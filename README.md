# FlyWise — APIx

**A real-time airfare price index for India**, built as a prototype for **Smart India Hackathon 2026**, problem statement **PS26056** (MoSPI / DIID). FlyWise tracks economy-class airfares across 14 domestic and international routes, computing a Jevons-based price index (APIx) updated 6× daily from live market data — no synthetic or fabricated observations.

---

## Repository Structure

| Folder | Purpose |
|---|---|
| `collectors/` | Data-source adapters (Bright Data, Scrappa, OTA Playwright scrapes) and the Render cron entrypoint |
| `ingestion/` | Raw-JSON parsing, airport normalisation, fare-family mapping, codeshare dedup |
| `processing/` | FX conversion, quality/glitch-fare checks, imputation engine, Jevons index computation |
| `api/` | FastAPI backend — routers, middleware, Pydantic models |
| `dashboard/` | Next.js + TailwindCSS + Framer Motion frontend (deployed on Vercel) |
| `db/` | PostgreSQL schema, seed data, and migration scripts (hosted on Neon) |
| `config/` | Environment-variable templates and gitignore |
| `docs/` | Methodology notes, data-dictionary, and presentation assets |
