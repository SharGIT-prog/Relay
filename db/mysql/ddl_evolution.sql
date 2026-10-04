-- DDL evolution for the foundational clinical schema.
-- This script demonstrates ALTER TABLE, index creation,
-- and a controlled DROP of a temporary demonstration index.

-- Add a useful index for patient-name searches.
ALTER TABLE patient
    ADD INDEX idx_patient_name (name);

-- Add a useful index for doctor-specialisation searches.
ALTER TABLE doctor
    ADD INDEX idx_doctor_specialisation (specialisation);

-- Add a useful index for admission-date searches.
ALTER TABLE admission
    ADD INDEX idx_admission_date (admission_date);

-- Controlled DROP:
-- Create a temporary demonstration index and remove it safely.
ALTER TABLE facility
    ADD INDEX idx_facility_demo_drop (facility_type);

ALTER TABLE facility
    DROP INDEX idx_facility_demo_drop;