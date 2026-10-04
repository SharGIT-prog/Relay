-- Atomic admission creation and initial doctor assignment.
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

COMMIT;