-- PATIENT DML
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
WHERE patient_id = @test_patient_id;