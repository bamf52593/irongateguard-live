import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config();

const apiBase = (process.env.BILLING_API_BASE || 'http://localhost:4000/v1').replace(/\/$/, '');
const adminEmail = process.env.BILLING_ADMIN_EMAIL || 'admin@irongate.local';
const adminPassword = process.env.BILLING_ADMIN_PASSWORD || 'Admin@123';
const requireLiveKeys = ['true', '1', 'yes'].includes((process.env.LIVE_BILLING_REQUIRE_LIVE_KEYS || 'false').toLowerCase());

function mask(value = '') {
  if (!value) return '(not set)';
  if (value.length < 10) return '***';
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

function isTrue(value) {
  return ['true', '1', 'yes'].includes(String(value || '').toLowerCase());
}

function validateStripeKeys(secretKey, publicKey, webhookSecret) {
  const issues = [];
  const warnings = [];

  const secretIsTest = secretKey.startsWith('sk_test_');
  const secretIsLive = secretKey.startsWith('sk_live_');
  const publicIsTest = publicKey.startsWith('pk_test_');
  const publicIsLive = publicKey.startsWith('pk_live_');

  if (!secretIsTest && !secretIsLive) {
    issues.push('STRIPE_SECRET_KEY missing or invalid (expected sk_test_ or sk_live_)');
  }
  if (!publicIsTest && !publicIsLive) {
    issues.push('STRIPE_PUBLIC_KEY missing or invalid (expected pk_test_ or pk_live_)');
  }
  if (!webhookSecret.startsWith('whsec_')) {
    issues.push('STRIPE_WEBHOOK_SECRET missing or invalid (expected whsec_)');
  }

  if ((secretIsLive && publicIsTest) || (secretIsTest && publicIsLive)) {
    issues.push('Stripe key mode mismatch: secret/public key are not both test or both live');
  }

  if (requireLiveKeys && !secretIsLive) {
    issues.push('LIVE_BILLING_REQUIRE_LIVE_KEYS=true but STRIPE_SECRET_KEY is not live');
  }

  if (!requireLiveKeys && secretIsTest) {
    warnings.push('Stripe is in TEST mode; set LIVE_BILLING_REQUIRE_LIVE_KEYS=true before production live test');
  }

  return { issues, warnings };
}

async function callJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${data?.error || response.statusText}`);
  }

  return data;
}

async function verifyStripeConnectivity(secretKey) {
  const stripe = new Stripe(secretKey);
  await stripe.balance.retrieve();
}

async function loginAdmin() {
  const login = await callJson(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword
    })
  });

  const token = login?.token;
  if (!token) {
    throw new Error('Auth login did not return a token');
  }
  return token;
}

async function checkAdminEndpoints(token) {
  const headers = {
    Authorization: `Bearer ${token}`
  };

  const checks = [
    { name: 'billing status', path: '/billing/status' },
    { name: 'billing health', path: '/billing/admin/health' },
    { name: 'revenue analytics', path: '/billing/admin/revenue' },
    { name: 'webhook observability', path: '/billing/admin/webhooks?limit=1' },
    { name: 'migration status', path: '/billing/admin/migrations?limit=1' }
  ];

  for (const check of checks) {
    await callJson(`${apiBase}${check.path}`, { headers });
    console.log(`PASS endpoint: ${check.name}`);
  }
}

async function main() {
  const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
  const stripePublic = process.env.STRIPE_PUBLIC_KEY || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  const failures = [];
  const warnings = [];

  console.log('Live Billing Preflight');
  console.log('----------------------');
  console.log(`API base:      ${apiBase}`);
  console.log(`Admin email:   ${adminEmail}`);
  console.log(`Require live:  ${requireLiveKeys}`);
  console.log(`Secret key:    ${mask(stripeSecret)}`);
  console.log(`Public key:    ${mask(stripePublic)}`);
  console.log(`Webhook key:   ${mask(webhookSecret)}`);

  const keyValidation = validateStripeKeys(stripeSecret, stripePublic, webhookSecret);
  failures.push(...keyValidation.issues);
  warnings.push(...keyValidation.warnings);

  try {
    await verifyStripeConnectivity(stripeSecret);
    console.log('PASS stripe api connectivity');
  } catch (error) {
    failures.push(`Stripe API connectivity failed: ${error.message}`);
  }

  let token = null;
  try {
    token = await loginAdmin();
    console.log('PASS admin auth login');
  } catch (error) {
    failures.push(`Admin auth failed at ${apiBase}/auth/login: ${error.message}`);
  }

  if (token) {
    try {
      await checkAdminEndpoints(token);
    } catch (error) {
      failures.push(`Admin endpoint validation failed: ${error.message}`);
    }
  }

  if (!isTrue(process.env.DB_AUTO_MIGRATE || 'true')) {
    warnings.push('DB_AUTO_MIGRATE is disabled; ensure migrations are manually applied before live billing test');
  }

  if (warnings.length > 0) {
    console.log('\nWarnings');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.error('\nPreflight FAILED');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('\nPreflight PASSED: billing is ready for live test execution.');
}

main().catch((error) => {
  console.error(`Preflight execution failed: ${error.message}`);
  process.exit(1);
});
