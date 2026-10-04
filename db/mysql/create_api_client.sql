CREATE TABLE IF NOT EXISTS api_client (
    client_id        BIGINT NOT NULL AUTO_INCREMENT,
    client_name      VARCHAR(200) NOT NULL,
    client_type      VARCHAR(60) NOT NULL,
    credential_hash  VARCHAR(255) NOT NULL,
    status            VARCHAR(30) NOT NULL,
    created_at       DATETIME NOT NULL,
    PRIMARY KEY (client_id)
);