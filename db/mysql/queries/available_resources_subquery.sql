SET @w_start = COALESCE(
    STR_TO_DATE(@window_start, '%Y-%m-%dT%H:%i:%s.%fZ'),
    STR_TO_DATE(@window_start, '%Y-%m-%d %H:%i:%s'),
    CAST(@window_start AS DATETIME),
    NOW()
);

SET @w_end = COALESCE(
    STR_TO_DATE(@window_end, '%Y-%m-%dT%H:%i:%s.%fZ'),
    STR_TO_DATE(@window_end, '%Y-%m-%d %H:%i:%s'),
    CAST(@window_end AS DATETIME),
    DATE_ADD(NOW(), INTERVAL 4 HOUR)
);

SELECT r.resource_id,
       r.resource_type,
       r.facility_id,
       f.name AS facility_name
FROM resource r
JOIN facility f ON f.facility_id = r.facility_id
WHERE CONVERT(r.availability USING utf8mb4) = 'AVAILABLE'
  AND (@resource_type IS NULL OR CONVERT(r.resource_type USING utf8mb4) = CONVERT(@resource_type USING utf8mb4))
  AND (@facility_id IS NULL OR r.facility_id = @facility_id)
  AND NOT EXISTS (
        SELECT 1
        FROM resource_allocation ra
        WHERE ra.resource_id = r.resource_id
          AND CONVERT(ra.allocation_status USING utf8mb4) IN ('ACTIVE', 'COMPLETED')
          AND ra.start_time < @w_end
          AND ra.end_time   > @w_start
  )
ORDER BY r.resource_type, r.facility_id, r.resource_id;