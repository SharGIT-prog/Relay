import { getMysqlPool, withTransaction } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';

export async function getRequirementDetail(id, db = getMysqlPool()) {
  const [rows] = await db.execute(
    `SELECT tr.requirement_id, tr.discharge_id, tr.recovery_id, tr.resource_type, tr.required_form,
            tr.required_until, tr.status, dp.admission_id, a.patient_id
     FROM transition_requirement tr
     JOIN discharge_plan dp ON dp.discharge_id = tr.discharge_id
     JOIN admission a ON a.admission_id = dp.admission_id
     WHERE tr.requirement_id = ?`, [id]);
  if (!rows.length) throw new ApiError(404, 'REQUIREMENT_NOT_FOUND', 'Transition requirement not found');
  const [allocations] = await db.execute(
    `SELECT allocation_id, resource_id, resource_type, start_time, end_time, allocation_status, allocated_by
     FROM resource_allocation WHERE requirement_id = ? ORDER BY allocation_id`, [id]);
  return { ...rows[0], allocations };
}

export async function createRequirement(input, actor) {
  return withTransaction(async (conn) => {
    // Locking the plan serialises this against "plan -> READY" in discharge-service.
    const [plan] = await conn.execute(
      `SELECT dp.status, a.patient_id FROM discharge_plan dp
       JOIN admission a ON a.admission_id = dp.admission_id
       WHERE dp.discharge_id = ? FOR UPDATE OF dp`, [input.dischargeId]);
    if (!plan.length) throw new ApiError(404, 'DISCHARGE_NOT_FOUND', 'Discharge plan not found');
    if (plan[0].status !== 'PLANNED') {
      throw new ApiError(409, 'PLAN_NOT_PLANNED', 'Requirements can only be added while the discharge plan is PLANNED');
    }
    const [rec] = await conn.execute('SELECT patient_id, status FROM recovery_episode WHERE recovery_id = ?', [input.recoveryId]);
    if (!rec.length) throw new ApiError(404, 'RECOVERY_NOT_FOUND', 'Recovery episode not found');
    if (rec[0].patient_id !== plan[0].patient_id) {
      throw new ApiError(422, 'RECOVERY_PATIENT_MISMATCH', 'The recovery episode belongs to a different patient than the discharge plan');
    }
    if (!['PLANNED', 'ACTIVE'].includes(rec[0].status)) {
      throw new ApiError(409, 'RECOVERY_CLOSED', `The recovery episode is ${rec[0].status}`);
    }
    const [res] = await conn.execute(
      `INSERT INTO transition_requirement (discharge_id, recovery_id, resource_type, required_form, required_until, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [input.dischargeId, input.recoveryId, input.resourceType, input.requiredForm ?? null, input.requiredUntil ?? null]);
    await writeAudit(conn, {
      userId: actor.userId, action: 'REQUIREMENT_CREATED', entityType: 'TRANSITION_REQUIREMENT', entityId: res.insertId,
      details: { dischargeId: input.dischargeId, recoveryId: input.recoveryId, resourceType: input.resourceType },
    });
    return res.insertId;
  });
}

export async function updateRequirement(id, changes, actor) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT tr.requirement_id, tr.resource_type, tr.required_form, tr.required_until, tr.status,
              dp.status AS plan_status
       FROM transition_requirement tr JOIN discharge_plan dp ON dp.discharge_id = tr.discharge_id
       WHERE tr.requirement_id = ? FOR UPDATE OF tr`, [id]);
    const cur = rows[0];
    if (!cur) throw new ApiError(404, 'REQUIREMENT_NOT_FOUND', 'Transition requirement not found');
    if (cur.status === 'FULFILLED' || cur.status === 'CANCELLED') {
      throw new ApiError(409, 'REQUIREMENT_CLOSED', `The requirement is ${cur.status} and can no longer be changed`);
    }
    if (cur.plan_status === 'COMPLETED' || cur.plan_status === 'CANCELLED') {
      throw new ApiError(409, 'PLAN_CLOSED', `The discharge plan is ${cur.plan_status}`);
    }

    const next = {}; // column names are fixed in code, never taken from input
    if (changes.resourceType !== undefined && changes.resourceType !== cur.resource_type) {
      if (cur.status !== 'PENDING') {
        throw new ApiError(409, 'REQUIREMENT_IN_USE', 'The resource type can only change while the requirement is PENDING');
      }
      next.resource_type = changes.resourceType;
    }
    if (changes.requiredForm !== undefined && changes.requiredForm !== cur.required_form) next.required_form = changes.requiredForm;
    if (changes.requiredUntil !== undefined && changes.requiredUntil !== cur.required_until) next.required_until = changes.requiredUntil;

    if (changes.status !== undefined && changes.status !== cur.status) {
      const allowed = cur.status === 'PENDING' ? ['FULFILLED', 'CANCELLED'] : ['CANCELLED'];
      if (!allowed.includes(changes.status)) {
        throw new ApiError(409, 'INVALID_TRANSITION', cur.status === 'ALLOCATED' && changes.status === 'FULFILLED'
          ? 'An ALLOCATED requirement is fulfilled by completing its allocation'
          : `Cannot change status from ${cur.status} to ${changes.status}`);
      }
      if (changes.status === 'CANCELLED' && cur.status === 'ALLOCATED') {
        // Cancel the live bookings first; the Step 10 trigger then resets the requirement.
        const [active] = await conn.execute(
          "SELECT allocation_id FROM resource_allocation WHERE requirement_id = ? AND allocation_status = 'ACTIVE' FOR UPDATE", [id]);
        for (const a of active) {
          await conn.execute("UPDATE resource_allocation SET allocation_status = 'CANCELLED' WHERE allocation_id = ?", [a.allocation_id]);
          await writeAudit(conn, {
            userId: actor.userId, action: 'ALLOCATION_CANCELLED', entityType: 'RESOURCE_ALLOCATION', entityId: a.allocation_id,
            details: { from: 'ACTIVE', to: 'CANCELLED', reason: 'REQUIREMENT_CANCELLED', requirementId: id },
          });
        }
      }
      next.status = changes.status;
    }

    const cols = Object.keys(next);
    if (!cols.length) return;
    await conn.execute(
      `UPDATE transition_requirement SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE requirement_id = ?`,
      [...cols.map((c) => next[c]), id]);
    await writeAudit(conn, {
      userId: actor.userId, action: 'REQUIREMENT_UPDATED', entityType: 'TRANSITION_REQUIREMENT', entityId: id,
      details: { before: Object.fromEntries(cols.map((c) => [c, cur[c]])), after: next },
    });
  });
}