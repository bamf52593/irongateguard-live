import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../utils/analytics';

const planFit = {
  starter: 'Best for lean security teams proving fast visibility and response value.',
  growth: 'Best for scaling operations that need more users, assets, and analytics depth.',
  scale: 'Best for enterprise environments needing broad coverage and executive-level readiness.'
};

export default function ComparePlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAuthenticated = !!localStorage.getItem('authToken');

  useEffect(() => {
    trackEvent('plans_view', { source: 'compare_plans' }, { onceKey: 'plans_view' });

    const loadPlans = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/v1';
        const response = await fetch(`${apiUrl}/billing/plans`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load plans');
        }

        setPlans(data.plans || []);
      } catch (err) {
        setError(err.message || 'Unable to load plans');
      } finally {
        setLoading(false);
      }
    };

    loadPlans();
  }, []);

  return (
    <div className="page landing-page">
      <section className="card landing-pricing-preview">
        <span className="landing-kicker">Pricing</span>
        <h1>Compare plans and choose the right starting point.</h1>
        <p>
          Start with the level of coverage and operational depth your team needs now, then expand as your environment grows.
        </p>
        <div className="landing-actions">
          <Link to={isAuthenticated ? '/billing' : '/signup'} className="landing-button primary" onClick={() => trackEvent('choose_plan_clicked', { source: 'plans_header', target: isAuthenticated ? 'billing' : 'signup' })}>{isAuthenticated ? 'Continue to Billing' : 'Start Free Account'}</Link>
          <Link to="/login" className="landing-button secondary">Sign In</Link>
        </div>
      </section>

      <section className="landing-grid">
        {loading && <div className="card"><p>Loading plans...</p></div>}
        {error && <div className="card"><p className="error">{error}</p></div>}
        {!loading && !error && plans.map((plan) => (
          <article key={plan.key} className="card landing-feature-card">
            <h2>{plan.name}</h2>
            <p style={{ fontSize: '28px', color: '#f7dd9b', marginBottom: '12px' }}>{plan.amount}<span style={{ fontSize: '14px', color: '#d5dce6' }}> / month</span></p>
            <p>{plan.devices === -1 ? 'Unlimited' : plan.devices} devices</p>
            <p>{plan.users} users</p>
            <p>{planFit[plan.key] || 'Flexible plan for growing security operations.'}</p>
            <div className="landing-trust-strip" style={{ marginTop: '16px' }}>
              {(plan.features || []).map((feature) => (
                <p key={feature}>{feature}</p>
              ))}
            </div>
            <div className="landing-actions" style={{ marginTop: '20px' }}>
              <Link to={isAuthenticated ? '/billing' : '/signup'} className="landing-button primary" onClick={() => trackEvent('choose_plan_clicked', { source: 'plan_card', planKey: plan.key })}>Choose {plan.name}</Link>
            </div>
          </article>
        ))}
      </section>

      {!loading && !error && plans.length > 0 && (
        <section className="card landing-faq">
          <h2>Feature comparison</h2>
          <div className="plans-matrix">
            <div className="plans-matrix-row plans-matrix-header">
              <div>Capability</div>
              {plans.map((plan) => (
                <div key={plan.key}>{plan.name}</div>
              ))}
            </div>
            <div className="plans-matrix-row">
              <div>Devices included</div>
              {plans.map((plan) => (
                <div key={`${plan.key}-devices`}>{plan.devices === -1 ? 'Unlimited' : plan.devices}</div>
              ))}
            </div>
            <div className="plans-matrix-row">
              <div>Users included</div>
              {plans.map((plan) => (
                <div key={`${plan.key}-users`}>{plan.users}</div>
              ))}
            </div>
            <div className="plans-matrix-row">
              <div>Pricing</div>
              {plans.map((plan) => (
                <div key={`${plan.key}-price`}>{plan.amount}</div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
