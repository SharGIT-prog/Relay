CREATE TABLE IF NOT EXISTS resource (
    resource_id    BIGINT       NOT NULL AUTO_INCREMENT,
    resource_type  VARCHAR(100) NOT NULL,
    availability   VARCHAR(30)  NOT NULL DEFAULT 'AVAILABLE',
    facility_id    BIGINT       NOT NULL,

    PRIMARY KEY (resource_id),

    KEY idx_resource_type         (resource_type),
    KEY idx_resource_availability (availability),
    KEY idx_resource_facility     (facility_id),

    CONSTRAINT fk_resource_facility
        FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT chk_resource_availability
        CHECK (availability IN ('AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'))
);