# SmartCancy database

`schema.sql` is the schema-only bootstrap for a fresh SmartCancy PostgreSQL database. It creates enums, tables, indexes, and update triggers. It must contain no seed rows, credentials, or real customer data.

## Fresh database

Create a dedicated empty PostgreSQL database named `smartcancy`, then run from the repository root:

```bash
psql -d smartcancy -v ON_ERROR_STOP=1 -f database/schema.sql
```

For a named local role/host:

```bash
psql -h localhost -p 5432 -U smartcancy_app -d smartcancy -v ON_ERROR_STOP=1 -f database/schema.sql
```

The database role needs permission to use the schema and the `pgcrypto` extension. If required, ask a PostgreSQL administrator to install that extension.

**Never apply this bootstrap to FlowSense.** It is for a fresh SmartCancy database and is not idempotent for the enum/table definitions. Do not rerun it against an initialized database. Back up existing databases before deliberate migrations.