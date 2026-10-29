CREATE TABLE IF NOT EXISTS game_rooms (
    code text PRIMARY KEY,
    data jsonb NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS game_rooms_expiration ON game_rooms(expires_at);
