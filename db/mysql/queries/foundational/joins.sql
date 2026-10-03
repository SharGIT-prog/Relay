-- FOUNDATIONAL JOIN QUERIES
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
ORDER BY a.admission_id;