CREATE TABLE IF NOT EXISTS transition_requirement (
    requirement_id  BIGINT        NOT NULL AUTO_INCREMENT,
    discharge_id    BIGINT        NOT NULL,
    recovery_id     BIGINT        NOT NULL,
    resource_type   VARCHAR(100)  NOT NULL,
    required_form   VARCHAR(200)  NULL,
    required_until  DATETIME      NULL,
    status          VARCHAR(30)   NOT NULL DEFAULT 'PENDING',

    PRIMARY KEY (requirement_id),

    KEY idx_transition_requirement_discharge (discharge_id),
    KEY idx_transition_requirement_recovery  (recovery_id),
    KEY idx_transition_requirement_status    (status),

    CONSTRAINT fk_transition_requirement_discharge
        FOREIGN KEY (discharge_id) REFERENCES discharge_plan (discharge_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_transition_requirement_recovery
        FOREIGN KEY (recovery_id) REFERENCES recovery_episode (recovery_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_transition_requirement_status
        CHECK (status IN ('PENDING', 'ALLOCATED', 'FULFILLED', 'CANCELLED'))
);