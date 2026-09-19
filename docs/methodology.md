# FlyWise (APIx) — Statistical Methodology

This document outlines the statistical framework, mathematical formulas, classification standards, and design decisions underpinning the **FlyWise Airfare Price Index (APIx)**.

---

## 1. Mathematical Index Formulation

Official price statistics (such as CPI, WPI, and PPI) follow a two-tier aggregation hierarchy defined by the **ILO/IMF Consumer Price Index Manual**:
1. **Lower-level (Elementary) Aggregation**: Combines unweighted price quotes within homogeneous product cells.
2. **Upper-level (Higher-level) Aggregation**: Combines elementary indices across routes and sectors using expenditure or traffic weights.

### 1.1 Elementary Index: Jevons Geometric Mean
At the elementary route-window level, airline ticket quantities sold per price point are unavailable from public search data. Under lack of volume weights, standard economic index theory strictly prohibits the arithmetic mean (**Carli index**) because it violates the *time-reversal test* and suffers from substantial upward price drift. The ratio-of-averages (**Dutot index**) is also unsuitable because it is sensitive to the scale and price level of different flights.

FlyWise implements the **Jevons Index** (unweighted geometric mean of price relatives) at the elementary level for each route $r$, advance window $w$, and observation day $t$:

$$I_{r, w, t}^{\text{Jevons}} = \left( \prod_{i=1}^{n_{r,w,t}} \frac{p_{i, r, w, t}}{p_{i, r, w, 0}} \right)^{\frac{1}{n_{r,w,t}}} \times 100$$

Equivalently computed via log-linear aggregation:

$$\ln\left(\frac{I_{r, w, t}^{\text{Jevons}}}{100}\right) = \frac{1}{n_{r,w,t}} \sum_{i=1}^{n_{r,w,t}} \ln\left(\frac{p_{i, r, w, t}}{p_{i, r, w, 0}}\right)$$

Where:
- $p_{i, r, w, t}$: The converted, quality-cleansed fare in INR for observation $i$ collected on day $t$.
- $p_{i, r, w, 0}$: The matched baseline reference price for that exact service specification (`service_spec_id`).
- $n_{r,w,t}$: The count of valid, non-rejected observations in cell $(r, w)$ on day $t$.

**Properties of the Jevons Index in FlyWise:**
- **Transitivity & Circularity**: $I_{0 \to t} = I_{0 \to s} \times I_{s \to t}$.
- **Time Reversal**: $I_{0 \to t} = 1 / I_{t \to 0}$.
- **Substitutability Assumption**: Assumes a unitary elasticity of substitution ($\sigma = 1$) among flights within the same route cell, reflecting realistic consumer behavior when comparing departure times.

---

### 1.2 Upper-Level Index: Young-Type Weighted Aggregation
Once elementary route indices $I_{r, t}$ are computed, they are aggregated into composite indices (**DAPIx** for domestic routes and **IAPIx** for international routes) using a **Young-type aggregation formula** with fixed expenditure/traffic proxy weights:

$$\text{DAPIx}_t = \frac{\sum_{r \in \text{Domestic}} W_r \times I_{r, t}}{\sum_{r \in \text{Domestic}} W_r}$$

$$\text{IAPIx}_t = \frac{\sum_{r \in \text{International}} W_r \times I_{r, t}}{\sum_{r \in \text{International}} W_r}$$

Where:
- $W_r$: The fixed weight for route $r$ (configured in `routes.expenditure_weight`, derived from DGCA annual passenger volume proxies).
- $I_{r, t}$: The route index for the active window category (e.g., T+21 for CPI-compatible domestic).

---

### 1.3 National Composite: Overall APIx
The headline **National Airfare Price Index (Overall APIx)** synthesizes domestic and cross-border connectivity:

$$\text{Overall APIx}_t = (W_{\text{dom}} \times \text{DAPIx}_t) + (W_{\text{intl}} \times \text{IAPIx}_t)$$

In the FlyWise prototype (`processing/index_engine.py`):
- $W_{\text{dom}} = 0.70$ (reflecting the 10 domestic/seasonal trunk routes and domestic passenger volume dominance).
- $W_{\text{intl}} = 0.30$ (reflecting the 4 high-capacity international gateway routes to Dubai and Singapore).

---

## 2. Sectoral Separation: DAPIx vs. IAPIx

FlyWise separates domestic airfares (**DAPIx**) from international airfares (**IAPIx**) by design rather than pooling them into an undifferentiated basket:

1. **Exchange Rate Sensitivity**: International fares are originated and quoted in foreign currencies (AED, SGD) and converted to INR via daily FBIL/ECB benchmark rates (`processing/quality_fx_engine.py`). Domestic fares have zero currency translation exposure.
2. **Lead Time & Booking Horizon Dynamics**: Consumer booking horizons for domestic business/leisure travel cluster around 1 to 21 days, whereas international long-haul and cross-border travel clusters around 30 to 60+ days.
3. **Macroeconomic Policy Utility**: The Reserve Bank of India (RBI) and Ministry of Finance require separate tracking of imported inflation / international transport costs versus domestic logistics and internal travel price pressures.

---

## 3. Constant-Quality Pricing via FSID (Service Specification)

A central pitfall in naive web-scraped price indices is comparing unbundled, hand-baggage-only basic fares against all-inclusive flexible fares with checked baggage. This induces artificial volatility caused by product mix shifts rather than genuine price inflation.

FlyWise enforces strict **constant-quality matched-model pricing** through the **Flight Service Specification ID (`service_spec_id`)**, constructed in `ingestion/normalize_fare_family.py`:

```
service_spec_id = {route_id}-{cabin}-{service_type}-T{advance_days}-{baggage_bucket}-{fare_family_tier}
```

### Components of the Specification:
- **`route_id`**: Airport pair (e.g., `DEL-BOM`).
- **`cabin`**: Travel class (e.g., `economy`, `business`).
- **`service_type`**: Flight itinerary structure (`nonstop` vs. `1-stop`).
- **`advance_days`**: Lead time window (`T+1`, `T+7`, `T+15`, `T+21`, `T+30`, `T+45`, `T+60`).
- **`baggage_bucket`**: Standardized baggage allowance (`0kg`, `15kg`, `20kg+`), mapped via airline fare family lookup tables.
- **`fare_family_tier`**: Fare conditions (`base`, `standard`, `flex`).

**Matching Logic:**
When computing price relatives:
$$R_{i, t} = \frac{p_{i, t}}{p_{0, \text{spec}}}$$
The denominator $p_{0, \text{spec}}$ is the baseline price for the **exact same `service_spec_id`**. An IndiGo *Saver* fare (`15kg-standard`) is evaluated against the *Saver* baseline, never against an IndiGo *Lite* (`0kg-base`) or *Flexi Plus* fare.

---

## 4. Base-Period Choice & Auto-Seeding (Day 1)

In national accounting, index series are anchored to a defined base period ($I_0 = 100.0$).

### 4.1 Prototype Baseline: Day 1 Median
In this production prototype, the base period is established on **Day 1** (the earliest date with verified non-imputed observations for each cell):
- Implemented in `processing/index_engine.py::_get_or_seed_reference_price()`.
- The reference price $p_{i, 0}$ is calculated as the **median `total_fare_inr`** across all valid observations for that exact `(route_id, window_category, advance_days, service_spec_id)` on the baseline date.
- Stored permanently in the `reference_prices` database table with unique constraint:
  `idx_refprice_pk ON reference_prices (route_id, window_category, advance_days, COALESCE(service_spec_id, '__GENERIC__'))`.

### 4.2 Why the Median?
The median is chosen over the arithmetic mean for the reference price to insulate the baseline against transient outliers, promotional introductory fares, or peak departure skews on the seed date.

---

## 5. Window Categories: CPI-Compatible vs. Analytical

FlyWise addresses two distinct institutional use cases by partitioning advance-purchase windows into two formal categories (`national_index.window_category`):

| Characteristic | CPI-Compatible Window (`cpi_compatible`) | Analytical Window (`analytical`) |
|:---|:---|:---|
| **Domestic Lead Time** | **T+21** days | **T+1, T+7, T+15, T+30, T+45** days |
| **International Lead Time** | **T+60** days | **T+1, T+30** days |
| **Consumer Target** | Planned household expenditure (standard consumer advance purchase) | Dynamic yield curve & last-minute surge monitoring |
| **Primary Consumer** | **MoSPI (NSO)** for official CPI monthly basket comparison | **DGCA, RBI, Ministry of Civil Aviation** for yield curves & gouging audits |
| **Index Volatility** | Low to moderate (stabilized pricing) | High (sensitive to inventory depletion & last-minute surge) |

### 5.1 CPI-Compatible (T+21 / T+60)
Official Consumer Price Indices measure typical consumer acquisition prices. Industry booking curves demonstrate that standard leisure and planned non-business domestic trips are booked approximately 3 weeks (21 days) in advance, while cross-border flights are booked 2 months (60 days) in advance. Restricting the headline CPI-compatible index to these windows eliminates high-frequency noise caused by 24-hour yield management algorithms.

### 5.2 Analytical Windows (T+1 to T+45)
Analytical windows capture the full dynamic pricing curve across time horizons:
- **T+1**: Spot fare / distress / last-minute surge pricing.
- **T+7 & T+15**: Short-term business travel horizon.
- **T+30 & T+45**: Early-bird promotions and holiday season inventory releases.

The dashboard's **Lead Time Curve Chart** visualizes this entire curve from T+1 to T+45 for any selected corridor.
