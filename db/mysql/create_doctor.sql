CREATE TABLE IF NOT EXISTS doctor (
    doctor_id       BIGINT NOT NULL AUTO_INCREMENT,
    name            VARCHAR(150) NOT NULL,
    specialisation  VARCHAR(120) NOT NULL,
    contact_number  VARCHAR(20) NOT NULL,
    PRIMARY KEY (doctor_id)
);