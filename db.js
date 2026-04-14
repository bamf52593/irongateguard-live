import dotenv from 'dotenv';
import pg from 'pg';

// Always prefer repository .env values over stale shell-level overrides.
dotenv.config({ override: true });

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;
let dbEnabled = false;

function shouldUseDatabaseSsl() {
  const raw = String(process.env.DB_SSL || '').toLowerCase().trim();

  if (['true', '1', 'yes'].includes(raw)) {
    return true;
  }

  if (['false', '0', 'no'].includes(raw)) {
    return false;
  }

  const databaseUrl = String(DATABASE_URL || '').toLowerCase();
  const isLocalDatabase = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  return process.env.NODE_ENV === 'production' && !isLocalDatabase;
}

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: shouldUseDatabaseSsl() ? { rejectUnauthorized: false } : false
  });
}

export async function initDb() {
  if (!pool) {
    console.log('DB: DATABASE_URL not set, using in-memory fallback');
    dbEnabled = false;
    return false;
  }

  try {
    await pool.query('SELECT 1');
    dbEnabled = true;
    console.log('DB: PostgreSQL connection established');
    return true;
  } catch (error) {
    dbEnabled = false;
    console.warn('DB: PostgreSQL unavailable, using in-memory fallback');
    console.warn(`DB error: ${error.message}`);
    return false;
  }
}

export function isDbEnabled() {
  return dbEnabled;
}

export async function query(text, params = []) {
  if (!pool || !dbEnabled) {
    throw new Error('Database is not available');
  }
  return pool.query(text, params);
}
