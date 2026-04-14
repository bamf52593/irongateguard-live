import Stripe from 'stripe';
import { createHash } from 'crypto';
import { query, isDbEnabled } from './db.js';
import { sendPaymentReceipt, sendSubscriptionConfirmation, sendPaymentFailedNotice } from './email-service.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
const inMemoryWebhookState = new Map();
const WEBHOOK_MAX_RETRIES = Number.parseInt(process.env.WEBHOOK_MAX_RETRIES || '5', 10);
const BILLING_HEALTH_SYNC_WINDOW = Number.parseInt(process.env.BILLING_HEALTH_SYNC_WINDOW || '20', 10);

function parseHealthThreshold(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isValidStripeSubscriptionId(value) {
  return typeof value === 'string' && value.startsWith('sub_');
}

function unixSecondsToDate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return new Date(numeric * 1000);
}

// Plan definitions with pricing
export const PLANS = {
  starter: {
    id: 'price_starter_monthly',
    name: 'Starter',
    amount: 9900, // $99.00 in cents
    interval: 'month',
    devices: 10,
    users: 3,
    features: ['basic-alerts', '30-day-retention'],
    includedEvents: 50000
  },
  growth: {
    id: 'price_growth_monthly',
    name: 'Growth',
    amount: 29900, // $299.00 in cents
    interval: 'month',
    devices: 50,
    users: 10,
    features: ['advanced-analytics', '90-day-retention', 'api-access'],
    includedEvents: 250000
  },
  scale: {
    id: 'price_scale_monthly',
    name: 'Scale',
    amount: 99900, // $999.00 in cents
    interval: 'month',
    devices: -1, // unlimited
    users: 30,
    features: ['unlimited-devices', '2-year-retention', 'dedicated-support', 'sso'],
    includedEvents: -1
  }
};

const DEFAULT_BILLING_CYCLE_DAYS = 30;
const USAGE_BILLING = {
  extraDeviceDailyCents: parseInt(process.env.BILLING_EXTRA_DEVICE_DAILY_CENTS || '50', 10),
  extraUserDailyCents: parseInt(process.env.BILLING_EXTRA_USER_DAILY_CENTS || '10', 10),
  eventBlockSize: parseInt(process.env.BILLING_EVENT_BLOCK_SIZE || '10000', 10),
  eventBlockMonthlyCents: parseInt(process.env.BILLING_EVENT_BLOCK_MONTHLY_CENTS || '500', 10)
};

// Trial period configuration
export const TRIAL_CONFIG = {
  durationDays: 14,
  defaultPlan: 'starter',
  couponId: 'TRIAL14' // Stripe coupon ID for 14-day free trial
};

// Coupon/Promo code configuration
export const AVAILABLE_COUPONS = {
  LAUNCH50: {
    name: 'Launch Special',
    percentOff: 50,
    description: '50% off your first month',
    validUntil: new Date('2026-12-31'),
    maxUses: 100,
    allowRepeatPerUser: false
  },
  TRIAL30: {
    name: 'Extended Trial',
    percentOff: 100,
    description: '30 days completely free',
    validUntil: new Date('2026-12-31'),
    maxUses: 50,
    allowRepeatPerUser: false
  },
  ANNUAL20: {
    name: 'Annual Savings',
    percentOff: 20,
    description: '20% off when you commit to annual billing',
    validUntil: new Date('2026-12-31'),
    maxUses: -1, // Unlimited
    allowRepeatPerUser: false
  },
  STARTUP15: {
    name: 'Startup Support',
    percentOff: 15,
    description: '15% off for early stage companies',
    validUntil: new Date('2026-12-31'),
    maxUses: 25,
    allowRepeatPerUser: false
  }
};

async function getCouponUsageStats(couponCode, userId = null) {
  if (!isDbEnabled()) {
    return { totalUses: 0, userUses: 0 };
  }

  try {
    const totalResult = await query(
      `SELECT COUNT(*) AS count
       FROM billing_coupon_usage
       WHERE coupon_code = $1`,
      [couponCode]
    );

    let userUses = 0;
    if (userId) {
      const userResult = await query(
        `SELECT COUNT(*) AS count
         FROM billing_coupon_usage
         WHERE coupon_code = $1 AND user_id = $2`,
        [couponCode, userId]
      );
      userUses = Number(userResult.rows[0]?.count || 0);
    }

    return {
      totalUses: Number(totalResult.rows[0]?.count || 0),
      userUses
    };
  } catch (error) {
    console.warn('Coupon usage stats unavailable:', error.message);
    return { totalUses: 0, userUses: 0 };
  }
}

export async function validateCoupon(couponCode, userId = null) {
  const code = couponCode.toUpperCase();
  const coupon = AVAILABLE_COUPONS[code];
  
  if (!coupon) {
    throw new Error('Invalid coupon code');
  }
  
  const now = new Date();
  if (coupon.validUntil < now) {
    throw new Error('This coupon has expired');
  }

  const usage = await getCouponUsageStats(code, userId);
  if (coupon.maxUses !== -1 && usage.totalUses >= coupon.maxUses) {
    throw new Error('This coupon has reached its usage limit');
  }

  if (!coupon.allowRepeatPerUser && usage.userUses > 0) {
    throw new Error('You have already used this coupon');
  }
  
  // In production, check used count against database
  // For now, return coupon details
  return {
    code,
    name: coupon.name,
    percentOff: coupon.percentOff,
    description: coupon.description,
    validUntil: coupon.validUntil.toISOString().split('T')[0],
    maxUses: coupon.maxUses,
    remainingUses: coupon.maxUses === -1
      ? null
      : Math.max(0, coupon.maxUses - usage.totalUses)
  };
}

function getEffectiveUsagePricing(pricing = {}) {
  return {
    extraDeviceDailyCents: Number.isFinite(pricing.extraDeviceDailyCents)
      ? pricing.extraDeviceDailyCents
      : USAGE_BILLING.extraDeviceDailyCents,
    extraUserDailyCents: Number.isFinite(pricing.extraUserDailyCents)
      ? pricing.extraUserDailyCents
      : USAGE_BILLING.extraUserDailyCents,
    eventBlockSize: Number.isFinite(pricing.eventBlockSize)
      ? pricing.eventBlockSize
      : USAGE_BILLING.eventBlockSize,
    eventBlockMonthlyCents: Number.isFinite(pricing.eventBlockMonthlyCents)
      ? pricing.eventBlockMonthlyCents
      : USAGE_BILLING.eventBlockMonthlyCents
  };
}

function suggestPlanFromUsage(devices, users, events) {
  const requiredPlan = Object.entries(PLANS).find(([, plan]) => {
    const deviceOk = plan.devices === -1 || devices <= plan.devices;
    const userOk = plan.users === -1 || users <= plan.users;
    const eventsOk = plan.includedEvents === -1 || events <= plan.includedEvents;
    return deviceOk && userOk && eventsOk;
  });

  return requiredPlan ? requiredPlan[0] : 'scale';
}

export function calculateUsageSummary({
  devices,
  users,
  events,
  limits,
  billingCycleDays = DEFAULT_BILLING_CYCLE_DAYS,
  pricing = USAGE_BILLING
}) {
  const safeLimits = {
    devices: typeof limits?.devices === 'number' ? limits.devices : 2,
    users: typeof limits?.users === 'number' ? limits.users : 1,
    events: typeof limits?.events === 'number' ? limits.events : 5000
  };
  const safePricing = getEffectiveUsagePricing(pricing);

  const overageDevices = safeLimits.devices === -1 ? 0 : Math.max(0, devices - safeLimits.devices);
  const overageUsers = safeLimits.users === -1 ? 0 : Math.max(0, users - safeLimits.users);
  const overageEvents = safeLimits.events === -1 ? 0 : Math.max(0, events - safeLimits.events);
  const eventBlocks = overageEvents > 0 ? Math.ceil(overageEvents / safePricing.eventBlockSize) : 0;

  const deviceOverageCents = overageDevices * safePricing.extraDeviceDailyCents * billingCycleDays;
  const userOverageCents = overageUsers * safePricing.extraUserDailyCents * billingCycleDays;
  const eventOverageCents = eventBlocks * safePricing.eventBlockMonthlyCents;
  const projectedOverageMonthlyCents = deviceOverageCents + userOverageCents + eventOverageCents;
  const isOverLimit = overageDevices > 0 || overageUsers > 0 || overageEvents > 0;

  return {
    limits: safeLimits,
    overages: {
      devices: overageDevices,
      users: overageUsers,
      events: overageEvents,
      eventBlocks
    },
    projectedOverageMonthlyCents,
    projectedOverageMonthly: `$${(projectedOverageMonthlyCents / 100).toFixed(2)}`,
    breakdownCents: {
      devices: deviceOverageCents,
      users: userOverageCents,
      events: eventOverageCents
    },
    pricing: safePricing,
    enforcement: {
      isOverLimit,
      requiresUpgrade: isOverLimit,
      suggestedPlan: suggestPlanFromUsage(devices, users, events)
    }
  };
}

/**
 * Create a new Stripe customer for an organization
 */
export async function createStripeCustomer(email, orgName, userId) {
  try {
    const customer = await stripe.customers.create({
      email,
      name: orgName,
      metadata: {
        irongate_user_id: userId.toString(),
        creation_date: new Date().toISOString()
      }
    });

    // Store in database if available
    if (isDbEnabled()) {
      await query(
        `INSERT INTO billing_customers (user_id, stripe_customer_id, email, organization_name, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2`,
        [userId, customer.id, email, orgName]
      );
    }

    return customer;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    throw error;
  }
}

/**
 * Get or create a Stripe customer
 */
export async function getOrCreateStripeCustomer(userId, email, orgName) {
  try {
    // Check if customer exists in database
    if (isDbEnabled()) {
      const result = await query(
        `SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length > 0) {
        return result.rows[0].stripe_customer_id;
      }
    }

    // Create new customer
    const customer = await createStripeCustomer(email, orgName, userId);
    return customer.id;
  } catch (error) {
    console.error('Error getting/creating Stripe customer:', error);
    throw error;
  }
}

/**
 * Create a subscription for a user
 */
export async function createSubscription(userId, planKey, stripeCustomerId) {
  try {
    const plan = PLANS[planKey];
    if (!plan) {
      throw new Error(`Invalid plan: ${planKey}`);
    }

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [
        {
          price: plan.id
        }
      ],
      metadata: {
        irongate_plan: planKey,
        irongate_user_id: userId.toString()
      }
    });

    // Store subscription in database
    if (isDbEnabled()) {
      await query(
        `INSERT INTO billing_subscriptions (user_id, stripe_subscription_id, plan, status, created_at, current_period_start, current_period_end)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET 
           stripe_subscription_id = $2, 
           plan = $3, 
           status = $4,
           current_period_start = $5,
           current_period_end = $6`,
        [
          userId,
          subscription.id,
          planKey,
          subscription.status,
          unixSecondsToDate(subscription.current_period_start),
          unixSecondsToDate(subscription.current_period_end)
        ]
      );
    }

    return subscription;
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }
}

/**
 * Create a trial subscription (14 days free)
 */
export async function createTrialSubscription(userId, planKey, stripeCustomerId, email, couponCode = null) {
  try {
    const plan = PLANS[planKey];

    if (!plan) {
      throw new Error(`Invalid plan: ${planKey}`);
    }

    let trialDurationDays = TRIAL_CONFIG.durationDays;
    let validatedCoupon = null;
    if (couponCode) {
      validatedCoupon = await validateCoupon(couponCode, userId);
      if (validatedCoupon.code === 'TRIAL30') {
        trialDurationDays = 30;
      }
    }

    // Create subscription with trial period
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + trialDurationDays);

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.id }],
      trial_period_days: trialDurationDays,
      metadata: {
        irongate_user_id: userId,
        irongate_plan: planKey,
        irongate_coupon_code: validatedCoupon?.code || ''
      },
      billing_cycle_anchor: Math.floor(trialEndDate.getTime() / 1000)
    });

    // Store in database
    if (isDbEnabled()) {
      await upsertSubscriptionRecord(
        userId,
        subscription.id,
        planKey,
        subscription.status,
        unixSecondsToDate(subscription.current_period_start),
        unixSecondsToDate(subscription.current_period_end),
        trialEndDate
      );

      if (validatedCoupon) {
        await recordCouponUsage(
          validatedCoupon.code,
          userId,
          null,
          validatedCoupon.percentOff
        );
      }
    }

    return subscription;
  } catch (error) {
    console.error('Error creating trial subscription:', error);
    throw error;
  }
}

/**
 * Get subscription status for a user
 */
export async function getSubscriptionStatus(userId) {
  try {
    if (isDbEnabled()) {
      const result = await query(
        `SELECT * FROM billing_subscriptions WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length > 0) {
        const subscription = result.rows[0];
        const plan = PLANS[subscription.plan] || {
          name: 'Unknown Plan',
          devices: 0,
          users: 0,
          features: []
        };

        return {
          status: subscription.status,
          plan: subscription.plan,
          planDetails: plan,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          stripeSubscriptionId: subscription.stripe_subscription_id
        };
      }
    }

    return {
      status: 'free',
      plan: 'free',
      planDetails: {
        name: 'Free',
        devices: 2,
        users: 1,
        includedEvents: 5000,
        features: ['basic-monitoring']
      }
    };
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Update subscription plan
 */
export async function updateSubscriptionPlan(subscriptionId, planKey) {
  try {
    const plan = PLANS[planKey];
    if (!plan) {
      throw new Error(`Invalid plan: ${planKey}`);
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: plan.id
        }
      ]
    });

    // Update in database
    if (isDbEnabled()) {
      await query(
        `UPDATE billing_subscriptions SET plan = $1 WHERE stripe_subscription_id = $2`,
        [planKey, subscriptionId]
      );
    }

    return updatedSubscription;
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.del(subscriptionId);

    // Update in database
    if (isDbEnabled()) {
      await query(
        `UPDATE billing_subscriptions SET status = $1 WHERE stripe_subscription_id = $2`,
        ['canceled', subscriptionId]
      );
    }

    return subscription;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

/**
 * Create a Stripe checkout session
 */
export async function createCheckoutSession(userId, stripeCustomerId, planKey, successUrl, cancelUrl, couponCode = null) {
  try {
    const plan = PLANS[planKey];
    if (!plan) {
      throw new Error(`Invalid plan: ${planKey}`);
    }

    const validatedCoupon = couponCode ? await validateCoupon(couponCode, userId) : null;

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `IronGate ${plan.name}`,
              description: `${plan.devices === -1 ? 'Unlimited' : plan.devices} devices · ${plan.users} users · ${plan.features.join(', ')}`
            },
            unit_amount: plan.amount,
            recurring: {
              interval: plan.interval
            }
          },
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        irongate_user_id: userId.toString(),
        irongate_plan: planKey,
        irongate_coupon_code: validatedCoupon?.code || ''
      }
    });

    return session;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
}

/**
 * Confirm a completed checkout session and persist subscription state.
 * This is used as a reliable fallback when webhook delivery is delayed.
 */
export async function confirmCheckoutSession(sessionId, expectedUserId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription']
  });

  if (!session) {
    throw new Error('Checkout session not found');
  }

  const sessionUserId = session?.metadata?.irongate_user_id;
  if (expectedUserId && sessionUserId && String(expectedUserId) !== String(sessionUserId)) {
    throw new Error('Checkout session does not belong to the authenticated user');
  }

  if (session.status !== 'complete' && session.payment_status !== 'paid') {
    throw new Error('Checkout session is not completed yet');
  }

  let subscription = typeof session.subscription === 'object' ? session.subscription : null;
  if (!subscription && isValidStripeSubscriptionId(session.subscription)) {
    subscription = await stripe.subscriptions.retrieve(session.subscription);
  }

  if (!subscription && session.subscription && !isValidStripeSubscriptionId(session.subscription)) {
    throw new Error('Checkout session is pending subscription activation. Please wait a few seconds and try again.');
  }

  if (
    subscription?.id
    && (!Number.isFinite(Number(subscription.current_period_start))
    || !Number.isFinite(Number(subscription.current_period_end)))
  ) {
    subscription = await stripe.subscriptions.retrieve(subscription.id);
  }

  if (!subscription) {
    throw new Error('No subscription found for checkout session');
  }

  const planKey = session?.metadata?.irongate_plan || getPlanKeyFromStripeSubscription(subscription);
  if (!planKey || !PLANS[planKey]) {
    throw new Error('Could not resolve subscription plan from checkout session');
  }

  const userId = sessionUserId || expectedUserId;
  if (!userId) {
    throw new Error('Checkout session is missing user identity metadata');
  }

  await upsertSubscriptionRecord(
    userId,
    subscription.id,
    planKey,
    subscription.status,
    unixSecondsToDate(subscription.current_period_start),
    unixSecondsToDate(subscription.current_period_end)
  );

  return {
    sessionId: session.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    plan: planKey
  };
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(event) {
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        return await handleCheckoutCompleted(event.data.object);
      case 'customer.subscription.created':
        return await handleSubscriptionUpdated(event.data.object);
      case 'customer.subscription.updated':
        return await handleSubscriptionUpdated(event.data.object);
      case 'customer.subscription.deleted':
        return await handleSubscriptionDeleted(event.data.object);
      case 'payment_intent.succeeded':
        return await handlePaymentSucceeded(event.data.object);
      case 'payment_intent.payment_failed':
        return await handlePaymentFailed(event.data.object);
      case 'invoice.payment_succeeded':
        return await handleInvoiceSucceeded(event.data.object);
      case 'invoice.payment_failed':
        return await handleInvoiceFailed(event.data.object);
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Error handling webhook event:', error);
    throw error;
  }
}

export async function beginWebhookEventProcessing(eventId, eventType, payloadHash = null) {
  if (!eventId) {
    return { duplicate: false, source: 'none' };
  }

  if (!isDbEnabled()) {
    const state = inMemoryWebhookState.get(eventId);
    if (state === 'processed' || state === 'processing') {
      return { duplicate: true, source: 'memory', state };
    }
    inMemoryWebhookState.set(eventId, 'processing');
    return { duplicate: false, source: 'memory' };
  }

  try {
    const existing = await query(
      `SELECT status, attempt_count
       FROM billing_webhook_events
       WHERE event_id = $1
       LIMIT 1`,
      [eventId]
    );

    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO billing_webhook_events (
          event_id, event_type, status, payload_hash, attempt_count, received_at, updated_at
        ) VALUES ($1, $2, 'processing', $3, 1, NOW(), NOW())`,
        [eventId, eventType || 'unknown', payloadHash]
      );
      return { duplicate: false, source: 'db' };
    }

    const currentStatus = existing.rows[0]?.status;
    const currentAttempts = Number(existing.rows[0]?.attempt_count || 0);
    if (currentStatus === 'processed' || currentStatus === 'processing' || currentStatus === 'dead_letter') {
      return { duplicate: true, source: 'db', state: currentStatus };
    }

    if (currentStatus === 'failed' && currentAttempts >= WEBHOOK_MAX_RETRIES) {
      await query(
        `UPDATE billing_webhook_events
         SET status = 'dead_letter',
             updated_at = NOW()
         WHERE event_id = $1`,
        [eventId]
      );
      return {
        duplicate: true,
        source: 'db',
        state: 'dead_letter',
        deadLettered: true,
        attempts: currentAttempts
      };
    }

    await query(
      `UPDATE billing_webhook_events
       SET status = 'processing',
           event_type = COALESCE($2, event_type),
           payload_hash = COALESCE($3, payload_hash),
           attempt_count = COALESCE(attempt_count, 0) + 1,
           last_error = NULL,
           updated_at = NOW()
       WHERE event_id = $1`,
      [eventId, eventType || null, payloadHash]
    );

    return { duplicate: false, source: 'db', resumed: true };
  } catch (error) {
    console.warn('Webhook dedup fallback (memory):', error.message);
    const state = inMemoryWebhookState.get(eventId);
    if (state === 'processed' || state === 'processing') {
      return { duplicate: true, source: 'memory', state };
    }
    inMemoryWebhookState.set(eventId, 'processing');
    return { duplicate: false, source: 'memory' };
  }
}

export async function completeWebhookEventProcessing(eventId) {
  if (!eventId) {
    return;
  }

  if (!isDbEnabled()) {
    inMemoryWebhookState.set(eventId, 'processed');
    return;
  }

  try {
    await query(
      `UPDATE billing_webhook_events
       SET status = 'processed',
           processed_at = NOW(),
           updated_at = NOW()
       WHERE event_id = $1`,
      [eventId]
    );
  } catch (error) {
    console.warn('Unable to mark webhook event as processed:', error.message);
    inMemoryWebhookState.set(eventId, 'processed');
  }
}

export async function failWebhookEventProcessing(eventId, errorMessage) {
  if (!eventId) {
    return;
  }

  if (!isDbEnabled()) {
    inMemoryWebhookState.set(eventId, 'failed');
    return;
  }

  try {
    const existing = await query(
      `SELECT attempt_count
       FROM billing_webhook_events
       WHERE event_id = $1
       LIMIT 1`,
      [eventId]
    );

    const attempts = Number(existing.rows[0]?.attempt_count || 1);
    const nextStatus = attempts >= WEBHOOK_MAX_RETRIES ? 'dead_letter' : 'failed';

    await query(
      `UPDATE billing_webhook_events
       SET status = $2,
           last_error = $3,
           updated_at = NOW()
       WHERE event_id = $1`,
      [
        eventId,
        nextStatus,
        String(errorMessage || 'webhook_processing_failed').slice(0, 2000)
      ]
    );

    return {
      status: nextStatus,
      attemptCount: attempts
    };
  } catch (error) {
    console.warn('Unable to mark webhook event as failed:', error.message);
    inMemoryWebhookState.set(eventId, 'failed');
    return {
      status: 'failed',
      attemptCount: 0
    };
  }
}

function getPlanKeyFromStripeSubscription(subscription) {
  const metadataPlan = subscription?.metadata?.irongate_plan;
  if (metadataPlan && PLANS[metadataPlan]) {
    return metadataPlan;
  }

  const subscriptionPriceId = subscription?.items?.data?.[0]?.price?.id;
  if (!subscriptionPriceId) {
    return null;
  }

  const matched = Object.entries(PLANS).find(([, plan]) => plan.id === subscriptionPriceId);
  return matched ? matched[0] : null;
}

async function upsertSubscriptionRecord(userId, subscriptionId, planKey, status, periodStart, periodEnd, trialEndsAt = null) {
  if (!isDbEnabled() || !userId || !subscriptionId || !planKey) {
    return;
  }

  await query(
    `INSERT INTO billing_subscriptions (user_id, stripe_subscription_id, plan, status, created_at, current_period_start, current_period_end, trial_ends_at)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       stripe_subscription_id = $2,
       plan = $3,
       status = $4,
       current_period_start = $5,
       current_period_end = $6,
      trial_ends_at = COALESCE($7, billing_subscriptions.trial_ends_at),
       updated_at = NOW()`,
    [userId, subscriptionId, planKey, status, periodStart, periodEnd, trialEndsAt]
  );
}

async function recordCouponUsage(couponCode, userId, subscriptionId, discountPercent) {
  if (!isDbEnabled() || !couponCode || !userId) {
    return;
  }

  try {
    const existing = await query(
      `SELECT id
       FROM billing_coupon_usage
       WHERE coupon_code = $1 AND user_id = $2
       LIMIT 1`,
      [couponCode.toUpperCase(), userId]
    );

    if (existing.rows.length > 0) {
      return;
    }

    await query(
      `INSERT INTO billing_coupon_usage (coupon_code, user_id, subscription_id, discount_percent)
       VALUES ($1, $2, $3, $4)`,
      [couponCode.toUpperCase(), userId, subscriptionId || null, discountPercent]
    );
  } catch (err) {
    console.error('Error recording coupon usage:', err);
    // Non-critical, don't throw
  }
}

async function handleCheckoutCompleted(session) {
  console.log('Checkout completed:', session.id);

  if (!isDbEnabled()) {
    return;
  }

  const userId = session?.metadata?.irongate_user_id;
  const planKey = session?.metadata?.irongate_plan;
  const stripeSubscriptionId = session?.subscription;
  const couponCode = session?.metadata?.irongate_coupon_code;

  if (!userId || !planKey || !isValidStripeSubscriptionId(stripeSubscriptionId)) {
    console.warn('Checkout completed webhook missing required metadata for subscription upsert');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  await upsertSubscriptionRecord(
    userId,
    subscription.id,
    planKey,
    subscription.status,
    unixSecondsToDate(subscription.current_period_start),
    unixSecondsToDate(subscription.current_period_end)
  );

  if (couponCode) {
    const coupon = AVAILABLE_COUPONS[couponCode];
    if (coupon) {
      await recordCouponUsage(couponCode, userId, null, coupon.percentOff);
    }
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log('Subscription updated:', subscription.id);
  if (isDbEnabled()) {
    const planKey = getPlanKeyFromStripeSubscription(subscription);
    const userId = subscription?.metadata?.irongate_user_id;

    if (planKey && userId) {
      await upsertSubscriptionRecord(
        userId,
        subscription.id,
        planKey,
        subscription.status,
        unixSecondsToDate(subscription.current_period_start),
        unixSecondsToDate(subscription.current_period_end)
      );
      return;
    }

    await query(
      `UPDATE billing_subscriptions 
       SET status = $1, current_period_start = $2, current_period_end = $3
       WHERE stripe_subscription_id = $4`,
      [
        subscription.status,
        unixSecondsToDate(subscription.current_period_start),
        unixSecondsToDate(subscription.current_period_end),
        subscription.id
      ]
    );
  }
}

async function handleSubscriptionDeleted(subscription) {
  console.log('Subscription deleted:', subscription.id);
  if (isDbEnabled()) {
    await query(
      `UPDATE billing_subscriptions SET status = $1 WHERE stripe_subscription_id = $2`,
      ['deleted', subscription.id]
    );
  }
}

async function handlePaymentSucceeded(paymentIntent) {
  console.log('Payment succeeded:', paymentIntent.id);
  if (isDbEnabled()) {
    await query(
      `INSERT INTO billing_payments (stripe_payment_id, amount, currency, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [paymentIntent.id, paymentIntent.amount, paymentIntent.currency, 'succeeded']
    );
  }
}

async function handlePaymentFailed(paymentIntent) {
  console.log('Payment failed:', paymentIntent.id);
  if (isDbEnabled()) {
    await query(
      `INSERT INTO billing_payments (stripe_payment_id, amount, currency, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [paymentIntent.id, paymentIntent.amount, paymentIntent.currency, 'failed']
    );
  }
}

async function handleInvoiceSucceeded(invoice) {
  console.log('Invoice payment succeeded:', invoice.id);
  
  if (invoice.customer_email && invoice.invoice_pdf) {
    try {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const planKey = getPlanKeyFromStripeSubscription(subscription);
      const plan = PLANS[planKey] || PLANS.starter;
      
      await sendPaymentReceipt(invoice.customer_email, {
        invoiceNumber: invoice.number,
        amount: invoice.amount_paid,
        currency: invoice.currency || 'usd',
        planName: plan.name,
        periodStart: unixSecondsToDate(subscription.current_period_start),
        periodEnd: unixSecondsToDate(subscription.current_period_end),
        invoicePdfUrl: invoice.invoice_pdf
      });
    } catch (error) {
      console.error('Error sending receipt email:', error);
    }
  }
}

async function handleInvoiceFailed(invoice) {
  console.log('Invoice payment failed:', invoice.id);
  
  if (invoice.customer_email) {
    try {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const planKey = getPlanKeyFromStripeSubscription(subscription);
      const plan = PLANS[planKey] || PLANS.starter;
      const retryDate = new Date();
      retryDate.setDate(retryDate.getDate() + 3);
      
      await sendPaymentFailedNotice(invoice.customer_email, plan.name, retryDate);
    } catch (error) {
      console.error('Error sending payment failed email:', error);
    }
  }
}

/**
 * Record usage snapshot for audit and billing purposes
 */
export async function recordUsageSnapshot(userId) {
  try {
    if (!isDbEnabled()) {
      return null;
    }

    const metrics = await getUsageMetrics(userId);
    if (metrics.error) {
      return null;
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Record device overage
    if (metrics.overages?.devices > 0) {
      await query(
        `INSERT INTO billing_usage (user_id, metric_name, metric_value, period_start, period_end, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, 'device_overage', metrics.overages.devices, periodStart, periodEnd]
      );
    }

    // Record user overage
    if (metrics.overages?.users > 0) {
      await query(
        `INSERT INTO billing_usage (user_id, metric_name, metric_value, period_start, period_end, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, 'user_overage', metrics.overages.users, periodStart, periodEnd]
      );
    }

    // Record event overage
    if (metrics.overages?.events > 0) {
      await query(
        `INSERT INTO billing_usage (user_id, metric_name, metric_value, period_start, period_end, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, 'event_overage', metrics.overages.events, periodStart, periodEnd]
      );
    }

    return metrics;
  } catch (error) {
    console.error('Error recording usage snapshot:', error);
    return null;
  }
}

/**
 * Check if user is over plan limits and return enforcement signal
 */
export async function checkEnforcementStatus(userId) {
  try {
    const metrics = await getUsageMetrics(userId);
    if (metrics.error) {
      return { status: 'error', message: metrics.error };
    }

    const overages = metrics.overages || {};
    const isOverDeviceLimit = overages.devices > 0;
    const isOverUserLimit = overages.users > 0;
    const isOverEventLimit = overages.events > 0;

    const isOverAnyLimit = isOverDeviceLimit || isOverUserLimit || isOverEventLimit;

    if (!isOverAnyLimit) {
      return { status: 'ok', message: 'Usage within plan limits' };
    }

    const overageItems = [];
    if (isOverDeviceLimit) overageItems.push(`+${overages.devices} devices`);
    if (isOverUserLimit) overageItems.push(`+${overages.users} users`);
    if (isOverEventLimit) overageItems.push(`+${overages.events} events`);

    return {
      status: 'over_limit',
      message: `Plan limit exceeded: ${overageItems.join(', ')}`,
      overages,
      projectedOverageMonthly: metrics.projectedOverageMonthly,
      projectedOverageMonthlyCents: metrics.projectedOverageMonthlyCents
    };
  } catch (error) {
    console.error('Error checking enforcement status:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * Get usage metrics for a user
 */
export async function getUsageMetrics(userId) {
  try {
    const freeUsage = {
      devices: 0,
      users: 1,
      events: 0
    };
    const freeSummary = calculateUsageSummary({
      ...freeUsage,
      limits: {
        devices: 2,
        users: 1,
        events: 5000
      }
    });

    if (!isDbEnabled()) {
      return {
        ...freeUsage,
        ...freeSummary
      };
    }

    const subscription = await getSubscriptionStatus(userId);
    const planDetails = subscription?.planDetails || {};
    const planDeviceLimit = typeof planDetails.devices === 'number' ? planDetails.devices : 2;
    const planUserLimit = typeof planDetails.users === 'number' ? planDetails.users : 1;
    const planEventLimit = typeof planDetails.includedEvents === 'number' ? planDetails.includedEvents : 5000;

    const devicesResult = await query(`SELECT COUNT(*) as count FROM devices`);

    const usersResult = await query(`SELECT COUNT(*) as count FROM users`);

    const eventsResult = await query(
      `SELECT COUNT(*) as count FROM events WHERE created_at > NOW() - INTERVAL '30 days'`
    );

    const devices = parseInt(devicesResult.rows[0]?.count || 0, 10);
    const users = parseInt(usersResult.rows[0]?.count || 0, 10);
    const events = parseInt(eventsResult.rows[0]?.count || 0, 10);

    let billingCycleDays = DEFAULT_BILLING_CYCLE_DAYS;
    if (subscription?.currentPeriodStart && subscription?.currentPeriodEnd) {
      const ms = new Date(subscription.currentPeriodEnd) - new Date(subscription.currentPeriodStart);
      const days = Math.round(ms / (24 * 60 * 60 * 1000));
      if (Number.isFinite(days) && days > 0) {
        billingCycleDays = days;
      }
    }

    const usageSummary = calculateUsageSummary({
      devices,
      users,
      events,
      limits: {
        devices: planDeviceLimit,
        users: planUserLimit,
        events: planEventLimit
      },
      billingCycleDays
    });

    return {
      devices,
      users,
      events,
      ...usageSummary
    };
  } catch (error) {
    console.error('Error getting usage metrics:', error);
    return { error: error.message };
  }
}

export async function saveUsageSnapshot(userId, usage, periodStart = null, periodEnd = null) {
  if (!isDbEnabled()) {
    return false;
  }

  const rows = [
    ['devices', usage.devices],
    ['users', usage.users],
    ['events_30d', usage.events],
    ['overage_monthly_cents', usage.projectedOverageMonthlyCents || 0]
  ];

  await Promise.all(
    rows.map(([metricName, metricValue]) =>
      query(
        `INSERT INTO billing_usage (user_id, metric_name, metric_value, period_start, period_end, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, metricName, metricValue, periodStart, periodEnd]
      )
    )
  );

  return true;
}

export async function captureUsageSnapshot(userId) {
  const subscription = await getSubscriptionStatus(userId);
  const usage = await getUsageMetrics(userId);

  if (!usage?.error) {
    await saveUsageSnapshot(
      userId,
      usage,
      subscription?.currentPeriodStart || null,
      subscription?.currentPeriodEnd || null
    );
  }

  return {
    subscription,
    usage
  };
}

/**
 * Retrieve billing invoices for a user from Stripe
 */
export async function getInvoices(userId) {
  try {
    if (!isDbEnabled()) {
      return [];
    }

    // Get Stripe customer ID from database
    const result = await query(
      'SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return [];
    }

    const customerId = result.rows[0].stripe_customer_id;

    // Fetch invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 100
    });

    // Format invoices for frontend
    return invoices.data.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      amount: invoice.amount_paid,
      amountDue: invoice.amount_due,
      currency: invoice.currency?.toUpperCase() || 'USD',
      status: invoice.status,
      date: new Date(invoice.created * 1000).toISOString(),
      paidDate: invoice.status_transitions?.paid_at 
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      pdfUrl: invoice.invoice_pdf,
      subscriptionId: invoice.subscription,
      description: invoice.description || 'IronGate Subscription Invoice'
    }));
  } catch (error) {
    console.error('Error retrieving invoices:', error);
    return [];
  }
}

function centsToDollars(cents) {
  const numeric = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return Number((numeric / 100).toFixed(2));
}

export async function getRevenueAnalytics() {
  if (!isDbEnabled()) {
    const monthlyRevenue = [
      { month: 'Jan', revenue: 4200, subscriptions: 22 },
      { month: 'Feb', revenue: 5100, subscriptions: 27 },
      { month: 'Mar', revenue: 6400, subscriptions: 33 },
      { month: 'Apr', revenue: 7100, subscriptions: 36 }
    ];

    return {
      totals: {
        grossRevenue: monthlyRevenue.reduce((sum, row) => sum + row.revenue, 0),
        paidSubscriptions: monthlyRevenue[monthlyRevenue.length - 1].subscriptions,
        averageRevenuePerSubscription: 197.22,
        couponRedemptions: 0
      },
      monthlyRevenue,
      topPlans: [
        { plan: 'starter', count: 18 },
        { plan: 'growth', count: 12 },
        { plan: 'scale', count: 6 }
      ],
      coupons: []
    };
  }

  const paidStatus = ['active', 'trialing', 'past_due'];

  const safeQuery = async (sql, params = [], fallbackRows = []) => {
    try {
      return await query(sql, params);
    } catch (error) {
      console.warn('Revenue analytics query fallback:', error.message);
      return { rows: fallbackRows };
    }
  };

  const [revenueResult, planResult, couponResult] = await Promise.all([
    query(
      `SELECT DATE_TRUNC('month', created_at) AS month,
              COALESCE(SUM(amount), 0) AS gross_cents,
              COUNT(*) AS payment_count
       FROM billing_payments
       WHERE status = 'succeeded'
       GROUP BY 1
       ORDER BY 1 DESC
       LIMIT 6`
    ),
    query(
      `SELECT plan, COUNT(*) AS count
       FROM billing_subscriptions
       WHERE status = ANY($1::text[])
       GROUP BY plan
       ORDER BY count DESC`,
      [paidStatus]
    ),
    safeQuery(
      `SELECT coupon_code, COUNT(*) AS uses
       FROM billing_coupon_usage
       GROUP BY coupon_code
       ORDER BY uses DESC
       LIMIT 5`
    )
  ]);

  const activeSubsResult = await query(
    `SELECT COUNT(*) AS count
     FROM billing_subscriptions
     WHERE status = ANY($1::text[])`,
    [paidStatus]
  );

  const monthlyRevenue = revenueResult.rows
    .slice()
    .reverse()
    .map((row) => ({
      month: new Date(row.month).toLocaleString('en-US', { month: 'short' }),
      revenue: centsToDollars(row.gross_cents),
      payments: Number(row.payment_count || 0)
    }));

  const grossRevenue = monthlyRevenue.reduce((sum, row) => sum + row.revenue, 0);
  const paidSubscriptions = Number(activeSubsResult.rows[0]?.count || 0);
  const couponRedemptions = couponResult.rows.reduce((sum, row) => sum + Number(row.uses || 0), 0);

  return {
    totals: {
      grossRevenue,
      paidSubscriptions,
      averageRevenuePerSubscription: paidSubscriptions > 0
        ? Number((grossRevenue / paidSubscriptions).toFixed(2))
        : 0,
      couponRedemptions
    },
    monthlyRevenue,
    topPlans: planResult.rows.map((row) => ({
      plan: row.plan,
      count: Number(row.count || 0)
    })),
    coupons: couponResult.rows.map((row) => ({
      code: row.coupon_code,
      uses: Number(row.uses || 0)
    }))
  };
}

function combineHealthStatus(current, next) {
  const rank = {
    healthy: 0,
    degraded: 1,
    critical: 2
  };

  return rank[next] > rank[current] ? next : current;
}

export async function evaluateBillingHealth() {
  const checkedAt = new Date().toISOString();

  if (!isDbEnabled()) {
    return {
      status: 'healthy',
      checkedAt,
      signals: [],
      metrics: {
        dbEnabled: false
      }
    };
  }

  const backlogDegraded = parseHealthThreshold('BILLING_HEALTH_WEBHOOK_BACKLOG_DEGRADED', 20);
  const backlogCritical = parseHealthThreshold('BILLING_HEALTH_WEBHOOK_BACKLOG_CRITICAL', 100);
  const deadLetterDegraded = parseHealthThreshold('BILLING_HEALTH_DEAD_LETTER_DEGRADED', 1);
  const deadLetterCritical = parseHealthThreshold('BILLING_HEALTH_DEAD_LETTER_CRITICAL', 10);
  const syncFailureDegraded = parseHealthThreshold('BILLING_HEALTH_SYNC_FAILURE_RATE_DEGRADED_PERCENT', 25);
  const syncFailureCritical = parseHealthThreshold('BILLING_HEALTH_SYNC_FAILURE_RATE_CRITICAL_PERCENT', 50);

  const safeQuery = async (sql, params = [], fallbackRows = []) => {
    try {
      return await query(sql, params);
    } catch (error) {
      console.warn('Billing health query fallback:', error.message);
      return { rows: fallbackRows };
    }
  };

  const [webhookCountsResult, syncRunsResult, migrationLogsResult] = await Promise.all([
    safeQuery(
      `SELECT
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing_count,
          COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter_count
       FROM billing_webhook_events`,
      [],
      [{ processing_count: 0, dead_letter_count: 0 }]
    ),
    safeQuery(
      `SELECT dry_run, error_count
       FROM billing_metered_sync_runs
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.max(1, BILLING_HEALTH_SYNC_WINDOW)],
      []
    ),
    safeQuery(
      `SELECT status, version, message, executed_at
       FROM schema_migration_logs
       ORDER BY executed_at DESC, id DESC
       LIMIT 20`,
      [],
      []
    )
  ]);

  const processingCount = Number(webhookCountsResult.rows[0]?.processing_count || 0);
  const deadLetterCount = Number(webhookCountsResult.rows[0]?.dead_letter_count || 0);
  const recentSyncRuns = syncRunsResult.rows || [];
  const nonDryRuns = recentSyncRuns.filter((row) => row.dry_run !== true);
  const failingSyncRuns = nonDryRuns.filter((row) => Number(row.error_count || 0) > 0).length;
  const syncFailureRate = nonDryRuns.length > 0
    ? Math.round((failingSyncRuns / nonDryRuns.length) * 100)
    : 0;

  const recentMigrationFailures = (migrationLogsResult.rows || [])
    .filter((row) => row.status === 'failed')
    .slice(0, 3)
    .map((row) => ({
      version: row.version,
      message: row.message || 'migration_failed',
      executedAt: row.executed_at
    }));

  const signals = [];
  let status = 'healthy';

  if (processingCount >= backlogCritical) {
    status = combineHealthStatus(status, 'critical');
    signals.push({
      key: 'webhook_backlog',
      severity: 'critical',
      message: `Webhook processing backlog is high (${processingCount})`,
      value: processingCount,
      threshold: backlogCritical
    });
  } else if (processingCount >= backlogDegraded) {
    status = combineHealthStatus(status, 'degraded');
    signals.push({
      key: 'webhook_backlog',
      severity: 'degraded',
      message: `Webhook processing backlog is elevated (${processingCount})`,
      value: processingCount,
      threshold: backlogDegraded
    });
  }

  if (deadLetterCount >= deadLetterCritical) {
    status = combineHealthStatus(status, 'critical');
    signals.push({
      key: 'dead_letter_count',
      severity: 'critical',
      message: `Dead-letter webhook count is critical (${deadLetterCount})`,
      value: deadLetterCount,
      threshold: deadLetterCritical
    });
  } else if (deadLetterCount >= deadLetterDegraded) {
    status = combineHealthStatus(status, 'degraded');
    signals.push({
      key: 'dead_letter_count',
      severity: 'degraded',
      message: `Dead-letter webhook count is non-zero (${deadLetterCount})`,
      value: deadLetterCount,
      threshold: deadLetterDegraded
    });
  }

  if (nonDryRuns.length >= 5 && syncFailureRate >= syncFailureCritical) {
    status = combineHealthStatus(status, 'critical');
    signals.push({
      key: 'metered_sync_failure_rate',
      severity: 'critical',
      message: `Metered sync failure rate is critical (${syncFailureRate}%)`,
      value: syncFailureRate,
      threshold: syncFailureCritical
    });
  } else if (nonDryRuns.length >= 5 && syncFailureRate >= syncFailureDegraded) {
    status = combineHealthStatus(status, 'degraded');
    signals.push({
      key: 'metered_sync_failure_rate',
      severity: 'degraded',
      message: `Metered sync failure rate is elevated (${syncFailureRate}%)`,
      value: syncFailureRate,
      threshold: syncFailureDegraded
    });
  }

  if (recentMigrationFailures.length > 0) {
    status = combineHealthStatus(status, 'critical');
    signals.push({
      key: 'migration_failures',
      severity: 'critical',
      message: 'Recent migration failures detected',
      value: recentMigrationFailures.length,
      threshold: 0,
      details: recentMigrationFailures
    });
  }

  return {
    status,
    checkedAt,
    signals,
    metrics: {
      dbEnabled: true,
      webhookProcessingCount: processingCount,
      deadLetterCount,
      recentMeteredRuns: nonDryRuns.length,
      meteredFailureRatePercent: syncFailureRate,
      recentMigrationFailureCount: recentMigrationFailures.length
    }
  };
}

function getMeteredPriceAllowList() {
  const raw = process.env.STRIPE_METERED_PRICE_IDS || '';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function persistMeteredSyncRun(summary, triggeredBy) {
  if (!isDbEnabled()) {
    return;
  }

  try {
    await query(
      `INSERT INTO billing_metered_sync_runs (
         triggered_by,
         dry_run,
         scanned_count,
         synced_count,
         skipped_count,
         error_count,
         details,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
      [
        triggeredBy,
        summary.dryRun,
        summary.scanned,
        summary.synced,
        summary.skipped,
        summary.errors.length,
        JSON.stringify(summary.details || [])
      ]
    );
  } catch (error) {
    console.warn('Unable to persist metered sync run:', error.message);
  }
}

export async function getMeteredSyncHistory(limit = 20) {
  if (!isDbEnabled()) {
    return [];
  }

  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(Number(limit), 200)
    : 20;

  try {
    const result = await query(
      `SELECT id,
              triggered_by,
              dry_run,
              scanned_count,
              synced_count,
              skipped_count,
              error_count,
              details,
              created_at
       FROM billing_metered_sync_runs
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      triggeredBy: row.triggered_by,
      dryRun: row.dry_run,
      scanned: Number(row.scanned_count || 0),
      synced: Number(row.synced_count || 0),
      skipped: Number(row.skipped_count || 0),
      errorCount: Number(row.error_count || 0),
      details: row.details || [],
      createdAt: row.created_at
    }));
  } catch (error) {
    console.warn('Unable to load metered sync history:', error.message);
    return [];
  }
}

export async function getWebhookEventHistory({ limit = 50, status = null } = {}) {
  if (!isDbEnabled()) {
    return [];
  }

  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(Number(limit), 500)
    : 50;

  const hasStatusFilter = typeof status === 'string' && status.trim().length > 0;

  try {
    const result = hasStatusFilter
      ? await query(
        `SELECT event_id,
                event_type,
                status,
                payload_hash,
                attempt_count,
                last_error,
                received_at,
                processed_at,
                updated_at
         FROM billing_webhook_events
         WHERE status = $1
         ORDER BY received_at DESC
         LIMIT $2`,
        [status.trim(), safeLimit]
      )
      : await query(
        `SELECT event_id,
                event_type,
                status,
                payload_hash,
                attempt_count,
                last_error,
                received_at,
                processed_at,
                updated_at
         FROM billing_webhook_events
         ORDER BY received_at DESC
         LIMIT $1`,
        [safeLimit]
      );

    return result.rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      status: row.status,
      payloadHash: row.payload_hash,
      attemptCount: Number(row.attempt_count || 0),
      lastError: row.last_error,
      receivedAt: row.received_at,
      processedAt: row.processed_at,
      updatedAt: row.updated_at
    }));
  } catch (error) {
    console.warn('Unable to load webhook event history:', error.message);
    return [];
  }
}

export async function reprocessWebhookEventById(eventId, { force = false } = {}) {
  if (!eventId || typeof eventId !== 'string') {
    throw new Error('eventId is required');
  }

  let currentStatus = null;
  if (isDbEnabled()) {
    const existing = await query(
      `SELECT status, attempt_count
       FROM billing_webhook_events
       WHERE event_id = $1
       LIMIT 1`,
      [eventId]
    );

    if (existing.rows.length === 0) {
      throw new Error('Webhook event not found in local history');
    }

    currentStatus = existing.rows[0]?.status;
    if (!force && currentStatus === 'processed') {
      throw new Error('Webhook event is already processed. Use force=true to reprocess.');
    }
    if (!force && currentStatus === 'dead_letter') {
      throw new Error('Webhook event is in dead-letter. Use force=true to reprocess.');
    }

    if (force && currentStatus === 'dead_letter') {
      await query(
        `UPDATE billing_webhook_events
         SET status = 'failed',
             attempt_count = 0,
             updated_at = NOW()
         WHERE event_id = $1`,
        [eventId]
      );
    }
  }

  const stripeEvent = await stripe.events.retrieve(eventId);
  if (!stripeEvent?.id) {
    throw new Error('Unable to retrieve webhook event from Stripe');
  }

  const payloadHash = createHash('sha256')
    .update(JSON.stringify(stripeEvent?.data || {}))
    .digest('hex');

  const dedup = await beginWebhookEventProcessing(stripeEvent.id, stripeEvent.type, payloadHash);
  if (dedup.duplicate && !force) {
    return {
      reprocessed: false,
      duplicate: true,
      state: dedup.state || currentStatus || 'unknown'
    };
  }

  try {
    await handleWebhookEvent(stripeEvent);
    await completeWebhookEventProcessing(stripeEvent.id);
    return {
      reprocessed: true,
      eventId: stripeEvent.id,
      eventType: stripeEvent.type
    };
  } catch (error) {
    await failWebhookEventProcessing(stripeEvent.id, error.message || 'reprocess_failed');
    throw error;
  }
}

export async function markStuckWebhookEventsAsFailed({ olderThanMinutes = 30, limit = 100 } = {}) {
  if (!isDbEnabled()) {
    return { updated: 0, events: [] };
  }

  const safeMinutes = Number.isFinite(Number(olderThanMinutes)) && Number(olderThanMinutes) > 0
    ? Math.min(Number(olderThanMinutes), 24 * 60)
    : 30;
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(Number(limit), 500)
    : 100;

  const result = await query(
    `WITH stuck AS (
       SELECT event_id
       FROM billing_webhook_events
       WHERE status = 'processing'
         AND updated_at < NOW() - make_interval(mins => $1)
       ORDER BY updated_at ASC
       LIMIT $2
     )
     UPDATE billing_webhook_events bwe
     SET status = 'failed',
         last_error = COALESCE(bwe.last_error, 'Marked as stuck by admin remediation'),
         updated_at = NOW()
     FROM stuck
     WHERE bwe.event_id = stuck.event_id
     RETURNING bwe.event_id`,
    [safeMinutes, safeLimit]
  );

  return {
    updated: result.rows.length,
    events: result.rows.map((row) => row.event_id)
  };
}

export async function syncMeteredUsageToStripe({ dryRun = true, limit = 100, triggeredBy = 'manual' } = {}) {
  if (!isDbEnabled()) {
    return {
      dryRun,
      scanned: 0,
      synced: 0,
      skipped: 0,
      errors: [],
      details: [],
      message: 'Database not enabled; metered sync skipped.'
    };
  }

  const result = await query(
    `SELECT user_id, stripe_subscription_id, plan, status
     FROM billing_subscriptions
     WHERE status = ANY($1::text[])
     ORDER BY updated_at DESC
     LIMIT $2`,
    [['active', 'trialing', 'past_due'], limit]
  );

  const allowedMeteredPriceIds = getMeteredPriceAllowList();
  const summary = {
    dryRun,
    scanned: result.rows.length,
    synced: 0,
    skipped: 0,
    errors: [],
    details: []
  };

  for (const row of result.rows) {
    const userId = row.user_id;
    const subscriptionId = row.stripe_subscription_id;

    try {
      const usage = await getUsageMetrics(userId);
      if (usage?.error) {
        summary.skipped += 1;
        summary.details.push({ userId, subscriptionId, status: 'skipped', reason: usage.error });
        continue;
      }

      const overages = usage.overages || {};
      const quantity = Number(overages.devices || 0)
        + Number(overages.users || 0)
        + Number(overages.eventBlocks || 0);

      if (quantity <= 0) {
        summary.skipped += 1;
        summary.details.push({ userId, subscriptionId, status: 'skipped', reason: 'no_overage' });
        continue;
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price']
      });

      const meteredItem = subscription.items?.data?.find((item) => {
        const recurring = item?.price?.recurring;
        const isMetered = recurring?.usage_type === 'metered';
        if (!isMetered) return false;
        if (allowedMeteredPriceIds.length === 0) return true;
        return allowedMeteredPriceIds.includes(item?.price?.id);
      });

      if (!meteredItem) {
        summary.skipped += 1;
        summary.details.push({ userId, subscriptionId, status: 'skipped', reason: 'missing_metered_item' });
        continue;
      }

      if (!dryRun) {
        await stripe.subscriptionItems.createUsageRecord(meteredItem.id, {
          quantity,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'set'
        });
      }

      summary.synced += 1;
      summary.details.push({
        userId,
        subscriptionId,
        status: dryRun ? 'dry_run' : 'synced',
        quantity,
        meteredPriceId: meteredItem?.price?.id || null
      });
    } catch (error) {
      summary.errors.push({ userId, subscriptionId, error: error.message });
      summary.details.push({ userId, subscriptionId, status: 'error', reason: error.message });
    }
  }

  await persistMeteredSyncRun(summary, triggeredBy);

  return summary;
}

export default {
  PLANS,
  createStripeCustomer,
  getOrCreateStripeCustomer,
  createSubscription,
  getSubscriptionStatus,
  updateSubscriptionPlan,
  cancelSubscription,
  createCheckoutSession,
  confirmCheckoutSession,
  handleWebhookEvent,
  beginWebhookEventProcessing,
  completeWebhookEventProcessing,
  failWebhookEventProcessing,
  getUsageMetrics,
  recordUsageSnapshot,
  recordCouponUsage,
  checkEnforcementStatus,
  getInvoices,
  validateCoupon,
  getRevenueAnalytics,
  evaluateBillingHealth,
  syncMeteredUsageToStripe,
  getMeteredSyncHistory,
  getWebhookEventHistory,
  reprocessWebhookEventById,
  markStuckWebhookEventsAsFailed
};
