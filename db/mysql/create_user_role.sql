CREATE TABLE IF NOT EXISTS user_role (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    KEY idx_user_role_role (role_id),
    CONSTRAINT fk_user_role_user
        FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT fk_user_role_role
        FOREIGN KEY (role_id) REFERENCES `role` (role_id)
);