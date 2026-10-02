CREATE TABLE IF NOT EXISTS resource_allocation (
    allocation_id      BIGINT       NOT NULL AUTO_INCREMENT,
    admission_id       BIGINT       NOT NULL,
    resource_id        BIGINT       NOT NULL,
    resource_type      VARCHAR(100) NOT NULL,
    start_time         DATETIME     NOT NULL,
    end_time           DATETIME     NOT NULL,
    requirement_id     BIGINT       NULL,
    allocation_status  VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
    allocated_by       BIGINT       NOT NULL,

    PRIMARY KEY (allocation_id),

    -- WHERE resource_id = ? AND start_time < ? AND end_time > ?
    KEY idx_resource_allocation_resource_time (resource_id, start_time, end_time),
    KEY idx_resource_allocation_admission     (admission_id),
    KEY idx_resource_allocation_requirement   (requirement_id),
    KEY idx_resource_allocation_allocated_by  (allocated_by),

    CONSTRAINT fk_resource_allocation_admission
        FOREIGN KEY (admission_id) REFERENCES admission (admission_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_resource_allocation_resource
        FOREIGN KEY (resource_id) REFERENCES resource (resource_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_resource_allocation_requirement
        FOREIGN KEY (requirement_id) REFERENCES transition_requirement (requirement_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_resource_allocation_allocated_by
        FOREIGN KEY (allocated_by) REFERENCES app_user (user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_resource_allocation_time
        CHECK (end_time > start_time),
    CONSTRAINT chk_resource_allocation_status
        CHECK (allocation_status IN ('ACTIVE', 'COMPLETED', 'CANCELLED'))
);