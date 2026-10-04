CREATE TABLE IF NOT EXISTS facility (
    facility_id     BIGINT NOT NULL AUTO_INCREMENT,
    name            VARCHAR(200) NOT NULL,
    facility_type   VARCHAR(50) NOT NULL,
    address         VARCHAR(500) NOT NULL,
    contact_number  VARCHAR(20) NOT NULL,
    PRIMARY KEY (facility_id)
);