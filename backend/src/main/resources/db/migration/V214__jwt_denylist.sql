-- Shared JWT denylist for multi-node logout/revocation.
-- Single-node previously used an in-memory map only; that failed closed incorrectly across
-- replicas (logout on node A left the token valid on node B until natural expiry).
-- Memory L1 cache remains optional in application code; the database is authoritative.

CREATE TABLE IF NOT EXISTS platform.jwt_denylist (
    jti            varchar(128) PRIMARY KEY,
    revoked_until  timestamptz  NOT NULL,
    revoked_at     timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT jwt_denylist_jti_ck CHECK (jti ~ '^[A-Za-z0-9._:-]{8,128}$'),
    CONSTRAINT jwt_denylist_until_ck CHECK (revoked_until > revoked_at - interval '1 second')
);

CREATE INDEX IF NOT EXISTS jwt_denylist_until_idx
    ON platform.jwt_denylist (revoked_until);

COMMENT ON TABLE platform.jwt_denylist IS
    'Revoked access-token JTIs until their original expiry; shared across app nodes.';
COMMENT ON COLUMN platform.jwt_denylist.jti IS
    'JWT id claim; never store the full token.';
