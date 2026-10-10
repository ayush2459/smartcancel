import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;

export async function handler(event) {
  const action = event?.action;
  if (!['initialize', 'schema', 'seed'].includes(action)) {
    throw new Error('Migration action must be initialize, schema, or seed.');
  }

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? true : undefined,
    connectionTimeoutMillis: 5000,
    application_name: 'smartcancy-bootstrap',
  });

  await client.connect();
  try {
    if (action === 'initialize' || action === 'schema') {
      const schema = await readFile('/opt/schema.sql', 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(schema);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    if (action === 'initialize' || action === 'seed') {
      const seed = await readFile('/opt/seed-demo.sql', 'utf8');
      await client.query(seed);
    }

    return { status: 'ok', action };
  } finally {
    await client.end();
  }
}
