-- FOUNDATIONAL AGGREGATE QUERIES
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
    admission_count DESC;