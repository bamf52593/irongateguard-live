import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

function formatMoney(value) {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RevenueAnalytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncHistory, setSyncHistory] = useState([]);
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [billingHealth, setBillingHealth] = useState(null);
  const [conversionSummary, setConversionSummary] = useState(null);
  const [launchReadiness, setLaunchReadiness] = useState(null);
  const [webhookActionInProgress, setWebhookActionInProgress] = useState('');
  const [webhookStatusFilter, setWebhookStatusFilter] = useState('all');
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [migrating, setMigrating] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || '/v1';
  const token = localStorage.getItem('authToken');
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      if (currentUser?.role !== 'admin') {
        setError('Admin access required to view revenue analytics.');
        setLoading(false);
        return;
      }

      try {
        const headers = {
          Authorization: `Bearer ${token}`
        };

        const [analyticsResponse, historyResponse, migrationResponse, webhookResponse, healthResponse, conversionResponse, readinessResponse] = await Promise.all([
          axios.get(`${API_URL}/billing/admin/revenue`, { headers }),
          axios.get(`${API_URL}/billing/admin/metered-sync/history?limit=10`, { headers }),
          axios.get(`${API_URL}/billing/admin/migrations?limit=10`, { headers }),
          axios.get(`${API_URL}/billing/admin/webhooks?limit=15`, { headers }),
          axios.get(`${API_URL}/billing/admin/health`, { headers }),
          axios.get(`${API_URL}/admin/conversion-summary`, { headers }),
          axios.get(`${API_URL}/admin/launch-readiness`, { headers })
        ]);

        setAnalytics(analyticsResponse.data.analytics);
        setSyncHistory(historyResponse.data.history || []);
        setMigrationStatus(migrationResponse.data.status || null);
        setWebhookEvents(webhookResponse.data.events || []);
        setBillingHealth(healthResponse.data.health || null);
        setConversionSummary(conversionResponse.data.summary || null);
        setLaunchReadiness(readinessResponse.data.readiness || null);
      } catch (err) {
        const message = err?.response?.data?.error || 'Unable to load revenue analytics';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [API_URL, token, currentUser]);

  const refreshWebhookEvents = async (statusFilter = webhookStatusFilter) => {
    const statusParam = statusFilter && statusFilter !== 'all'
      ? `&status=${encodeURIComponent(statusFilter)}`
      : '';
    const response = await axios.get(`${API_URL}/billing/admin/webhooks?limit=15${statusParam}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    setWebhookEvents(response.data.events || []);
  };

  const runMeteredSync = async (dryRun) => {
    try {
      setSyncing(true);
      setError('');
      const response = await axios.post(
        `${API_URL}/billing/admin/metered-sync`,
        { dryRun, limit: 100 },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      setSyncResult(response.data.summary);

      const historyResponse = await axios.get(
        `${API_URL}/billing/admin/metered-sync/history?limit=10`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      setSyncHistory(historyResponse.data.history || []);
    } catch (err) {
      const message = err?.response?.data?.error || 'Unable to run metered usage sync';
      setError(message);
    } finally {
      setSyncing(false);
    }
  };

  const runMigrationsNow = async () => {
    try {
      setMigrating(true);
      setError('');

      await axios.post(
        `${API_URL}/billing/admin/migrations/run`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const statusResponse = await axios.get(
        `${API_URL}/billing/admin/migrations?limit=10`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      setMigrationStatus(statusResponse.data.status || null);
    } catch (err) {
      const message = err?.response?.data?.error || 'Unable to run migrations';
      setError(message);
    } finally {
      setMigrating(false);
    }
  };

  const reprocessWebhookEvent = async (eventId, force = false) => {
    try {
      setWebhookActionInProgress(`reprocess:${eventId}`);
      setError('');

      await axios.post(
        `${API_URL}/billing/admin/webhooks/reprocess`,
        { eventId, force },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      await refreshWebhookEvents();
    } catch (err) {
      const message = err?.response?.data?.error || 'Unable to reprocess webhook event';
      setError(message);
    } finally {
      setWebhookActionInProgress('');
    }
  };

  const applyWebhookFilter = async (nextFilter) => {
    try {
      setWebhookStatusFilter(nextFilter);
      await refreshWebhookEvents(nextFilter);
    } catch (err) {
      const message = err?.response?.data?.error || 'Unable to filter webhook events';
      setError(message);
    }
  };

  const unstickWebhookEvents = async () => {
    try {
      setWebhookActionInProgress('unstick');
      setError('');

      await axios.post(
        `${API_URL}/billing/admin/webhooks/unstick`,
        { olderThanMinutes: 30, limit: 100 },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      await refreshWebhookEvents();
    } catch (err) {
      const message = err?.response?.data?.error || 'Unable to unstick webhook events';
      setError(message);
    } finally {
      setWebhookActionInProgress('');
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h1>Revenue</h1>
        <p>Loading revenue analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1>Revenue</h1>
        <p className="error">{error}</p>
      </div>
    );
  }

  const totals = analytics?.totals || {};
  const monthlyRevenue = analytics?.monthlyRevenue || [];
  const topPlans = analytics?.topPlans || [];
  const coupons = analytics?.coupons || [];

  return (
    <div className="page">
      <h1>Revenue</h1>
      <div className="viking-banner">
        <h2>Commercial performance at a glance</h2>
        <p>Track revenue momentum, plan adoption, and coupon usage from one admin view.</p>
      </div>

      <div className="card-grid">
        <div className="card stat-card">
          <h2>{formatMoney(totals.grossRevenue)}</h2>
          <p>Gross Revenue</p>
        </div>
        <div className="card stat-card">
          <h2>{totals.paidSubscriptions || 0}</h2>
          <p>Paid Subscriptions</p>
        </div>
        <div className="card stat-card">
          <h2>{formatMoney(totals.averageRevenuePerSubscription)}</h2>
          <p>ARPS</p>
        </div>
        <div className="card stat-card">
          <h2>{totals.couponRedemptions || 0}</h2>
          <p>Coupon Redemptions</p>
        </div>
      </div>

      <div className="card-grid">
        <section className="card">
          <h2>Funnel Snapshot</h2>
          {conversionSummary ? (
            <ul className="activity-list">
              <li><strong>Landing views</strong><span>{conversionSummary.counts?.landing_view || 0}</span></li>
              <li><strong>Plan views</strong><span>{conversionSummary.counts?.plans_view || 0}</span></li>
              <li><strong>Completed signups</strong><span>{conversionSummary.counts?.signup_completed || 0}</span></li>
              <li><strong>Demo requests</strong><span>{conversionSummary.counts?.demo_request_submitted || 0}</span></li>
              <li><strong>Checkout starts</strong><span>{conversionSummary.counts?.checkout_started || 0}</span></li>
              <li><strong>Landing → signup</strong><span>{conversionSummary.rates?.signupFromLanding || 0}%</span></li>
            </ul>
          ) : (
            <p>No funnel data yet.</p>
          )}
        </section>

        <section className="card">
          <h2>Monthly Revenue (Last 6 Months)</h2>
          {monthlyRevenue.length === 0 ? (
            <p>No revenue data yet.</p>
          ) : (
            <ul className="activity-list">
              {monthlyRevenue.map((row) => (
                <li key={row.month}>
                  <strong>{row.month}</strong>
                  <span>{formatMoney(row.revenue)}</span>
                  <em>{row.payments || row.subscriptions || 0} records</em>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Top Plans</h2>
          {topPlans.length === 0 ? (
            <p>No plan distribution data available.</p>
          ) : (
            <ul className="activity-list">
              {topPlans.map((row) => (
                <li key={row.plan}>
                  <strong>{String(row.plan).toUpperCase()}</strong>
                  <span>{row.count} subscriptions</span>
                  <em>active</em>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card recommendation-card">
        <h2>Production Setup Checklist</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #888)', marginBottom: '0.75rem' }}>
          These are one-time Render environment variable tasks. They do <strong>not</strong> block you or customers from using the dashboard — they only affect Stripe payments and email delivery.
        </p>
        {launchReadiness ? (
          <>
            <p>
              Status: <strong>{launchReadiness.ready ? '✅ All systems go' : `⚠️ ${launchReadiness.blockerCount} setup task(s) remaining — site is still fully accessible`}</strong>
            </p>
            <ul className="activity-list" style={{ marginTop: '1rem' }}>
              {launchReadiness.checks.map((check) => (
                <li key={check.key}>
                  <strong>{check.label}</strong>
                  <span style={{ color: check.ok ? 'var(--color-success, #22c55e)' : 'var(--color-warning, #f59e0b)' }}>{check.ok ? '✅ PASS' : '⚙️ SET IN RENDER DASHBOARD'}</span>
                  <em>{check.detail}</em>
                </li>
              ))}
            </ul>
            {!launchReadiness.ready && (
              <p style={{ fontSize: '0.8rem', marginTop: '1rem', color: 'var(--color-text-muted, #888)' }}>
                To fix: go to <strong>render.com → irongate service → Environment</strong> and add the missing keys.
              </p>
            )}
          </>
        ) : (
          <p>Production checklist data is not available yet.</p>
        )}
      </section>

      <section className="card recommendation-card">
        <h2>Coupon Performance</h2>
        {coupons.length === 0 ? (
          <p>No coupon redemptions recorded yet.</p>
        ) : (
          <ul className="activity-list">
            {coupons.map((row) => (
              <li key={row.code}>
                <strong>{row.code}</strong>
                <span>{row.uses} redemptions</span>
                <em>campaign performance</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card recommendation-card">
        <h2>Billing Ops Health</h2>
        <p>Automated SLO snapshot across webhooks, metered sync reliability, and migration integrity.</p>
        <ul className="activity-list" style={{ marginTop: '1rem' }}>
          <li>
            <strong>Status</strong>
            <span>{String(billingHealth?.status || 'unknown').toUpperCase()}</span>
            <em>last checked {billingHealth?.checkedAt ? new Date(billingHealth.checkedAt).toLocaleString() : 'never'}</em>
          </li>
          <li>
            <strong>Webhook Processing Queue</strong>
            <span>{billingHealth?.metrics?.webhookProcessingCount ?? 0}</span>
            <em>events currently processing</em>
          </li>
          <li>
            <strong>Dead Letter Events</strong>
            <span>{billingHealth?.metrics?.deadLetterCount ?? 0}</span>
            <em>awaiting remediation</em>
          </li>
          <li>
            <strong>Metered Sync Failure Rate</strong>
            <span>{billingHealth?.metrics?.meteredFailureRatePercent ?? 0}%</span>
            <em>recent non-dry-run syncs</em>
          </li>
        </ul>
        {(billingHealth?.signals || []).length > 0 && (
          <ul className="activity-list" style={{ marginTop: '1rem' }}>
            {billingHealth.signals.slice(0, 5).map((signal) => (
              <li key={`${signal.key}-${signal.severity}`}>
                <strong>{signal.key}</strong>
                <span>{signal.severity}</span>
                <em>{signal.message}</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card recommendation-card">
        <h2>Metered Usage Sync</h2>
        <p>Push overage usage quantities to Stripe metered subscription items.</p>
        <div className="management-actions">
          <button
            className="action-btn management-btn"
            disabled={syncing}
            onClick={() => runMeteredSync(true)}
          >
            {syncing ? 'Running...' : 'Run Dry Sync'}
          </button>
          <button
            className="action-btn"
            disabled={syncing}
            onClick={() => runMeteredSync(false)}
          >
            {syncing ? 'Running...' : 'Run Live Sync'}
          </button>
        </div>
        {syncResult && (
          <ul className="activity-list" style={{ marginTop: '1rem' }}>
            <li>
              <strong>Scanned</strong>
              <span>{syncResult.scanned}</span>
              <em>subscriptions</em>
            </li>
            <li>
              <strong>Synced</strong>
              <span>{syncResult.synced}</span>
              <em>{syncResult.dryRun ? 'dry run' : 'live'}</em>
            </li>
            <li>
              <strong>Skipped</strong>
              <span>{syncResult.skipped}</span>
              <em>no overage or no metered item</em>
            </li>
            <li>
              <strong>Errors</strong>
              <span>{(syncResult.errors || []).length}</span>
              <em>check backend logs for details</em>
            </li>
          </ul>
        )}
      </section>

      <section className="card recommendation-card">
        <h2>Sync Run History</h2>
        {syncHistory.length === 0 ? (
          <p>No metered sync runs recorded yet.</p>
        ) : (
          <ul className="activity-list">
            {syncHistory.map((run) => (
              <li key={run.id}>
                <strong>{new Date(run.createdAt).toLocaleString()}</strong>
                <span>
                  {run.triggeredBy} · scanned {run.scanned}, synced {run.synced}, skipped {run.skipped}, errors {run.errorCount}
                </span>
                <em>{run.dryRun ? 'dry run' : 'live run'}</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card recommendation-card">
        <h2>Database Migrations</h2>
        <p>Track migration versions and recent execution logs.</p>
        <div className="management-actions">
          <button
            className="action-btn management-btn"
            disabled={migrating}
            onClick={runMigrationsNow}
          >
            {migrating ? 'Running...' : 'Run Migrations Now'}
          </button>
        </div>
        <ul className="activity-list" style={{ marginTop: '1rem' }}>
          <li>
            <strong>Applied Versions</strong>
            <span>{migrationStatus?.applied?.length || 0}</span>
            <em>tracked in schema_migrations</em>
          </li>
          <li>
            <strong>Recent Logs</strong>
            <span>{migrationStatus?.recentLogs?.length || 0}</span>
            <em>from schema_migration_logs</em>
          </li>
        </ul>
        {migrationStatus?.recentLogs?.length > 0 && (
          <ul className="activity-list" style={{ marginTop: '1rem' }}>
            {migrationStatus.recentLogs.slice(0, 5).map((row) => (
              <li key={row.id}>
                <strong>{new Date(row.executed_at).toLocaleString()}</strong>
                <span>{row.version} · {row.status}</span>
                <em>{row.message || 'no details'}</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card recommendation-card">
        <h2>Webhook Events</h2>
        <p>Recent Stripe webhook processing outcomes and retry state.</p>
        <div className="management-actions" style={{ marginBottom: '1rem' }}>
          <select
            value={webhookStatusFilter}
            onChange={(e) => applyWebhookFilter(e.target.value)}
            style={{ maxWidth: '240px' }}
          >
            <option value="all">All statuses</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
            <option value="dead_letter">Dead letter</option>
            <option value="processed">Processed</option>
          </select>
          <button
            className="action-btn management-btn"
            disabled={webhookActionInProgress === 'unstick'}
            onClick={unstickWebhookEvents}
          >
            {webhookActionInProgress === 'unstick' ? 'Running...' : 'Unstick Processing > 30m'}
          </button>
        </div>
        {webhookEvents.length === 0 ? (
          <p>No webhook events recorded yet.</p>
        ) : (
          <ul className="activity-list">
            {webhookEvents.slice(0, 10).map((event) => (
              <li key={event.eventId}>
                <strong>{new Date(event.receivedAt).toLocaleString()}</strong>
                <span>
                  {event.eventType || 'unknown'} · {event.status} · attempts {event.attemptCount}
                </span>
                <em>{event.lastError || 'processed cleanly'}</em>
                {event.status === 'failed' && (
                  <button
                    type="button"
                    className="action-btn"
                    disabled={webhookActionInProgress === `reprocess:${event.eventId}`}
                    onClick={() => reprocessWebhookEvent(event.eventId, false)}
                  >
                    {webhookActionInProgress === `reprocess:${event.eventId}` ? 'Retrying...' : 'Reprocess'}
                  </button>
                )}
                {event.status === 'dead_letter' && (
                  <button
                    type="button"
                    className="action-btn"
                    disabled={webhookActionInProgress === `reprocess:${event.eventId}`}
                    onClick={() => reprocessWebhookEvent(event.eventId, true)}
                  >
                    {webhookActionInProgress === `reprocess:${event.eventId}` ? 'Retrying...' : 'Force Reprocess'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
