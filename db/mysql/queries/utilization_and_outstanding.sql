SET @util_from = CAST(COALESCE(@util_from, NOW() - INTERVAL 30 DAY) AS DATETIME);
SET @util_to   = CAST(COALESCE(@util_to,   NOW() + INTERVAL 30 DAY) AS DATETIME);
SET @min_booked_minutes = COALESCE(@min_booked_minutes, 1);
SET @min_outstanding    = COALESCE(@min_outstanding, 1);

-- 6a: utilization per resource (GROUP BY + aggregates + HAVING)
SELECT r.resource_id,
       r.resource_type,
       r.facility_id,
       COUNT(ra.allocation_id) AS bookings,
       COALESCE(SUM(TIMESTAMPDIFF(MINUTE,
                    GREATEST(ra.start_time, @util_from),
                    LEAST(ra.end_time, @util_to))), 0) AS booked_minutes,
       ROUND(100 * COALESCE(SUM(TIMESTAMPDIFF(MINUTE,
                    GREATEST(ra.start_time, @util_from),
                    LEAST(ra.end_time, @util_to))), 0)
              / TIMESTAMPDIFF(MINUTE, @util_from, @util_to), 2) AS utilization_pct
FROM resource r
LEFT JOIN resource_allocation ra
       ON ra.resource_id = r.resource_id
      AND ra.allocation_status COLLATE utf8mb4_0900_ai_ci IN ('ACTIVE', 'COMPLETED')
      AND ra.start_time < @util_to
      AND ra.end_time   > @util_from
GROUP BY r.resource_id, r.resource_type, r.facility_id
HAVING booked_minutes >= @min_booked_minutes
ORDER BY booked_minutes DESC, r.resource_id;

-- 6b: utilization per facility and resource type (only groups with at least one booking)
SELECT f.facility_id,
       f.name AS facility_name,
       r.resource_type,
       COUNT(DISTINCT r.resource_id) AS resources_in_group,
       COUNT(ra.allocation_id)       AS bookings,
       COALESCE(SUM(TIMESTAMPDIFF(MINUTE,
                    GREATEST(ra.start_time, @util_from),
                    LEAST(ra.end_time, @util_to))), 0) AS booked_minutes
FROM resource r
JOIN facility f ON f.facility_id = r.facility_id
LEFT JOIN resource_allocation ra
       ON ra.resource_id = r.resource_id
      AND ra.allocation_status COLLATE utf8mb4_0900_ai_ci IN ('ACTIVE', 'COMPLETED')
      AND ra.start_time < @util_to
      AND ra.end_time   > @util_from
GROUP BY f.facility_id, f.name, r.resource_type
HAVING COUNT(ra.allocation_id) >= 1
ORDER BY booked_minutes DESC, f.facility_id, r.resource_type;

-- 6c: outstanding transition requirements per open discharge plan
SELECT dp.discharge_id,
       p.patient_id,
       p.name AS patient_name,
       COUNT(*)                                                         AS outstanding_requirements,
       SUM(tr.status COLLATE utf8mb4_0900_ai_ci = 'PENDING')            AS pending,
       SUM(tr.status COLLATE utf8mb4_0900_ai_ci = 'ALLOCATED')          AS allocated,
       MIN(tr.required_until)                                           AS earliest_deadline,
       SUM(tr.required_until < NOW())                                   AS overdue
FROM transition_requirement tr
JOIN discharge_plan dp ON dp.discharge_id = tr.discharge_id
JOIN admission a       ON a.admission_id  = dp.admission_id
JOIN patient p         ON p.patient_id    = a.patient_id
WHERE tr.status COLLATE utf8mb4_0900_ai_ci IN ('PENDING', 'ALLOCATED')
  AND dp.status COLLATE utf8mb4_0900_ai_ci NOT IN ('CANCELLED', 'COMPLETED')
GROUP BY dp.discharge_id, p.patient_id, p.name
HAVING COUNT(*) >= @min_outstanding
ORDER BY outstanding_requirements DESC, earliest_deadline, dp.discharge_id;

-- 6d: shortage: resource types where unallocated demand exceeds AVAILABLE supply (subquery)
SELECT tr.resource_type,
       COUNT(*) AS pending_requirements,
       (SELECT COUNT(*) FROM resource r
         WHERE r.resource_type COLLATE utf8mb4_0900_ai_ci = tr.resource_type COLLATE utf8mb4_0900_ai_ci
           AND r.availability COLLATE utf8mb4_0900_ai_ci = 'AVAILABLE') AS available_resources
FROM transition_requirement tr
WHERE tr.status COLLATE utf8mb4_0900_ai_ci = 'PENDING'
GROUP BY tr.resource_type
HAVING pending_requirements > available_resources
ORDER BY pending_requirements DESC, tr.resource_type;