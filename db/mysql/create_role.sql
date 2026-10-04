CREATE TABLE IF NOT EXISTS `role` (
    role_id    BIGINT NOT NULL AUTO_INCREMENT,
    role_name  VARCHAR(50) NOT NULL,
    PRIMARY KEY (role_id),
    UNIQUE KEY uq_role_name (role_name)
);