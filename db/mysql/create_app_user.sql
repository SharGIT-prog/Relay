CREATE TABLE IF NOT EXISTS app_user (
    user_id        BIGINT NOT NULL AUTO_INCREMENT,
    name           VARCHAR(150) NOT NULL,
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    status         VARCHAR(30) NOT NULL,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_app_user_email (email)
);