# SmartCancy — cancellation recovery and sustainable logistics

SmartCancy is a prototype for reducing waste from late order cancellations. This repository contains an interactive React/Vite simulator and a separate PostgreSQL-backed Express API for cancellation intake, recovery recommendations, human approval, simulated execution, and reports.

> **Prototype boundary:** the frontend currently uses local demo data. The backend uses deterministic rule-based recommendations and illustrative estimates. Execution is simulation-only: it does not dispatch riders, reprint labels, refund payments, mutate live orders/parcels, or establish verified savings. Concept/ROI figures are projections, not measured results.

## Repository layout

- `src/` — React + TypeScript + Vite frontend and demo data.
- `backend/` — Express API and PostgreSQL routes.
- `database/schema.sql` — schema-only bootstrap for a fresh SmartCancy database (16 tables, enums, indexes, triggers; no seed/customer data).
- `.github/workflows/ci.yml` — frontend/backend checks and API smoke tests.

## Prerequisites

- Node.js 22 LTS recommended (Node 20.19+ works with current Vite).
- npm, Git, PostgreSQL 16+ (local install or Docker).

## Quick start on macOS

### 1. Clone and install

```bash
git clone https://github.com/ayush2459/smartcancel.git
cd smartcancel
npm install
cd backend
npm ci
cd ..
```

The root has a Bun lockfile rather than an npm lockfile, so use `npm install` (or `bun install --frozen-lockfile`) for the frontend. The backend has `package-lock.json`, so `npm ci` works there.

### 2. Create a dedicated PostgreSQL database

**Do not point SmartCancy at your FlowSense database.** Create a fresh database called `smartcancy` owned by the role configured in `backend/.env`. Example SQL to run as a local PostgreSQL administrator (choose your own password locally):

```sql
CREATE ROLE smartcancy_app LOGIN PASSWORD 'set-your-own-local-password';
CREATE DATABASE smartcancy OWNER smartcancy_app;
```

From the repository root, apply the schema:

```bash
psql -h localhost -p 5432 -U smartcancy_app -d smartcancy \
  -v ON_ERROR_STOP=1 -f database/schema.sql
```

If the role/database already exists, do not drop or reset it. Confirm you are targeting the intended SmartCancy database first. The schema uses `pgcrypto` for UUID generation. Verify:

```bash
psql -h localhost -p 5432 -U smartcancy_app -d smartcancy -c "\\dt"
psql -h localhost -p 5432 -U smartcancy_app -d smartcancy -c "SELECT current_database(), current_user;"
```

A fresh schema should show 16 application tables. This bootstrap is not a migration for an initialized database and should not be rerun on it. See [database setup notes](database/README.md).

### 3. Configure and start the backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` locally so `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` match your SmartCancy database. Never commit `.env` or share credentials.

Start terminal 1:

```bash
npm run dev
```

Health checks:
- http://127.0.0.1:8000/api/health/live — process liveness.
- http://127.0.0.1:8000/api/health — PostgreSQL connectivity.

### 4. Start the frontend

In terminal 2, from the repository root:

```bash
npm run dev
```

Open http://localhost:3000. The frontend is currently a simulator with local data; it is **not yet fully wired to all backend endpoints**. Never put database credentials or a privileged API secret into Vite/client-side variables.

## Backend API

Base URL: `http://127.0.0.1:8000`

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health/live` | Liveness |
| GET | `/api/health` | Database health |
| POST | `/api/v1/cancellations` | Idempotent cancellation intake |
| POST | `/api/v1/recovery/:eventId/evaluate` | Evaluate recovery candidates |
| GET | `/api/v1/reports/overview` | Operational counters and recorded ledger totals |
| GET | `/api/v1/reports/cancellations` | Paginated cancellation listing |
| GET | `/api/v1/reports/decisions/:decisionId` | Decision, candidates and ledger detail |
| POST | `/api/v1/approvals/:decisionId/approve` | Human approval |
| POST | `/api/v1/approvals/:decisionId/reject` | Human rejection |
| POST | `/api/v1/executions/:decisionId/execute` | Simulated execution only |
| GET | `/api/v1/executions/:decisionId` | Execution/audit history |

Cancellation intake requires `order_number`, `reason`, `source`, and `idempotency_key` (or an `Idempotency-Key` header). Sources: `CUSTOMER_APP`, `CUSTOMER_SUPPORT`, `SYSTEM`, `OPERATOR`. Requests depend on records already in the database; no seed/customer records are inserted automatically.

## Tests and checks

From repository root:

```bash
npm run lint
npm run build
```

From `backend/`:

```bash
npm run dev
npm test
```

Backend smoke tests expect the API at `http://127.0.0.1:8000`; override with `API_BASE_URL`. The CI workflow initializes a temporary PostgreSQL database and runs the frontend checks plus backend smoke tests.

## Production readiness checklist

- **Authentication and authorization are not implemented.** Do not expose the API publicly or treat caller-provided `actor` values as verified identity. Add real authentication, role-based access control, and verified audit attribution before deployment.
- **Frontend integration is incomplete.** Screens use demo data; connect them through a server-side integration layer before describing the product as fully integrated.
- **Recovery scoring is a prototype.** `rules-v1` is not a trained/validated model. Calibrate cost, carbon factors, SLA risk, and confidence with operational data.
- **Execution is simulation-only.** No real dispatch, rematching, label printing, refunds, or order/parcel mutation occurs.
- Add request IDs, rate limiting, structured logs, monitoring, backup/restore drills, and a formal migration/versioning strategy.
- Define retention, minimize personal data, and review privacy/access controls before real customer data is processed.
- Publish only measured, auditable impact results; treat concept/ROI values as assumptions until validated.

## Safety

- Keep `.env`, credentials, production dumps, and real customer data out of Git.
- Never run destructive database commands against FlowSense or any database containing data you need.
- The SQL file is for a fresh SmartCancy database; it is not an automatic migration.
