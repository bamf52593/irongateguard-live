import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../utils/analytics';

const planFit = {
  starter: 'Perfect for small businesses and solo owners. Simple to set up, covers the essentials, no IT team required.',
  growth: 'Great for growing businesses with a small IT team. More devices, more users, deeper visibility.',
  scale: 'Built for large organizations and enterprise IT. Full coverage, advanced controls, unlimited devices.'
};

const quiz = [
  { q: 'How many devices do you need to monitor?', answers: [{ label: 'Under 25', plan: 'starter' }, { label: '25 - 100', plan: 'growth' }, { label: 'Over 100', plan: 'scale' }] },
  { q: 'How would you describe your team?', answers: [{ label: 'Just me or no IT staff', plan: 'starter' }, { label: 'Small IT team (1–5 people)', plan: 'growth' }, { label: 'Dedicated security/IT department', plan: 'scale' }] },
  { q: 'What\'s your main goal?', answers: [{ label: 'Basic protection and peace of mind', plan: 'starter' }, { label: 'Visibility and faster incident response', plan: 'growth' }, { label: 'Full enterprise security operations', plan: 'scale' }] }
];

export default function ComparePlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAuthenticated = !!localStorage.getItem('authToken');
  const [quizAnswers, setQuizAnswers] = useState({});
  const [showQuiz, setShowQuiz] = useState(false);

  const quizResult = Object.values(quizAnswers).length === quiz.length
    ? (() => {
        const counts = {};
        Object.values(quizAnswers).forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
        const result = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        trackEvent('plan_quiz_completed', { result, answers: quizAnswers });
        return result;
      })()
    : null;

  useEffect(() => {
    trackEvent('plans_view', { source: 'compare_plans' }, { onceKey: 'plans_view' });

    const loadPlans = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '/v1';
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
          Not sure which plan fits? Answer 3 quick questions and we'll point you to the right one.
        </p>
        <div className="landing-actions">
          <button className="landing-button secondary" onClick={() => setShowQuiz((v) => !v)}>
            {showQuiz ? 'Hide recommender' : 'Help me choose →'}
          </button>
        </div>
        {showQuiz && (
          <div style={{ marginTop: '24px' }}>
            {quiz.map((item, i) => (
              <div key={i} style={{ marginBottom: '20px' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>{item.q}</p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {item.answers.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => setQuizAnswers((prev) => ({ ...prev, [i]: a.plan }))}
                      className={`landing-button ${quizAnswers[i] === a.plan ? 'primary' : 'secondary'}`}
                      style={{ fontSize: '0.85rem' }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {quizResult && (
              <div className="card" style={{ marginTop: '16px', borderColor: '#00ffff' }}>
                <p style={{ color: '#00ffff', fontWeight: 'bold' }}>Recommended: {quizResult.charAt(0).toUpperCase() + quizResult.slice(1)}</p>
                <p style={{ marginTop: '4px', opacity: 0.8 }}>{planFit[quizResult]}</p>
              </div>
            )}
          </div>
        )}
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
              <Link to={isAuthenticated ? '/billing' : '/signup'} className="landing-button primary" onClick={() => trackEvent('choose_plan_clicked', { source: 'plan_card', planKey: plan.key, isAuthenticated })}>Choose {plan.name}</Link>
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
