-- FACILITY DML
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
WHERE name = 'Test Medical Center';