CREATE TABLE IF NOT EXISTS admission_doctor (
    admission_id BIGINT NOT NULL,
    doctor_id    BIGINT NOT NULL,
    PRIMARY KEY (admission_id, doctor_id),
    KEY idx_admdoc_doctor (doctor_id),
    CONSTRAINT fk_admdoc_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id),
    CONSTRAINT fk_admdoc_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctor (doctor_id)
);