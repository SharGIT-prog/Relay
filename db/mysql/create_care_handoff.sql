CREATE TABLE IF NOT EXISTS care_handoff (
    handoff_id        BIGINT       NOT NULL AUTO_INCREMENT,
    admission_id      BIGINT       NOT NULL,
    discharge_id      BIGINT       NOT NULL,
    from_facility_id  BIGINT       NOT NULL,
    to_facility_id    BIGINT       NOT NULL,
    status            VARCHAR(30)  NOT NULL DEFAULT 'PREPARED',
    handoff_date      DATETIME     NOT NULL,
    acknowledged_at   DATETIME     NULL,
    created_by        BIGINT       NOT NULL,

    PRIMARY KEY (handoff_id),

    KEY idx_care_handoff_discharge     (discharge_id),
    KEY idx_care_handoff_to_facility   (to_facility_id),
    KEY idx_care_handoff_status        (status),
    KEY idx_care_handoff_admission     (admission_id),
    KEY idx_care_handoff_from_facility (from_facility_id),
    KEY idx_care_handoff_created_by    (created_by),

    CONSTRAINT fk_care_handoff_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_handoff_discharge
        FOREIGN KEY (discharge_id) REFERENCES discharge_plan (discharge_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_handoff_from_facility
        FOREIGN KEY (from_facility_id) REFERENCES facility (facility_id),
    CONSTRAINT fk_care_handoff_to_facility
        FOREIGN KEY (to_facility_id) REFERENCES facility (facility_id),
    CONSTRAINT fk_care_handoff_created_by
        FOREIGN KEY (created_by) REFERENCES app_user (user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_care_handoff_status
        CHECK (status IN ('PREPARED', 'SENT', 'ACKNOWLEDGED', 'REJECTED')),
    CONSTRAINT chk_care_handoff_facilities_differ
        CHECK (from_facility_id <> to_facility_id),
    CONSTRAINT chk_care_handoff_ack
        CHECK (status <> 'ACKNOWLEDGED' OR acknowledged_at IS NOT NULL)
);