# Launch Ready Now

This file shows the only remaining items needed to move IronGate from locally verified to publicly launchable.

## Current Status

The product is already verified for:
- signup flow
- demo request flow
- plan comparison flow
- checkout creation
- billing portal creation
- incident tracing persistence
- active defense actions
- conversion tracking
- launch-readiness reporting

## Remaining Blockers

These are now external deployment items, not missing product functionality.

### 1. Add Live Stripe Credentials
Update your real production environment with:

- `STRIPE_PUBLIC_KEY=pk_live_...`
- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`

## 2. Add Email Delivery
Set these in production:

- `SENDGRID_API_KEY=SG...`
- `FROM_EMAIL=noreply@yourdomain.com`
- `SUPPORT_EMAIL=support@yourdomain.com`
- `SALES_EMAIL=sales@yourdomain.com`

## 3. Set Public Domain
Replace local values with your real app URL:

- `FRONTEND_URL=https://yourdomain.com`
- `VITE_API_URL=https://yourdomain.com/v1`
- `CORS_ORIGIN=https://yourdomain.com`

## 4. Deploy Using the Production Template
Start from:

- [.env.production.example](.env.production.example)

## 5. Final Verification Commands
After real credentials are added:

```powershell
$env:LIVE_BILLING_REQUIRE_LIVE_KEYS='true'; npm run test:billing:live-preflight
```

Then do one real live journey:
1. open homepage
2. create account
3. request demo
4. choose plan
5. complete checkout
6. confirm subscription state
7. open billing portal
8. verify email delivery

## Launch Decision Rule

If the strict preflight passes and the real end-to-end flow works, the app is ready to launch.
