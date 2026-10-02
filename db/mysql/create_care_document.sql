CREATE TABLE IF NOT EXISTS care_document (
    document_id    BIGINT        NOT NULL AUTO_INCREMENT,
    patient_id     BIGINT        NOT NULL,
    admission_id   BIGINT        NULL,
    recovery_id    BIGINT        NULL,
    document_type  VARCHAR(60)   NOT NULL,
    title          VARCHAR(250)  NOT NULL,
    source         VARCHAR(150)  NOT NULL,
    created_by     BIGINT        NOT NULL,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status         VARCHAR(30)   NOT NULL DEFAULT 'DRAFT',

    PRIMARY KEY (document_id),

    KEY idx_care_document_patient    (patient_id),
    KEY idx_care_document_admission  (admission_id),
    KEY idx_care_document_recovery   (recovery_id),
    KEY idx_care_document_created_by (created_by),
    KEY idx_care_document_status     (status),
    KEY idx_care_document_type       (document_type),

    CONSTRAINT fk_care_document_patient
        FOREIGN KEY (patient_id) REFERENCES patient (patient_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_document_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_document_recovery
        FOREIGN KEY (recovery_id) REFERENCES recovery_episode (recovery_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_care_document_created_by
        FOREIGN KEY (created_by) REFERENCES app_user (user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_care_document_status
        CHECK (status IN ('DRAFT', 'APPROVED', 'ARCHIVED'))
);