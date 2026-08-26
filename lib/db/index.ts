import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Each serverless instance opens its own pool, so the driver's default of 10
// multiplies by instance count and can exhaust a small Postgres. Exhaustion is
// not graceful here: checkRateLimit fails closed, so /api/chat starts returning
// 503. Long-running single-process deploys can raise this via the env var.
const DEFAULT_POOL_MAX = 3;
const parsedPoolMax = Number(process.env.DATABASE_POOL_MAX);
const poolMax =
  Number.isInteger(parsedPoolMax) && parsedPoolMax > 0 ? parsedPoolMax : DEFAULT_POOL_MAX;

export const client = postgres(connectionString, { max: poolMax });
export const db = drizzle(client);
