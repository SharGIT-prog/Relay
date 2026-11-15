CREATE TABLE IF NOT EXISTS admission (
    admission_id    BIGINT NOT NULL AUTO_INCREMENT,
    patient_id      BIGINT NOT NULL,
    facility_id     BIGINT NOT NULL,
    admission_date  DATETIME NOT NULL,
    discharge_date  DATETIME NULL,
    PRIMARY KEY (admission_id),
    KEY idx_admission_patient (patient_id),
    KEY idx_admission_facility (facility_id),
    CONSTRAINT fk_admission_patient
        FOREIGN KEY (patient_id) REFERENCES patient (patient_id),
    CONSTRAINT fk_admission_facility
        FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;CREATE TABLE IF NOT EXISTS admission_doctor (
    admission_id BIGINT NOT NULL,
    doctor_id    BIGINT NOT NULL,
    PRIMARY KEY (admission_id, doctor_id),
    KEY idx_admdoc_doctor (doctor_id),
    CONSTRAINT fk_admdoc_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id),
    CONSTRAINT fk_admdoc_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctor (doctor_id)
);CREATE TABLE IF NOT EXISTS api_client (
    client_id        BIGINT NOT NULL AUTO_INCREMENT,
    client_name      VARCHAR(200) NOT NULL,
    client_type      VARCHAR(60) NOT NULL,
    credential_hash  VARCHAR(255) NOT NULL,
    status            VARCHAR(30) NOT NULL,
    created_at       DATETIME NOT NULL,
    PRIMARY KEY (client_id)
);CREATE TABLE IF NOT EXISTS api_client_facility (
    client_id    BIGINT NOT NULL,
    facility_id  BIGINT NOT NULL,

    PRIMARY KEY (client_id, facility_id),
    KEY idx_api_client_facility_facility (facility_id),

    CONSTRAINT fk_api_client_facility_client
        FOREIGN KEY (client_id) REFERENCES api_client (client_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_api_client_facility_facility
        FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);CREATE TABLE IF NOT EXISTS app_user (
    user_id        BIGINT NOT NULL AUTO_INCREMENT,
    name           VARCHAR(150) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    status         VARCHAR(30) NOT NULL,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_app_user_email (email)
);CREATE TABLE IF NOT EXISTS audit_log (
    audit_id      BIGINT       NOT NULL AUTO_INCREMENT,
    user_id       BIGINT       NULL,
    client_id     BIGINT       NULL,
    action        VARCHAR(80)  NOT NULL,
    entity_type   VARCHAR(80)  NOT NULL,
    entity_id     VARCHAR(80)  NOT NULL,
    `timestamp`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details       JSON         NULL,

    PRIMARY KEY (audit_id),

    KEY idx_audit_log_timestamp (`timestamp`),
    KEY idx_audit_log_entity    (entity_type, entity_id),
    KEY idx_audit_log_user      (user_id),
    KEY idx_audit_log_client    (client_id),

    CONSTRAINT fk_audit_log_user
        FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT fk_audit_log_client
        FOREIGN KEY (client_id) REFERENCES api_client (client_id),

    CONSTRAINT chk_audit_log_actor
        CHECK (user_id IS NOT NULL OR client_id IS NOT NULL)
);CREATE TABLE IF NOT EXISTS care_document (
    document_id    BIGINT        NOT NULL AUTO_INCREMENT,
    patient_id     BIGINT        NOT NULL,
    admission_id   BIGINT        NULL,
    recovery_id    BIGINT        NULL,
    document_type  VARCHAR(60)   NOT NULL,
    title          VARCHAR(250)  NOT NULL,
    source         VARCHAR(150)  NOT NULL,
    created_by     BIGINT        NOT NULL,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status         VARCHAR(30)   NOT NULL DEFAULT 'DRAFT',

    PRIMARY KEY (document_id),

    KEY idx_care_document_patient    (patient_id),
    KEY idx_care_document_admission  (admission_id),
    KEY idx_care_document_recovery   (recovery_id),
    KEY idx_care_document_created_by (created_by),
    KEY idx_care_document_status     (status),
    KEY idx_care_document_type       (document_type),

    CONSTRAINT fk_care_document_patient
        FOREIGN KEY (patient_id) REFERENCES patient (patient_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_document_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_document_recovery
        FOREIGN KEY (recovery_id) REFERENCES recovery_episode (recovery_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_document_created_by
        FOREIGN KEY (created_by) REFERENCES app_user (user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_care_document_status
        CHECK (status IN ('DRAFT', 'APPROVED', 'ARCHIVED'))
);CREATE TABLE IF NOT EXISTS care_handoff (
    handoff_id        BIGINT       NOT NULL AUTO_INCREMENT,
    admission_id      BIGINT       NOT NULL,
    discharge_id      BIGINT       NOT NULL,
    from_facility_id  BIGINT       NOT NULL,
    to_facility_id    BIGINT       NOT NULL,
    status            VARCHAR(30)  NOT NULL DEFAULT 'PREPARED',
    handoff_date      DATETIME     NOT NULL,
    acknowledged_at   DATETIME     NULL,
    created_by        BIGINT       NOT NULL,

    PRIMARY KEY (handoff_id),

    KEY idx_care_handoff_discharge     (discharge_id),
    KEY idx_care_handoff_to_facility   (to_facility_id),
    KEY idx_care_handoff_status        (status),
    KEY idx_care_handoff_admission     (admission_id),
    KEY idx_care_handoff_from_facility (from_facility_id),
    KEY idx_care_handoff_created_by    (created_by),

    CONSTRAINT fk_care_handoff_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_handoff_discharge
        FOREIGN KEY (discharge_id) REFERENCES discharge_plan (discharge_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_handoff_from_facility
        FOREIGN KEY (from_facility_id) REFERENCES facility (facility_id),
    CONSTRAINT fk_care_handoff_to_facility
        FOREIGN KEY (to_facility_id) REFERENCES facility (facility_id),
    CONSTRAINT fk_care_handoff_created_by
        FOREIGN KEY (created_by) REFERENCES app_user (user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_care_handoff_status
        CHECK (status IN ('PREPARED', 'SENT', 'ACKNOWLEDGED', 'REJECTED')),
    CONSTRAINT chk_care_handoff_facilities_differ
        CHECK (from_facility_id <> to_facility_id),
    CONSTRAINT chk_care_handoff_ack
        CHECK (status <> 'ACKNOWLEDGED' OR acknowledged_at IS NOT NULL)
);CREATE TABLE IF NOT EXISTS discharge_plan (
    discharge_id             BIGINT       NOT NULL AUTO_INCREMENT,
    admission_id             BIGINT       NOT NULL,
    doctor_id                BIGINT       NOT NULL,
    discharge_date           DATETIME     NOT NULL,
    status                   VARCHAR(30)  NOT NULL DEFAULT 'PLANNED',
    destination_facility_id  BIGINT       NULL,
    notes                    TEXT         NULL,

    PRIMARY KEY (discharge_id),

    KEY idx_discharge_plan_admission   (admission_id),
    KEY idx_discharge_plan_doctor      (doctor_id),
    KEY idx_discharge_plan_destination (destination_facility_id),

    CONSTRAINT fk_discharge_plan_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_discharge_plan_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctor (doctor_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_discharge_plan_destination
        FOREIGN KEY (destination_facility_id) REFERENCES facility (facility_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_discharge_plan_status
        CHECK (status IN ('PLANNED', 'READY', 'COMPLETED', 'CANCELLED'))
);CREATE TABLE IF NOT EXISTS doctor (
    doctor_id       BIGINT NOT NULL AUTO_INCREMENT,
    name            VARCHAR(150) NOT NULL,
    specialisation  VARCHAR(120) NOT NULL,
    contact_number  VARCHAR(20) NOT NULL,
    PRIMARY KEY (doctor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;CREATE TABLE IF NOT EXISTS facility (
    facility_id     BIGINT NOT NULL AUTO_INCREMENT,
    name            VARCHAR(200) NOT NULL,
    facility_type   VARCHAR(50) NOT NULL,
    address         VARCHAR(500) NOT NULL,
    contact_number  VARCHAR(20) NOT NULL,
    PRIMARY KEY (facility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;CREATE TABLE IF NOT EXISTS patient (
    patient_id BIGINT NOT NULL AUTO_INCREMENT,
    name       VARCHAR(150) NOT NULL,
    DOB        DATE NOT NULL,
    PRIMARY KEY (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;CREATE TABLE IF NOT EXISTS recovery_episode (
    recovery_id  BIGINT       NOT NULL AUTO_INCREMENT,
    patient_id   BIGINT       NOT NULL,
    facility_id  BIGINT       NOT NULL,
    start_date   DATE         NOT NULL,
    end_date     DATE         NULL,
    status       VARCHAR(30)  NOT NULL DEFAULT 'PLANNED',

    PRIMARY KEY (recovery_id),

    KEY idx_recovery_episode_patient  (patient_id),
    KEY idx_recovery_episode_facility (facility_id),
    KEY idx_recovery_episode_status   (status),

    CONSTRAINT fk_recovery_episode_patient
        FOREIGN KEY (patient_id) REFERENCES patient (patient_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_recovery_episode_facility
        FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_recovery_episode_status
        CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_recovery_episode_dates
        CHECK (end_date IS NULL OR end_date >= start_date)
);CREATE TABLE IF NOT EXISTS resource (
    resource_id    BIGINT       NOT NULL AUTO_INCREMENT,
    resource_type  VARCHAR(100) NOT NULL,
    availability   VARCHAR(30)  NOT NULL DEFAULT 'AVAILABLE',
    facility_id    BIGINT       NOT NULL,

    PRIMARY KEY (resource_id),

    KEY idx_resource_type         (resource_type),
    KEY idx_resource_availability (availability),
    KEY idx_resource_facility     (facility_id),

    CONSTRAINT fk_resource_facility
        FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_resource_availability
        CHECK (availability IN ('AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'))
);CREATE TABLE IF NOT EXISTS resource_allocation (
    allocation_id      BIGINT       NOT NULL AUTO_INCREMENT,
    admission_id       BIGINT       NOT NULL,
    resource_id        BIGINT       NOT NULL,
    resource_type      VARCHAR(100) NOT NULL,
    start_time         DATETIME     NOT NULL,
    end_time           DATETIME     NOT NULL,
    requirement_id     BIGINT       NULL,
    allocation_status  VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
    allocated_by       BIGINT       NOT NULL,

    PRIMARY KEY (allocation_id),

    -- WHERE resource_id = ? AND start_time < ? AND end_time > ?
    KEY idx_resource_allocation_resource_time (resource_id, start_time, end_time),
    KEY idx_resource_allocation_admission     (admission_id),
    KEY idx_resource_allocation_requirement   (requirement_id),
    KEY idx_resource_allocation_allocated_by  (allocated_by),

    CONSTRAINT fk_resource_allocation_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_resource_allocation_resource
        FOREIGN KEY (resource_id) REFERENCES resource (resource_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_resource_allocation_requirement
        FOREIGN KEY (requirement_id) REFERENCES transition_requirement (requirement_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_resource_allocation_allocated_by
        FOREIGN KEY (allocated_by) REFERENCES app_user (user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_resource_allocation_time
        CHECK (end_time > start_time),
    CONSTRAINT chk_resource_allocation_status
        CHECK (allocation_status IN ('ACTIVE', 'COMPLETED', 'CANCELLED'))
);CREATE TABLE IF NOT EXISTS `role` (
    role_id    BIGINT NOT NULL AUTO_INCREMENT,
    role_name  VARCHAR(50) NOT NULL,
    PRIMARY KEY (role_id),
    UNIQUE KEY uq_role_name (role_name)
);DROP PROCEDURE IF EXISTS sp_create_admission;

CREATE PROCEDURE sp_create_admission(
    IN  p_patient_id      BIGINT,
    IN  p_facility_id     BIGINT,
    IN  p_doctor_id       BIGINT,
    IN  p_admission_date  DATETIME,
    OUT p_admission_id    BIGINT
)
BEGIN
    DECLARE v_patient_exists  INT DEFAULT 0;
    DECLARE v_facility_exists INT DEFAULT 0;
    DECLARE v_doctor_exists   INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET p_admission_id = NULL;

    -- Validate required input.
    IF p_patient_id IS NULL
       OR p_facility_id IS NULL
       OR p_doctor_id IS NULL
       OR p_admission_date IS NULL THEN

        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 51001,
                MESSAGE_TEXT = 'Patient, facility, doctor and admission date are required';
    END IF;

    START TRANSACTION;

    -- Validate patient.
    SELECT COUNT(*)
      INTO v_patient_exists
      FROM patient
     WHERE patient_id = p_patient_id;

    IF v_patient_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 51002,
                MESSAGE_TEXT = 'Patient not found';
    END IF;

    -- Validate facility.
    SELECT COUNT(*)
      INTO v_facility_exists
      FROM facility
     WHERE facility_id = p_facility_id;

    IF v_facility_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 51003,
                MESSAGE_TEXT = 'Facility not found';
    END IF;

    -- Validate doctor.
    SELECT COUNT(*)
      INTO v_doctor_exists
      FROM doctor
     WHERE doctor_id = p_doctor_id;

    IF v_doctor_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MYSQL_ERRNO = 51004,
                MESSAGE_TEXT = 'Doctor not found';
    END IF;

    -- Create admission.
    INSERT INTO admission (
        patient_id,
        facility_id,
        admission_date,
        discharge_date
    )
    VALUES (
        p_patient_id,
        p_facility_id,
        p_admission_date,
        NULL
    );

    SET p_admission_id = LAST_INSERT_ID();

    -- Assign the initial doctor as part of the same transaction.
    INSERT INTO admission_doctor (
        admission_id,
        doctor_id
    )
    VALUES (
        p_admission_id,
        p_doctor_id
    );

    COMMIT;

    SELECT p_admission_id AS admission_id;
END;DROP PROCEDURE IF EXISTS sp_allocate_resource;

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
END;CREATE TABLE IF NOT EXISTS patient (
    patient_id BIGINT NOT NULL AUTO_INCREMENT,
    name       VARCHAR(150) NOT NULL,
    DOB        DATE NOT NULL,
    PRIMARY KEY (patient_id)
);

CREATE TABLE IF NOT EXISTS doctor (
    doctor_id       BIGINT NOT NULL AUTO_INCREMENT,
    name            VARCHAR(150) NOT NULL,
    specialisation  VARCHAR(120) NOT NULL,
    contact_number  VARCHAR(20)  NOT NULL,
    PRIMARY KEY (doctor_id)
);

CREATE TABLE IF NOT EXISTS facility (
    facility_id     BIGINT NOT NULL AUTO_INCREMENT,
    name            VARCHAR(200) NOT NULL,
    facility_type   VARCHAR(50)  NOT NULL,
    address         VARCHAR(500) NOT NULL,
    contact_number  VARCHAR(20)  NOT NULL,
    PRIMARY KEY (facility_id)
);

CREATE TABLE IF NOT EXISTS admission (
    admission_id    BIGINT NOT NULL AUTO_INCREMENT,
    patient_id      BIGINT NOT NULL,
    facility_id     BIGINT NOT NULL,
    admission_date  DATETIME NOT NULL,
    discharge_date  DATETIME NULL,
    PRIMARY KEY (admission_id),
    KEY idx_admission_patient (patient_id),
    KEY idx_admission_facility (facility_id),
    CONSTRAINT fk_admission_patient  FOREIGN KEY (patient_id)  REFERENCES patient (patient_id),
    CONSTRAINT fk_admission_facility FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
);

CREATE TABLE IF NOT EXISTS admission_doctor (
    admission_id BIGINT NOT NULL,
    doctor_id    BIGINT NOT NULL,
    PRIMARY KEY (admission_id, doctor_id),
    KEY idx_admdoc_doctor (doctor_id),
    CONSTRAINT fk_admdoc_admission FOREIGN KEY (admission_id) REFERENCES admission (admission_id),
    CONSTRAINT fk_admdoc_doctor    FOREIGN KEY (doctor_id)    REFERENCES doctor (doctor_id)
);

CREATE TABLE IF NOT EXISTS app_user (
    user_id        BIGINT NOT NULL AUTO_INCREMENT,
    name           VARCHAR(150) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    status         VARCHAR(30)  NOT NULL,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_app_user_email (email)
);

CREATE TABLE IF NOT EXISTS `role` (
    role_id    BIGINT NOT NULL AUTO_INCREMENT,
    role_name  VARCHAR(50) NOT NULL,
    PRIMARY KEY (role_id),
    UNIQUE KEY uq_role_name (role_name)
);

CREATE TABLE IF NOT EXISTS user_role (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    KEY idx_user_role_role (role_id),
    CONSTRAINT fk_user_role_user FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES `role` (role_id)
);

CREATE TABLE IF NOT EXISTS api_client (
    client_id        BIGINT NOT NULL AUTO_INCREMENT,
    client_name      VARCHAR(200) NOT NULL,
    client_type      VARCHAR(60)  NOT NULL,
    credential_hash  VARCHAR(255) NOT NULL,
    status           VARCHAR(30)  NOT NULL,
    created_at       DATETIME NOT NULL,
    PRIMARY KEY (client_id)
);CREATE TABLE IF NOT EXISTS transition_requirement (
    requirement_id  BIGINT        NOT NULL AUTO_INCREMENT,
    discharge_id    BIGINT        NOT NULL,
    recovery_id     BIGINT        NOT NULL,
    resource_type   VARCHAR(100)  NOT NULL,
    required_form   VARCHAR(200)  NULL,
    required_until  DATETIME      NULL,
    status          VARCHAR(30)   NOT NULL DEFAULT 'PENDING',

    PRIMARY KEY (requirement_id),

    KEY idx_transition_requirement_discharge (discharge_id),
    KEY idx_transition_requirement_recovery  (recovery_id),
    KEY idx_transition_requirement_status    (status),

    CONSTRAINT fk_transition_requirement_discharge
        FOREIGN KEY (discharge_id) REFERENCES discharge_plan (discharge_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_transition_requirement_recovery
        FOREIGN KEY (recovery_id) REFERENCES recovery_episode (recovery_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_transition_requirement_status
        CHECK (status IN ('PENDING', 'ALLOCATED', 'FULFILLED', 'CANCELLED'))
);DROP TRIGGER IF EXISTS trg_allocation_status_requirement;

CREATE TRIGGER trg_allocation_status_requirement
AFTER UPDATE ON resource_allocation
FOR EACH ROW
BEGIN
    DECLARE v_remaining INT DEFAULT 0;

    IF NEW.requirement_id IS NOT NULL
       AND NEW.allocation_status <> OLD.allocation_status THEN

        IF NEW.allocation_status = 'COMPLETED' THEN

            UPDATE transition_requirement
               SET status = 'FULFILLED'
             WHERE requirement_id = NEW.requirement_id
               AND status IN ('PENDING', 'ALLOCATED');

        ELSEIF NEW.allocation_status = 'CANCELLED' THEN

            SELECT COUNT(*)
              INTO v_remaining
              FROM resource_allocation
             WHERE requirement_id = NEW.requirement_id
               AND allocation_id <> NEW.allocation_id
               AND allocation_status IN ('ACTIVE', 'COMPLETED');

            IF v_remaining = 0 THEN

                UPDATE transition_requirement
                   SET status = 'PENDING'
                 WHERE requirement_id = NEW.requirement_id
                   AND status = 'ALLOCATED';

            END IF;

        END IF;

    END IF;

END;CREATE TABLE IF NOT EXISTS user_role (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    KEY idx_user_role_role (role_id),
    CONSTRAINT fk_user_role_user
        FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT fk_user_role_role
        FOREIGN KEY (role_id) REFERENCES `role` (role_id)
);CREATE OR REPLACE VIEW v_patient_admission_summary AS
SELECT
    p.patient_id,
    p.name AS patient_name,
    a.admission_id,
    a.admission_date,
    a.discharge_date,
    f.facility_id,
    f.name AS facility_name,
    f.facility_type,
    CASE
        WHEN a.discharge_date IS NULL THEN 'ACTIVE'
        ELSE 'DISCHARGED'
    END AS discharge_status
FROM patient p
JOIN admission a
    ON a.patient_id = p.patient_id
JOIN facility f
    ON f.facility_id = a.facility_id;CREATE OR REPLACE VIEW v_transition_readiness AS
SELECT
    p.patient_id,
    p.name AS patient_name,
    a.admission_id,
    dp.discharge_id,
    dp.discharge_date,
    dp.status AS discharge_status,
    dp.destination_facility_id,
    df.name AS destination_facility_name,

    COALESCE(req.total_requirements, 0) AS total_requirements,
    COALESCE(req.pending_requirements, 0) AS pending_requirements,
    COALESCE(req.allocated_requirements, 0) AS allocated_requirements,
    COALESCE(req.fulfilled_requirements, 0) AS fulfilled_requirements,

    COALESCE(req.pending_requirements, 0)
        + COALESCE(req.allocated_requirements, 0)
        AS outstanding_requirements,

    req.next_deadline,
    COALESCE(req.recovery_episodes, 0) AS recovery_episodes,
    req.recovery_statuses,

    COALESCE(al.active_allocations, 0) AS active_allocations,
    COALESCE(al.completed_allocations, 0) AS completed_allocations,

    h.handoff_id,
    h.status AS handoff_status,
    h.from_facility_id AS handoff_from_facility_id,
    h.to_facility_id AS handoff_to_facility_id,
    h.handoff_date,
    h.acknowledged_at,

    CASE
        WHEN dp.status = 'CANCELLED'
            THEN 'CANCELLED'

        WHEN dp.status = 'COMPLETED'
            THEN 'COMPLETED'

        WHEN COALESCE(req.total_requirements, 0) = 0
            THEN 'NO_REQUIREMENTS'

        WHEN COALESCE(req.pending_requirements, 0)
             + COALESCE(req.allocated_requirements, 0) > 0
            THEN 'REQUIREMENTS_OUTSTANDING'

        WHEN dp.destination_facility_id IS NULL
            THEN 'READY'

        WHEN h.status = 'ACKNOWLEDGED'
            THEN 'READY'

        WHEN h.status = 'REJECTED'
            THEN 'HANDOFF_REJECTED'

        ELSE 'AWAITING_HANDOFF'
    END AS readiness_status

FROM discharge_plan dp

JOIN admission a
    ON a.admission_id = dp.admission_id

JOIN patient p
    ON p.patient_id = a.patient_id

LEFT JOIN facility df
    ON df.facility_id = dp.destination_facility_id

LEFT JOIN (
    SELECT
        tr.discharge_id,

        CAST(COUNT(*) AS SIGNED)
            AS total_requirements,

        CAST(
            SUM(tr.status = 'PENDING')
            AS SIGNED
        ) AS pending_requirements,

        CAST(
            SUM(tr.status = 'ALLOCATED')
            AS SIGNED
        ) AS allocated_requirements,

        CAST(
            SUM(tr.status = 'FULFILLED')
            AS SIGNED
        ) AS fulfilled_requirements,

        MIN(
            CASE
                WHEN tr.status IN ('PENDING', 'ALLOCATED')
                THEN tr.required_until
            END
        ) AS next_deadline,

        COUNT(DISTINCT tr.recovery_id)
            AS recovery_episodes,

        GROUP_CONCAT(
            DISTINCT re.status
            ORDER BY re.status
            SEPARATOR ','
        ) AS recovery_statuses

    FROM transition_requirement tr

    JOIN recovery_episode re
        ON re.recovery_id = tr.recovery_id

    WHERE tr.status <> 'CANCELLED'

    GROUP BY tr.discharge_id
) req
    ON req.discharge_id = dp.discharge_id

LEFT JOIN (
    SELECT
        tr.discharge_id,

        CAST(
            SUM(ra.allocation_status = 'ACTIVE')
            AS SIGNED
        ) AS active_allocations,

        CAST(
            SUM(ra.allocation_status = 'COMPLETED')
            AS SIGNED
        ) AS completed_allocations

    FROM transition_requirement tr

    JOIN resource_allocation ra
        ON ra.requirement_id = tr.requirement_id

    WHERE ra.allocation_status IN ('ACTIVE', 'COMPLETED')

    GROUP BY tr.discharge_id
) al
    ON al.discharge_id = dp.discharge_id

LEFT JOIN care_handoff h
    ON h.handoff_id = (
        SELECT MAX(h2.handoff_id)
        FROM care_handoff h2
        WHERE h2.discharge_id = dp.discharge_id
    );-- DDL evolution for the foundational clinical schema.
-- This script demonstrates ALTER TABLE, index creation,
-- and a controlled DROP of a temporary demonstration index.

-- Add a useful index for patient-name searches.
ALTER TABLE patient
    ADD INDEX idx_patient_name (name);

-- Add a useful index for doctor-specialisation searches.
ALTER TABLE doctor
    ADD INDEX idx_doctor_specialisation (specialisation);

-- Add a useful index for admission-date searches.
ALTER TABLE admission
    ADD INDEX idx_admission_date (admission_date);

-- Controlled DROP:
-- Create a temporary demonstration index and remove it safely.
ALTER TABLE facility
    ADD INDEX idx_facility_demo_drop (facility_type);

ALTER TABLE facility
    DROP INDEX idx_facility_demo_drop;-- Atomic admission creation and initial doctor assignment.
-- Set the input variables before executing this transaction.

SET @patient_id = 1;
SET @facility_id = 1;
SET @doctor_id = 1;
SET @admission_date = CURRENT_TIMESTAMP;

START TRANSACTION;

-- Validate that the patient exists.
SELECT patient_id
FROM patient
WHERE patient_id = @patient_id
FOR UPDATE;

-- Validate that the facility exists.
SELECT facility_id
FROM facility
WHERE facility_id = @facility_id
FOR UPDATE;

-- Validate that the doctor exists.
SELECT doctor_id
FROM doctor
WHERE doctor_id = @doctor_id
FOR UPDATE;

-- Create the admission.
INSERT INTO admission (
    patient_id,
    facility_id,
    admission_date,
    discharge_date
)
VALUES (
    @patient_id,
    @facility_id,
    @admission_date,
    NULL
);

SET @admission_id = LAST_INSERT_ID();

-- Assign the initial doctor.
INSERT INTO admission_doctor (
    admission_id,
    doctor_id
)
VALUES (
    @admission_id,
    @doctor_id
);

-- Return the newly created admission.
SELECT @admission_id AS admission_id;

COMMIT;START TRANSACTION;

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

COMMIT;SET @w_start = COALESCE(
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
ORDER BY r.resource_type, r.facility_id, r.resource_id;-- ADMISSION DML
-- Foundational DML operations for the ADMISSION table

-- Select an existing patient and facility for the test admission
SET @test_patient_id = (
    SELECT patient_id
    FROM patient
    ORDER BY patient_id
    LIMIT 1
);

SET @test_facility_id = (
    SELECT facility_id
    FROM facility
    ORDER BY facility_id
    LIMIT 1
);

-- 1. INSERT
INSERT INTO admission
    (patient_id, facility_id, admission_date, discharge_date)
VALUES
    (@test_patient_id,
     @test_facility_id,
     '2026-10-04 10:00:00',
     NULL);

-- Store the newly created admission ID
SET @test_admission_id = LAST_INSERT_ID();

-- 2. SELECT
SELECT admission_id,
       patient_id,
       facility_id,
       admission_date,
       discharge_date
FROM admission
ORDER BY admission_id;

-- 3. UPDATE
UPDATE admission
SET discharge_date = '2026-10-05 15:00:00'
WHERE admission_id = @test_admission_id;

-- 4. DELETE
DELETE FROM admission
WHERE admission_id = @test_admission_id;-- FOUNDATIONAL AGGREGATE QUERIES
-- GROUP BY, aggregate functions, HAVING and ORDER BY


-- 1. Number of admissions for each facility

SELECT
    f.facility_id,
    f.name AS facility_name,
    COUNT(a.admission_id) AS total_admissions
FROM facility f
LEFT JOIN admission a
    ON a.facility_id = f.facility_id
GROUP BY
    f.facility_id,
    f.name
ORDER BY
    total_admissions DESC;


-- 2. Facilities with more than one admission

SELECT
    f.facility_id,
    f.name AS facility_name,
    COUNT(a.admission_id) AS total_admissions
FROM facility f
INNER JOIN admission a
    ON a.facility_id = f.facility_id
GROUP BY
    f.facility_id,
    f.name
HAVING COUNT(a.admission_id) > 1
ORDER BY
    total_admissions DESC;


-- 3. Number of admissions handled by each doctor

SELECT
    d.doctor_id,
    d.name AS doctor_name,
    d.specialisation,
    COUNT(ad.admission_id) AS total_admissions
FROM doctor d
LEFT JOIN admission_doctor ad
    ON ad.doctor_id = d.doctor_id
GROUP BY
    d.doctor_id,
    d.name,
    d.specialisation
ORDER BY
    total_admissions DESC;


-- 4. Patients with multiple admissions

SELECT
    p.patient_id,
    p.name AS patient_name,
    COUNT(a.admission_id) AS admission_count
FROM patient p
INNER JOIN admission a
    ON a.patient_id = p.patient_id
GROUP BY
    p.patient_id,
    p.name
HAVING COUNT(a.admission_id) > 1
ORDER BY
    admission_count DESC;-- FOUNDATIONAL DDL EVOLUTION
-- Meaningful schema evolution using ALTER TABLE


-- 1. Add an index to improve patient name searches
ALTER TABLE patient
ADD INDEX idx_patient_name (name);


-- 2. Add an index to improve doctor specialisation searches
ALTER TABLE doctor
ADD INDEX idx_doctor_specialisation (specialisation);-- DOCTOR DML
-- Foundational DML operations for the DOCTOR table

-- 1. INSERT
INSERT INTO doctor (name, specialisation, contact_number)
VALUES ('Test Doctor', 'General Medicine', '9999999999');

-- Store the ID of the inserted doctor
SET @test_doctor_id = LAST_INSERT_ID();

-- 2. SELECT
SELECT doctor_id, name, specialisation, contact_number
FROM doctor
ORDER BY doctor_id;

-- 3. UPDATE
UPDATE doctor
SET specialisation = 'Internal Medicine'
WHERE doctor_id = @test_doctor_id;

-- 4. DELETE
DELETE FROM doctor
WHERE doctor_id = @test_doctor_id;-- FACILITY DML
-- Foundational DML operations for the FACILITY table

-- 1. INSERT
INSERT INTO facility
    (name, facility_type, address, contact_number)
VALUES
    ('Test Medical Center',
     'Hospital',
     '123 Test Street',
     '8888888888');

-- 2. SELECT
SELECT facility_id,
       name,
       facility_type,
       address,
       contact_number
FROM facility
ORDER BY facility_id;

-- 3. UPDATE
UPDATE facility
SET address = '456 Updated Street'
WHERE name = 'Test Medical Center';

-- 4. DELETE
DELETE FROM facility
WHERE name = 'Test Medical Center';-- FOUNDATIONAL JOIN QUERIES
-- Relationships between patients, admissions, doctors and facilities


-- 1. PATIENT -> ADMISSION
-- Shows each patient's admissions

SELECT
    p.patient_id,
    p.name AS patient_name,
    p.DOB,
    a.admission_id,
    a.admission_date,
    a.discharge_date
FROM patient p
INNER JOIN admission a
    ON a.patient_id = p.patient_id
ORDER BY p.patient_id, a.admission_date;


-- 2. ADMISSION -> DOCTOR
-- Shows doctors assigned to each admission

SELECT
    a.admission_id,
    a.patient_id,
    d.doctor_id,
    d.name AS doctor_name,
    d.specialisation,
    d.contact_number
FROM admission a
INNER JOIN admission_doctor ad
    ON ad.admission_id = a.admission_id
INNER JOIN doctor d
    ON d.doctor_id = ad.doctor_id
ORDER BY a.admission_id, d.doctor_id;


-- 3. ADMISSION -> FACILITY
-- Shows the facility where each admission occurred

SELECT
    a.admission_id,
    a.patient_id,
    p.name AS patient_name,
    f.facility_id,
    f.name AS facility_name,
    f.facility_type,
    a.admission_date,
    a.discharge_date
FROM admission a
INNER JOIN patient p
    ON p.patient_id = a.patient_id
INNER JOIN facility f
    ON f.facility_id = a.facility_id
ORDER BY a.admission_id;-- PATIENT DML
-- Foundational DML operations for the PATIENT table

-- 1. INSERT
INSERT INTO patient (name, DOB)
VALUES ('Test Patient', '2000-01-15');

-- Store the ID of the inserted patient
SET @test_patient_id = LAST_INSERT_ID();

-- 2. SELECT
SELECT patient_id, name, DOB
FROM patient
ORDER BY patient_id;

-- 3. UPDATE
UPDATE patient
SET name = 'Updated Test Patient'
WHERE patient_id = @test_patient_id;

-- 4. DELETE
DELETE FROM patient
WHERE patient_id = @test_patient_id;-- ROLE SEED
-- Required application roles for authentication and authorization.

INSERT INTO role (role_name)
VALUES
    ('ADMIN'),
    ('CARE_COORDINATOR')
ON DUPLICATE KEY UPDATE
    role_name = VALUES(role_name);-- FOUNDATIONAL SUBQUERY QUERIES
-- Subqueries involving PATIENT and ADMISSION


-- 1. Patients who have more than one admission

SELECT
    p.patient_id,
    p.name AS patient_name,
    p.DOB
FROM patient p
WHERE p.patient_id IN (
    SELECT a.patient_id
    FROM admission a
    GROUP BY a.patient_id
    HAVING COUNT(a.admission_id) > 1
)
ORDER BY p.patient_id;


-- 2. Patients who have at least one admission

SELECT
    p.patient_id,
    p.name AS patient_name,
    p.DOB
FROM patient p
WHERE EXISTS (
    SELECT 1
    FROM admission a
    WHERE a.patient_id = p.patient_id
)
ORDER BY p.patient_id;


-- 3. Admissions belonging to the patient with the highest number
-- of admissions

SELECT
    a.admission_id,
    a.patient_id,
    a.facility_id,
    a.admission_date,
    a.discharge_date
FROM admission a
WHERE a.patient_id = (
    SELECT a2.patient_id
    FROM admission a2
    GROUP BY a2.patient_id
    ORDER BY COUNT(*) DESC
    LIMIT 1
)
ORDER BY a.admission_date;SET @util_from = CAST(COALESCE(@util_from, NOW() - INTERVAL 30 DAY) AS DATETIME);
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