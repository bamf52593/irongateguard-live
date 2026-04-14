import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { trackEvent } from '../utils/analytics';
import '../styles/billing.css';

const BillingPage = () => {
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [enforcement, setEnforcement] = useState(null);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/v1';
  const resolvedPlanDetails = subscription?.planDetails || {
    name: 'Unknown Plan',
    devices: 0,
    users: 0,
    features: []
  };

  useEffect(() => {
    trackEvent('billing_view', { source: 'billing_page' }, { onceKey: 'billing_view' });
    loadBillingData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');

    if (location.pathname === '/billing/success' && sessionId) {
      confirmCheckoutCompletion(sessionId);
      return;
    }

    if (location.pathname === '/billing/cancel') {
      setInfoMessage('Checkout was canceled. You can try again any time.');
      navigate('/billing', { replace: true });
    }
  }, [location.pathname, location.search]);

  const confirmCheckoutCompletion = async (sessionId) => {
    try {
      setActionInProgress('confirm-checkout');
      setInfoMessage('Finalizing your subscription...');
      setError(null);

      await axios.post(
        `${API_URL}/billing/checkout/confirm`,
        { sessionId },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );

      await loadBillingData(true);
      setInfoMessage('Payment confirmed. Your subscription is active.');
      window.dispatchEvent(new Event('billing-status-updated'));
      navigate('/billing', { replace: true });
    } catch (err) {
      console.error('Error confirming checkout:', err);
      const message = err?.response?.data?.error || 'We could not confirm your payment yet. Please refresh in a moment.';
      setError(message);
      navigate('/billing', { replace: true });
    } finally {
      setActionInProgress(null);
    }
  };

  const loadBillingData = async (background = false) => {
    try {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [plansRes, subscriptionRes, statusRes, enforcementRes, invoicesRes] = await Promise.all([
        axios.get(`${API_URL}/billing/plans`),
        axios.get(`${API_URL}/billing/subscription`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }),
        axios.get(`${API_URL}/billing/status`),
        axios.get(`${API_URL}/billing/enforcement`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }).catch(() => ({ data: { enforcement: null } })),
        axios.get(`${API_URL}/billing/invoices`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }).catch(() => ({ data: { invoices: [] } }))
      ]);

      setPlans(plansRes.data.plans);
      setSubscription(subscriptionRes.data.subscription);
      setUsage(subscriptionRes.data.usage);
      setEnforcement(enforcementRes.data?.enforcement || null);
      setInvoices(invoicesRes.data?.invoices || []);
      setStripeConfigured(Boolean(statusRes?.data?.stripeConfigured));
      
      // Calculate trial days remaining
      if (subscriptionRes.data.subscription?.trial_ends_at) {
        const trialEnd = new Date(subscriptionRes.data.subscription.trial_ends_at);
        const today = new Date();
        const daysLeft = Math.ceil((trialEnd - today) / (1000 * 60 * 60 * 24));
        setTrialDaysRemaining(daysLeft > 0 ? daysLeft : 0);
      } else {
        setTrialDaysRemaining(null);
      }
      
      window.dispatchEvent(new Event('billing-status-updated'));
      setError(null);
    } catch (err) {
      console.error('Error loading billing data:', err);
      if (err?.response?.status === 401) {
        setError('Session expired. Please sign in again.');
      } else {
        setError('Failed to load billing information. Check backend connectivity and try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleStartTrial = async (planKey) => {
    try {
      setActionInProgress(`trial:${planKey}`);
      setError(null);

      const response = await axios.post(
        `${API_URL}/billing/trial`,
        { planKey, couponCode: appliedCoupon?.code || null },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );

      if (response.data.success) {
        trackEvent('trial_started', { source: 'billing_page', planKey });
        const trialNote = appliedCoupon?.code === 'TRIAL30' ? '30 days free access.' : '14 days free access.';
        setInfoMessage(`🎉 Your ${planKey} trial has started! ${trialNote}`);
        setAppliedCoupon(null);
        await loadBillingData(true);
        window.dispatchEvent(new Event('billing-status-updated'));
      }
    } catch (err) {
      console.error('Error starting trial:', err);
      const message = err?.response?.data?.error || 'Failed to start trial';

      // Fallback path: if trial price IDs are missing in Stripe, proceed with checkout.
      if (String(message).toLowerCase().includes('no such price')) {
        setInfoMessage('Trial setup is unavailable for this Stripe account. Redirecting to checkout...');
        await handleCheckout(planKey);
        return;
      }

      setError(message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCheckout = async (planKey) => {
    try {
      setActionInProgress(`checkout:${planKey}`);
      setError(null);
      const res = await axios.post(`${API_URL}/billing/checkout`, {
        orgName: 'My Organization',
        planKey: planKey,
        couponCode: appliedCoupon?.code || null
      }, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (res.data.url) {
        trackEvent('checkout_started', { source: 'billing_page', planKey });
        window.location.href = res.data.url;
      }
    } catch (err) {
      console.error('Error creating checkout session:', err);
      const message = err?.response?.data?.error || 'Failed to initiate checkout';
      setError(message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleUpgrade = async (newPlan) => {
    try {
      setActionInProgress(`upgrade:${newPlan}`);
      setError(null);
      await axios.post(
        `${API_URL}/billing/upgrade`,
        { planKey: newPlan },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );
      await loadBillingData(true);
    } catch (err) {
      console.error('Error upgrading subscription:', err);
      const message = err?.response?.data?.error || 'Failed to upgrade subscription';
      setError(message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancel = async () => {
    if (window.confirm('Are you sure you want to cancel your subscription?')) {
      try {
        setActionInProgress('cancel');
        setError(null);
        await axios.post(`${API_URL}/billing/cancel`, {}, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        });
        await loadBillingData(true);
      } catch (err) {
        console.error('Error canceling subscription:', err);
        const message = err?.response?.data?.error || 'Failed to cancel subscription';
        setError(message);
      } finally {
        setActionInProgress(null);
      }
    }
  };

  const handleOpenBillingPortal = async () => {
    try {
      setActionInProgress('portal');
      setError(null);

      const response = await axios.post(
        `${API_URL}/billing/portal`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );

      if (response.data.url) {
        // Redirect to Stripe billing portal
        window.location.href = response.data.url;
      } else {
        setError('Could not open billing portal. Please try again.');
      }
    } catch (err) {
      console.error('Error opening billing portal:', err);
      const message = err?.response?.data?.error || 'Failed to open billing portal';
      setError(message);
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return <div className="billing-loading">Loading billing information...</div>;
  }

  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim()) {
      setError('Please enter a coupon code');
      return;
    }

    try {
      setActionInProgress('apply-coupon');
      setError(null);

      const response = await axios.post(
        `${API_URL}/billing/coupon/validate`,
        { couponCode: couponCode.toUpperCase() },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );

      if (response.data.success) {
        setAppliedCoupon(response.data.coupon);
        const remainingInfo = response.data.coupon.remainingUses === null
          ? 'Unlimited uses remaining.'
          : `${response.data.coupon.remainingUses} uses remaining.`;
        setInfoMessage(
          `✅ Coupon applied! ${response.data.coupon.name} (${response.data.coupon.percentOff}% off). ${remainingInfo}`
        );
        setCouponCode('');
      }
    } catch (err) {
      console.error('Error applying coupon:', err);
      const message = err?.response?.data?.error || 'Invalid or expired coupon code';
      setError(message);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="billing-page">
      <div className="billing-header">
        <h1>Billing & Subscription</h1>
        <p>Manage your IronGate subscription</p>
      </div>

      {infoMessage && <div className="billing-inline-status">{infoMessage}</div>}

      {error && (
        <div className="billing-error-row">
          <div className="billing-error">{error}</div>
          <button className="retry-btn" onClick={() => loadBillingData(true)} disabled={refreshing}>
            {refreshing ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      {appliedCoupon && (
        <div className="coupon-discount-banner">
          🎉 <strong>{appliedCoupon.name}</strong> applied - Save {appliedCoupon.percentOff}% on any plan!
        </div>
      )}

      {enforcement?.status === 'over_limit' && (
        <div className="billing-warning">
          <strong>⚠️ Plan Limit Exceeded:</strong> {enforcement.message}
          <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Projected monthly add-on charges: <strong>{enforcement.projectedOverageMonthly}</strong>
          </div>
        </div>
      )}

      {!stripeConfigured && (
        <div className="billing-error">
          Payments are not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PUBLIC_KEY in .env, then restart backend.
        </div>
      )}

      {refreshing && <div className="billing-inline-status">Refreshing billing data...</div>}

      {enforcement?.requiresUpgrade && (
        <div className="billing-upgrade-warning" role="alert">
          Usage is above your current plan limits.
          {enforcement?.suggestedPlan ? ` Recommended plan: ${enforcement.suggestedPlan}.` : ''}
        </div>
      )}

      {/* Management Options */}
      {subscription && subscription.status !== 'free' && (
        <div className="billing-management">
          <h2>Manage Subscription</h2>
          <div className="management-actions">
            <button
              className="action-btn management-btn"
              onClick={handleOpenBillingPortal}
              disabled={actionInProgress === 'portal'}
            >
              {actionInProgress === 'portal' ? 'Opening Portal...' : '📊 Billing Portal'}
            </button>
            <p className="management-help">
              Manage payment methods, download invoices, view subscription details, and more.
            </p>
          </div>
        </div>
      )}

      {/* Coupon Code Section */}
      {(!subscription || subscription.status === 'free') && !appliedCoupon && (
        <div className="coupon-section">
          <h2>Have a Promo Code?</h2>
          <form onSubmit={handleApplyCoupon} className="coupon-form">
            <div className="coupon-input-group">
              <input
                type="text"
                placeholder="Enter coupon code (e.g., LAUNCH50)"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                maxLength="20"
                disabled={actionInProgress === 'apply-coupon'}
                className="coupon-input"
              />
              <button
                type="submit"
                className="action-btn coupon-btn"
                disabled={actionInProgress === 'apply-coupon' || !couponCode.trim()}
              >
                {actionInProgress === 'apply-coupon' ? 'Validating...' : 'Apply Coupon'}
              </button>
            </div>
            <p className="coupon-hint">e.g., LAUNCH50 for 50% off, TRIAL30 for 30 days free</p>
          </form>
        </div>
      )}

      {/* Current Subscription Status */}
      {subscription && (
        <div className="billing-current">
          <div className="current-status">
            <h2>Current Plan</h2>
            <div className="status-card">
              <div className="plan-name">{resolvedPlanDetails.name}</div>
              <div className="plan-details">
                <div className="detail">
                  <span className="label">Devices:</span>
                  <span className="value">{resolvedPlanDetails.devices === -1 ? 'Unlimited' : resolvedPlanDetails.devices}</span>
                </div>
                <div className="detail">
                  <span className="label">Users:</span>
                  <span className="value">{resolvedPlanDetails.users}</span>
                </div>
                <div className="detail">
                  <span className="label">Status:</span>
                  <span className={`status-badge status-${subscription.status}`}>{subscription.status}</span>
                </div>
              </div>
              {subscription.currentPeriodEnd && (
                <div className="period-info">
                  Renews on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </div>
              )}
              {subscription.status !== 'free' && (
                <button className="cancel-btn" onClick={handleCancel} disabled={actionInProgress !== null}>
                  {actionInProgress === 'cancel' ? 'Canceling...' : 'Cancel Subscription'}
                </button>
              )}
            </div>
          </div>

          {/* Usage Metrics */}
          {usage && (
            <div className="usage-metrics">
              <h3>Current Usage</h3>
              <div className="metrics-grid">
                <div className="metric">
                  <span className="metric-label">Devices</span>
                  <span className="metric-value">
                    {usage.devices}
                    {usage?.limits?.devices === -1 ? ' / Unlimited' : ` / ${usage?.limits?.devices ?? '-'}`}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Users</span>
                  <span className="metric-value">
                    {usage.users}
                    {usage?.limits?.users === -1 ? ' / Unlimited' : ` / ${usage?.limits?.users ?? '-'}`}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Events (30d)</span>
                  <span className="metric-value">
                    {usage.events}
                    {usage?.limits?.events === -1 ? ' / Unlimited' : ` / ${usage?.limits?.events ?? '-'}`}
                  </span>
                </div>
              </div>

              {usage?.overages && (
                <>
                  <div className="period-info" style={{ marginTop: '0.75rem' }}>
                    Overage: +{usage.overages.devices || 0} devices, +{usage.overages.users || 0} users, +{usage.overages.events || 0} events.
                    Projected monthly add-on charges: <strong>{usage.projectedOverageMonthly || '$0.00'}</strong>
                  </div>
                  <div className="overage-breakdown">
                    <span>Devices: ${(((usage?.breakdownCents?.devices || 0) / 100).toFixed(2))}</span>
                    <span>Users: ${(((usage?.breakdownCents?.users || 0) / 100).toFixed(2))}</span>
                    <span>Events: ${(((usage?.breakdownCents?.events || 0) / 100).toFixed(2))}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Plans Selection */}
      <div className="billing-plans">
        <h2>Choose Your Plan</h2>
        <div className="plans-grid">
          {plans.map((plan) => (
            <div key={plan.key} className={`plan-card ${subscription?.plan === plan.key ? 'active' : ''}`}>
              <div className="plan-header">
                <h3>{plan.name}</h3>
                <div className="plan-price">{plan.amount}</div>
                <div className="plan-period">per month</div>
              </div>

              <div className="plan-features">
                <div className="feature">
                  <span className="icon">📱</span>
                  <span>{plan.devices === -1 ? 'Unlimited' : plan.devices} Devices</span>
                </div>
                <div className="feature">
                  <span className="icon">👥</span>
                  <span>{plan.users} Users</span>
                </div>
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="feature">
                    <span className="icon">✓</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="plan-action">
                {subscription?.plan === plan.key ? (
                  <div>
                    <button className="action-btn active" disabled>
                      Current Plan
                    </button>
                    {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
                      <p className="trial-notice">Trial ends in {trialDaysRemaining} days</p>
                    )}
                  </div>
                ) : subscription?.status === 'free' ? (
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <button
                      className="action-btn"
                      onClick={() => handleCheckout(plan.key)}
                      disabled={!stripeConfigured || actionInProgress !== null}
                    >
                      {actionInProgress === `checkout:${plan.key}` ? 'Redirecting...' : 'Pay Now'}
                    </button>
                    <button
                      className="action-btn trial-btn"
                      onClick={() => handleStartTrial(plan.key)}
                      disabled={!stripeConfigured || actionInProgress !== null}
                    >
                      {actionInProgress === `trial:${plan.key}` ? 'Starting Trial...' : '🎁 Start Free Trial'}
                    </button>
                  </div>
                ) : (
                  <button
                    className="action-btn"
                    onClick={() => handleUpgrade(plan.key)}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === `upgrade:${plan.key}` ? 'Upgrading...' : 'Upgrade Now'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Billing History */}
      <div className="billing-history">
        <h2>Billing History</h2>
        {invoices.length === 0 ? (
          <p style={{ color: '#b6c7d9' }}>No invoices yet. They will appear here after your first payment.</p>
        ) : (
          <div className="invoices-table">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.number || invoice.id.slice(-6)}</td>
                    <td>{new Date(invoice.date).toLocaleDateString()}</td>
                    <td>${(invoice.amount / 100).toFixed(2)}</td>
                    <td>
                      <span className={`status-badge status-${invoice.status}`}>
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </td>
                    <td>
                      {invoice.pdfUrl && (
                        <a
                          href={invoice.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="invoice-link"
                        >
                          Download PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingPage;
