# FlyWise (APIx) — Policy API Consumer Guide

This guide is intended for institutional data consumers at the **National Statistical Office (NSO / MoSPI)**, **Reserve Bank of India (RBI)**, and the **Ministry of Civil Aviation (MoCA)** who integrate the FlyWise Airfare Price Index into econometric models and official inflation series.

---

## 1. Overview & Service URLs

FlyWise exposes dedicated, high-throughput policy export endpoints under the `/policy/` route namespace. These endpoints stream raw time-series data and route-level breakdowns in structured CSV and JSON formats.

### Base URLs
- **Production Backend**: `https://flywise-uoxg.onrender.com`
- **Local / Development**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `https://flywise-uoxg.onrender.com/docs`

---

## 2. Authentication: The `X-API-Key` Header

To protect institutional endpoints from unauthorized mass extraction, all requests under `/policy/*` require an API key passed via the `X-API-Key` HTTP header.

```http
GET /policy/apix.json HTTP/1.1
Host: flywise-uoxg.onrender.com
X-API-Key: YOUR_AUTHORIZED_KEY
Accept: application/json
```

### Authentication Responses
- **`200 OK`**: Request authorized; payload returned.
- **`401 Unauthorized`**:
  ```json
  { "detail": "Missing X-API-Key header." }
  ```
- **`403 Forbidden`**:
  ```json
  { "detail": "Invalid API key." }
  ```
- **`503 Service Unavailable`**: Server lacks configured key allow-lists.

---

## 3. Endpoints Reference

### 3.1 National Index Series: `GET /policy/apix.json` & `GET /policy/apix.csv`

Exports daily national-level airfare price indices (DAPIx, IAPIx, and Overall APIx) along with data quality metrics.

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|:---|:---|:---|:---|:---|
| `window` | string | No | `null` | Filter by `cpi_compatible` (T+21/T+60) or `analytical`. |
| `from_date` | string (YYYY-MM-DD) | No | `null` | Start date (inclusive). |
| `to_date` | string (YYYY-MM-DD) | No | `null` | End date (inclusive). |

#### Sample Request (cURL)
```bash
curl -X GET "https://flywise-uoxg.onrender.com/policy/apix.json?window=cpi_compatible&from_date=2026-09-01" \
  -H "X-API-Key: key1"
```

#### Sample Request (Python)
```python
import requests

url = "https://flywise-uoxg.onrender.com/policy/apix.json"
headers = {"X-API-Key": "key1"}
params = {
    "window": "cpi_compatible",
    "from_date": "2026-09-01",
    "to_date": "2026-09-19"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(f"Retrieved {len(data)} index records.")
```

#### Sample JSON Response
```json
[
  {
    "date": "2026-09-19",
    "window_category": "cpi_compatible",
    "domestic_apix": 103.45,
    "international_apix": 94.20,
    "overall_apix": 100.68,
    "status": "finalized",
    "coverage_score": 0.965,
    "confidence_score": 0.982
  },
  {
    "date": "2026-09-18",
    "window_category": "cpi_compatible",
    "domestic_apix": 102.80,
    "international_apix": 95.10,
    "overall_apix": 100.49,
    "status": "finalized",
    "coverage_score": 1.000,
    "confidence_score": 0.990
  }
]
```

#### Sample CSV Response (`GET /policy/apix.csv`)
```csv
date,window_category,domestic_apix,international_apix,overall_apix,status,coverage_score,confidence_score
2026-09-19,cpi_compatible,103.45,94.20,100.68,finalized,0.965,0.982
2026-09-18,cpi_compatible,102.80,95.10,100.49,finalized,1.000,0.990
```

---

### 3.2 Route-Level Microdata: `GET /policy/routes.json` & `GET /policy/routes.csv`

Exports detailed route-level price relatives ($p_t / p_0 \times 100$) for every corridor and lead-time window.

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|:---|:---|:---|:---|:---|
| `window` | string | No | `null` | Filter by `cpi_compatible` or `analytical`. |
| `from_date` | string (YYYY-MM-DD) | No | `null` | Start date (inclusive). |
| `to_date` | string (YYYY-MM-DD) | No | `null` | End date (inclusive). |

#### Sample Request (cURL)
```bash
curl -X GET "https://flywise-uoxg.onrender.com/policy/routes.json?window=cpi_compatible" \
  -H "X-API-Key: key1"
```

#### Sample JSON Response
```json
[
  {
    "route_id": "DEL-BOM",
    "window_category": "cpi_compatible",
    "advance_days": 21,
    "date": "2026-09-19",
    "price_relative": 104.85,
    "n_observations": 18
  },
  {
    "route_id": "DEL-BLR",
    "window_category": "cpi_compatible",
    "advance_days": 21,
    "date": "2026-09-19",
    "price_relative": 97.40,
    "n_observations": 14
  }
]
```

#### Sample CSV Response (`GET /policy/routes.csv`)
```csv
route_id,window_category,advance_days,date,price_relative,n_observations
DEL-BOM,cpi_compatible,21,2026-09-19,104.85,18
DEL-BLR,cpi_compatible,21,2026-09-19,97.40,14
```

---

## 4. Field Definitions & Economic Semantics

| Field Name | Type | Description |
|:---|:---|:---|
| `date` | Date (ISO-8601) | Collection and index computation date (`YYYY-MM-DD`). |
| `window_category` | String | `cpi_compatible` (T+21 domestic / T+60 international) or `analytical` (all other advance lead-times). |
| `domestic_apix` | Float | Young-weighted index for domestic routes ($I_0 = 100.0$). |
| `international_apix` | Float | Young-weighted index for international routes ($I_0 = 100.0$). |
| `overall_apix` | Float | Composite national index ($0.70 \times \text{DAPIx} + 0.30 \times \text{IAPIx}$). |
| `status` | String | Data lifecycle state: `live` (interim intraday), `mtd` (month-to-date), or `finalized` (post-imputation). |
| `coverage_score` | Float (0.0 to 1.0) | Fraction of expected observation cells populated by real, non-imputed data ($\ge 0.80$ indicates high statistical confidence). |
| `confidence_score` | Float (0.0 to 1.0) | Composite data quality score based on cross-source reconciliation and source trust. |
| `route_id` | String | Airport IATA pair code (e.g., `DEL-BOM`). |
| `advance_days` | Integer | Lead time in days before departure date (e.g., 1, 7, 15, 21, 30, 45, 60). |
| `price_relative` | Float | Elementary Jevons index for that specific corridor and lead time ($p_t / p_0 \times 100$). |
| `n_observations` | Integer | Count of valid flight observations used in the Jevons geometric mean for that cell. |

---

## 5. Performance, Streaming & Rate Limits

- **Streaming Architecture**: CSV export endpoints utilize Python `io.StringIO` streaming generators wrapped in FastAPI `StreamingResponse`. Memory consumption on the backend remains constant ($O(1)$) regardless of whether querying 30 days or 3 years of data.
- **Database Connection Management**: Backed by a high-concurrency Neon PostgreSQL connection pool (`minconn=2, maxconn=20`), ensuring uninterrupted service under parallel institutional access.
- **Consumption Cadence**: NSO and RBI automated ingestion jobs typically execute daily at **18:30 IST** following the completion of the 18:00 IST calculation cycle. Rate limits are set to a generous **120 requests/minute per API key**.
