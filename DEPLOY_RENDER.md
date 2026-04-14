# Deploy IronGate to Render

## What is ready
- production domain configured for https://irongateguard.com
- live Stripe key pair configured
- customer contact inbox configured
- launch-readiness endpoint returns zero blockers locally

## One-time Render setup
1. Push this repository to GitHub.
2. In Render, create a new Blueprint deployment from the repository.
3. Render will detect `render.yaml` and create:
   - one Node web service
   - one PostgreSQL database
4. Use the repository as-is; the build and start commands are already prepared for Linux hosting.
5. Fill the protected environment variables when prompted:
   - `STRIPE_PUBLIC_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `FROM_EMAIL`
   - `SUPPORT_EMAIL`
   - `SALES_EMAIL`

## Domain cutover
1. In Render, open the web service.
2. Add the custom domain `irongateguard.com`.
3. Add the DNS records Render gives you at your domain registrar.
4. Wait for TLS/SSL to finish provisioning.

## Stripe webhook
After the public domain is live, create this webhook in Stripe:
- endpoint URL: https://irongateguard.com/v1/billing/webhook

Recommended events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## Verify after deploy
- open the homepage
- create a signup
- start checkout
- confirm billing portal opens
- verify `/health` responds with status ok
- verify admin launch readiness still shows zero blockers
