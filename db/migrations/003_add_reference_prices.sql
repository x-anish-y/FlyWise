-- FlyWise (APIx) — Migration 003: Add reference_prices table
-- Stores base-period reference prices for Jevons index computation.
-- The reference price for each route/window/service_spec_id is the
-- Day-1 median — the first day we have real observations for that cell.

CREATE TABLE IF NOT EXISTS reference_prices (
    route_id        VARCHAR(10) NOT NULL REFERENCES routes(route_id),
    window_category VARCHAR(20) NOT NULL,
    advance_days    INT NOT NULL,
    service_spec_id VARCHAR(100),           -- NULL = "generic" (all service specs combined)
    reference_price NUMERIC NOT NULL,       -- Day-1 median total_fare_inr
    reference_date  DATE NOT NULL,          -- The base-period date
    n_observations  INT NOT NULL DEFAULT 1, -- Count used to compute the median
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (route_id, window_category, advance_days, COALESCE(service_spec_id, '__GENERIC__'))
);

-- NOTE: The composite PK uses COALESCE because service_spec_id can be NULL.
-- We use a functional unique index instead:
ALTER TABLE reference_prices DROP CONSTRAINT IF EXISTS reference_prices_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS idx_refprice_pk
    ON reference_prices (route_id, window_category, advance_days, COALESCE(service_spec_id, '__GENERIC__'));
