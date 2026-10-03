-- DOCTOR DML
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
WHERE doctor_id = @test_doctor_id;