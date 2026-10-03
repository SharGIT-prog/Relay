CREATE TABLE IF NOT EXISTS care_document_chunk (
    chunk_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id  BIGINT       NOT NULL,
    chunk_index  INTEGER      NOT NULL CHECK (chunk_index >= 0),
    content      TEXT         NOT NULL CHECK (length(btrim(content)) > 0),
    embedding    VECTOR(384)  NOT NULL,
    metadata     JSONB        NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_chunk_document_index UNIQUE (document_id, chunk_index)
);

COMMENT ON TABLE care_document_chunk IS
  'Chunks of care documents with embeddings from Xenova/all-MiniLM-L6-v2 (384 dims, cosine).';
COMMENT ON COLUMN care_document_chunk.document_id IS
  'Logical reference to MySQL CARE_DOCUMENT.document_id (no native cross-DB FK).';