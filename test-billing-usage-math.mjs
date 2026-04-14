import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateUsageSummary } from './billing.js';

test('returns zero overage when usage is within limits', () => {
  const result = calculateUsageSummary({
    devices: 8,
    users: 3,
    events: 22000,
    limits: { devices: 10, users: 3, events: 50000 },
    billingCycleDays: 30,
    pricing: {
      extraDeviceDailyCents: 50,
      extraUserDailyCents: 10,
      eventBlockSize: 10000,
      eventBlockMonthlyCents: 500
    }
  });

  assert.equal(result.overages.devices, 0);
  assert.equal(result.overages.users, 0);
  assert.equal(result.overages.events, 0);
  assert.equal(result.projectedOverageMonthlyCents, 0);
  assert.equal(result.enforcement.requiresUpgrade, false);
});

test('computes monthly overages across all dimensions', () => {
  const result = calculateUsageSummary({
    devices: 14,
    users: 6,
    events: 75500,
    limits: { devices: 10, users: 3, events: 50000 },
    billingCycleDays: 30,
    pricing: {
      extraDeviceDailyCents: 50,
      extraUserDailyCents: 10,
      eventBlockSize: 10000,
      eventBlockMonthlyCents: 500
    }
  });

  assert.equal(result.overages.devices, 4);
  assert.equal(result.overages.users, 3);
  assert.equal(result.overages.events, 25500);
  assert.equal(result.overages.eventBlocks, 3);
  assert.equal(result.breakdownCents.devices, 6000);
  assert.equal(result.breakdownCents.users, 900);
  assert.equal(result.breakdownCents.events, 1500);
  assert.equal(result.projectedOverageMonthlyCents, 8400);
  assert.equal(result.projectedOverageMonthly, '$84.00');
  assert.equal(result.enforcement.requiresUpgrade, true);
});

test('treats unlimited limits as no overage', () => {
  const result = calculateUsageSummary({
    devices: 500,
    users: 80,
    events: 1200000,
    limits: { devices: -1, users: -1, events: -1 },
    billingCycleDays: 30
  });

  assert.equal(result.overages.devices, 0);
  assert.equal(result.overages.users, 0);
  assert.equal(result.overages.events, 0);
  assert.equal(result.projectedOverageMonthlyCents, 0);
});
