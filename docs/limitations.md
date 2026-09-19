# FlyWise (APIx) — Prototype Limitations & Engineering Scope

This document provides a transparent and rigorous disclosure of features, statistical inputs, and data sources that were simplified or descoped in this prototype relative to the full commercial vision of the SIH Problem Statement (PS26056 / MoSPI / DIID).

---

## 1. Route Weighting: Passenger Traffic Proxies vs. True Expenditure Weights

### Problem Statement Expectation
In formal national accounting (ILO/IMF CPI Manual), upper-level price index weights must reflect **true economic expenditure shares**:
$$w_r = \frac{P_r \times Q_r}{\sum_{k} P_k \times Q_k}$$
Where $P_r \times Q_r$ represents total rupee revenue expended by consumers on route $r$ during the baseline reference year.

### Prototype Implementation & Rationale
- **The Data Reality**: In India, airline route-level passenger revenues and average ticket yields are strictly proprietary commercial information protected by carriers. Neither DGCA nor airlines publish ticket-level sales volumes or revenue numbers to the public.
- **Our Implementation**:
  - FlyWise approximates route importance using **DGCA passenger traffic volume proxies** stored in `routes.expenditure_weight` (e.g., higher weights for Delhi–Mumbai `DEL-BOM` and Delhi–Bengaluru `DEL-BLR`).
  - At the macro level, FlyWise applies a fixed **70% Domestic / 30% International** aggregation split (`processing/index_engine.py::DOMESTIC_WEIGHT`), mirroring total passenger carriage proportions reported in DGCA annual reports.
- **Production Roadmap**: In an official deployment within MoSPI/DGCA, statutory powers under the *Collection of Statistics Act, 2008* would enable direct monthly collection of route-level passenger revenue matrices from scheduled domestic carriers.

---

## 2. Base-Period Scope: Day 1 Auto-Seeding vs. Multi-Month Annual Base

### Problem Statement Expectation
Official Consumer Price Indices (such as India CPI 2012=100) construct baseline reference prices ($p_0$) over a full 12-month calendar year to average out seasonal spikes (festivals, holiday rushes, monsoon troughs).

### Prototype Implementation & Rationale
- **Hackathon Time Horizon**: A multi-month baseline requires months of pre-existing daily historical collection across all matched service specifications.
- **Our Implementation**:
  - The prototype automatically seeds baseline reference prices from **Day 1** (the earliest date with verified, non-imputed real observations for each route and service specification), taking the **median fare** of that day.
  - Stored permanently in the `reference_prices` database table.
- **Production Roadmap**: For official adoption, MoSPI would run the FlyWise collection pipeline for an initial 12-month calibration period to compute geometric mean reference prices across an entire baseline fiscal year.

---

## 3. Basket Coverage: 14 Monitored Corridors vs. Full National Airspace

### Problem Statement Expectation
A nationwide index covering all ~350+ commercial route pairs in India, including regional connectivity schemes (UDAN), tier-2/tier-3 regional airports, and remote island/northeastern routes.

### Prototype Implementation & Rationale
- **Resource Constraints**: Querying 350 routes across 6 lead times (T+1 to T+60) and 3 data providers would require ~6,300 web scrapes per daily cycle, resulting in significant commercial proxy infrastructure costs.
- **Our Implementation**:
  - FlyWise curates a **representative 14-corridor basket** (`config/routes_config.json`):
    - **8 Domestic Trunk Routes**: DEL-BOM, DEL-BLR, BOM-BLR, DEL-CCU, BLR-HYD, MAA-DEL, BOM-HYD, DEL-AMD.
    - **4 International Gateways**: DEL-DXB, BOM-DXB, DEL-SIN, BOM-SIN.
    - **2 Seasonal Tourism Corridors**: DEL-GOI (Goa, winter) and DEL-SXR (Srinagar, summer).
  - These selected trunk routes account for over **50% of total scheduled commercial passenger volume** in Indian civil aviation.

---

## 4. Collection Frequency: Daily Scheduled Batch vs. Continuous Real-Time Tick Stream

### Problem Statement Expectation
Continuous, tick-by-tick real-time fare ingestion capturing every mid-day price change executed by airline revenue management algorithms.

### Prototype Implementation & Rationale
- **Anti-Bot Ethics & Rate Limiting**: Continuously scraping consumer websites 24/7 triggers immediate bot mitigation, IP blocks, and imposes unwarranted load on airline booking infrastructure.
- **Statistical Relevance**: Monthly or weekly inflation metrics do not require tick-by-tick updates; a standardized, repeatable daily collection time eliminates intraday noise.
- **Our Implementation**:
  - Daily scheduled batch run at **18:00 IST** via `collectors/render_cron_entrypoint.py`.
  - Captures end-of-day market pricing consistently across all routes and lead times.

---

## 5. Unbundled Ancillary Pricing: Baggage vs. Seat & Meal Add-Ons

### Problem Statement Expectation
A completely unbundled hedonic price model that tracks and standardizes every micro-fee: seat selection (extra legroom vs. middle seat), hot meals, priority boarding, ticket cancellation insurance, and excess baggage.

### Prototype Implementation & Rationale
- **Data Availability**: Third-party aggregators and SERP results disclose total airfare and standard baggage allowances (0kg hand-baggage vs. 15kg check-in), but do not expose dynamic seat map pricing or meal menus until the passenger enters the booking checkout funnel.
- **Our Implementation**:
  - Constant-quality matching is anchored to the **primary economic price determinants**:
    - Cabin Class (`economy`)
    - Routing Type (`nonstop` vs. `1-stop`)
    - Standard Baggage Bucket (`0kg`, `15kg`, `20kg+`)
    - Fare Family Tier (`base`, `standard`, `flex`)
  - Optional personal convenience fees (hot meals, seat selection) are excluded as non-transport ancillaries.

---

## 6. GDS & Direct Airline Feeds vs. Public Web Scraping

### Problem Statement Expectation
Direct API integrations with airline New Distribution Capability (NDC) feeds or Global Distribution Systems (Amadeus, Sabre, Travelport).

### Prototype Implementation & Rationale
- **Licensing & Accreditation**: Access to GDS and airline NDC APIs requires IATA certification, agency accreditation, and substantial enterprise licensing fees unavailable to academic/hackathon teams.
- **Our Implementation**:
  - Relies entirely on public, authorized web data collection via **Bright Data Google Flights SERP API**, **Scrappa**, and an **independent Playwright direct scraper** with strict robots.txt compliance and no CAPTCHA bypass tooling.
