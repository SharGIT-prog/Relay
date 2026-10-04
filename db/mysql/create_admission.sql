CREATE TABLE IF NOT EXISTS admission (
    admission_id    BIGINT NOT NULL AUTO_INCREMENT,
    patient_id      BIGINT NOT NULL,
    facility_id     BIGINT NOT NULL,
    admission_date  DATETIME NOT NULL,
    discharge_date  DATETIME NULL,
    PRIMARY KEY (admission_id),
    KEY idx_admission_patient (patient_id),
    KEY idx_admission_facility (facility_id),
    CONSTRAINT fk_admission_patient
        FOREIGN KEY (patient_id) REFERENCES patient (patient_id),
    CONSTRAINT fk_admission_facility
        FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;