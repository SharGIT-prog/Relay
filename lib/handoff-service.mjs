import { getMysqlPool, withTransaction } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit, actorIds } from './audit.mjs';

export async function getHandoffDetail(id, db = getMysqlPool()) {
  const [rows] = await db.execute(
    `SELECT h.handoff_id, h.admission_id, h.discharge_id, a.patient_id, p.name AS patient_name,
            h.from_facility_id, ff.name AS from_facility_name, h.to_facility_id, tf.name AS to_facility_name,
            h.status, h.handoff_date, h.acknowledged_at, h.created_by, u.name AS created_by_name
     FROM care_handoff h
     JOIN admission a ON a.admission_id = h.admission_id
     JOIN patient p ON p.patient_id = a.patient_id
     JOIN facility ff ON ff.facility_id = h.from_facility_id
     JOIN facility tf ON tf.facility_id = h.to_facility_id
     JOIN app_user u ON u.user_id = h.created_by
     WHERE h.handoff_id = ?`, [id]);
  if (!rows.length) throw new ApiError(404, 'HANDOFF_NOT_FOUND', 'Care handoff not found');
  return rows[0];
}

/** Sender = the admission's facility; receiver = the plan's destination facility. */
export async function createHandoff(input, actor) {
  return withTransaction(async (conn) => {
    const [plan] = await conn.execute(
      `SELECT dp.admission_id, dp.status, dp.destination_facility_id, a.facility_id AS from_facility_id
       FROM discharge_plan dp JOIN admission a ON a.admission_id = dp.admission_id
       WHERE dp.discharge_id = ? FOR UPDATE OF dp`, [input.dischargeId]);
    if (!plan.length) throw new ApiError(404, 'DISCHARGE_NOT_FOUND', 'Discharge plan not found');
    const p = plan[0];
    if (p.status === 'CANCELLED' || p.status === 'COMPLETED') {
      throw new ApiError(409, 'PLAN_CLOSED', `The discharge plan is ${p.status}`);
    }
    if (p.destination_facility_id == null) {
      throw new ApiError(422, 'NO_DESTINATION', 'The discharge plan has no destination facility');
    }
    const [live] = await conn.execute(
      "SELECT handoff_id FROM care_handoff WHERE discharge_id = ? AND status IN ('PREPARED', 'SENT', 'ACKNOWLEDGED')", [input.dischargeId]);
    if (live.length) {
      throw new ApiError(409, 'ACTIVE_HANDOFF_EXISTS', `The plan already has a live handoff (${live[0].handoff_id})`);
    }
    const [res] = await conn.execute(
      `INSERT INTO care_handoff (admission_id, discharge_id, from_facility_id, to_facility_id, status, handoff_date, created_by)
       VALUES (?, ?, ?, ?, 'PREPARED', ?, ?)`,
      [p.admission_id, input.dischargeId, p.from_facility_id, p.destination_facility_id, input.handoffDate, actor.userId]);
    await writeAudit(conn, {
      userId: actor.userId, action: 'HANDOFF_CREATED', entityType: 'CARE_HANDOFF', entityId: res.insertId,
      details: { dischargeId: input.dischargeId, fromFacilityId: p.from_facility_id, toFacilityId: p.destination_facility_id },
    });
    return res.insertId;
  });
}

const ACTIONS = {
  send:        { requires: 'PREPARED', to: 'SENT',         audit: 'HANDOFF_SENT' },
  acknowledge: { requires: 'SENT',     to: 'ACKNOWLEDGED', audit: 'HANDOFF_ACKNOWLEDGED' },
  reject:      { requires: 'SENT',     to: 'REJECTED',     audit: 'HANDOFF_REJECTED' },
};

export async function transitionHandoff(id, action, actor) {
  const a = ACTIONS[action];
  if (!a) throw new Error(`Unknown handoff action ${action}`);
  await withTransaction(async (conn) => {
    const [h] = await conn.execute('SELECT status, discharge_id FROM care_handoff WHERE handoff_id = ? FOR UPDATE', [id]);
    if (!h.length) throw new ApiError(404, 'HANDOFF_NOT_FOUND', 'Care handoff not found');
    if (h[0].status !== a.requires) {
      throw new ApiError(409, 'INVALID_TRANSITION', `Cannot ${action} a handoff that is ${h[0].status}`);
    }
    const [plan] = await conn.execute('SELECT status FROM discharge_plan WHERE discharge_id = ? FOR UPDATE', [h[0].discharge_id]);
    const ps = plan[0].status;
    if (action === 'send') {
      if (ps !== 'READY') throw new ApiError(409, 'PLAN_NOT_READY', `The discharge plan must be READY to send a handoff (it is ${ps})`);
      const [[o]] = await conn.execute(
        "SELECT COUNT(*) AS n FROM transition_requirement WHERE discharge_id = ? AND status IN ('PENDING', 'ALLOCATED')", [h[0].discharge_id]);
      if (o.n > 0) throw new ApiError(409, 'REQUIREMENTS_OUTSTANDING', `${o.n} transition requirement(s) are still outstanding`);
    } else if (ps === 'CANCELLED' || ps === 'COMPLETED') {
      throw new ApiError(409, 'PLAN_CLOSED', `The discharge plan is ${ps}`);
    }
    if (action === 'acknowledge') {
      await conn.execute("UPDATE care_handoff SET status = 'ACKNOWLEDGED', acknowledged_at = NOW() WHERE handoff_id = ?", [id]);
    } else {
      await conn.execute('UPDATE care_handoff SET status = ? WHERE handoff_id = ?', [a.to, id]);
    }
    await writeAudit(conn, {
      ...actorIds(actor), action: a.audit, entityType: 'CARE_HANDOFF', entityId: id,
      details: { from: a.requires, to: a.to, dischargeId: h[0].discharge_id },
    });
  });
}