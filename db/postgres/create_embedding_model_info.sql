CREATE TABLE IF NOT EXISTS embedding_model_info (
    singleton        BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    model_name       TEXT        NOT NULL,
    model_version    TEXT        NOT NULL,
    dimension        INTEGER     NOT NULL CHECK (dimension > 0),
    distance_metric  TEXT        NOT NULL CHECK (distance_metric IN ('cosine')),
    registered_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE embedding_model_info IS
  'The one embedding model used for care_document_chunk.embedding. Checked on every ingestion.';