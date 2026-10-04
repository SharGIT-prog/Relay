-- ROLE SEED
-- Required application roles for authentication and authorization.

INSERT INTO role (role_name)
VALUES
    ('ADMIN'),
    ('CARE_COORDINATOR')
ON DUPLICATE KEY UPDATE
    role_name = VALUES(role_name);