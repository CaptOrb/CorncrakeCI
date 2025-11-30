ALTER TABLE repositories
    ADD COLUMN webhook_setup BOOLEAN DEFAULT FALSE,
    ADD COLUMN webhook_url TEXT,
    ADD COLUMN webhook_id TEXT;
