# SmartCancy — cancellation recovery and sustainable logistics

SmartCancy is a prototype for reducing waste when orders are cancelled late. The repository includes an interactive React/Vite simulator and a separate PostgreSQL-backed Express API for cancellation intake, recovery recommendations, human approval, simulated execution, and reports.

> **Prototype boundary:** the frontend currently includes local demo data. The backend uses deterministic rule-based recommendations and illustrative estimates. Execution is simulation-only: it does not dispatch riders, reprint labels, refund payments, mutate live orders/parcels, or establish verified savings. Figures in the concept material are projections, not measured results.

## Repository layout

- `src/` — React + TypeScript + Vite interactive frontend and demo data.
- `backend/` — Express API and PostgreSQL routes.
- `database/schema.sql` — schema-only bootstrap for a fresh SmartCancy database (16 tables, enums, indexes, triggers; no seed/customer data).
- `.github/workflows/ci.yml` — CI build, type-check, schema bootstrap and API smoke tests.

## Prerequisites

- Node.js 22 LTS recommended (Node 20.19+ works with current Vite).
- npm and Git.
- PostgreSQL 16+ (local install or Docker).

## Quick start on macOS

### 1. Clone and install

```bash
git clone https://github.com/ayush2459/smartcancel.git
cd smartcancel
npm ci
cd backend
npm ci
cd ..
```

### 2. Create a dedicated PostgreSQL database

Use a database named `smartcancy` and a local role permitted to create/use the schema. **Do not point SmartCancy at your FlowSense database.**

For an existing local PostgreSQL installation, create an empty database with your normal local admin tools, then run from the repository root:

```bash
createdb smartcancy
psql -d smartcancy -v ON_ERROR_STOP=1 -f database/schema.sql
```

If `createdb` reports that the database already exists, do not delete/reset it. Confirm it is the intended SmartCancy database before running SQL. The schema uses `pgcrypto` for UUID generation.

Alternatively, start an isolated local Docker database. Replace the example password with your own and keep it private:

```bash
docker run --name smartcancy-postgres \
  -e POSTGRES_DB=smartcancy \
  -e POSTGRES_USER=smartcancy_app \
  -e POSTGRES_PASSWORD='choose-a-local-password' \
  -p 5432:5432 -d postgres:16
```

Apply the schema to that container:

```bash
PGPASSWORD='choose-a-local-password' psql -h localhost -p 5432 \
  -U smartcancy_app -d smartcancy -v ON_ERROR_STOP=1 \
  -f database/schema.sql
```

Verify the database:

```bash
psql -d smartcancy -c "\\dt"
psql -d smartcancy -c "SELECT current_database(), current_user;"
```

A fresh schema should show 16 application tables. This bootstrap is not a migration for an already-initialized database and should not be rerun on it.

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

Open http://localhost:3000. The current frontend is an interactive demo/simulator with local data; it is **not yet fully wired to all backend endpoints**. Never put database credentials or a privileged API secret into Vite/client-side variables.

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

Cancellation intake requires `order_number`, `reason`, `source`, and `idempotency_key` (or an `Idempotency-Key` header). Sources: `CUSTOMER_APP`, `CUSTOMER_SUPPORT`, `SYSTEM`, `OPERATOR`. Requests require matching records in the database; no seed or customer records are automatically inserted.

## Commands

From repository root:

```bash
npm run dev       # frontend
npm run build     # production frontend build
npm run lint      # TypeScript type check
```

From `backend/`:

```bash
npm run dev       # API with Node watch mode
npm start         # API
npm run check     # syntax checks for backend files
npm test          # API smoke tests against a running backend
```

The API smoke tests expect the backend to be running at `http://127.0.0.1:8000`; set `API_BASE_URL` to override this. GitHub Actions runs these checks with an isolated temporary PostgreSQL database.

## Production readiness checklist

- **Authentication and authorization are not implemented.** Do not expose the API publicly or treat caller-provided `actor` values as verified identity. Add real authentication, role-based access control, and verified audit attribution before deployment.
- **Frontend integration is incomplete.** The visible screens use demo data; connect them to the API through a server-side integration layer before describing the product as fully integrated.
- **Recovery scoring is a prototype.** `rules-v1` is not a trained/validated model. Calibrate cost, carbon factors, SLA risk, and confidence with operational data.
- **Execution is simulation-only.** No real dispatch, rematching, label printing, refunds, or order/parcel mutation occurs.
- Add request IDs, rate limiting, structured logs, monitoring, backup/restore drills, and a formal migration/versioning strategy.
- Define data retention, minimize personal data, and review privacy/access controls before processing real customer data.
- Publish only measured, auditable impact results; treat concept/ROI values as assumptions until validated.

## Safety

- Keep `.env`, credentials, production dumps, and real customer data out of Git.
- Never run destructive database commands against FlowSense or any database containing data you need.
- The SQL file is for a fresh SmartCancy database; it is not an automatic migration.
