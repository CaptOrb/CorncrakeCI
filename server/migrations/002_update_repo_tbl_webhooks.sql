ALTER TABLE repositories
    ADD COLUMN webhook_secret TEXT;
    
-- Secret for authenticating that a webhook request came from the forge.
-- If NULL, means the webhook has not been set up yet.