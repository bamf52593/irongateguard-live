-- IronGate Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================
-- USERS & AUTHENTICATION
-- =============================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'operator', 'analyst', 'viewer')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- =============================
-- DEVICES / ASSETS
-- =============================

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id VARCHAR(100) NOT NULL UNIQUE,
  mac_address VARCHAR(17),
  device_type VARCHAR(50),
  location VARCHAR(255),
  status VARCHAR(20) DEFAULT 'online' CHECK (status IN ('online', 'offline', 'unknown')),
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================
-- EVENTS / ALERTS
-- =============================

CREATE TABLE events (
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
);

CREATE INDEX idx_events_device_id ON events(device_id);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_events_severity ON events(severity);

-- =============================
-- ATTACK TRACES & CHAINS
-- =============================

CREATE TABLE attack_traces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mac_address VARCHAR(17) NOT NULL,
  attack_vector VARCHAR(100),
  confidence_score FLOAT DEFAULT 0.5,
  events_count INTEGER DEFAULT 0,
  related_devices INTEGER DEFAULT 0,
  threat_level VARCHAR(20) CHECK (threat_level IN ('critical', 'high', 'medium', 'low')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attack_chains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trace_id UUID NOT NULL REFERENCES attack_traces(id) ON DELETE CASCADE,
  chain_pattern VARCHAR(100),
  sequence JSONB,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================
-- API KEYS & INTEGRATIONS
-- =============================

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_name VARCHAR(255),
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  last_used TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

-- =============================
-- AUDIT LOG
-- =============================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(255),
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  changes JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- =============================
-- SEED DATA
-- =============================

-- Admin user (password: Admin@123)
INSERT INTO users (email, password_hash, full_name, role, status) 
VALUES (
  'admin@irongate.local',
  'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
  'System Admin',
  'admin',
  'active'
) ON CONFLICT DO NOTHING;

-- Operator user (password: Operator@123)
INSERT INTO users (email, password_hash, full_name, role, status)
VALUES (
  'operator@irongate.local',
  '448296e3138d4843057574ba9fbd21829f1f6d40891ce89664608ce55005a7ef',
  'Security Operator',
  'operator',
  'active'
) ON CONFLICT DO NOTHING;

-- Analyst user (password: Analyst@123)
INSERT INTO users (email, password_hash, full_name, role, status)
VALUES (
  'analyst@irongate.local',
  'a1205a5c10b5f96929efd9230890b238f3ba07b76641d8b96ac814eef869d8a5',
  'Security Analyst',
  'analyst',
  'active'
) ON CONFLICT DO NOTHING;

-- Viewer user (password: Viewer@123)
INSERT INTO users (email, password_hash, full_name, role, status)
VALUES (
  'viewer@irongate.local',
  '06470f816c6846a98c2a79c2ce2cfa4fcb4ad935a8e4252065e99370ec119e0c',
  'Dashboard Viewer',
  'viewer',
  'active'
) ON CONFLICT DO NOTHING;

-- Sample devices
INSERT INTO devices (device_id, mac_address, device_type, location, status, last_seen)
VALUES
  ('Gateway-01', 'AA:BB:CC:DD:EE:01', 'Gateway', 'North Hub', 'online', CURRENT_TIMESTAMP),
  ('Sensor-14', 'AA:BB:CC:DD:EE:02', 'Temperature', 'West Wing', 'online', CURRENT_TIMESTAMP),
  ('Cam-07', 'AA:BB:CC:DD:EE:03', 'Camera', 'Loading Dock', 'offline', CURRENT_TIMESTAMP - INTERVAL '12 minutes'),
  ('Beacon-03', 'AA:BB:CC:DD:EE:04', 'BLE Beacon', 'Server Room', 'online', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- =============================
-- BILLING & PAYMENTS (Stripe)
-- =============================

CREATE TABLE IF NOT EXISTS billing_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  organization_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL CHECK (plan IN ('free', 'starter', 'growth', 'scale')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'deleted')),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  trial_ends_at TIMESTAMP,
  coupon_code VARCHAR(50),
  coupon_discount_percent INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS billing_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_payment_id VARCHAR(255) NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL CHECK (status IN ('succeeded', 'failed', 'processing', 'requires_action')),
  invoice_id VARCHAR(255),
  receipt_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_coupon_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_code VARCHAR(50) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
  discount_percent INTEGER NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_metered_sync_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggered_by VARCHAR(50) NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  synced_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  event_id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'processing',
  payload_hash VARCHAR(64),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_name VARCHAR(100),
  metric_value INTEGER,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_customers_user_id ON billing_customers(user_id);
CREATE INDEX idx_billing_subscriptions_user_id ON billing_subscriptions(user_id);
CREATE INDEX idx_billing_payments_status ON billing_payments(status);
CREATE INDEX idx_billing_usage_user_id ON billing_usage(user_id);
CREATE INDEX idx_billing_metered_sync_runs_created_at ON billing_metered_sync_runs(created_at DESC);
CREATE INDEX idx_billing_webhook_events_status ON billing_webhook_events(status);
CREATE INDEX idx_billing_webhook_events_received_at ON billing_webhook_events(received_at DESC);
