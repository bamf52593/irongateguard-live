import Stripe from 'stripe';
import crypto from 'crypto';
import {
  createStripeCustomer,
  getOrCreateStripeCustomer,
  createSubscription,
  createTrialSubscription,
  getSubscriptionStatus,
  updateSubscriptionPlan,
  cancelSubscription,
  createCheckoutSession,
  confirmCheckoutSession,
  handleWebhookEvent,
  recordUsageSnapshot,
  captureUsageSnapshot,
  checkEnforcementStatus,
  getUsageMetrics,
  getInvoices,
  getRevenueAnalytics,
  evaluateBillingHealth,
  getMeteredSyncHistory,
  getWebhookEventHistory,
  reprocessWebhookEventById,
  markStuckWebhookEventsAsFailed,
  syncMeteredUsageToStripe,
  beginWebhookEventProcessing,
  completeWebhookEventProcessing,
  failWebhookEventProcessing,
  validateCoupon,
  calculateUsageSummary,
  PLANS,
  TRIAL_CONFIG,
  AVAILABLE_COUPONS
} from './billing.js';
import { verifyTokenMiddleware, requireRole } from './backend-auth-endpoints.js';
import {
  sendMeteredSyncFailureAlert,
  sendWebhookSignatureFailureAlert,
  sendWebhookDeadLetterAlert
} from './ops-alerts.js';
import { getDatabaseMigrationStatus, runDatabaseMigrations } from './db-migrations.js';
import { isDbEnabled, query } from './db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

function isStripeConfigured() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return false;
  if (key === 'sk_test_dummy') return false;
  if (key.includes('YOUR_SECRET_KEY_HERE')) return false;
  return key.startsWith('sk_test_') || key.startsWith('sk_live_');
}

function isWebhookConfigured() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) return false;
  if (secret.includes('YOUR_WEBHOOK_SECRET_HERE')) return false;
  return secret.startsWith('whsec_');
}

function isAdminReviewUser(req) {
  return req.user?.role === 'admin';
}

async function getAdminReviewBillingData() {
  const planDetails = PLANS.scale;

  let devices = 0;
  let users = 1;
  let events = 0;

  if (isDbEnabled()) {
    const [devicesResult, usersResult, eventsResult] = await Promise.all([
      query('SELECT COUNT(*) as count FROM devices'),
      query('SELECT COUNT(*) as count FROM users'),
      query(`SELECT COUNT(*) as count FROM events WHERE created_at > NOW() - INTERVAL '30 days'`)
    ]);

    devices = parseInt(devicesResult.rows[0]?.count || 0, 10);
    users = parseInt(usersResult.rows[0]?.count || 0, 10);
    events = parseInt(eventsResult.rows[0]?.count || 0, 10);
  }

  const usage = {
    devices,
    users,
    events,
    ...calculateUsageSummary({
      devices,
      users,
      events,
      limits: {
        devices: -1,
        users: planDetails.users,
        events: -1
      }
    })
  };

  return {
    subscription: {
      status: 'active',
      plan: 'scale',
      planDetails,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
      isAdminBypass: true
    },
    usage
  };
}

async function auditAdminAction({ userId, action, resourceType, resourceId, changes, ipAddress }) {
  if (!isDbEnabled()) {
    return;
  }

  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())`,
      [userId || null, action, resourceType, resourceId || null, JSON.stringify(changes || {}), ipAddress || null]
    );
  } catch (error) {
    console.warn('Failed to write admin audit log:', error.message);
  }
}

export function setupBillingEndpoints(app) {
  app.get('/v1/billing/status', (req, res) => {
    res.json({
      success: true,
      stripeConfigured: isStripeConfigured(),
      webhookConfigured: isWebhookConfigured(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Get available plans
  app.get('/v1/billing/plans', (req, res) => {
    const plansArray = Object.entries(PLANS).map(([key, plan]) => ({
      key,
      ...plan,
      amount: `$${(plan.amount / 100).toFixed(2)}`
    }));

    res.json({
      success: true,
      plans: plansArray
    });
  });

  // Create checkout session
  app.post('/v1/billing/checkout', verifyTokenMiddleware, async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({
          success: false,
          code: 'BILLING_NOT_CONFIGURED',
          error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env and restart backend.'
        });
      }

      const userId = req.user?.userId;
      const email = req.user?.email;
      const { orgName, planKey, couponCode } = req.body;

      if (!userId || !email || !planKey) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      // Get or create Stripe customer
      const stripeCustomerId = await getOrCreateStripeCustomer(userId, email, orgName || 'Organization');

      // Build URLs
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const successUrl = `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${frontendUrl}/billing/cancel`;

      // Create checkout session
      const session = await createCheckoutSession(
        userId,
        stripeCustomerId,
        planKey,
        successUrl,
        cancelUrl,
        couponCode
      );

      res.json({
        success: true,
        sessionId: session.id,
        url: session.url
      });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Start free trial (14 days)
  app.post('/v1/billing/trial', verifyTokenMiddleware, async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({
          success: false,
          code: 'BILLING_NOT_CONFIGURED',
          error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env and restart backend.'
        });
      }

      const userId = req.user?.userId;
      const userEmail = req.user?.email;

      if (!userId || !userEmail) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { planKey, couponCode } = req.body;
      if (!planKey || !PLANS[planKey]) {
        return res.status(400).json({
          success: false,
          error: `Invalid plan: ${planKey}`
        });
      }

      // Get or create Stripe customer
      const stripeCustomerId = await getOrCreateStripeCustomer(userId, userEmail, 'Organization');

      // Create trial subscription
      const subscription = await createTrialSubscription(userId, planKey, stripeCustomerId, userEmail, couponCode || null);

      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          plan: planKey,
          trialEndsAt: new Date(subscription.trial_end * 1000)
        }
      });
    } catch (error) {
      console.error('Error starting trial:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Validate coupon code
  app.post('/v1/billing/coupon/validate', verifyTokenMiddleware, async (req, res) => {
    try {
      const { couponCode } = req.body;

      if (!couponCode || typeof couponCode !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Coupon code is required'
        });
      }

      const coupon = await validateCoupon(couponCode, req.user?.userId || null);

      res.json({
        success: true,
        coupon
      });
    } catch (error) {
      console.error('Error validating coupon:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Invalid coupon code'
      });
    }
  });

  // Admin revenue analytics
  app.get('/v1/billing/admin/revenue', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const analytics = await getRevenueAnalytics();
      res.json({
        success: true,
        analytics
      });
    } catch (error) {
      console.error('Error getting revenue analytics:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to load revenue analytics'
      });
    }
  });

  // Get subscription status
  app.get('/v1/billing/subscription', verifyTokenMiddleware, async (req, res) => {
    try {
      // Get userId from auth token (verifyTokenMiddleware provides req.user with userId, email, role)
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      if (isAdminReviewUser(req)) {
        const adminBilling = await getAdminReviewBillingData();
        return res.json({
          success: true,
          subscription: adminBilling.subscription,
          usage: adminBilling.usage
        });
      }

      const subscription = await getSubscriptionStatus(userId);
      const usage = await getUsageMetrics(userId);

      res.json({
        success: true,
        subscription,
        usage
      });
    } catch (error) {
      console.error('Error getting subscription:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Check enforcement status (over limit, warning, compliance)
  app.get('/v1/billing/enforcement', verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      if (isAdminReviewUser(req)) {
        return res.json({
          success: true,
          enforcement: {
            requiresUpgrade: false,
            suggestedPlan: null,
            projectedOverageMonthly: '$0.00',
            projectedOverageMonthlyCents: 0,
            message: 'Admin review mode bypasses billing enforcement.'
          }
        });
      }

      const enforcement = await checkEnforcementStatus(userId);

      res.json({
        success: true,
        enforcement
      });
    } catch (error) {
      console.error('Error checking enforcement:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Persist current usage snapshot for audit/troubleshooting
  app.post('/v1/billing/usage/snapshot', verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const snapshot = await captureUsageSnapshot(userId);
      res.json({
        success: true,
        snapshot
      });
    } catch (error) {
      console.error('Error capturing usage snapshot:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Admin metered usage sync to Stripe subscription items
  app.post('/v1/billing/admin/metered-sync', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({
          success: false,
          code: 'BILLING_NOT_CONFIGURED',
          error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env and restart backend.'
        });
      }

      const dryRun = req.body?.dryRun !== false;
      const requestedLimit = Number.parseInt(req.body?.limit, 10);
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 100;

      const summary = await syncMeteredUsageToStripe({ dryRun, limit, triggeredBy: 'admin_api' });

      if ((summary.errors || []).length > 0) {
        const alertResult = await sendMeteredSyncFailureAlert({
          source: 'admin_api',
          summary,
          reason: 'sync_errors_detected'
        });
        if (!alertResult.sent) {
          console.warn(`Metered sync alert was not sent (${alertResult.reason})`);
        }
      }

      res.json({
        success: true,
        summary
      });
    } catch (error) {
      console.error('Error syncing metered usage:', error);
      await sendMeteredSyncFailureAlert({
        source: 'admin_api',
        summary: {
          dryRun: req.body?.dryRun !== false,
          scanned: 0,
          synced: 0,
          skipped: 0,
          errors: [{ error: error.message || 'admin_sync_failure' }]
        },
        reason: 'sync_execution_failed'
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to sync metered usage'
      });
    }
  });

  // Admin metered sync run history
  app.get('/v1/billing/admin/metered-sync/history', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const requestedLimit = Number.parseInt(req.query?.limit, 10);
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 200)
        : 25;

      const history = await getMeteredSyncHistory(limit);

      res.json({
        success: true,
        history
      });
    } catch (error) {
      console.error('Error loading metered sync history:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to load metered sync history'
      });
    }
  });

  // Admin Stripe webhook event observability
  app.get('/v1/billing/admin/webhooks', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const requestedLimit = Number.parseInt(req.query?.limit, 10);
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 50;
      const status = typeof req.query?.status === 'string' ? req.query.status : null;

      const events = await getWebhookEventHistory({ limit, status });

      res.json({
        success: true,
        events
      });
    } catch (error) {
      console.error('Error loading webhook events:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to load webhook events'
      });
    }
  });

  // Admin billing health snapshot
  app.get('/v1/billing/admin/health', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const health = await evaluateBillingHealth();
      res.json({
        success: true,
        health
      });
    } catch (error) {
      console.error('Error loading billing health:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to load billing health'
      });
    }
  });

  // Admin reprocess specific webhook event
  app.post('/v1/billing/admin/webhooks/reprocess', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const eventId = String(req.body?.eventId || '').trim();
      const force = req.body?.force === true;

      if (!eventId) {
        return res.status(400).json({
          success: false,
          error: 'eventId is required'
        });
      }

      const result = await reprocessWebhookEventById(eventId, { force });

      await auditAdminAction({
        userId: req.user?.userId,
        action: 'reprocess_webhook_event',
        resourceType: 'billing_webhook_events',
        resourceId: eventId,
        changes: { force, result },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('Error reprocessing webhook event:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to reprocess webhook event'
      });
    }
  });

  // Admin mark stuck processing webhook events as failed
  app.post('/v1/billing/admin/webhooks/unstick', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const olderThanMinutes = Number.parseInt(req.body?.olderThanMinutes, 10);
      const limit = Number.parseInt(req.body?.limit, 10);

      const result = await markStuckWebhookEventsAsFailed({
        olderThanMinutes: Number.isFinite(olderThanMinutes) ? olderThanMinutes : 30,
        limit: Number.isFinite(limit) ? limit : 100
      });

      await auditAdminAction({
        userId: req.user?.userId,
        action: 'unstick_webhook_events',
        resourceType: 'billing_webhook_events',
        resourceId: null,
        changes: { olderThanMinutes, limit, result },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('Error unsticking webhook events:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to unstick webhook events'
      });
    }
  });

  // Admin DB migration status and recent execution logs
  app.get('/v1/billing/admin/migrations', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const requestedLimit = Number.parseInt(req.query?.limit, 10);
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 200)
        : 50;

      const status = await getDatabaseMigrationStatus({ limit });

      res.json({
        success: true,
        status
      });
    } catch (error) {
      console.error('Error loading migration status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to load migration status'
      });
    }
  });

  // Admin run migrations now
  app.post('/v1/billing/admin/migrations/run', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const summary = await runDatabaseMigrations();

      res.json({
        success: true,
        summary
      });
    } catch (error) {
      console.error('Error running migrations:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to run migrations'
      });
    }
  });

  // Confirm completed checkout session (fallback when webhook delivery is delayed)
  app.post('/v1/billing/checkout/confirm', verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.user?.userId;
      const { sessionId } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'sessionId is required'
        });
      }

      const confirmation = await confirmCheckoutSession(sessionId, userId);
      res.json({
        success: true,
        confirmation
      });
    } catch (error) {
      console.error('Error confirming checkout session:', error);
      const safeMessage = (error?.message || '').includes('No such subscription')
        ? 'Checkout is still being finalized. Please refresh billing in a few seconds.'
        : error.message;
      res.status(400).json({
        success: false,
        error: safeMessage
      });
    }
  });

  // Update subscription plan
  app.post('/v1/billing/upgrade', verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.user?.userId;
      const { planKey } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      if (!planKey) {
        return res.status(400).json({
          success: false,
          error: 'planKey is required'
        });
      }

      // Get current subscription
      const currentSubscription = await getSubscriptionStatus(userId);

      if (currentSubscription.status === 'free') {
        return res.status(400).json({
          success: false,
          error: 'No active subscription. Please create a subscription first.'
        });
      }

      // Update subscription
      const updated = await updateSubscriptionPlan(
        currentSubscription.stripeSubscriptionId,
        planKey
      );

      res.json({
        success: true,
        subscription: updated
      });
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Cancel subscription
  app.post('/v1/billing/cancel', verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      // Get current subscription
      const currentSubscription = await getSubscriptionStatus(userId);

      if (currentSubscription.status === 'free') {
        return res.status(400).json({
          success: false,
          error: 'No active subscription to cancel'
        });
      }

      // Cancel subscription
      await cancelSubscription(currentSubscription.stripeSubscriptionId);

      res.json({
        success: true,
        message: 'Subscription cancelled'
      });
    } catch (error) {
      console.error('Error canceling subscription:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Webhook endpoint (for Stripe events)
  app.post('/v1/billing/webhook', async (req, res) => {
    if (!isStripeConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'BILLING_NOT_CONFIGURED',
        error: 'Stripe is not configured for webhook processing.'
      });
    }

    if (!isWebhookConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'WEBHOOK_NOT_CONFIGURED',
        error: 'Webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET in .env.'
      });
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) {
      await sendWebhookSignatureFailureAlert({
        reason: 'missing_signature_header',
        details: {
          path: '/v1/billing/webhook',
          contentLength: Number(req.headers['content-length'] || 0)
        }
      });
      return res.status(400).json({
        success: false,
        code: 'MISSING_SIGNATURE',
        error: 'Missing Stripe signature header'
      });
    }

    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PAYLOAD',
        error: 'Webhook payload must be raw JSON bytes'
      });
    }

    try {
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (signatureError) {
        await sendWebhookSignatureFailureAlert({
          reason: 'invalid_signature_or_payload',
          details: {
            path: '/v1/billing/webhook',
            message: signatureError.message
          }
        });
        throw signatureError;
      }

      const payloadHash = crypto.createHash('sha256').update(req.body).digest('hex');
      const dedup = await beginWebhookEventProcessing(event.id, event.type, payloadHash);
      if (dedup.duplicate) {
        if (dedup.state === 'dead_letter') {
          await sendWebhookDeadLetterAlert({
            eventId: event.id,
            eventType: event.type,
            attemptCount: dedup.attempts,
            lastError: 'Retry cap reached before processing'
          });
        }
        return res.json({ received: true, duplicate: true });
      }

      // Handle the event
      try {
        await handleWebhookEvent(event);
        await completeWebhookEventProcessing(event.id);
      } catch (processingError) {
        const failure = await failWebhookEventProcessing(event.id, processingError.message || 'processing_failed');
        if (failure?.status === 'dead_letter') {
          await sendWebhookDeadLetterAlert({
            eventId: event.id,
            eventType: event.type,
            attemptCount: failure.attemptCount,
            lastError: processingError.message || 'processing_failed'
          });
        }
        throw processingError;
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      const responseCode = String(error?.message || '').toLowerCase().includes('signature')
        ? 'INVALID_SIGNATURE'
        : 'WEBHOOK_PROCESSING_ERROR';
      const status = responseCode === 'INVALID_SIGNATURE' ? 400 : 500;
      res.status(status).json({
        success: false,
        code: responseCode,
        error: `Webhook Error: ${error.message}`
      });
    }
  });

  // Get billing portal session
  app.post('/v1/billing/portal', verifyTokenMiddleware, async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({
          success: false,
          code: 'BILLING_NOT_CONFIGURED',
          error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env and restart backend.'
        });
      }

      const userId = req.user?.userId;
      const userEmail = req.user?.email;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      // Get or create Stripe customer
      const stripeCustomerId = await getOrCreateStripeCustomer(userId, userEmail, 'Organization');

      // Build return URL from configured frontend base (supports full URL or host-only input).
      const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
      const normalizedBase = /^https?:\/\//i.test(frontendBase)
        ? frontendBase
        : `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${frontendBase}`;
      const returnUrl = `${normalizedBase.replace(/\/$/, '')}/billing`;

      // Create Stripe portal session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl
      });

      res.json({
        success: true,
        url: portalSession.url
      });
    } catch (error) {
      console.error('Error creating portal session:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get billing invoices
  app.get('/v1/billing/invoices', verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const invoices = await getInvoices(userId);

      res.json({
        success: true,
        invoices
      });
    } catch (error) {
      console.error('Error retrieving invoices:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

export default setupBillingEndpoints;
