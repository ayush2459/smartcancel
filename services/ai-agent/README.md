# SCRE AI agent sidecar

This directory is a standalone Node HTTP service. It is intentionally separate from the Vite frontend and the FastAPI recovery engine.

It consumes a read-only, already-persisted backend decision, validates its contract, and returns a grounded explanation. It cannot generate candidates, change a recommendation or score, write to the database, or execute an operation. Gemini is optional: missing keys, model timeouts, failures, and invalid responses produce a deterministic fallback rather than blocking cancellation recovery.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
# Set SCRE_API_BASE_URL and, only when wanted, GEMINI_API_KEY in the private .env file.
npm run agent:dev
```

The default address is `http://localhost:8081`. Call `GET /health` to see whether it is using Gemini or `deterministic-fallback`.

The backend calls `POST /v1/decisions/{decision_id}/analyze`; the sidecar fetches the actual backend `GET /decisions/{decision_id}` response. Details, schemas, security expectations, error semantics, and the backend handoff checklist are in [the integration contract](../../docs/ai-agent-integration.md).

## Verify

```powershell
npm run agent:test
npm run lint
npm run build
```

`AI_AGENT_ALLOW_INLINE_SNAPSHOT=true` exists only for isolated test requests. Leave it `false` in normal operation so the agent always consumes the backend decision API.
