#!/usr/bin/env node
// test-billing-overage.js - Unit tests for billing overage calculations

import assert from 'assert';

// Mock billing constants
const PLANS = {
  starter: {
    id: 'price_starter_monthly',
    name: 'Starter',
    amount: 9900,
    interval: 'month',
    devices: 10,
    users: 3,
    features: ['basic-alerts', '30-day-retention'],
    includedEvents: 50000
  },
  growth: {
    id: 'price_growth_monthly',
    name: 'Growth',
    amount: 29900,
    interval: 'month',
    devices: 50,
    users: 10,
    features: ['advanced-analytics', '90-day-retention', 'api-access'],
    includedEvents: 250000
  },
  scale: {
    id: 'price_scale_monthly',
    name: 'Scale',
    amount: 99900,
    interval: 'month',
    devices: -1,
    users: 30,
    features: ['unlimited-devices', '2-year-retention', 'dedicated-support', 'sso'],
    includedEvents: -1
  }
};

const DEFAULT_BILLING_CYCLE_DAYS = 30;
const USAGE_BILLING = {
  extraDeviceDailyCents: 50,
  extraUserDailyCents: 10,
  eventBlockSize: 10000,
  eventBlockMonthlyCents: 500
};

// Overage calculation function (mirrors billing.js logic)
function calculateOverages(usage, planDetails, billingCycleDays = DEFAULT_BILLING_CYCLE_DAYS) {
  const planDeviceLimit = typeof planDetails.devices === 'number' ? planDetails.devices : 2;
  const planUserLimit = typeof planDetails.users === 'number' ? planDetails.users : 1;
  const planEventLimit = typeof planDetails.includedEvents === 'number' ? planDetails.includedEvents : 5000;

  const overageDevices = planDeviceLimit === -1 ? 0 : Math.max(0, usage.devices - planDeviceLimit);
  const overageUsers = planUserLimit === -1 ? 0 : Math.max(0, usage.users - planUserLimit);
  const overageEvents = planEventLimit === -1 ? 0 : Math.max(0, usage.events - planEventLimit);
  const eventBlocks = overageEvents > 0 ? Math.ceil(overageEvents / USAGE_BILLING.eventBlockSize) : 0;

  const deviceOverageCents = overageDevices * USAGE_BILLING.extraDeviceDailyCents * billingCycleDays;
  const userOverageCents = overageUsers * USAGE_BILLING.extraUserDailyCents * billingCycleDays;
  const eventOverageCents = eventBlocks * USAGE_BILLING.eventBlockMonthlyCents;
  const projectedOverageMonthlyCents = deviceOverageCents + userOverageCents + eventOverageCents;

  return {
    overages: {
      devices: overageDevices,
      users: overageUsers,
      events: overageEvents,
      eventBlocks
    },
    charges: {
      deviceOverageCents,
      userOverageCents,
      eventOverageCents
    },
    projectedOverageMonthlyCents
  };
}

// Test suite
const tests = [
  {
    name: 'Starter plan: 5 devices (within limit)',
    usage: { devices: 5, users: 2, events: 30000 },
    plan: PLANS.starter,
    expected: { devices: 0, users: 0, events: 0, eventBlocks: 0, monthlyCents: 0 }
  },
  {
    name: 'Starter plan: 15 devices (5 over limit)',
    usage: { devices: 15, users: 2, events: 30000 },
    plan: PLANS.starter,
    expected: { devices: 5, users: 0, events: 0, eventBlocks: 0, monthlyCents: 5 * 50 * 30 }
  },
  {
    name: 'Starter plan: 12 devices, 5 users (within and over)',
    usage: { devices: 12, users: 5, events: 30000 },
    plan: PLANS.starter,
    expected: {
      devices: 2,
      users: 2,
      events: 0,
      eventBlocks: 0,
      monthlyCents: 2 * 50 * 30 + 2 * 10 * 30
    }
  },
  {
    name: 'Growth plan: 60 devices, 12 users, 300k events',
    usage: { devices: 60, users: 12, events: 300000 },
    plan: PLANS.growth,
    expected: {
      devices: 10,
      users: 2,
      events: 50000,
      eventBlocks: 5,
      monthlyCents: 10 * 50 * 30 + 2 * 10 * 30 + 5 * 500
    }
  },
  {
    name: 'Scale plan: unlimited devices/events',
    usage: { devices: 1000, users: 50, events: 1000000 },
    plan: PLANS.scale,
    expected: { devices: 0, users: 20, events: 0, eventBlocks: 0, monthlyCents: 20 * 10 * 30 }
  },
  {
    name: 'Free plan: 3 devices (1 over limit)',
    usage: { devices: 3, users: 2, events: 6000 },
    plan: { devices: 2, users: 1, includedEvents: 5000 },
    expected: { devices: 1, users: 1, events: 1000, eventBlocks: 1, monthlyCents: 2300 }
  }
];

let passed = 0;
let failed = 0;

console.log('🧪 Running billing overage calculation tests...\n');

tests.forEach((test, idx) => {
  try {
    const result = calculateOverages(test.usage, test.plan);

    assert.strictEqual(
      result.overages.devices,
      test.expected.devices,
      `Devices overage mismatch: got ${result.overages.devices}, expected ${test.expected.devices}`
    );

    assert.strictEqual(
      result.overages.users,
      test.expected.users,
      `Users overage mismatch: got ${result.overages.users}, expected ${test.expected.users}`
    );

    assert.strictEqual(
      result.overages.events,
      test.expected.events,
      `Events overage mismatch: got ${result.overages.events}, expected ${test.expected.events}`
    );

    assert.strictEqual(
      result.overages.eventBlocks,
      test.expected.eventBlocks,
      `Event blocks mismatch: got ${result.overages.eventBlocks}, expected ${test.expected.eventBlocks}`
    );

    assert.strictEqual(
      result.projectedOverageMonthlyCents,
      test.expected.monthlyCents,
      `Monthly charges mismatch: got ${result.projectedOverageMonthlyCents}, expected ${test.expected.monthlyCents}`
    );

    console.log(`✅ Test ${idx + 1}: ${test.name}`);
    console.log(
      `   Overages: +${result.overages.devices} devices, +${result.overages.users} users, +${result.overages.events} events`
    );
    console.log(`   Projected charges: $${(result.projectedOverageMonthlyCents / 100).toFixed(2)}\n`);
    passed++;
  } catch (error) {
    console.log(`❌ Test ${idx + 1}: ${test.name}`);
    console.log(`   Error: ${error.message}\n`);
    failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);

if (failed > 0) {
  process.exit(1);
}
