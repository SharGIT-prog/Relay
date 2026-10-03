CREATE TABLE IF NOT EXISTS recovery_episode (
    recovery_id  BIGINT       NOT NULL AUTO_INCREMENT,
    patient_id   BIGINT       NOT NULL,
    facility_id  BIGINT       NOT NULL,
    start_date   DATE         NOT NULL,
    end_date     DATE         NULL,
    status       VARCHAR(30)  NOT NULL DEFAULT 'PLANNED',

    PRIMARY KEY (recovery_id),

    KEY idx_recovery_episode_patient  (patient_id),
    KEY idx_recovery_episode_facility (facility_id),
    KEY idx_recovery_episode_status   (status),

    CONSTRAINT fk_recovery_episode_patient
        FOREIGN KEY (patient_id) REFERENCES patient (patient_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_recovery_episode_facility
        FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_recovery_episode_status
        CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_recovery_episode_dates
        CHECK (end_date IS NULL OR end_date >= start_date)
);