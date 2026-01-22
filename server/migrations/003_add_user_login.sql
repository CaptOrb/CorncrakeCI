ALTER TABLE users
-- The human-readable login/username from the forge
ADD COLUMN forge_username TEXT NOT NULL;