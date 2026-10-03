-- ADMISSION DML
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
WHERE admission_id = @test_admission_id;