CREATE OR REPLACE VIEW v_transition_readiness AS
SELECT
    p.patient_id,
    p.name                                   AS patient_name,
    a.admission_id,
    dp.discharge_id,
    dp.discharge_date,
    dp.status                                AS discharge_status,
    dp.destination_facility_id,
    df.name                                  AS destination_facility_name,

    COALESCE(req.total_requirements, 0)      AS total_requirements,
    COALESCE(req.pending_requirements, 0)    AS pending_requirements,
    COALESCE(req.allocated_requirements, 0)  AS allocated_requirements,
    COALESCE(req.fulfilled_requirements, 0)  AS fulfilled_requirements,
    COALESCE(req.pending_requirements, 0)
      + COALESCE(req.allocated_requirements, 0) AS outstanding_requirements,
    req.next_deadline,
    COALESCE(req.recovery_episodes, 0)       AS recovery_episodes,
    req.recovery_statuses,

    COALESCE(al.active_allocations, 0)       AS active_allocations,
    COALESCE(al.completed_allocations, 0)    AS completed_allocations,

    h.handoff_id,
    h.status                                 AS handoff_status,
    h.from_facility_id                       AS handoff_from_facility_id,
    h.to_facility_id                         AS handoff_to_facility_id,
    h.handoff_date,
    h.acknowledged_at,

    CASE
        WHEN dp.status COLLATE utf8mb4_0900_ai_ci = 'CANCELLED' THEN 'CANCELLED'
        WHEN dp.status COLLATE utf8mb4_0900_ai_ci = 'COMPLETED' THEN 'COMPLETED'
        WHEN COALESCE(req.total_requirements, 0) = 0 THEN 'NO_REQUIREMENTS'
        WHEN COALESCE(req.pending_requirements, 0)
           + COALESCE(req.allocated_requirements, 0) > 0 THEN 'REQUIREMENTS_OUTSTANDING'
        WHEN dp.destination_facility_id IS NULL THEN 'READY'
        WHEN h.status COLLATE utf8mb4_0900_ai_ci = 'ACKNOWLEDGED' THEN 'READY'
        WHEN h.status COLLATE utf8mb4_0900_ai_ci = 'REJECTED' THEN 'HANDOFF_REJECTED'
        ELSE 'AWAITING_HANDOFF'
    END AS readiness_status

FROM discharge_plan dp
JOIN admission a ON a.admission_id = dp.admission_id
JOIN patient   p ON p.patient_id   = a.patient_id
LEFT JOIN facility df ON df.facility_id = dp.destination_facility_id

LEFT JOIN (
    SELECT tr.discharge_id,
           CAST(COUNT(*) AS SIGNED)                                                                                AS total_requirements,
           CAST(SUM(tr.status COLLATE utf8mb4_0900_ai_ci = 'PENDING' COLLATE utf8mb4_0900_ai_ci)   AS SIGNED)   AS pending_requirements,
           CAST(SUM(tr.status COLLATE utf8mb4_0900_ai_ci = 'ALLOCATED' COLLATE utf8mb4_0900_ai_ci) AS SIGNED)   AS allocated_requirements,
           CAST(SUM(tr.status COLLATE utf8mb4_0900_ai_ci = 'FULFILLED' COLLATE utf8mb4_0900_ai_ci) AS SIGNED)   AS fulfilled_requirements,
           MIN(CASE WHEN tr.status COLLATE utf8mb4_0900_ai_ci IN ('PENDING' COLLATE utf8mb4_0900_ai_ci, 'ALLOCATED' COLLATE utf8mb4_0900_ai_ci)
                    THEN tr.required_until END)                                                                    AS next_deadline,
           COUNT(DISTINCT tr.recovery_id)                                                                          AS recovery_episodes,
           GROUP_CONCAT(DISTINCT re.status ORDER BY re.status SEPARATOR ',') COLLATE utf8mb4_0900_ai_ci           AS recovery_statuses
    FROM transition_requirement tr
    JOIN recovery_episode re ON re.recovery_id = tr.recovery_id
    WHERE tr.status COLLATE utf8mb4_0900_ai_ci <> 'CANCELLED' COLLATE utf8mb4_0900_ai_ci
    GROUP BY tr.discharge_id
) req ON req.discharge_id = dp.discharge_id

LEFT JOIN (
    SELECT tr.discharge_id,
           CAST(SUM(ra.allocation_status COLLATE utf8mb4_0900_ai_ci = 'ACTIVE' COLLATE utf8mb4_0900_ai_ci)    AS SIGNED) AS active_allocations,
           CAST(SUM(ra.allocation_status COLLATE utf8mb4_0900_ai_ci = 'COMPLETED' COLLATE utf8mb4_0900_ai_ci) AS SIGNED) AS completed_allocations
    FROM transition_requirement tr
    JOIN resource_allocation ra ON ra.requirement_id = tr.requirement_id
    WHERE ra.allocation_status COLLATE utf8mb4_0900_ai_ci IN ('ACTIVE' COLLATE utf8mb4_0900_ai_ci, 'COMPLETED' COLLATE utf8mb4_0900_ai_ci)
    GROUP BY tr.discharge_id
) al ON al.discharge_id = dp.discharge_id

LEFT JOIN care_handoff h
       ON h.handoff_id = (SELECT MAX(h2.handoff_id)
                            FROM care_handoff h2
                           WHERE h2.discharge_id = dp.discharge_id);