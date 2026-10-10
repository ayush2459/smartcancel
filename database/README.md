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

## Synthetic dashboard data

To populate an initialized SmartCancy database for a local frontend demonstration, run `seed-demo.sql` from the repository root:

```bash
psql -h localhost -p 5432 -U smartcancy_app -d smartcancy \
  -v ON_ERROR_STOP=1 -f database/seed-demo.sql
```

The seed adds clearly labeled synthetic orders, customers, parcels, and cancellation workflows, including five Bengaluru-to-Delhi pilot cases. It is separate from the schema bootstrap, safe to rerun, and does not overwrite workflow records already used.

The five-order pilot stores a **2,150 km one-way planning estimate** in each synthetic cancellation event. This is not live routing, carrier telemetry, or a measured journey. The pilot report may show the sum as modeled return-distance exposure only; it is not distance saved.

The pilot report separately calculates a **modeled local last-mile petrol-bike scenario**: five orders × 38.5 km assumed local return distance per order, ÷ 45 km/L illustrative bike mileage, × ₹112.05/L illustrative petrol price (the existing SmartCancy fuel-price assumption). This yields about ₹479 potential petrol cost avoided, conditional on those local return trips otherwise being required and actually avoided. It is not the Bengaluru–Delhi lane distance, a current pump-price quote, vehicle telemetry, or realized savings. CO₂e uses an illustrative 2.31 kg/L factor. Measured savings still come only from `impact_ledger`. The seed does not create ledger rows or represent synthetic demand signals and parcel flags as real observations.