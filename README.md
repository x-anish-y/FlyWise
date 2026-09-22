# ✈️ FlyWise (APIx) — Real-Time Airfare Price Index for India

<div align="center">

![SIH 2026 Banner](https://img.shields.io/badge/SIH%202026-PS26056-FF6B35?style=for-the-badge&logo=target&logoColor=white)
![Ministry](https://img.shields.io/badge/Ministry-MoSPI%20%7C%20DIID-1E3A8A?style=for-the-badge&logo=government&logoColor=white)
![Status](https://img.shields.io/badge/System_Status-Live%20Production-10B981?style=for-the-badge&logo=statuspage&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-3B82F6?style=for-the-badge)

**Next-Generation High-Frequency Price Intelligence Platform for Indian Civil Aviation**  
*Built for the Ministry of Statistics & Programme Implementation (MoSPI / DIID) — Smart India Hackathon 2026*

[Live Production API](https://flywise-uoxg.onrender.com/docs) • [Interactive API Docs (Swagger)](https://flywise-uoxg.onrender.com/docs) • [System Methodology](docs/methodology.md) • [Edge Cases Defense](docs/edge_cases.md) • [Policy API Guide](docs/policy_api_guide.md)

</div>

---

## 📑 Table of Contents
- [1. Executive Summary & Problem Context](#1-executive-summary--problem-context)
- [2. Platform Architecture & Data Pipeline](#2-platform-architecture--data-pipeline)
- [3. Interactive 3D WebGL Dashboard Showcase](#3-interactive-3d-webgl-dashboard-showcase)
- [4. Statistical & Mathematical Methodology](#4-statistical--mathematical-methodology)
  - [4.1 Elementary Jevons Formulation](#41-elementary-jevons-formulation)
  - [4.2 Upper-Level Young-Type Route Aggregation](#42-upper-level-young-type-route-aggregation)
  - [4.3 Constant-Quality Pricing via FSID](#43-constant-quality-pricing-via-fsid)
  - [4.4 Dual-Track Indexing: CPI-Compatible vs. Analytical](#44-dual-track-indexing-cpi-compatible-vs-analytical)
  - [4.5 Composite Statistical Confidence Metric](#45-composite-statistical-confidence-metric)
- [5. Engineering Edge Cases & Operational Resilience](#5-engineering-edge-cases--operational-resilience)
  - [5.1 Deterministic 4-Tier Imputation Cascade](#51-deterministic-4-tier-imputation-cascade)
  - [5.2 Operational Disruptions vs. Economic Price Signals](#52-operational-disruptions-vs-economic-price-signals)
  - [5.3 Codeshare Deduplication & Carrier Mapping](#53-codeshare-deduplication--carrier-mapping)
  - [5.4 Session Contamination & Anti-Fingerprinting](#54-session-contamination--anti-fingerprinting)
  - [5.5 Glitch Fares & Component Reconciliation](#55-glitch-fares--component-reconciliation)
  - [5.6 Flight Renumbering & Seasonal Routes](#56-flight-renumbering--seasonal-routes)
- [6. Representative Corridor Basket](#6-representative-corridor-basket)
- [7. Institutional Policy API & MoSPI/RBI Integration](#7-institutional-policy-api--mospirbi-integration)
- [8. Technology Stack](#8-technology-stack)
- [9. Repository Structure](#9-repository-structure)
- [10. Local Setup & Reproduction Guide](#10-local-setup--reproduction-guide)
- [11. Production Scalability & National Roadmap](#11-production-scalability--national-roadmap)

---

## 1. Executive Summary & Problem Context

### The Challenge (SIH 2026 · PS26056)
Civil aviation in India is one of the fastest-growing domestic transport markets in the world, yet official inflation tracking remains hampered by traditional measurement bottlenecks:
- **30-to-45 Day Latency**: The official Consumer Price Index (CPI) compiled by MoSPI tracks airfares via manual, counter-based or travel-agent quotations collected periodically, publishing indices weeks after travel has occurred.
- **Dynamic Pricing Blindness**: Modern airline yield-management algorithms adjust prices minute-by-minute across inventory buckets. Static monthly sampling fails to capture surge volatility, holiday spikes, or predatory pricing behavior.
- **Product Mix & Unbundling Distortion**: Comparing basic hand-baggage fares with all-inclusive flex fares introduces artificial volatility caused by product shifts rather than true inflation.
- **Mathematical Drift**: Simple arithmetic averages (Carli index) violate the fundamental *time-reversal test* and generate severe upward price bias.

### The FlyWise Solution
**FlyWise (APIx)** is a complete, automated end-to-end price index platform designed to provide **daily, high-frequency, constant-quality airfare intelligence** for India:
1. **Live High-Acuity Ingestion**: Multi-source web scraping infrastructure (Bright Data Google Flights SERP, Scrappa, and direct Playwright headless browser collectors) capturing genuine live market fares across 14 representative high-traffic corridors.
2. **Economic Rigor**: Built strictly according to the **ILO/IMF Consumer Price Index Manual**, employing the **Jevons Geometric Mean** at the elementary level and **Young-type expenditure-proxy weighting** at the upper tier.
3. **Strict Constant-Quality Matching**: Novel **Flight Service Specification ID (FSID)** guarantees that fares are compared against strictly identical cabin, route, baggage tier, and flexibility specifications.
4. **Dual Institutional Architecture**:
   - **CPI-Compatible Window ($T+21$ / $T+60$)**: Clean, stabilized index designed for direct plug-in ingestion by MoSPI / NSO into the monthly national CPI basket.
   - **Analytical Dynamic Horizon ($T+1$ to $T+45$)**: High-sensitivity yield curve monitoring for DGCA, Ministry of Civil Aviation (MoCA), and Reserve Bank of India (RBI).
5. **Operational Resilience**: Deterministic 4-tier imputation cascade, automated FX conversion with locked benchmark rates, anti-session-contamination engines, and glitch fare rejection.

---

## 2. Platform Architecture & Data Pipeline

```mermaid
flowchart TD
    subgraph S1["1. Live Market Collectors (18:00 IST Cadence)"]
        BD["Bright Data SERP API<br/>(Google Flights)"]
        SC["Scrappa Backup API"]
        PW["Playwright Direct Scraper<br/>(Stateless / Ephemeral Contexts)"]
    end

    subgraph S2["2. Ingestion & Quality Cleansing"]
        NORM["Airport & Time Normalizer<br/>(IST Conversion / IATA Codes)"]
        DEDUP["Codeshare Deduplicator<br/>(Min-Fare Key: Route + OpCarrier + Hour)"]
        SPEC["FSID Service Spec Generator<br/>(Cabin + Baggage Bucket + Tier)"]
    end

    subgraph S3["3. Processing & Econometric Engine"]
        FX["FBIL / ECB Daily FX Normalizer<br/>(Locked Benchmark Rates for AED / SGD)"]
        QC["Glitch Fare & Component Filter<br/>(7-Day Median < 0.20x & ±1% Sum Check)"]
        IMP["Deterministic 4-Tier Imputation Cascade<br/>(Neighbor → Trend → Sector Peer → Carryover)"]
        JEV["Jevons Geometric Mean Engine<br/>(Elementary Route Indices p_t / p_0)"]
        AGG["Young-Type Aggregator<br/>(DAPIx 70% + IAPIx 30% → Overall APIx)"]
        CONF["Composite Confidence & Coverage Engine"]
    end

    subgraph S4["4. Persistence Layer (Neon PostgreSQL)"]
        DB[("Neon Serverless Postgres<br/>(observations, route_index, national_index, reference_prices)")]
    end

    subgraph S5["5. Presentation & Policy API"]
        FASTAPI["FastAPI Production Backend<br/>(Swagger / Redoc / High-Throughput Engine)"]
        DASH["Next.js 16 + React 19 Dashboard<br/>(3D WebGL Globe Radar, Recharts, Framer Motion)"]
        POLICY["Institutional Policy Endpoints<br/>(/policy/apix.csv, /policy/routes.json with X-API-Key)"]
    end

    BD --> NORM
    SC --> NORM
    PW --> NORM
    NORM --> DEDUP --> SPEC
    SPEC --> FX --> QC --> IMP --> JEV --> AGG --> CONF
    CONF --> DB
    DB --> FASTAPI
    FASTAPI --> DASH
    FASTAPI --> POLICY
```

---

## 3. Interactive 3D WebGL Dashboard Showcase

The FlyWise analyst dashboard is engineered using **Next.js 16, React 19, Three.js / WebGL, Recharts, and TailwindCSS**, delivering a terminal-grade institutional monitoring experience.

### 🌐 View 1: 3D Airspace Radar & Real-Time Executive KPI Dashboard
Interactive WebGL globe plotting real-time commercial corridors. Flight arcs are dynamically tinted in real time based on their elementary price relative (**Red**: Surging above base, **Green**: Discounted / Below base). Features high-level telemetry for **Overall APIx**, **DAPIx (Domestic)**, **IAPIx (International)**, **Data Coverage (100%)**, and **Statistical Confidence Score**.

<div align="center">
  <img src="dashboard/public/Dashboard%201.png" alt="FlyWise 3D Airspace Radar and Executive KPIs" width="100%" style="border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

---

### 📈 View 2: High-Frequency Trajectory, Lead-Time Curves & Volatility Delta
- **National APIx Trajectory**: Multi-tier historical time series tracking Live, MTD (Provisional), and Finalized index movements.
- **Advance Booking Lead-Time Curve ($T+1 \to T+60$)**: Visualizes airline dynamic pricing escalation curves comparing individual corridors (e.g., DEL-BOM) against national market benchmarks.
- **Corridor Fare Ranking**: Cross-sectional bar charts categorizing corridors into Surge ($>115$), Moderate ($100-115$), and Discount ($<100$).
- **Day-over-Day Diverging Volatility**: Identifies daily price shocks, max hikes ($+8.4\%$), and max drops ($-5.1\%$) across the national network.

<div align="center">
  <img src="dashboard/public/Dashboard%202.png" alt="High-Frequency Trajectory, Lead-Time Curves and Volatility Delta" width="100%" style="border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

---

### 📋 View 3: Monitored Airspace Corridors & Observation Telemetry
Comprehensive live telemetry matrix exposing route metadata, sector classifications (Domestic / International), DGCA proxy weights, live elementary price relatives, percentage deviations from baseline, and ingestion pipeline operational health status.

<div align="center">
  <img src="dashboard/public/Dashboard%203.png" alt="Monitored Airspace Corridors Telemetry" width="100%" style="border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" />
</div>

---

## 4. Statistical & Mathematical Methodology

FlyWise adheres to the international price index standards set forth in the **United Nations / ILO / IMF Consumer Price Index Manual**.

### 4.1 Elementary Jevons Formulation
At the route-window level, airline flight ticket sales quantities per price point are proprietary and unavailable from public search queries. Under lack of volume weights, the standard arithmetic mean (**Carli Index**) violates the time-reversal test and produces an artificial upward price drift. The ratio-of-averages (**Dutot Index**) is heavily distorted by absolute price levels.

FlyWise computes elementary price relatives via the **Jevons Index** (unweighted geometric mean of price relatives):

$$I_{r, w, t}^{\text{Jevons}} = \left( \prod_{i=1}^{n_{r,w,t}} \frac{p_{i, r, w, t}}{p_{i, r, w, 0}} \right)^{\frac{1}{n_{r,w,t}}} \times 100$$

Computed in log-space for numerical precision and stability:

$$\ln\left(\frac{I_{r, w, t}^{\text{Jevons}}}{100}\right) = \frac{1}{n_{r,w,t}} \sum_{i=1}^{n_{r,w,t}} \ln\left(\frac{p_{i, r, w, t}}{p_{i, r, w, 0}}\right)$$

**Key Axiomatic Properties Satisfied:**
1. **Transitivity & Circularity**: $I_{0 \to t} = I_{0 \to s} \times I_{s \to t}$
2. **Time Reversal**: $I_{0 \to t} \times I_{t \to 0} = 1$
3. **Unitary Elasticity of Substitution ($\sigma = 1$)**: Accurately models consumer substitution across different departure times within the same flight corridor on a given day.

---

### 4.2 Upper-Level Young-Type Route Aggregation
Elementary route indices are aggregated into sectoral composite indices using a **Young-type weighted aggregation formula** based on DGCA annual passenger volume distribution proxies ($W_r$):

$$\text{DAPIx}_t = \frac{\sum_{r \in \text{Domestic}} W_r \cdot I_{r, t}}{\sum_{r \in \text{Domestic}} W_r} \qquad \text{IAPIx}_t = \frac{\sum_{r \in \text{International}} W_r \cdot I_{r, t}}{\sum_{r \in \text{International}} W_r}$$

The headline **National Airfare Price Index (Overall APIx)** synthesizes domestic travel and international gateway connectivity:

$$\text{Overall APIx}_t = \Big(W_{\text{dom}} \times \text{DAPIx}_t\Big) + \Big(W_{\text{intl}} \times \text{IAPIx}_t\Big)$$

*Where $W_{\text{dom}} = 0.70$ (reflecting domestic passenger volume dominance) and $W_{\text{intl}} = 0.30$ (cross-border gateway volume).*

---

### 4.3 Constant-Quality Pricing via FSID
Comparing basic hand-baggage-only unbundled fares against all-inclusive tickets with checked luggage produces false price volatility. FlyWise enforces strict **constant-quality matched-model pricing** through the **Flight Service Specification ID (`service_spec_id`)**:

$$\text{FSID} = \texttt{\{route\_id\}-\{cabin\}-\{service\_type\}-T\{advance\_days\}-\{baggage\_bucket\}-\{fare\_tier\}}$$

*Example*: `DEL-BOM-economy-nonstop-T21-15kg-standard`

When computing price relatives, an IndiGo *Saver* fare (`15kg-standard`) is **strictly matched** against the baseline reference price for that exact same specification, eliminating product-mix distortion. Baseline prices are seeded on Day 1 using the **median fare** of verified observations to insulate against single-flight promotional outliers.

---

### 4.4 Dual-Track Indexing: CPI-Compatible vs. Analytical

| Metric | CPI-Compatible Window (`cpi_compatible`) | Analytical Lead-Time Window (`analytical`) |
|:---|:---|:---|
| **Domestic Lead Time** | **$T+21$ days** (Planned consumer purchase) | **$T+1, T+7, T+15, T+30, T+45$ days** |
| **International Lead Time** | **$T+60$ days** (Cross-border planning horizon) | **$T+1, T+30$ days** |
| **Target Institution** | **MoSPI / NSO** for official monthly CPI integration | **DGCA / MoCA / RBI** for regulatory & market audits |
| **Volatility Profile** | Low to moderate (stabilized economic price trend) | High (captures inventory depletion & last-minute surge) |
| **Core Utility** | Replaces lagged, counter-based survey collection | Real-time gouging detection, yield curve analysis |

---

### 4.5 Composite Statistical Confidence Metric
Every daily published index is accompanied by an auditable, composite **Statistical Confidence Score** ($\in [0, 1]$):

$$\text{confidence\_score} = 0.40 \cdot \text{coverage\_score} + 0.35 \cdot \overline{\text{quality\_score}} + 0.25 \cdot \min\left(1.0, \frac{N_{\text{obs}}}{N_{\text{expected}}}\right)$$

- **Coverage Component (40%)**: Ratio of non-imputed slots to total expected slots.
- **Data Quality Component (35%)**: Average quality score across observations (penalizing reconciliation errors and scraper warnings).
- **Sample Density Component (25%)**: Penalizes thin sample sets to safeguard against statistical noise.

---

## 5. Engineering Edge Cases & Operational Resilience

Real-world aviation datasets are notoriously volatile. FlyWise incorporates industrial-grade defenses for every major operational edge case:

### 5.1 Deterministic 4-Tier Imputation Cascade
Web scrapers face rate limits, network timeouts, or OTA outages. When an expected cell is missing, `processing/imputation.py` executes a deterministic 4-tier fallback:

```
Missing Cell (Route r, Window w, Day t)
  │
  ├──► Tier 1: neighbor_window
  │      └─ Applies average price movement across other windows of route r on Day t
  │
  ├──► Tier 2: time_carry_forward (if Tier 1 empty)
  │      └─ Extrapolates route r's trailing trend onto its last verified observation
  │
  ├──► Tier 3: cross_route (if Tier 2 empty)
  │      └─ Applies average sector-wide movement (Domestic or International) on Day t
  │
  └──► Tier 4: full_carry_forward (terminal fallback)
         └─ Holds last known absolute fare inr without adjustment
```
*Transparency Guarantee*: Every imputed record is flagged with `is_imputed = TRUE` and the exact method logged. If daily `coverage_score < 0.80`, telemetry visual alerts are automatically triggered.

---

### 5.2 Operational Disruptions vs. Economic Price Signals
- **The Pitfall**: Fog, cyclones, or airspace closures cause flight cancellations on travel day. Teams often mistakenly purge cancelled flights retroactively from price indices.
- **FlyWise Defense**: Adhering to **ILO CPI Manual §6.42**, price indices track **transaction and quotation prices established at booking**, not operational delivery. Disruptions are tracked in a separate `flight_events` table for dashboard contextual overlays and **never** retroactively distort or delete historical price signals.

---

### 5.3 Codeshare Deduplication & Carrier Mapping
- **The Pitfall**: Major airlines cross-list the same physical flight under multiple flight numbers (e.g., IndiGo marketing an Air India or Turkish Airlines service). Double-counting biases the Jevons geometric mean.
- **FlyWise Defense**: Ingestion groups observations by `(route_id, travel_date, operating_carrier, rounded_hour)`. When identical departure footprints are detected, the pipeline retains the **lowest consumer price** and discards marketing shells (`ingestion/dedup_observations.py`).

---

### 5.4 Session Contamination & Anti-Fingerprinting
- **The Pitfall**: Airline yield algorithms track cookies, session tokens, and recurring IPs to artificially inflate prices shown to repeated queries (dynamic price discrimination).
- **FlyWise Defense**: Every scraper query in `collectors/ota_scraper.py` initializes an **isolated, ephemeral Playwright browser context** (`browser.new_context()`). Cookies, cache, and storage are destroyed immediately after query completion. Direct SERP proxy requests are stateless.

---

### 5.5 Glitch Fares & Component Reconciliation
- **The Pitfall**: Scraper parsing bugs or airline tariff glitches produce impossible fares (e.g., ₹250 on Delhi–Mumbai where airport taxes alone are ₹800).
- **FlyWise Defense**:
  1. **Trailing Median Filter**: Flags and rejects any fare where:
     $$\text{total\_fare\_inr} < 0.20 \times \text{trailing\_7\_day\_median}$$
  2. **Component Reconciliation**: Validates that breakdown totals match within $\pm 1\%$:
     $$\left|\frac{(\text{base\_fare} + \text{taxes} + \text{fees}) - \text{total\_fare}}{\text{total\_fare}}\right| \le 0.01$$

---

### 5.6 Flight Renumbering & Seasonal Routes
- **Schedule Number Churn**: Flights renumber between IATA summer/winter seasons. FlyWise ties index cells to the invariant **FSID specification**, ensuring complete continuity regardless of flight number churn.
- **Seasonal Tourism Corridors**: Corridors like `DEL-GOI` (Goa, high winter) and `DEL-SXR` (Srinagar, high summer) have defined season windows in `routes_config.json`. When out-of-season, slots are cleanly flagged, omitted from expected denominators, and protected from triggering false imputation.

---

## 6. Representative Corridor Basket

FlyWise monitors **14 high-volume commercial corridors** representing **over 50% of scheduled commercial passenger traffic** in India:

| Corridor ID | Origin | Destination | Sector | Category | Seasonality | Advance Windows Monitored |
|:---|:---|:---|:---|:---|:---|:---|
| **DEL-BOM** | Delhi (DEL) | Mumbai (BOM) | Domestic | Trunk | Year-round | $T+1, T+7, T+15, T+21, T+30, T+45$ |
| **DEL-BLR** | Delhi (DEL) | Bengaluru (BLR) | Domestic | Trunk | Year-round | $T+1, T+7, T+15, T+21, T+30, T+45$ |
| **BOM-BLR** | Mumbai (BOM) | Bengaluru (BLR) | Domestic | Trunk | Year-round | $T+1, T+7, T+15, T+21, T+30, T+45$ |
| **DEL-CCU** | Delhi (DEL) | Kolkata (CCU) | Domestic | Trunk | Year-round | $T+1, T+7, T+15, T+21, T+30, T+45$ |
| **BLR-HYD** | Bengaluru (BLR) | Hyderabad (HYD) | Domestic | Trunk | Year-round | $T+1, T+7, T+15, T+21, T+30, T+45$ |
| **MAA-DEL** | Chennai (MAA) | Delhi (DEL) | Domestic | Trunk | Year-round | $T+1, T+7, T+15, T+21, T+30, T+45$ |
| **BOM-HYD** | Mumbai (BOM) | Hyderabad (HYD) | Domestic | Trunk | Year-round | $T+1, T+7, T+15, T+21, T+30, T+45$ |
| **DEL-AMD** | Delhi (DEL) | Ahmedabad (AMD) | Domestic | Trunk | Year-round | $T+1, T+7, T+15, T+21, T+30, T+45$ |
| **DEL-DXB** | Delhi (DEL) | Dubai (DXB) | International | Gateway | Year-round | $T+1, T+30, T+60$ (AED Converted) |
| **BOM-DXB** | Mumbai (BOM) | Dubai (DXB) | International | Gateway | Year-round | $T+1, T+30, T+60$ (AED Converted) |
| **DEL-SIN** | Delhi (DEL) | Singapore (SIN) | International | Gateway | Year-round | $T+1, T+30, T+60$ (SGD Converted) |
| **BOM-SIN** | Mumbai (BOM) | Singapore (SIN) | International | Gateway | Year-round | $T+1, T+30, T+60$ (SGD Converted) |
| **DEL-GOI** | Delhi (DEL) | Goa (GOI) | Domestic | Seasonal | Oct – Mar | $T+1, T+7, T+15, T+21, T+30, T+45$ |
| **DEL-SXR** | Delhi (DEL) | Srinagar (SXR) | Domestic | Seasonal | Apr – Oct | $T+1, T+7, T+15, T+21, T+30, T+45$ |

---

## 7. Institutional Policy API & MoSPI/RBI Integration

FlyWise provides high-throughput, low-latency streaming endpoints under `/policy/*` secured with the `X-API-Key` authentication header.

### 7.1 Key Endpoints Reference

| Endpoint | Method | Format | Description |
|:---|:---|:---|:---|
| `/policy/apix.json` | `GET` | JSON | National aggregate indices (DAPIx, IAPIx, Overall APIx, Coverage, Confidence). |
| `/policy/apix.csv` | `GET` | CSV | $O(1)$ streaming CSV export for econometric packages (R, Stata, Python). |
| `/policy/routes.json` | `GET` | JSON | Route-level elementary Jevons price relatives ($p_t / p_0 \times 100$) and sample sizes. |
| `/policy/routes.csv` | `GET` | CSV | Granular corridor microdata in streaming CSV format. |
| `/apix/daily` | `GET` | JSON | Public daily headline index time series. |
| `/routes/{route_id}/summary` | `GET` | JSON | Corridor summary, bidirectionally resolved with 30-day trailing statistics. |

### 7.2 Sample Ingestion Request (Python)
```python
import requests
import pandas as pd
import io

API_URL = "https://flywise-uoxg.onrender.com/policy/apix.csv"
HEADERS = {"X-API-Key": "flywise_nso_institutional_token"}
PARAMS = {"window": "cpi_compatible", "from_date": "2026-09-01"}

response = requests.get(API_URL, headers=HEADERS, params=PARAMS)
df = pd.read_csv(io.StringIO(response.text))

print(f"Ingested {len(df)} daily index records into MoSPI econometric pipeline:")
print(df.tail())
```

---

## 8. Technology Stack

```
Frontend Architecture:
├── Framework: Next.js 16 (App Router) + React 19 + TypeScript
├── 3D Visualization: Three.js + react-globe.gl (WebGL Shaders & Geospatial Arcs)
├── Analytics & Charts: Recharts + Lucide React
└── UI & Styling: TailwindCSS v4 + Framer Motion (Glassmorphic dark/light design system)

Backend & Data Pipeline:
├── API Framework: FastAPI (Python 3.11+) + Uvicorn + Pydantic v2
├── Data Collection: Playwright (Headless Chromium) + Bright Data SERP + Scrappa
├── Econometric Engines: NumPy + SciPy + Pandas (Jevons Geometric Mean & Imputation)
└── FX Engine: Frankfurter / FBIL / ECB Benchmark Synchronization

Database & Infrastructure:
├── Database: Serverless PostgreSQL (Hosted on Neon, Connection Pooling)
├── API Hosting: Render (Continuous Deployment & Automated Cron Engine)
└── Frontend Hosting: Vercel (Edge CDN)
```

---

## 9. Repository Structure

```bash
FlyWise/
├── api/                         # FastAPI application
│   ├── main.py                  # Entrypoint, lifespan, CORS, custom Swagger UI
│   ├── dependencies.py          # API-key authentication & DB connection pool
│   └── routers/
│       ├── apix.py              # National index endpoints (daily, weekly, monthly)
│       ├── routes.py            # Corridor-level price relative & summary routers
│       ├── coverage.py          # Data coverage and telemetry endpoints
│       └── policy_export.py     # NSO/RBI streaming CSV/JSON endpoints
├── collectors/                  # Live fare scraping adapters
│   ├── bright_data_adapter.py   # Google Flights SERP API integration
│   ├── scrappa_adapter.py       # Scrappa secondary backup adapter
│   ├── ota_scraper.py           # Ephemeral Playwright direct browser scraper
│   └── render_cron_entrypoint.py# Scheduled 18:00 IST collection orchestrator
├── ingestion/                   # Raw payload cleansing & normalization
│   ├── parse_google_flights.py  # SERP payload extractor
│   ├── dedup_observations.py    # Codeshare deduplication engine
│   └── normalize_fare_family.py # FSID constant-quality specification mapper
├── processing/                  # Econometric & statistical calculation
│   ├── index_engine.py          # Jevons geometric mean & Young-type aggregator
│   ├── imputation.py            # Deterministic 4-tier imputation cascade
│   └── quality_fx_engine.py     # Glitch-fare rejection & FX rate normalization
├── dashboard/                   # Next.js 16 frontend application
│   ├── src/
│   │   ├── app/                 # App Router pages (Root, Light, Layout)
│   │   ├── components/          # 3D Globe Radar, charts, telemetry table
│   │   └── api-client.ts        # Typed API client for FastAPI backend
│   └── public/                  # Dashboard presentation assets & vector icons
├── db/                          # Database schema & migrations
│   ├── schema.sql               # PostgreSQL DDL (tables, constraints, indexes)
│   └── seed_reference_prices.py # Day 1 median baseline seeding script
├── config/                      # Configuration registries
│   └── routes_config.json       # 14-corridor metadata, seasonal windows, lead times
└── docs/                        # Architectural & jury defense documentation
    ├── methodology.md           # Full mathematical index formulation
    ├── edge_cases.md            # In-depth edge case handling specifications
    ├── judge_qa_prep.md         # Technical defense guide for Grand Finale jury
    ├── limitations.md           # Transparent engineering scope & disclosures
    └── policy_api_guide.md      # Institutional user guide for NSO / RBI
```

---

## 10. Local Setup & Reproduction Guide

### Prerequisites
- Python `3.11+`
- Node.js `20+` and `npm`
- PostgreSQL database instance (or free tier [Neon](https://neon.tech))

### Step 1: Clone Repository
```bash
git clone https://github.com/x-anish-y/FlyWise.git
cd FlyWise
```

### Step 2: Python Environment & Database Setup
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Configure Environment Variables (.env)
export DATABASE_URL="postgresql://user:password@host/flywise?sslmode=require"
export POLICY_API_KEYS="key1,key2,flywise_institutional_key"
export BRIGHT_DATA_API_KEY="your_bright_data_token"
export SCRAPPA_API_KEY="your_scrappa_token"

# Initialize PostgreSQL Schema
psql $DATABASE_URL -f db/schema.sql
```

### Step 3: Run the Ingestion & Index Pipeline
```bash
# Execute collection, normalization, imputation, and Jevons index calculation:
python collectors/render_cron_entrypoint.py
```

### Step 4: Launch FastAPI Backend
```bash
uvicorn api.main.app --reload --port 8000
# Access interactive documentation at: http://127.0.0.1:8000/docs
```

### Step 5: Launch Next.js Dashboard
```bash
cd dashboard
npm install
export NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:8000"
npm run dev
# Access analyst dashboard at: http://localhost:3000
```

---

## 11. Production Scalability & National Roadmap

While this prototype focuses on 14 representative corridors, the system was designed from inception for nationwide deployment under MoSPI / DGCA sponsorship:

1. **Statutory Expenditure Weighting**: Under the *Collection of Statistics Act, 2008*, MoSPI can mandate airlines to provide monthly route-level passenger revenue matrices, upgrading traffic volume proxies to true economic expenditure shares ($P \times Q$).
2. **Direct Airline NDC Feeds**: Transitioning from public web scraping to direct regulatory NDC / API feeds eliminates scraper friction, rate limiting, and CAPTCHAs entirely.
3. **Pan-India Airspace Coverage**: Because route processing is fully vectorized, expanding from 14 corridors to all 350+ domestic commercial routes (including UDAN regional routes) requires only appending route rows to `routes_config.json`.
4. **Sub-Index Disaggregation**: Capability to publish independent sub-indices: *Low-Cost Carriers (LCC) vs. Full-Service Carriers (FSC)*, *Regional Connectivity Index (RCI)*, and *Corporate Business Travel Index*.

---

<div align="center">

**FlyWise (APIx) — Built with pride for Smart India Hackathon 2026**  
*Empowering India's National Statistical Architecture with Transparent, Real-Time Economic Data.*

</div>
