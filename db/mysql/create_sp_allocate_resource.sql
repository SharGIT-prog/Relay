DROP PROCEDURE IF EXISTS sp_allocate_resource;

CREATE PROCEDURE sp_allocate_resource(
    IN  p_admission_id   BIGINT,
    IN  p_resource_id    BIGINT,
    IN  p_start_time     DATETIME,
    IN  p_end_time       DATETIME,
    IN  p_requirement_id BIGINT,
    IN  p_allocated_by   BIGINT,
    OUT p_allocation_id  BIGINT
)
BEGIN
    DECLARE v_found            INT DEFAULT 1;
    DECLARE v_resource_type    VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    DECLARE v_availability     VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    DECLARE v_admission_exists INT DEFAULT 0;
    DECLARE v_req_status       VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    DECLARE v_req_type         VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    DECLARE v_req_admission    BIGINT;
    DECLARE v_conflicts        INT DEFAULT 0;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_found = 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET p_allocation_id = NULL;

    -- 1. Time range
    IF p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time THEN
        SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50001,
            MESSAGE_TEXT = 'Invalid time range: end_time must be after start_time';
    END IF;

    START TRANSACTION;

    -- 2. Lock the resource row and read state
    SET v_found = 1;

    SELECT resource_type, availability
      INTO v_resource_type, v_availability
      FROM resource
     WHERE resource_id = p_resource_id
       FOR UPDATE;

    IF v_found = 0 THEN
        SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50002,
            MESSAGE_TEXT = 'Resource not found';
    END IF;

    IF v_availability COLLATE utf8mb4_0900_ai_ci <> 'AVAILABLE' COLLATE utf8mb4_0900_ai_ci THEN
        SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50003,
            MESSAGE_TEXT = 'Resource is not AVAILABLE';
    END IF;

    -- 3. Admission must exist
    SELECT COUNT(*) INTO v_admission_exists
      FROM admission
     WHERE admission_id = p_admission_id;

    IF v_admission_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50004,
            MESSAGE_TEXT = 'Admission not found';
    END IF;

    -- 4. Requirement validation
    IF p_requirement_id IS NOT NULL THEN
        SET v_found = 1;

        SELECT tr.status, tr.resource_type, dp.admission_id
          INTO v_req_status, v_req_type, v_req_admission
          FROM transition_requirement tr
          JOIN discharge_plan dp
            ON dp.discharge_id = tr.discharge_id
         WHERE tr.requirement_id = p_requirement_id
           FOR UPDATE OF tr;

        IF v_found = 0 THEN
            SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50005,
                MESSAGE_TEXT = 'Transition requirement not found';
        END IF;

        IF v_req_status COLLATE utf8mb4_0900_ai_ci IN (
            'FULFILLED' COLLATE utf8mb4_0900_ai_ci,
            'CANCELLED' COLLATE utf8mb4_0900_ai_ci
        ) THEN
            SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50006,
                MESSAGE_TEXT = 'Transition requirement is already FULFILLED or CANCELLED';
        END IF;

        IF v_req_admission <> p_admission_id THEN
            SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50007,
                MESSAGE_TEXT = 'Transition requirement belongs to a different admission';
        END IF;

        IF v_req_type COLLATE utf8mb4_0900_ai_ci <>
           v_resource_type COLLATE utf8mb4_0900_ai_ci THEN
            SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50008,
                MESSAGE_TEXT = 'Resource type does not match the requirement';
        END IF;
    END IF;

    -- 5. Reject overlapping ACTIVE allocation
    SELECT COUNT(*) INTO v_conflicts
      FROM resource_allocation
     WHERE resource_id = p_resource_id
       AND allocation_status COLLATE utf8mb4_0900_ai_ci =
           'ACTIVE' COLLATE utf8mb4_0900_ai_ci
       AND start_time < p_end_time
       AND end_time > p_start_time;

    IF v_conflicts > 0 THEN
        SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 50009,
            MESSAGE_TEXT = 'Resource already has an overlapping ACTIVE allocation';
    END IF;

    -- 6. Insert allocation
    INSERT INTO resource_allocation
        (
            admission_id,
            resource_id,
            resource_type,
            start_time,
            end_time,
            requirement_id,
            allocation_status,
            allocated_by
        )
    VALUES
        (
            p_admission_id,
            p_resource_id,
            v_resource_type,
            p_start_time,
            p_end_time,
            p_requirement_id,
            'ACTIVE',
            p_allocated_by
        );

    SET p_allocation_id = LAST_INSERT_ID();

    -- 7. PENDING becomes ALLOCATED
    IF p_requirement_id IS NOT NULL
       AND v_req_status COLLATE utf8mb4_0900_ai_ci =
           'PENDING' COLLATE utf8mb4_0900_ai_ci THEN

        UPDATE transition_requirement
           SET status = 'ALLOCATED'
         WHERE requirement_id = p_requirement_id;
    END IF;

    COMMIT;
END;