-- FOUNDATIONAL DDL EVOLUTION
-- Meaningful schema evolution using ALTER TABLE


-- 1. Add an index to improve patient name searches
ALTER TABLE patient
ADD INDEX idx_patient_name (name);


-- 2. Add an index to improve doctor specialisation searches
ALTER TABLE doctor
ADD INDEX idx_doctor_specialisation (specialisation);