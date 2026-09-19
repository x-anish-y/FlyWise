# FlyWise (APIx) — Judge Q&A Preparation & Technical Defense

This document prepares the team to defend technical, statistical, and architectural choices during the SIH 2026 Grand Finale jury evaluation. Every answer is grounded strictly in what was implemented in the codebase.

---

### Q1: Why did you use the Jevons formula at the elementary level instead of Carli or Dutot?
**Answer:**
> "At the elementary route level, exact sales quantities and ticket volumes per flight are proprietary and unpublished. Under lack of quantity weights, economic index theory (ILO/IMF CPI Manual, Chapter 10) explicitly warns against the **Carli index** (arithmetic mean of price relatives) because it fails the *time-reversal test* and exhibits an inherent upward price drift. The **Dutot index** (ratio of arithmetic mean prices) is flawed because it is distorted by baseline price levels.
> 
> We chose the **Jevons index** (geometric mean of price relatives, `processing/index_engine.py`):
> 1. It strictly satisfies the transitivity, circularity, and time-reversal tests ($I_{0 \to t} \times I_{t \to 0} = 1$).
> 2. It assumes a realistic unitary elasticity of substitution ($\sigma = 1$), reflecting that when one flight within a day’s corridor surges, consumers partially substitute to adjacent departure times."

---

### Q2: Why did you scrape only 14 corridors instead of all 300+ domestic routes in India?
**Answer:**
> "Scraping all 350+ commercial routes across 6 lead-time windows (T+1 to T+60) would require over 6,000 HTTP requests per day. In a prototype, this would trigger aggressive bot mitigations and incur unsustainable commercial proxy costs.
> 
> Instead, we applied rigorous statistical sampling: we curated a representative basket of **14 high-volume corridors** (8 domestic trunk routes, 4 international gateways, and 2 seasonal leisure routes) that collectively account for **over 50% of scheduled commercial passenger traffic** in India (DEL-BOM, DEL-BLR, BOM-BLR, etc.). This mirrors the methodology of national statistical agencies that sample representative commodities rather than census-enumerating every corner store."

---

### Q3: How do you handle airline dynamic pricing where fares change minute-by-minute?
**Answer:**
> "Airline yield management algorithms adjust fares constantly based on inventory depletion. We neutralize this noise through a two-dimensional stabilization framework:
> 1. **Standardized Daily Collection Cadence**: All routes are collected once daily at **18:00 IST** (`collectors/render_cron_entrypoint.py`), freezing a consistent end-of-day market price point across all providers.
> 2. **Lead-Time Window Stratification**: We never pool spot fares with advance purchases. Fares are tracked across explicit advance-purchase horizons (T+1, T+7, T+15, T+21, T+30, T+45, T+60). For official CPI reporting, we isolate the **T+21 window** (domestic) and **T+60 window** (international), measuring price movements for standardized consumer planning horizons."

---

### Q4: How do you prevent web scrapers from getting biased by session contamination or IP tracking?
**Answer:**
> "Airlines and OTAs use persistent cookies and browsing history to identify repeated searches and artificially increase fares (price discrimination).
> 
> We engineered complete session isolation in `collectors/ota_scraper.py`:
> 1. **Ephemeral Browser Contexts**: Every single flight search initializes a brand-new Playwright context (`browser.new_context()`) with zero cookie carryover, clean cache, and standardized viewport.
> 2. **Clean SERP Proxies**: Our primary Bright Data Google Flights adapter operates through stateless SERP API endpoints.
> 3. **Robots.txt & Compliance**: We parse and verify `robots.txt` programmatically before scraping, never solve CAPTCHAs, and never employ malicious anti-bot bypass scripts."

---

### Q5: What happens if a web scraper or OTA source fails completely on a given day?
**Answer:**
> "FlyWise is designed with multi-tier fault tolerance across both collection and processing:
> 1. **Provider Redundancy**: If the primary Bright Data Google Flights collector fails, the pipeline falls back to Scrappa, followed by the Playwright direct OTA scraper (Ixigo/EaseMyTrip).
> 2. **Deterministic 4-Tier Imputation Cascade** (`processing/imputation.py`): If all providers fail for a specific cell, the engine fills the gap using a strict hierarchy:
>    - Tier 1: `neighbor_window` (price movement from other windows on the same route today)
>    - Tier 2: `time_carry_forward` (last known real observation for this route + window, trend-adjusted)
>    - Tier 3: `cross_route` (peer route movement in the same domestic/international sector)
>    - Tier 4: `full_carry_forward` (last known absolute fare)
> 3. **Transparency Metric**: Every imputed observation is explicitly tagged with `is_imputed = TRUE`, and we compute a daily `coverage_score`. If coverage drops below 80%, visual alerts trigger on the dashboard."

---

### Q6: How is this index different from MoSPI’s official Consumer Price Index (CPI)?
**Answer:**
> "MoSPI’s current CPI tracks airfares under a generic 'Transport & Communication' sub-index via infrequent, offline price collection from ticket counters or travel agents, published with a **30-to-45 day lag**.
> 
> FlyWise fundamentally transforms this:
> 1. **Near Real-Time Cadence**: Daily frequency with T+0 intraday telemetry and T+1 publication.
> 2. **Constant-Quality Match**: Accounts for unbundled fare families and baggage tiers using FSID.
> 3. **Separation of Sectors**: Disentangles domestic travel (`DAPIx`) from currency-exposed international travel (`IAPIx`).
> 4. **Dual-Track Indexing**: Produces both a headline **CPI-Compatible Series (T+21/T+60)** designed to integrate directly into MoSPI’s monthly basket, and an **Analytical Series (T+1 to T+45)** for DGCA regulatory monitoring."

---

### Q7: How do you guarantee constant-quality pricing when airlines unbundle fares (e.g. hand baggage vs. checked bag)?
**Answer:**
> "Comparing a bare-bones hand-baggage-only fare against a flex fare with checked bags creates false deflation or inflation.
> 
> We built the **Flight Service Specification ID (`service_spec_id`)** in `ingestion/normalize_fare_family.py`:
> `route_id - cabin - service_type - T{advance_days} - baggage_bucket - fare_family_tier`
> 
> When the Jevons index calculates price relatives ($p_t / p_0$), the denominator $p_0$ is the baseline price for the **exact same `service_spec_id`**. An IndiGo Saver fare (15kg check-in) is only ever compared against an IndiGo Saver baseline, preserving strict constant-quality pricing."

---

### Q8: Why don't you discard cancelled or diverted flights from the price index?
**Answer:**
> "In national accounting, price indices measure **transaction and quotation prices** agreed upon at the time of consumer purchase, not post-purchase operational delivery.
> 
> In `processing/index_engine.py`, operational disruptions are captured in the `flight_events` table for **informational purposes only**. They populate the analyst dashboard's disruption overlay to explain price movements, but they never retroactively alter or delete historical quotation prices. Discarding flights after the fact would introduce survival bias into the index."

---

### Q9: How do you handle foreign currency volatility on international routes like Dubai and Singapore?
**Answer:**
> "Fares on international routes originate in foreign currencies (AED for Dubai, SGD for Singapore). To ensure that daily price changes reflect genuine airline fare shifts rather than intraday foreign exchange trading noise, `processing/quality_fx_engine.py` locks each day's foreign fares using the **official daily benchmark rate** from FBIL / European Central Bank via Frankfurter. These locked rates are stored alongside each observation (`fx_rate_used`)."

---

### Q10: How could MoSPI or DGCA transition this prototype into nationwide production?
**Answer:**
> "The architecture was designed from day one to scale into an official government deployment:
> 1. **Statutory Expenditure Weights**: MoSPI can exercise statutory authority under the *Collection of Statistics Act, 2008* to obtain monthly route-level passenger revenue matrices from Indian airlines, replacing traffic volume proxies with true expenditure weights.
> 2. **Direct Airline API / NDC Feeds**: Regulatory access to direct airline NDC APIs would supplement public web scrapers, eliminating scraping friction.
> 3. **Corridor Expansion**: The modular `routes_config.json` allows scaling from 14 corridors to all 350+ commercial airport pairs simply by adding route rows to the database."
