# Stripe Payment Integration Setup Guide

This guide explains how to set up Stripe payments for IronGate SaaS billing.

## Overview

IronGate now includes a complete Stripe integration for handling subscription payments. The system supports three tiered plans with the following capabilities:

- **Starter Plan**: $99/month - 10 devices, 3 users
- **Growth Plan**: $299/month - 50 devices, 10 users  
- **Scale Plan**: $999/month - Unlimited devices, 30 users

## Prerequisites

- Stripe account (create one at https://dashboard.stripe.com)
- Node.js backend running with Express
- Frontend React app with routing

## Setup Steps

### 1. Get Stripe API Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Under "Standard keys", copy:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)
3. For webhook handling, go to Webhooks section and create an endpoint:
   - URL: `https://your-domain.com/v1/billing/webhook`
   - Events to listen: 
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy the **Signing secret** (starts with `whsec_`)

### 2. Configure Environment Variables

Update your `.env` file with Stripe credentials:

```env
# Stripe Configuration
STRIPE_PUBLIC_KEY=pk_test_YOUR_PUBLIC_KEY
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
FRONTEND_URL=http://localhost:3000
```

For production, use `pk_live_` and `sk_live_` keys instead of `pk_test_` and `sk_test_`.

### 3. Create Products & Prices in Stripe

You need to create the products and prices in your Stripe account:

#### Using Stripe Dashboard:

1. Go to Products section
2. Click "Add product"
3. Create three products:

**Product 1: Starter**
- Name: `Starter Plan`
- Pricing: $99.00/month
- Price ID: `price_starter_monthly`

**Product 2: Growth**
- Name: `Growth Plan`
- Pricing: $299.00/month
- Price ID: `price_growth_monthly`

**Product 3: Scale**
- Name: `Scale Plan`
- Pricing: $999.00/month
- Price ID: `price_scale_monthly`

#### Using Stripe CLI:

```bash
# Create products and prices
stripe products create --name "Starter Plan" --type service
stripe prices create --product prod_STARTER --unit-amount 9900 --currency usd --recurring-interval month --recurring-usage-type licensed

stripe products create --name "Growth Plan" --type service
stripe prices create --product prod_GROWTH --unit-amount 29900 --currency usd --recurring-interval month --recurring-usage-type licensed

stripe products create --name "Scale Plan" --type service
stripe prices create --product prod_SCALE --unit-amount 99900 --currency usd --recurring-interval month --recurring-usage-type licensed
```

### 4. Set Up Database

The billing tables are already defined in `database.sql`. If you haven't imported the schema yet:

```bash
psql -h localhost -U postgres -d irongate < database.sql
```

This creates these tables:
- `billing_customers` - Stripe customer records
- `billing_subscriptions` - Active subscriptions
- `billing_payments` - Payment history
- `billing_usage` - Usage metrics

### 5. Start the Backend

```bash
npm run backend
```

The billing endpoints will be available at:
- `POST /v1/billing/checkout` - Create checkout session
- `GET /v1/billing/plans` - List available plans
- `GET /v1/billing/subscription` - Get user's subscription status
- `POST /v1/billing/upgrade` - Change subscription plan
- `POST /v1/billing/cancel` - Cancel subscription
- `POST /v1/billing/webhook` - Stripe webhook receiver

### 6. Test Checkout Flow

1. Navigate to `/billing` in your application
2. Click "Pay Now" on a plan (recommended first path)
3. You'll be redirected to Stripe Checkout
4. Use Stripe test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits

Note:
- `Pay Now` uses dynamic checkout line items and works even if dashboard price IDs are not configured.
- `Start Free Trial` requires valid Stripe Price IDs for each plan in `billing.js` plan mapping.

### 7. Set Up Local Webhook Testing (Development)

To test webhooks locally, use Stripe CLI:

```bash
# Install Stripe CLI (see https://stripe.com/docs/stripe-cli)

# Forward Stripe events to your local webhook endpoint
stripe listen --forward-to localhost:4000/v1/billing/webhook

# Run events in another terminal for testing
stripe trigger payment_intent.succeeded
```

### 8. Deployment Considerations

For production deployment to AWS/other cloud:

1. Update `.env` with live Stripe keys (`pk_live_`, `sk_live_`)
2. Set `FRONTEND_URL` to your production domain
3. Update webhook endpoint URL in Stripe Dashboard to `https://your-domain/v1/billing/webhook`
4. Ensure HTTPS is enabled (required by Stripe)
5. Store secrets in environment variables, not in code

## API Endpoint Documentation

### Get Available Plans
```bash
GET /v1/billing/plans
```
Returns list of available subscription plans with pricing.

### Create Checkout Session
```bash
POST /v1/billing/checkout
Content-Type: application/json

{
  "userId": "user-uuid",
  "email": "user@example.com",
  "orgName": "Organization Name",
  "planKey": "starter"
}
```
Returns Stripe checkout URL.

### Get Subscription Status
```bash
GET /v1/billing/subscription
Authorization: Bearer <auth-token>
```
Returns current subscription plan, status, and usage metrics.

### Upgrade Plan
```bash
POST /v1/billing/upgrade
Authorization: Bearer <auth-token>
Content-Type: application/json

{
  "planKey": "growth"
}
```
Changes subscription to a new plan.

### Cancel Subscription
```bash
POST /v1/billing/cancel
Authorization: Bearer <auth-token>
```
Cancels the current subscription (downgrades to free tier).

## Files Added/Modified

**New Files:**
- `billing.js` - Stripe integration logic
- `backend-billing-endpoints.js` - API endpoints for billing
- `src/pages/Billing.jsx` - Billing UI component
- `src/styles/billing.css` - Billing page styles
- `STRIPE_SETUP.md` - This setup guide

**Modified Files:**
- `.env` - Added Stripe configuration keys
- `database.sql` - Added billing tables
- `backend.js` - Integrated billing endpoints
- `package.json` - Added stripe dependency
- `src/App.jsx` - Added billing route
- `src/components/Sidebar.jsx` - Added billing link

## Troubleshooting

**Issue: "Invalid API key" error**
- Solution: Verify Stripe keys in `.env` are correct
- Make sure you're using the right environment (test vs live)

**Issue: Checkout button does nothing**
- Solution: Check browser console for errors
- Verify `STRIPE_PUBLIC_KEY` is set
- Make sure checkout endpoint is returning a valid session ID

**Issue: Webhook events not triggering**
- Solution: Verify webhook secret in `.env` matches Stripe Dashboard
- Check that webhook endpoint is receiving POST requests
- Use Stripe CLI to test locally: `stripe trigger payment_intent.succeeded`

**Issue: Subscription not updating after payment**
- Solution: Check database billing tables for records
- Verify webhook is processing events correctly
- Check backend logs for errors

## Next Steps

1. **Customize Plans**: Modify `PLANS` object in `billing.js` to match your pricing
2. **Add Email Notifications**: Integrate email service to send receipts/invoices
3. **Implement Usage-Based Billing**: Track actual usage of devices/events
4. **Add Metering**: Use Stripe usage-based pricing for pay-as-you-go model
5. **Create Billing Portal**: Use Stripe's Customer Portal for self-serve management
6. **Analytics**: Track subscription metrics and revenue

## Additional Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Testing Cards](https://stripe.com/docs/testing)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
