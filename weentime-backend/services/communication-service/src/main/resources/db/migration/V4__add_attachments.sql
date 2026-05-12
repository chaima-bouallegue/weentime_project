-- ============================================================================
-- V4: Add file attachments support for communication messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS communication.comm_attachments (
    id            UUID PRIMARY KEY,
    entreprise_id BIGINT        NOT NULL,
    uploader_id   BIGINT        NOT NULL,
    message_id    UUID,
    file_name     VARCHAR(500)  NOT NULL,
    original_name VARCHAR(500)  NOT NULL,
    content_type  VARCHAR(200)  NOT NULL,
    file_size     BIGINT        NOT NULL,
    storage_path  VARCHAR(1000) NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_attachments_message
    ON communication.comm_attachments(message_id);

CREATE INDEX IF NOT EXISTS idx_comm_attachments_entreprise
    ON communication.comm_attachments(entreprise_id);

CREATE INDEX IF NOT EXISTS idx_comm_attachments_uploader
    ON communication.comm_attachments(uploader_id, created_at DESC);
