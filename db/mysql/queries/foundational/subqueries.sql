-- FOUNDATIONAL SUBQUERY QUERIES
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
ORDER BY a.admission_date;