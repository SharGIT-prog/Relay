CREATE OR REPLACE VIEW v_patient_admission_summary AS
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
    ON f.facility_id = a.facility_id;