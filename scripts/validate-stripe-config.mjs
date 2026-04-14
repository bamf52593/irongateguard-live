import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config();

function mask(value = '') {
  if (!value) return '(not set)';
  if (value.length < 10) return '***';
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

const secretKey = process.env.STRIPE_SECRET_KEY || '';
const publicKey = process.env.STRIPE_PUBLIC_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

const issues = [];

const secretLooksValid = secretKey.startsWith('sk_test_') || secretKey.startsWith('sk_live_');
if (!secretLooksValid) {
  issues.push('STRIPE_SECRET_KEY is missing or has an invalid prefix (expected sk_test_ or sk_live_).');
}

const publicLooksValid = publicKey.startsWith('pk_test_') || publicKey.startsWith('pk_live_');
if (!publicLooksValid) {
  issues.push('STRIPE_PUBLIC_KEY is missing or has an invalid prefix (expected pk_test_ or pk_live_).');
}

const webhookLooksValid = webhookSecret.startsWith('whsec_');
if (!webhookLooksValid) {
  issues.push('STRIPE_WEBHOOK_SECRET is missing or has an invalid prefix (expected whsec_).');
}

console.log('Stripe config check');
console.log('-------------------');
console.log(`Secret key:  ${mask(secretKey)}`);
console.log(`Public key:  ${mask(publicKey)}`);
console.log(`Webhook key: ${mask(webhookSecret)}`);

if (issues.length > 0) {
  console.error('\nConfiguration issues:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

try {
  const stripe = new Stripe(secretKey);
  await stripe.balance.retrieve();
  console.log('\nStripe API connectivity: OK');

  if (secretKey.startsWith('sk_live_')) {
    console.log('Mode: LIVE');
  } else {
    console.log('Mode: TEST');
  }

  process.exit(0);
} catch (error) {
  console.error('\nStripe API connectivity failed.');
  console.error(`Reason: ${error.message}`);
  process.exit(1);
}
