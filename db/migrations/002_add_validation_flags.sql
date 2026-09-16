-- FlyWise (APIx) — Migration 002: Add validation_flags table
-- Stores per-observation quality flags without mutating the observations table.
-- Flags are "flag for review, don't auto-delete" — human review decides action.

CREATE TABLE IF NOT EXISTS validation_flags (
    flag_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id UUID NOT NULL REFERENCES observations(observation_id),
    flag_type      VARCHAR(40) NOT NULL,   -- e.g. 'reconciliation_mismatch', 'glitch_fare'
    flag_detail    TEXT,                    -- human-readable explanation
    flagged_at     TIMESTAMP NOT NULL DEFAULT now(),
    resolved       BOOLEAN DEFAULT FALSE,  -- set TRUE after manual review
    resolved_at    TIMESTAMP,
    resolved_by    VARCHAR(50)
);

-- Fast lookups: unresolved flags, flags for a specific observation
CREATE INDEX IF NOT EXISTS idx_vf_observation ON validation_flags(observation_id);
CREATE INDEX IF NOT EXISTS idx_vf_unresolved  ON validation_flags(resolved) WHERE resolved = FALSE;
