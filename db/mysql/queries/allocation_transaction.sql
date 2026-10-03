START TRANSACTION;

-- Lock the resource row (serialises concurrent bookings of this resource).
SELECT resource_id FROM resource WHERE resource_id = @resource_id FOR UPDATE;

-- Validate and insert in a single atomic statement (resource_type is copied from the resource, never taken from the caller)
INSERT INTO resource_allocation
    (admission_id, resource_id, resource_type, start_time, end_time,
     requirement_id, allocation_status, allocated_by)
SELECT @admission_id, r.resource_id, r.resource_type,
       CAST(@start_time AS DATETIME), CAST(@end_time AS DATETIME),
       @requirement_id, 'ACTIVE', @allocated_by
FROM resource r
WHERE r.resource_id = @resource_id
  AND r.availability = 'AVAILABLE'
  AND CAST(@end_time AS DATETIME) > CAST(@start_time AS DATETIME)
  AND NOT EXISTS (
        SELECT 1
        FROM resource_allocation ra
        WHERE ra.resource_id = r.resource_id
          AND ra.allocation_status = 'ACTIVE'
          AND ra.start_time < CAST(@end_time AS DATETIME)
          AND ra.end_time   > CAST(@start_time AS DATETIME)
  );

-- ROW_COUNT() must be read immediately after the INSERT.
SET @rows_inserted = ROW_COUNT();

-- Mark the linked requirement, only if the booking really happened.
UPDATE transition_requirement
   SET status = 'ALLOCATED'
 WHERE requirement_id = @requirement_id
   AND status = 'PENDING'
   AND @rows_inserted = 1;

SELECT @rows_inserted AS allocated,
       IF(@rows_inserted = 1, LAST_INSERT_ID(), NULL) AS allocation_id;

COMMIT;