# IronGate - IoT Sentinel Dashboard

A complete React-based dashboard for monitoring IoT devices and security sentinels with live updates and cyber theme.

## Quick Start

### Combined Server (Recommended)
Run both frontend and backend in a single server:

```bash
npm run start
```

This will:
1. Build the React frontend for production
2. Start the Express server on port 4000
3. Serve the React app and API from the same server

### Development Mode
For development with hot reloading:

```bash
npm run dev    # Frontend dev server (port 3000+)
npm run backend # Backend API server (port 4000)
```

## Features

- **Live Updates**: All pages refresh automatically every 3-10 seconds
- **Cyber Theme**: Neon colors, glowing effects, and futuristic design
- **Real-time Monitoring**: System health, sentinel status, event logs
- **Interactive Threat Map**: Dynamic visualization with event density
- **Responsive Design**: Works on desktop and mobile devices

## API Endpoints

- `GET /v1/dashboard` - Dashboard statistics and recent activity
- `GET /v1/health` - System health metrics
- `GET /v1/sentinels` - Sentinel device list with online/offline status
- `GET /v1/events` - Event logs with filtering
- `GET /v1/devices` - Connected device inventory
- `POST /v1/events/ingest` - Ingest new events (requires API key)

## Project Structure

```
irongate/
├── src/
│   ├── pages/
│   │   ├── SystemHealth.jsx      # CPU, RAM, Uptime metrics
│   │   ├── SentinelList.jsx      # Active sentinels table
│   │   ├── EventLogs.jsx         # Real-time event log with filters
│   │   ├── ThreatMap.jsx         # Visual threat visualization
│   │   ├── ApiKeys.jsx           # API key management
│   │   ├── UserAccounts.jsx      # User management
│   │   └── Settings.jsx          # System configuration
│   ├── components/
│   │   └── Sidebar.jsx           # Navigation sidebar
│   ├── styles/
│   │   ├── App.css               # Main application styles
│   │   └── Sidebar.css           # Sidebar styles
│   ├── App.jsx                   # Main app component with routing
│   └── index.jsx                 # React entry point
├── public/                       # Vanilla HTML dashboard (legacy)
├── backend.js                    # Express backend API server
├── irongate                      # Mock sentinel device
├── index.html                    # HTML entry for Vite
├── vite.config.js               # Vite configuration
├── package.json                 # Dependencies & scripts
└── README.md
```

## Features

### Pages
- **System Health**: Real-time CPU, RAM, uptime, database status
- **Sentinels**: List of active sentinel devices with stats
- **Event Logs**: Filterable real-time event history
- **Threat Map**: Visual representation of device signals
- **API Keys**: Manage API credentials
- **User Accounts**: User management and roles
- **Settings**: System configuration & notifications

### Navigation
- Fixed sidebar with active link highlighting
- Quick access to all pages
- Responsive design

## Setup & Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
cd c:\Users\codie\.copilot

# Install dependencies
npm install
```

## Running the Application

### Development Mode (React + Vite)
```bash
npm run dev
```
Open http://localhost:3000 in your browser

### Backend API Server
```bash
npm run backend
```
Runs on http://localhost:4000

### Billing Validation Commands
```bash
npm run test:billing:all
npm run test:stripe:validate
npm run test:billing:live-preflight
npm run test:payment
npm run test:billing
npm run test:billing:failure
npm run test:billing:persistence
```

Notes:
- `test:billing:all` runs DB startup/init, backend startup, all billing tests, then backend shutdown.
- Start backend before running billing tests.
- `test:billing:persistence` requires PostgreSQL container running and schema initialized.
- Local Docker PostgreSQL is exposed on `127.0.0.1:5433` (container `5432`).
- Use `npm run db:up` and `npm run db:init` before `npm run test:billing:persistence`.

### Mock Sentinel
```bash
npm run sentinel
```
Sends events to the backend every 2 seconds

### Build for Production
```bash
npm run build
npm run preview
```

## Running Everything Together

Open 3 terminals:

**Terminal 1 - Backend API:**
```bash
npm run backend
```

**Terminal 2 - React Frontend:**
```bash
npm run dev
```

**Terminal 3 - Mock Sentinel:**
```bash
npm run sentinel
```

Then open http://localhost:3000

## Overnight Keep-Alive Mode

Use this when you want the local stack to stay up while you are away. It will:
- start PostgreSQL, backend, and frontend
- run health checks on backend and frontend every 30 seconds
- automatically restart services after repeated health check failures
- write logs to `logs/overnight-YYYYMMDD-HHMMSS.log`

Start overnight guard:
```bash
npm run watch:overnight
```

Start overnight guard including the mock sentinel generator:
```bash
powershell -ExecutionPolicy Bypass -File ./scripts/overnight-guard.ps1 -IncludeSentinel
```

Optional tuning:
```bash
powershell -ExecutionPolicy Bypass -File ./scripts/overnight-guard.ps1 -IntervalSeconds 20 -MaxConsecutiveFailures 2
```

Stop everything in the morning:
```bash
npm run stop:all
```

## API Endpoints

- `GET /v1/events` - Get all events (requires `X-API-Key: test-key`)
- `POST /v1/events/ingest` - Ingest events
- `GET /health` - Health check
- `POST /v1/public/demo-request` - Capture pre-sales demo requests

## Routing

| URL | Component | Purpose |
|-----|-----------|---------|
| `/` | Dashboard | Overview |
| `/devices` | Devices | Device details |
| `/system-health` | SystemHealth | System metrics |
| `/sentinels` | SentinelList | Sentinel status |
| `/events` | EventLogs | Event history |
| `/threat-map` | ThreatMap | Security visualization |
| `/api-keys` | ApiKeys | API management |
| `/users` | UserAccounts | User management |
| `/settings` | Settings | System configuration |

## Styling

All pages include:
- Responsive card layouts
- Data tables with hover effects
- Progress bars and metrics
- Form controls
- Color-coded badges and status indicators
- Danger zone actions

## Next Steps

- Connect to real event backend
- Add chart.js for data visualization
- Implement authentication
- Add export functionality
- Deploy to production server

## Environment Variables

### Required (Production)
- `STRIPE_SECRET_KEY` - Stripe API secret key (format: `sk_test_*` or `sk_live_*`)
- `STRIPE_PUBLIC_KEY` - Stripe publishable key (format: `pk_test_*` or `pk_live_*`)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (format: `whsec_*`)

### Optional (Billing Usage-Based Add-ons)
- `BILLING_EXTRA_DEVICE_DAILY_CENTS` - Cost per device/day in overage (default: 50)
- `BILLING_EXTRA_USER_DAILY_CENTS` - Cost per user/day in overage (default: 10)
- `BILLING_EVENT_BLOCK_SIZE` - Events per block for overage calculation (default: 10000)
- `BILLING_EVENT_BLOCK_MONTHLY_CENTS` - Cost per block of events/month (default: 500)
- `METERED_SYNC_SCHEDULER_ENABLED` - Enable automatic metered sync scheduler (`true`/`false`, default: `false`)
- `METERED_SYNC_INTERVAL_MINUTES` - Scheduler interval in minutes (default: `1440` for daily)
- `METERED_SYNC_DRY_RUN` - Run scheduler without posting usage to Stripe (`true`/`false`, default: `true`)
- `METERED_SYNC_RUN_ON_START` - Run one sync immediately when backend starts (`true`/`false`, default: `false`)
- `STRIPE_METERED_PRICE_IDS` - Optional comma-separated allow-list of Stripe metered price IDs used for usage posting
- `OPS_ALERTS_ENABLED` - Enable operational failure alerts (`true`/`false`, default: `false`)
- `OPS_ALERT_WEBHOOK_URL` - Webhook URL to receive metered sync failure alerts (JSON POST payload)
- `DB_AUTO_MIGRATE` - Auto-apply safe billing migrations on backend start (`true`/`false`, default: `true`)
- `DB_SSL` - Force PostgreSQL SSL on or off (`true`/`false`); defaults to off for local DB URLs and on for remote production DBs
- `WEBHOOK_MAX_RETRIES` - Maximum webhook processing attempts before dead-letter (default: `5`)
- `BILLING_API_BASE` - Billing API base URL for live preflight command (default: `http://localhost:4000/v1`)
- `BILLING_ADMIN_EMAIL` - Admin email for authenticated preflight endpoint checks (default: `admin@irongate.local`)
- `BILLING_ADMIN_PASSWORD` - Admin password for preflight login (default: `Admin@123`)
- `LIVE_BILLING_REQUIRE_LIVE_KEYS` - Require `sk_live_`/`pk_live_` keys in preflight (`true`/`false`, default: `false`)
- `VITE_BILLING_PAYWALL_BYPASS` - Bypass frontend paywall lock to access non-billing routes while testing (`true`/`false`, default: `false`)
- `SALES_EMAIL` - Inbox to receive demo request notifications (defaults to `SUPPORT_EMAIL`)
- `BILLING_HEALTH_CHECKS_ENABLED` - Enable scheduled billing health checks (`true`/`false`, default: `true`)
- `BILLING_HEALTH_CHECK_INTERVAL_MINUTES` - Billing health check cadence in minutes (default: `15`)
- `BILLING_HEALTH_WEBHOOK_BACKLOG_DEGRADED` - Processing backlog threshold for degraded state (default: `20`)
- `BILLING_HEALTH_WEBHOOK_BACKLOG_CRITICAL` - Processing backlog threshold for critical state (default: `100`)
- `BILLING_HEALTH_DEAD_LETTER_DEGRADED` - Dead-letter threshold for degraded state (default: `1`)
- `BILLING_HEALTH_DEAD_LETTER_CRITICAL` - Dead-letter threshold for critical state (default: `10`)
- `BILLING_HEALTH_SYNC_FAILURE_RATE_DEGRADED_PERCENT` - Metered sync failure-rate threshold (%) for degraded state (default: `25`)
- `BILLING_HEALTH_SYNC_FAILURE_RATE_CRITICAL_PERCENT` - Metered sync failure-rate threshold (%) for critical state (default: `50`)
- `BILLING_HEALTH_SYNC_WINDOW` - Number of recent metered sync runs used for failure-rate calculations (default: `20`)

### Database Migration Runner
To safely apply billing schema upgrades on existing environments:
```bash
npm run db:migrate
```

This migration runner is idempotent and focuses on billing tables/columns/indexes.
It now tracks migration versions and writes per-step execution logs (`applied`, `skipped`, `failed`).

Admin migration status API:
```bash
GET /v1/billing/admin/migrations?limit=50
```

### Email Receipts (SendGrid)
- `SENDGRID_API_KEY` - SendGrid API key for email sending (format: `SG.xxxxx`)
- `FROM_EMAIL` - Sender email address (default: `noreply@irongate.local`)
- `SUPPORT_EMAIL` - Support email address (default: `support@irongate.local`)

### Examples
```bash
# .env file
STRIPE_SECRET_KEY=sk_test_abc123...
STRIPE_PUBLIC_KEY=pk_test_xyz789...
STRIPE_WEBHOOK_SECRET=whsec_abc123...

# Email receipts with SendGrid (optional)
SENDGRID_API_KEY=SG.your_sendgrid_key_here
FROM_EMAIL=noreply@yourdomain.com
SUPPORT_EMAIL=support@yourdomain.com

# Custom pricing (optional)
BILLING_EXTRA_DEVICE_DAILY_CENTS=75
BILLING_EXTRA_USER_DAILY_CENTS=15
BILLING_EVENT_BLOCK_SIZE=5000
BILLING_EVENT_BLOCK_MONTHLY_CENTS=750
```

### Testing Billing Overages
Run the test suite to verify overage calculations:
```bash
npm run test:billing:overage
```

### Live Billing Preflight
Run a live-test readiness check before executing real billing actions:
```bash
npm run test:billing:live-preflight
```

What it validates:
- Stripe key format and mode consistency (test/live match)
- Stripe API connectivity
- Auth login for admin user
- Admin billing endpoints: health, revenue, webhooks, and migrations
- Warns when `DB_AUTO_MIGRATE` is disabled

### Testing Email Receipts
To test the email receipt service (runs in demo mode without SendGrid):
```bash
npm run test:emails
```

The email service automatically:
- **Sends receipt emails** when invoice payments succeed (via Stripe webhook)
- **Sends confirmation emails** when customers setup new subscriptions
- **Sends failure notices** when invoice payments fail, with retry instructions

To enable real email sending:
1. Get a SendGrid API key from [SendGrid Console](https://app.sendgrid.com/)
2. Set `SENDGRID_API_KEY=SG.xxxxx` in your `.env` file
3. Configure `FROM_EMAIL` and `SUPPORT_EMAIL` 
4. Restart the backend server

## Billing Features

### Supported Features
- ✅ Usage-based overage billing (devices, users, events)
- ✅ Tiered pricing plans (Starter, Growth, Scale)
- ✅ Subscription management via Stripe
- ✅ Invoice retrieval and PDF downloads
- ✅ Email receipts and payment notifications
- ✅ Enforcement signals for usage limits
- ✅ Stripe Billing Portal (self-serve customer management)
- ✅ 14-Day Free Trials (no credit card required)
- ✅ Coupon/Promo Codes (LAUNCH50, TRIAL30, ANNUAL20, STARTUP15)
- ✅ Admin Revenue Dashboard (totals, monthly revenue, plan mix, coupon performance)
- ✅ Metered Usage Sync to Stripe (dry-run and live execution)
- ✅ Scheduled Metered Sync Runner (automatic interval-based execution)
- ✅ Metered Sync Audit History (stored runs + admin history view)
- ✅ Metered Sync Failure Alerting (webhook notifications for run errors)
- ✅ Coupon Usage Cap Enforcement (DB-backed max usage + per-user reuse guard)
- ✅ Safe Billing Migration Runner (manual command + startup auto-apply)
- ✅ Migration Version Tracking & Step Logs (`schema_migrations`, `schema_migration_logs`)
- ✅ Admin Migration Controls (status API + run-now endpoint + dashboard panel)
- ✅ Authenticated Checkout Hardening (server-side identity from JWT)
- ✅ Webhook Replay Protection & Signature Alerts (event dedup + ops notifications)
- ✅ Admin Webhook Observability (history API + dashboard panel)
- ✅ Webhook Remediation Controls (reprocess failed + unstick stuck processing)
- ✅ Webhook Retry Governance & Dead-Letter Escalation (retry cap + dead-letter alerts)
- ✅ Billing Health SLO Monitoring (scheduled checks + admin health API + transition alerts)

### Implementation Status
- Phase 1: ✅ Overage calculations and enforcement
- Phase 2: ✅ Invoice management and display
- Phase 3: ✅ Email receipts and notifications
- Phase 4: ✅ Stripe Billing Portal
- Phase 5: ✅ Trial Periods
- Phase 6: ✅ Coupon & Promo Codes
- Phase 7: ✅ Admin Revenue Dashboard
- Phase 8: ✅ Metered Usage Sync
- Phase 9: ✅ Scheduled Metered Sync Runner
- Phase 10: ✅ Metered Sync Audit History
- Phase 11: ✅ Metered Sync Failure Alerting
- Phase 12: ✅ Coupon Usage Cap Enforcement
- Phase 13: ✅ Safe Billing Migration Runner
- Phase 14: ✅ Migration Version Tracking & Step Logs
- Phase 15: ✅ Admin Migration Controls
- Phase 16: ✅ Authenticated Checkout Hardening
- Phase 17: ✅ Webhook Replay Protection & Signature Alerts
- Phase 18: ✅ Admin Webhook Observability
- Phase 19: ✅ Webhook Remediation Controls
- Phase 20: ✅ Webhook Retry Governance & Dead-Letter Escalation
- Phase 21: ✅ Billing Health SLO Monitoring

### Billing Health Runbook
- `degraded`: Inspect `/v1/billing/admin/health` and `/v1/billing/admin/webhooks?status=failed` for rising failure pressure.
- `critical` with dead-letter growth: use `/v1/billing/admin/webhooks/reprocess` (or force mode for dead-letter) and `/v1/billing/admin/webhooks/unstick`.
- `critical` with migration failure signal: check `/v1/billing/admin/migrations` and run `/v1/billing/admin/migrations/run` after fixing root cause.
- metered sync failure spikes: inspect `/v1/billing/admin/metered-sync/history`, then execute `/v1/billing/admin/metered-sync` in dry-run first.

## License

ISC