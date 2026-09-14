-- FlyWise (APIx) — Database Schema
-- SIH 2026 · PS26056 · MoSPI/DIID Real-time Airfare Price Index for India
-- Hosted on Neon (PostgreSQL)

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. routes — the 14-route basket (12 core + 2 seasonal)
-- ============================================================
CREATE TABLE routes (
    route_id VARCHAR(10) PRIMARY KEY,
    origin_airport VARCHAR(3) NOT NULL,
    destination_airport VARCHAR(3) NOT NULL,
    domestic_international VARCHAR(15) NOT NULL,
    route_weight NUMERIC,
    currency VARCHAR(3) DEFAULT 'INR',
    is_seasonal BOOLEAN DEFAULT FALSE,
    season_window VARCHAR(30)
);

-- ============================================================
-- 2. observations — every scraped fare observation
-- ============================================================
CREATE TABLE observations (
    observation_id UUID PRIMARY KEY,
    route_id VARCHAR(10) REFERENCES routes(route_id),
    service_type VARCHAR(10) NOT NULL,
    collection_timestamp TIMESTAMP NOT NULL,
    travel_date DATE NOT NULL,
    advance_days INT NOT NULL,
    window_category VARCHAR(20) NOT NULL,
    airline VARCHAR(10),
    flight_number VARCHAR(10),
    operating_carrier VARCHAR(10),
    cabin VARCHAR(20) DEFAULT 'economy',
    fare_family_raw VARCHAR(50),
    fare_family_tier VARCHAR(20),
    baggage_bucket VARCHAR(10),
    service_spec_id VARCHAR(100),
    base_fare NUMERIC,
    taxes NUMERIC,
    mandatory_fees NUMERIC,
    total_fare_original_currency NUMERIC,
    original_currency VARCHAR(3),
    fx_rate_used NUMERIC,
    fx_rate_date DATE,
    total_fare_inr NUMERIC,
    availability_status VARCHAR(20),
    is_imputed BOOLEAN DEFAULT FALSE,
    imputation_method VARCHAR(30),
    quality_score NUMERIC,
    source VARCHAR(30),
    collection_method VARCHAR(30),
    run_id VARCHAR(50),
    raw_reference TEXT,
    methodology_version VARCHAR(10) DEFAULT 'v1.0'
);

-- ============================================================
-- 3. flight_events — operational disruptions (never affects index)
-- ============================================================
CREATE TABLE flight_events (
    event_id UUID PRIMARY KEY,
    flight_number VARCHAR(10),
    travel_date DATE,
    operational_status VARCHAR(20),
    logged_at TIMESTAMP
);

-- ============================================================
-- 4. route_index — per-route Jevons index by window/advance_days
-- ============================================================
CREATE TABLE route_index (
    route_id VARCHAR(10) REFERENCES routes(route_id),
    window_category VARCHAR(20),
    advance_days INT,
    date DATE,
    price_relative NUMERIC,
    n_observations INT,
    PRIMARY KEY (route_id, window_category, advance_days, date)
);

-- ============================================================
-- 5. national_index — aggregated DAPIx, IAPIx, overall APIx
-- ============================================================
CREATE TABLE national_index (
    date DATE,
    window_category VARCHAR(20),
    domestic_apix NUMERIC,
    international_apix NUMERIC,
    overall_apix NUMERIC,
    status VARCHAR(15),
    coverage_score NUMERIC,
    confidence_score NUMERIC,
    PRIMARY KEY (date, window_category)
);
