CREATE TABLE IF NOT EXISTS discharge_plan (
    discharge_id             BIGINT       NOT NULL AUTO_INCREMENT,
    admission_id             BIGINT       NOT NULL,
    doctor_id                BIGINT       NOT NULL,
    discharge_date           DATETIME     NOT NULL,
    status                   VARCHAR(30)  NOT NULL DEFAULT 'PLANNED',
    destination_facility_id  BIGINT       NULL,
    notes                    TEXT         NULL,

    PRIMARY KEY (discharge_id),

    KEY idx_discharge_plan_admission   (admission_id),
    KEY idx_discharge_plan_doctor      (doctor_id),
    KEY idx_discharge_plan_destination (destination_facility_id),

    CONSTRAINT fk_discharge_plan_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_discharge_plan_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctor (doctor_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_discharge_plan_destination
        FOREIGN KEY (destination_facility_id) REFERENCES facility (facility_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_discharge_plan_status
        CHECK (status IN ('PLANNED', 'READY', 'COMPLETED', 'CANCELLED'))
);