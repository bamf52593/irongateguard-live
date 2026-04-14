import { query, isDbEnabled } from './db.js';
import { createHash } from 'crypto';

const MIGRATION_STEPS = [
  {
    name: 'devices_table',
    sql: `CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      device_id VARCHAR(100) NOT NULL UNIQUE,
      mac_address VARCHAR(17),
      device_type VARCHAR(50),
      location VARCHAR(255),
      status VARCHAR(20) DEFAULT 'online' CHECK (status IN ('online', 'offline', 'unknown')),
      last_seen TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: 'events_table',
    sql: `CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      event_type VARCHAR(100) NOT NULL,
      severity VARCHAR(20) CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
      title VARCHAR(255),
      description TEXT,
      raw_data JSONB,
      is_resolved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP
    )`
  },
  {
    name: 'attack_traces_table',
    sql: `CREATE TABLE IF NOT EXISTS attack_traces (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      mac_address VARCHAR(17) NOT NULL,
      attack_vector VARCHAR(100),
      confidence_score FLOAT DEFAULT 0.5,
      events_count INTEGER DEFAULT 0,
      related_devices INTEGER DEFAULT 0,
      threat_level VARCHAR(20) CHECK (threat_level IN ('critical', 'high', 'medium', 'low')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: 'attack_chains_table',
    sql: `CREATE TABLE IF NOT EXISTS attack_chains (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      trace_id UUID NOT NULL REFERENCES attack_traces(id) ON DELETE CASCADE,
      chain_pattern VARCHAR(100),
      sequence JSONB,
      detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: 'attack_traces_attacker_city_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS attacker_city VARCHAR(120)`
  },
  {
    name: 'attack_traces_attacker_country_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS attacker_country VARCHAR(120)`
  },
  {
    name: 'attack_traces_risk_score_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2)`
  },
  {
    name: 'attack_traces_threat_context_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS threat_context JSONB DEFAULT '{}'::jsonb`
  },
  {
    name: 'attack_traces_attack_pattern_name_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS attack_pattern_name VARCHAR(100)`
  },
  {
    name: 'attack_traces_attack_pattern_confidence_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS attack_pattern_confidence NUMERIC(6,2)`
  },
  {
    name: 'attack_traces_occurred_at_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  },
  {
    name: 'attack_traces_containment_status_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS containment_status VARCHAR(30) DEFAULT 'active'`
  },
  {
    name: 'attack_traces_response_notes_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS response_notes TEXT`
  },
  {
    name: 'attack_traces_last_action_at_column',
    sql: `ALTER TABLE attack_traces ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMP`
  },
  {
    name: 'idx_attack_traces_containment_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_attack_traces_containment_status ON attack_traces(containment_status)`
  },
  {
    name: 'attack_chains_risk_level_column',
    sql: `ALTER TABLE attack_chains ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20)`
  },
  {
    name: 'attack_chains_event_count_column',
    sql: `ALTER TABLE attack_chains ADD COLUMN IF NOT EXISTS event_count INTEGER DEFAULT 0`
  },
  {
    name: 'attack_chains_start_time_column',
    sql: `ALTER TABLE attack_chains ADD COLUMN IF NOT EXISTS start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  },
  {
    name: 'attack_chains_updated_at_column',
    sql: `ALTER TABLE attack_chains ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  },
  {
    name: 'idx_events_created_at',
    sql: `CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC)`
  },
  {
    name: 'idx_events_severity',
    sql: `CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity)`
  },
  {
    name: 'idx_attack_traces_occurred_at',
    sql: `CREATE INDEX IF NOT EXISTS idx_attack_traces_occurred_at ON attack_traces(occurred_at DESC)`
  },
  {
    name: 'billing_customers_table',
    sql: `CREATE TABLE IF NOT EXISTS billing_customers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL,
      organization_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    )`
  },
  {
    name: 'billing_subscriptions_table',
    sql: `CREATE TABLE IF NOT EXISTS billing_subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_subscription_id VARCHAR(255) NOT NULL UNIQUE,
      plan VARCHAR(50) NOT NULL CHECK (plan IN ('free', 'starter', 'growth', 'scale')),
      status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'deleted')),
      current_period_start TIMESTAMP,
      current_period_end TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    )`
  },
  {
    name: 'billing_subscriptions_trial_column',
    sql: `ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP`
  },
  {
    name: 'billing_subscriptions_coupon_code_column',
    sql: `ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50)`
  },
  {
    name: 'billing_subscriptions_coupon_percent_column',
    sql: `ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS coupon_discount_percent INTEGER`
  },
  {
    name: 'billing_payments_table',
    sql: `CREATE TABLE IF NOT EXISTS billing_payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      stripe_payment_id VARCHAR(255) NOT NULL UNIQUE,
      amount INTEGER NOT NULL,
      currency VARCHAR(3) DEFAULT 'USD',
      status VARCHAR(50) NOT NULL CHECK (status IN ('succeeded', 'failed', 'processing', 'requires_action')),
      invoice_id VARCHAR(255),
      receipt_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: 'billing_usage_table',
    sql: `CREATE TABLE IF NOT EXISTS billing_usage (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      metric_name VARCHAR(100),
      metric_value INTEGER,
      period_start TIMESTAMP,
      period_end TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: 'billing_coupon_usage_table',
    sql: `CREATE TABLE IF NOT EXISTS billing_coupon_usage (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      coupon_code VARCHAR(50) NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
      discount_percent INTEGER NOT NULL,
      used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: 'billing_coupon_usage_subscription_column',
    sql: `ALTER TABLE billing_coupon_usage ADD COLUMN IF NOT EXISTS subscription_id UUID`
  },
  {
    name: 'billing_coupon_usage_discount_column',
    sql: `ALTER TABLE billing_coupon_usage ADD COLUMN IF NOT EXISTS discount_percent INTEGER`
  },
  {
    name: 'billing_coupon_usage_used_at_column',
    sql: `ALTER TABLE billing_coupon_usage ADD COLUMN IF NOT EXISTS used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  },
  {
    name: 'billing_coupon_usage_fk',
    sql: `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'billing_coupon_usage_subscription_id_fkey'
      ) THEN
        ALTER TABLE billing_coupon_usage
        ADD CONSTRAINT billing_coupon_usage_subscription_id_fkey
        FOREIGN KEY (subscription_id)
        REFERENCES billing_subscriptions(id)
        ON DELETE SET NULL;
      END IF;
    END
    $$`
  },
  {
    name: 'billing_metered_sync_runs_table',
    sql: `CREATE TABLE IF NOT EXISTS billing_metered_sync_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      triggered_by VARCHAR(50) NOT NULL,
      dry_run BOOLEAN NOT NULL DEFAULT true,
      scanned_count INTEGER NOT NULL DEFAULT 0,
      synced_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      details JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: 'billing_webhook_events_table',
    sql: `CREATE TABLE IF NOT EXISTS billing_webhook_events (
      event_id VARCHAR(255) PRIMARY KEY,
      event_type VARCHAR(100),
      status VARCHAR(30) NOT NULL DEFAULT 'processing',
      payload_hash VARCHAR(64),
      attempt_count INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: 'billing_webhook_events_status_column',
    sql: `ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'processing'`
  },
  {
    name: 'billing_webhook_events_payload_hash_column',
    sql: `ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64)`
  },
  {
    name: 'billing_webhook_events_attempt_count_column',
    sql: `ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1`
  },
  {
    name: 'billing_webhook_events_last_error_column',
    sql: `ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS last_error TEXT`
  },
  {
    name: 'billing_webhook_events_received_at_column',
    sql: `ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  },
  {
    name: 'billing_webhook_events_processed_at_column',
    sql: `ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP`
  },
  {
    name: 'billing_webhook_events_updated_at_column',
    sql: `ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  },
  {
    name: 'idx_billing_customers_user_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_billing_customers_user_id ON billing_customers(user_id)`
  },
  {
    name: 'idx_billing_subscriptions_user_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_id ON billing_subscriptions(user_id)`
  },
  {
    name: 'idx_billing_payments_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_billing_payments_status ON billing_payments(status)`
  },
  {
    name: 'idx_billing_usage_user_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_billing_usage_user_id ON billing_usage(user_id)`
  },
  {
    name: 'idx_billing_metered_sync_runs_created_at',
    sql: `CREATE INDEX IF NOT EXISTS idx_billing_metered_sync_runs_created_at ON billing_metered_sync_runs(created_at DESC)`
  },
  {
    name: 'idx_billing_webhook_events_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_status ON billing_webhook_events(status)`
  },
  {
    name: 'idx_billing_webhook_events_received_at',
    sql: `CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_received_at ON billing_webhook_events(received_at DESC)`
  }
];

async function ensureMigrationMetaTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await query(
    `CREATE TABLE IF NOT EXISTS schema_migration_logs (
      id BIGSERIAL PRIMARY KEY,
      version VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('applied', 'skipped', 'failed')),
      message TEXT,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

function checksumForSql(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

async function loadAppliedMigrations() {
  const result = await query(
    `SELECT version, checksum
     FROM schema_migrations`
  );

  const map = new Map();
  for (const row of result.rows) {
    map.set(row.version, row.checksum);
  }
  return map;
}

async function logMigrationStep(version, status, message) {
  await query(
    `INSERT INTO schema_migration_logs (version, status, message, executed_at)
     VALUES ($1, $2, $3, NOW())`,
    [version, status, message || null]
  );
}

async function upsertAppliedMigration(version, checksum) {
  await query(
    `INSERT INTO schema_migrations (version, checksum, executed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (version) DO UPDATE SET
       checksum = EXCLUDED.checksum,
       executed_at = NOW()`,
    [version, checksum]
  );
}

export async function getDatabaseMigrationStatus({ limit = 50 } = {}) {
  if (!isDbEnabled()) {
    return { enabled: false, applied: [], recentLogs: [] };
  }

  await ensureMigrationMetaTables();

  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(Number(limit), 200)
    : 50;

  const [appliedResult, logsResult] = await Promise.all([
    query(
      `SELECT version, checksum, executed_at
       FROM schema_migrations
       ORDER BY executed_at DESC`
    ),
    query(
      `SELECT id, version, status, message, executed_at
       FROM schema_migration_logs
       ORDER BY executed_at DESC, id DESC
       LIMIT $1`,
      [safeLimit]
    )
  ]);

  return {
    enabled: true,
    applied: appliedResult.rows,
    recentLogs: logsResult.rows
  };
}

export async function runDatabaseMigrations({ logger = console } = {}) {
  if (!isDbEnabled()) {
    logger.log('DB migrations skipped: database is not enabled');
    return { executed: 0, failed: 0, skipped: true, applied: [], unchanged: [], failedSteps: [] };
  }

  await ensureMigrationMetaTables();
  const appliedMigrations = await loadAppliedMigrations();

  let executed = 0;
  const applied = [];
  const unchanged = [];
  const failedSteps = [];

  for (const step of MIGRATION_STEPS) {
    const checksum = checksumForSql(step.sql);
    const currentChecksum = appliedMigrations.get(step.name);

    if (currentChecksum && currentChecksum === checksum) {
      unchanged.push(step.name);
      await logMigrationStep(step.name, 'skipped', 'Already applied with identical checksum');
      continue;
    }

    try {
      await query(step.sql);
      await upsertAppliedMigration(step.name, checksum);
      await logMigrationStep(
        step.name,
        'applied',
        currentChecksum ? 'Reapplied due to checksum change' : 'Applied successfully'
      );
      applied.push(step.name);
      executed += 1;
    } catch (error) {
      failedSteps.push({ step: step.name, error: error.message });
      await logMigrationStep(step.name, 'failed', error.message);
      throw error;
    }
  }

  logger.log(
    `DB migrations complete: applied=${applied.length}, skipped=${unchanged.length}, failed=${failedSteps.length}`
  );
  return {
    executed,
    failed: failedSteps.length,
    skipped: false,
    applied,
    unchanged,
    failedSteps
  };
}

export default {
  runDatabaseMigrations,
  getDatabaseMigrationStatus
};
