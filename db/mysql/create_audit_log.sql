CREATE TABLE IF NOT EXISTS audit_log (
    audit_id      BIGINT       NOT NULL AUTO_INCREMENT,
    user_id       BIGINT       NULL,
    client_id     BIGINT       NULL,
    action        VARCHAR(80)  NOT NULL,
    entity_type   VARCHAR(80)  NOT NULL,
    entity_id     VARCHAR(80)  NOT NULL,
    `timestamp`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details       JSON         NULL,

    PRIMARY KEY (audit_id),

    KEY idx_audit_log_timestamp (`timestamp`),
    KEY idx_audit_log_entity    (entity_type, entity_id),
    KEY idx_audit_log_user      (user_id),
    KEY idx_audit_log_client    (client_id),

    CONSTRAINT fk_audit_log_user
        FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT fk_audit_log_client
        FOREIGN KEY (client_id) REFERENCES api_client (client_id),

    CONSTRAINT chk_audit_log_actor
        CHECK (user_id IS NOT NULL OR client_id IS NOT NULL)
);