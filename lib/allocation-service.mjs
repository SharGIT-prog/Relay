import { getMysqlPool, withTransaction } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';
import { writeAudit } from './audit.mjs';

const COLUMNS = `allocation_id, admission_id, resource_id, resource_type, start_time, end_time,
                 requirement_id, allocation_status, allocated_by`;

export async function getAllocation(id, db = getMysqlPool()) {
  const [rows] = await db.execute(`SELECT ${COLUMNS} FROM resource_allocation WHERE allocation_id = ?`, [id]);
  if (!rows.length) throw new ApiError(404, 'ALLOCATION_NOT_FOUND', 'Resource allocation not found');
  return rows[0];
}

async function requirementStatus(requirementId, db) {
  if (requirementId == null) return null;
  const [r] = await db.execute('SELECT status FROM transition_requirement WHERE requirement_id = ?', [requirementId]);
  return r[0]?.status ?? null;
}
export async function allocateResource(input, actor) {
  const conn = await getMysqlPool().getConnection();
  let allocationId;
  try {
    await conn.query('CALL sp_allocate_resource(?, ?, ?, ?, ?, ?, @alloc_id)', [
      input.admissionId, input.resourceId, input.startTime, input.endTime, input.requirementId ?? null, actor.userId,
    ]);
    const [[out]] = await conn.query('SELECT @alloc_id AS id');
    allocationId = out.id;
    try {
      await writeAudit(conn, {
        userId: actor.userId, action: 'RESOURCE_ALLOCATED', entityType: 'RESOURCE_ALLOCATION', entityId: allocationId,
        details: { admissionId: input.admissionId, resourceId: input.resourceId, startTime: input.startTime,
                   endTime: input.endTime, requirementId: input.requirementId ?? null },
      });
    } catch (e) {
      console.error(`AUDIT FAILURE: allocation ${allocationId} was created but its audit row was not written:`, e);
    }
  } finally {
    conn.release();
  }
  const allocation = await getAllocation(allocationId);
  return { allocation, requirementStatus: await requirementStatus(allocation.requirement_id, getMysqlPool()) };
}

/** ACTIVE -> COMPLETED or CANCELLED. Trigger updates linked requirement. */
export async function updateAllocationStatus(id, status, actor) {
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT allocation_status FROM resource_allocation WHERE allocation_id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new ApiError(404, 'ALLOCATION_NOT_FOUND', 'Resource allocation not found');
    if (rows[0].allocation_status !== 'ACTIVE') {
      throw new ApiError(409, 'ALLOCATION_NOT_ACTIVE', `The allocation is already ${rows[0].allocation_status}`);
    }
    await conn.execute('UPDATE resource_allocation SET allocation_status = ? WHERE allocation_id = ?', [status, id]);
    await writeAudit(conn, {
      userId: actor.userId, action: `ALLOCATION_${status}`, entityType: 'RESOURCE_ALLOCATION', entityId: id,
      details: { from: 'ACTIVE', to: status },
    });
  });
  const allocation = await getAllocation(id);
  return { allocation, requirementStatus: await requirementStatus(allocation.requirement_id, getMysqlPool()) };
}