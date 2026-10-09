DROP PROCEDURE IF EXISTS sp_create_admission;

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
END;