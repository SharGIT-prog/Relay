CREATE TABLE IF NOT EXISTS patient (
    patient_id BIGINT NOT NULL AUTO_INCREMENT,
    name       VARCHAR(150) NOT NULL,
    DOB        DATE NOT NULL,
    PRIMARY KEY (patient_id)
);

CREATE TABLE IF NOT EXISTS doctor (
    doctor_id       BIGINT NOT NULL AUTO_INCREMENT,
    name            VARCHAR(150) NOT NULL,
    specialisation  VARCHAR(120) NOT NULL,
    contact_number  VARCHAR(20)  NOT NULL,
    PRIMARY KEY (doctor_id)
);

CREATE TABLE IF NOT EXISTS facility (
    facility_id     BIGINT NOT NULL AUTO_INCREMENT,
    name            VARCHAR(200) NOT NULL,
    facility_type   VARCHAR(50)  NOT NULL,
    address         VARCHAR(500) NOT NULL,
    contact_number  VARCHAR(20)  NOT NULL,
    PRIMARY KEY (facility_id)
);

CREATE TABLE IF NOT EXISTS admission (
    admission_id    BIGINT NOT NULL AUTO_INCREMENT,
    patient_id      BIGINT NOT NULL,
    facility_id     BIGINT NOT NULL,
    admission_date  DATETIME NOT NULL,
    discharge_date  DATETIME NULL,
    PRIMARY KEY (admission_id),
    KEY idx_admission_patient (patient_id),
    KEY idx_admission_facility (facility_id),
    CONSTRAINT fk_admission_patient  FOREIGN KEY (patient_id)  REFERENCES patient (patient_id),
    CONSTRAINT fk_admission_facility FOREIGN KEY (facility_id) REFERENCES facility (facility_id)
);

CREATE TABLE IF NOT EXISTS admission_doctor (
    admission_id BIGINT NOT NULL,
    doctor_id    BIGINT NOT NULL,
    PRIMARY KEY (admission_id, doctor_id),
    KEY idx_admdoc_doctor (doctor_id),
    CONSTRAINT fk_admdoc_admission FOREIGN KEY (admission_id) REFERENCES admission (admission_id),
    CONSTRAINT fk_admdoc_doctor    FOREIGN KEY (doctor_id)    REFERENCES doctor (doctor_id)
);

CREATE TABLE IF NOT EXISTS app_user (
    user_id        BIGINT NOT NULL AUTO_INCREMENT,
    name           VARCHAR(150) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    status         VARCHAR(30)  NOT NULL,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_app_user_email (email)
);

CREATE TABLE IF NOT EXISTS `role` (
    role_id    BIGINT NOT NULL AUTO_INCREMENT,
    role_name  VARCHAR(50) NOT NULL,
    PRIMARY KEY (role_id),
    UNIQUE KEY uq_role_name (role_name)
);

CREATE TABLE IF NOT EXISTS user_role (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    KEY idx_user_role_role (role_id),
    CONSTRAINT fk_user_role_user FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES `role` (role_id)
);

CREATE TABLE IF NOT EXISTS api_client (
    client_id        BIGINT NOT NULL AUTO_INCREMENT,
    client_name      VARCHAR(200) NOT NULL,
    client_type      VARCHAR(60)  NOT NULL,
    credential_hash  VARCHAR(255) NOT NULL,
    status           VARCHAR(30)  NOT NULL,
    created_at       DATETIME NOT NULL,
    PRIMARY KEY (client_id)
);