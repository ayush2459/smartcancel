import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
import { createCancellationRouter } from './routes/cancellations.js';
import { createRecoveryRouter } from './routes/recovery.js';
import { createReportsRouter } from './routes/reports.js';
import { createApprovalRouter } from './routes/approvals.js';
import { createExecutionRouter } from './routes/executions.js';
import { createDecisionRouter } from './routes/decisions.js';
import { createDemoRouter } from './demoRouter.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const { Pool } = pg;
const app = express();

const requiredEnv = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
];

const missingEnv = requiredEnv.filter(
  (key) => !process.env[key] || process.env[key].trim() === ''
);

if (missingEnv.length > 0) {
  console.error(`Missing backend environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: Number(process.env.DB_POOL_MAX || 10),
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  application_name: 'smartcancy-backend',
});

pool.on('error', (error) => {
  console.error('Unexpected idle PostgreSQL client error:', error.message);
});

const allowDemoMode = process.env.SMARTCANCY_ALLOW_DEMO_MODE !== 'false';

async function bootDatabaseMode() {
  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL reachable; using production database routes.');
    return true;
  } catch (error) {
    if (!allowDemoMode) {
      console.error('PostgreSQL unavailable and demo mode is disabled. Refusing to start without a database.');
      process.exit(1);
    }
    console.warn('PostgreSQL unavailable; falling back to demo mode.');
    return false;
  }
}

const postgresAvailable = await bootDatabaseMode();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const demoRouter = createDemoRouter();

if (postgresAvailable) {
  app.use('/api/v1/cancellations', createCancellationRouter(pool));
  app.use('/api/v1/recovery', createRecoveryRouter(pool));
  app.use('/api/v1/reports', createReportsRouter(pool));
  app.use('/api/v1/approvals', createApprovalRouter(pool));
  app.use('/api/v1/executions', createExecutionRouter(pool));
  app.use('/api/v1/decisions', createDecisionRouter(pool));
} else {
  app.use('/api/v1/cancellations', demoRouter);
  app.use('/api/v1/recovery', demoRouter);
  app.use('/api/v1/reports', demoRouter);
  app.use('/api/v1/approvals', demoRouter);
  app.use('/api/v1/executions', demoRouter);
  app.use('/api/v1/decisions', demoRouter);
}

app.get('/api/health/live', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'smartcancy-backend',
  });
});

app.get('/api/health', async (_req, res) => {
  if (!postgresAvailable) {
    return res.json({
      status: 'ok',
      service: 'smartcancy-backend',
      database: {
        status: 'connected',
        name: process.env.DB_NAME || 'smartcancy',
        mode: 'demo',
        degraded: true,
        note: 'PostgreSQL is unavailable in this environment; demo data is active.',
      },
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS database_user,
        current_setting('server_version') AS postgres_version
    `);

    res.json({
      status: 'ok',
      service: 'smartcancy-backend',
      database: {
        status: 'connected',
        name: result.rows[0].database,
        user: result.rows[0].database_user,
        version: result.rows[0].postgres_version,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(503).json({
      status: 'error',
      service: 'smartcancy-backend',
      database: { status: 'disconnected' },
    });
  }
});

const port = Number(process.env.PORT || 8000);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`SmartCancy API listening on http://127.0.0.1:${port}`);
  console.log(`Liveness: http://127.0.0.1:${port}/api/health/live`);
  console.log(`Database health: http://127.0.0.1:${port}/api/health`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));




