# SmartCancy
### Cancellation Recovery & Sustainable Logistics

SmartCancy explores how logistics teams can reduce avoidable costs, unnecessary travel, and environmental impact when an order is cancelled after fulfilment has begun.

Instead of treating every cancellation as an automatic return, SmartCancy evaluates recovery options—such as stopping, holding, continuing, rematching, transferring, or returning a parcel—and records a recommendation for operational review.

> **Project status:** SmartCancy is a prototype. The backend supports cancellation intake, rule-based recovery recommendations, human approval/rejection, reporting, and simulated execution. Recovery estimates are illustrative and have not been validated against live logistics operations. Simulated execution does not dispatch riders, refund payments, print labels, or modify live orders or parcels.

## Live deployment

- **API endpoint:** https://wdu1m18nd1.execute-api.ap-southeast-2.amazonaws.com/
- **AWS region:** Asia Pacific (Sydney), `ap-southeast-2`
- **Repository:** https://github.com/ayush2459/smartcancel

The endpoint above is the deployed API base URL; it is not necessarily a browser-based frontend URL. Use the configured application interface or the documented API routes to interact with the service.

**Security notice:** Do not publish usernames, passwords, API keys, database credentials, tokens, or other access details in this README or in source control. If credentials have been exposed in a public repository or message, rotate/revoke them immediately and review access logs. Share access details only through an approved private channel.

## What SmartCancy does

- **Cancellation intake:** accepts cancellation requests and records them against an existing order.
- **Recovery evaluation:** evaluates six candidate actions using deterministic rules.
- **Human review:** supports approval or rejection of a recommended decision.
- **Execution simulation:** records a simulated execution and its audit trail without performing real-world side effects.
- **Operational reporting:** exposes cancellation, decision, and recorded impact-ledger summaries.
- **AWS deployment foundation:** includes an AWS CDK application and staged deployment guidance for the Sydney region.

## How the workflow works

```text
Existing Order
     |
     v
Cancellation Request
     |
     v
Recovery Evaluation
     |
     v
Candidate Actions + Recommendation
     |
     v
Human Approval / Rejection
     |
     v
Simulated Execution (approved decisions only)
     |
     v
Execution History + Audit Trail + Reports
```

The workflow depends on order and related records already existing in the database. The repository does not automatically populate a real customer dataset.

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| Infrastructure | AWS CDK; deployment targets `ap-southeast-2` |
| CI | GitHub Actions |
| Authentication at deployed entry point | AWS Cognito and API Gateway JWT authorizer, as configured for the deployment |

The local development API is unauthenticated by default. Do not expose it publicly without adding suitable authentication and authorization controls. The prototype does not yet provide a complete viewer/operator permission model, and caller-provided actor labels must not be treated as verified identities.

## Repository structure

```text
.
├── src/                     # React/Vite frontend and simulator views
├── backend/                 # Express API and PostgreSQL route handlers
├── database/
│   ├── schema.sql            # Schema bootstrap for a fresh SmartCancy database
│   └── README.md             # Database setup notes
├── infra/                    # AWS CDK application
├── .github/workflows/ci.yml  # CI checks and API smoke tests
├── DEPLOY.md                 # Staged AWS deployment and review gates
└── README.md
```

## Frontend behaviour

The Operations area is intended to use backend reports and support cancellation intake, recovery evaluation, approval/rejection, and simulated execution. The Customer App area remains a local simulator using sample data; it does not submit those sample orders to the backend. Do not interpret demo values or UI animations as proof of real operational savings.

## Backend API

For local development, the default base URL is `http://127.0.0.1:8000`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health/live` | Process liveness check |
| GET | `/api/health` | Database connectivity check |
| POST | `/api/v1/cancellations` | Submit an idempotent cancellation request |
| POST | `/api/v1/recovery/:eventId/evaluate` | Evaluate recovery candidates for a cancellation event |
| GET | `/api/v1/reports/overview` | Operational counts and recorded ledger totals |
| GET | `/api/v1/reports/cancellations` | Paginated cancellation list |
| GET | `/api/v1/reports/decisions/:decisionId` | Decision, candidate, and ledger details |
| POST | `/api/v1/approvals/:decisionId/approve` | Approve a decision |
| POST | `/api/v1/approvals/:decisionId/reject` | Reject a decision |
| POST | `/api/v1/executions/:decisionId/execute` | Record simulated execution for an approved decision |
| GET | `/api/v1/executions/:decisionId` | Read execution and audit history |

Cancellation requests require `order_number`, `reason`, `source`, and `idempotency_key` (or an `Idempotency-Key` header). Supported sources are `CUSTOMER_APP`, `CUSTOMER_SUPPORT`, `SYSTEM`, and `OPERATOR`.

## Run locally

### Prerequisites

- Node.js 22 LTS recommended (Node.js 20.19+ may work with the current Vite setup)
- npm
- PostgreSQL 16 or later, installed locally or run in a development container
- Git

### 1. Clone the repository

```bash
git clone https://github.com/ayush2459/smartcancel.git
cd smartcancel
```

### 2. Install dependencies

The frontend uses a Bun lockfile; use Bun for a reproducible install when available. The backend uses npm and has its own lockfile.

```bash
bun install --frozen-lockfile
cd backend
npm ci
cd ..
```

If Bun is not installed, install the frontend dependencies with `npm install`. Do not use `npm ci` at the repository root unless an npm lockfile is present.

### 3. Create a dedicated PostgreSQL database

Use a dedicated SmartCancy database. **Never point SmartCancy at your FlowSense database or any database containing unrelated data.** As a PostgreSQL administrator, create a local role and database using a password you choose locally:

```sql
CREATE ROLE smartcancy_app LOGIN PASSWORD 'choose-a-local-password';
CREATE DATABASE smartcancy OWNER smartcancy_app;
```

From the repository root, apply the schema only to a newly created, empty SmartCancy database:

```bash
psql -h localhost -p 5432 -U smartcancy_app -d smartcancy \
  -v ON_ERROR_STOP=1 -f database/schema.sql
```

Verify the connection and tables:

```bash
psql -h localhost -p 5432 -U smartcancy_app -d smartcancy \
  -c "SELECT current_database(), current_user;"
psql -h localhost -p 5432 -U smartcancy_app -d smartcancy -c "\\dt"
```

**Important:** `database/schema.sql` is a bootstrap schema for a fresh database, not a migration. Do not rerun it against an initialized database. Review `database/README.md` and verify the schema against any existing database before applying changes.

### 4. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` locally to match your database configuration. Keep `.env` out of Git and never place database credentials or privileged secrets in frontend environment variables.

Start the API:

```bash
npm run dev
```

Check these endpoints:

- http://127.0.0.1:8000/api/health/live
- http://127.0.0.1:8000/api/health

### 5. Start the frontend

In a second terminal, return to the repository root and start the Vite development server:

```bash
npm run dev
```

Open the local URL printed by Vite. The development server is configured to proxy `/api` to `http://127.0.0.1:8000`. Set `SMARTCANCY_API_TARGET` only when the backend is listening at a different address.

### 6. Run checks

From the repository root, run the frontend checks supported by the configured scripts:

```bash
npm run lint
npm run build
```

Run backend tests from `backend/`:

```bash
npm test
```

The backend smoke tests expect the API at `http://127.0.0.1:8000`; set `API_BASE_URL` to override the test target. The GitHub Actions workflow also runs frontend checks and backend API smoke tests against a temporary PostgreSQL service.

## AWS infrastructure

The AWS CDK application targets `ap-southeast-2`. Review the infrastructure and deployment instructions before provisioning resources.

To synthesize the CDK template without deploying resources, use the infrastructure script configured in the root package:

```bash
npm run infra:synth
```

Read [DEPLOY.md](DEPLOY.md) for deployment stages, Cognito callback configuration, database initialization, cost review gates, and teardown guidance. Do not run `cdk bootstrap` or `cdk deploy` until the documented reviews and approvals are complete.

## Prototype limitations and next steps

SmartCancy is not yet a production logistics platform. Before using it with real customers or operations:

- **Complete integration testing:** verify that each intended frontend workflow uses the API and persists data correctly.
- **Authentication and authorization:** enforce server-side roles and permissions; derive audit identity from verified credentials, not request-body actor fields.
- **Reliability:** add request IDs, rate limiting, structured logs, concurrency tests, formal migrations, monitoring, and tested backup/restore procedures.
- **Recovery quality:** validate feasibility rules and calibrate cost, carbon, service-level, and risk estimates against representative operational data.
- **Real execution adapters:** integrate carrier, dispatch, rematching, returns, and other external systems only with explicit authorization, safe retries, timeouts, reconciliation, and auditability.
- **Impact measurement:** distinguish estimated from measured savings and record evidence for any claimed cost, distance, or emissions reduction.
- **Privacy:** minimize personal data, define retention periods, and review access controls before processing real customer information.

## Safety and data handling

- Never commit `.env` files, passwords, access tokens, database dumps, or real customer data.
- Rotate credentials immediately if they have been exposed.
- Keep SmartCancy and FlowSense databases separate.
- Back up important data before any schema or migration work.
- Treat all simulation output, cost estimates, and ROI figures as illustrative until independently validated.

## Contributing

For changes, keep API contracts and documentation in sync, add regression tests for backend behaviour, and run the relevant frontend/backend checks before submitting a pull request.

## License

No license is specified in this README. Add a `LICENSE` file before presenting the repository as open source.
