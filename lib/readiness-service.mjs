import { getMysqlPool } from './db-mysql.mjs';
import { ApiError } from './errors.mjs';

/** v_transition_readiness + detail rows -> transition dashboard [for one patient] */
export async function getPatientReadiness(patientId, db = getMysqlPool()) {
  const [pat] = await db.execute(
    'SELECT patient_id AS patientId, name, DOB FROM patient WHERE patient_id = ?',
    [patientId]
  );
  if (!pat.length) throw new ApiError(404, 'PATIENT_NOT_FOUND', 'Patient not found');

  const [plans] = await db.execute(
    'SELECT * FROM v_transition_readiness WHERE patient_id = ? ORDER BY discharge_id DESC',
    [patientId]
  );
  const [recoveryEpisodes] = await db.execute(
    `SELECT recovery_id AS recoveryId, facility_id AS facilityId, start_date AS startDate, 
            end_date AS endDate, status 
     FROM recovery_episode WHERE patient_id = ? ORDER BY recovery_id DESC`,
    [patientId]
  );

  const dischargeIds = plans.map((p) => p.discharge_id);
  let requirements = [], allocations = [], handoffs = [];

  if (dischargeIds.length) {
    [requirements] = await db.query(
      `SELECT requirement_id AS requirementId, discharge_id AS dischargeId, recovery_id AS recoveryId, 
              resource_type AS resourceType, required_form AS requiredForm, required_until AS requiredUntil, status
       FROM transition_requirement WHERE discharge_id IN (?) AND status <> 'CANCELLED' ORDER BY requirement_id`,
      [dischargeIds]
    );

    if (requirements.length) {
      [allocations] = await db.query(
        `SELECT allocation_id AS allocationId, requirement_id AS requirementId, resource_id AS resourceId, 
                resource_type AS resourceType, start_time AS startTime, end_time AS endTime, 
                allocation_status AS allocationStatus
         FROM resource_allocation WHERE requirement_id IN (?) AND allocation_status IN ('ACTIVE', 'COMPLETED') ORDER BY allocation_id`,
        [requirements.map((r) => r.requirementId)]
      );
    }

    [handoffs] = await db.query(
      `SELECT handoff_id AS handoffId, discharge_id AS dischargeId, from_facility_id AS fromFacilityId, 
              to_facility_id AS toFacilityId, status, handoff_date AS handoffDate, acknowledged_at AS acknowledgedAt
       FROM care_handoff WHERE discharge_id IN (?) ORDER BY handoff_id`,
      [dischargeIds]
    );
  }

  const open = plans.filter((p) => !['CANCELLED', 'COMPLETED'].includes(p.readiness_status ?? p.status));

  return {
    patient: pat[0],
    summary: {
      plans: plans.length,
      ready: plans.filter((p) => (p.readiness_status ?? p.status) === 'READY').length,
      outstandingRequirements: open.reduce((n, p) => n + Number(p.outstanding_requirements ?? p.outstandingRequirements ?? 0), 0),
    },
    plans: plans.map((p) => {
      const pDischargeId = p.discharge_id ?? p.dischargeId;
      const status = p.readiness_status ?? p.status;
      return {
        dischargeId: pDischargeId,
        readinessStatus: status,
        totalRequirements: Number(p.total_requirements ?? p.totalRequirements ?? 0),
        fulfilledRequirements: Number(p.fulfilled_requirements ?? p.fulfilledRequirements ?? 0),
        outstandingRequirements: Number(p.outstanding_requirements ?? p.outstandingRequirements ?? 0),
        requirements: requirements
          .filter((r) => r.dischargeId === pDischargeId)
          .map((r) => ({
            ...r,
            allocations: allocations.filter((a) => a.requirementId === r.requirementId),
          })),
        handoffs: handoffs.filter((h) => h.dischargeId === pDischargeId),
      };
    }),
    recoveryEpisodes,
  };
}