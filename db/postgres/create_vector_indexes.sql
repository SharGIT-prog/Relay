CREATE INDEX IF NOT EXISTS idx_chunk_embedding_hnsw_cosine
    ON care_document_chunk
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Mapping a retrieved chunk back to its document, and deleting/re-ingesting by document.
CREATE INDEX IF NOT EXISTS idx_chunk_document_id
    ON care_document_chunk (document_id);

-- Metadata filtering (patient_id, admission_id, recovery_id, document_type, source).
CREATE INDEX IF NOT EXISTS idx_chunk_metadata_gin
    ON care_document_chunk
    USING gin (metadata jsonb_path_ops);