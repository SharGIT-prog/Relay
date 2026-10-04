CREATE TABLE IF NOT EXISTS api_client_facility (
    client_id    BIGINT NOT NULL,
    facility_id  BIGINT NOT NULL,

    PRIMARY KEY (client_id, facility_id),
    KEY idx_api_client_facility_facility (facility_id),

    CONSTRAINT fk_api_client_facility_client
        FOREIGN KEY (client_id) REFERENCES api_client (client_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_api_client_facility_facility
        FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);