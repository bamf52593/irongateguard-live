import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../utils/analytics';

const valueBlocks = [
  {
    title: 'Cut alert noise by prioritizing what matters',
    body: 'IronGate highlights high-impact incidents first so operators stop wasting cycles on low-value noise.'
  },
  {
    title: 'Reduce mean-time-to-understand incidents',
    body: 'Attack timelines, asset context, and live health data are unified so teams can act faster with confidence.'
  },
  {
    title: 'Prove operational readiness to leadership',
    body: 'Track coverage, response trends, and platform reliability from one executive-ready command center.'
  }
];

const trustPoints = [
  'Live system telemetry and security events in one interface',
  'Built-in billing, usage governance, and operational controls',
  'Role-ready workflows for admins, operators, analysts, and viewers'
];

const faqs = [
  {
    q: 'How fast can a team get value?',
    a: 'Most teams get signal in the first hour by connecting assets and reviewing live events in the dashboard.'
  },
  {
    q: 'Do we need a long deployment project?',
    a: 'No. You can start with a focused rollout, validate outcomes, then scale coverage gradually.'
  },
  {
    q: 'Can we start before committing?',
    a: 'Yes. Create an account, validate fit with your workflow, then move to a paid plan when ready.'
  }
];

const testimonials = [
  {
    quote: 'IronGate gave our operations team one place to see risk, asset health, and action priority without bouncing between tools.',
    author: 'Director of Security Operations',
    company: 'Regional Infrastructure Provider'
  },
  {
    quote: 'The dashboard changed our incident handoff quality. Leadership now sees the same reality the response team sees.',
    author: 'Head of Platform Reliability',
    company: 'Industrial Systems Operator'
  },
  {
    quote: 'We moved from reactive triage to controlled response because the product makes context visible immediately.',
    author: 'Security Program Lead',
    company: 'Connected Manufacturing Group'
  }
];

const proofSignals = [
  'Persistent incident history and evidence trail',
  'Role-based response actions for operators and admins',
  'Fast rollout path from sign-up to live monitoring'
];

export default function Landing() {
  const [demoForm, setDemoForm] = useState({
    fullName: '',
    email: '',
    company: '',
    teamSize: '',
    message: ''
  });
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoStatus, setDemoStatus] = useState('');

  useEffect(() => {
    trackEvent('landing_view', { source: 'landing_page' }, { onceKey: 'landing_view' });
  }, []);

  const handleDemoSubmit = async (e) => {
    e.preventDefault();
    setDemoSubmitting(true);
    setDemoStatus('');

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:404/v1';
      const response = await fetch(`${apiUrl}/public/demo-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demoForm)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit demo request');
      }

      setDemoStatus(data.message || 'Demo request received.');
      setDemoForm({ fullName: '', email: '', company: '', teamSize: '', message: '' });
    } catch (error) {
      setDemoStatus(error.message || 'Unable to submit demo request');
    } finally {
      setDemoSubmitting(false);
    }
  };

  return (
    <div className="page landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="landing-kicker">Security operations that drive business confidence</span>
          <h1>Stop guessing during incidents. See risk, act faster, and prove control.</h1>
          <p>
            IronGate gives your team one operational view for device visibility, system health,
            threat signals, and response execution so every shift can detect and resolve issues faster.
          </p>
          <div className="landing-actions">
            <Link to="/signup" className="landing-button primary" onClick={() => trackEvent('start_free_clicked', { source: 'landing_hero' })}>Start Free Account</Link>
            <Link to="/plans" className="landing-button secondary" onClick={() => trackEvent('view_plans_clicked', { source: 'landing_hero' })}>View Plans</Link>
            <Link to="/login" className="landing-button tertiary" onClick={() => trackEvent('sign_in_clicked', { source: 'landing_hero' })}>Sign In</Link>
          </div>
          <div className="landing-trust-strip">
            {trustPoints.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </div>
        <div className="landing-proof card">
          <h2>Commercial impact</h2>
          <div className="landing-metrics">
            <div>
              <strong>Faster response</strong>
              <span>Operational context in one place so teams decide and act without context switching.</span>
            </div>
            <div>
              <strong>Lower risk</strong>
              <span>Continuous visibility across assets and platform health reduces blind spots.</span>
            </div>
            <div>
              <strong>Better accountability</strong>
              <span>Audit-ready actions and operational reporting improve stakeholder trust.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card landing-faq">
        <h2>Why teams trust IronGate</h2>
        <div className="landing-trust-strip">
          {proofSignals.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </section>

      <section className="landing-grid">
        {valueBlocks.map((item) => (
          <article key={item.title} className="card landing-feature-card">
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <section id="plans" className="card landing-pricing-preview">
        <h2>Start small, scale with confidence</h2>
        <div className="landing-outcome-list">
          <p><strong>Starter:</strong> Fast launch for lean teams needing immediate operational visibility.</p>
          <p><strong>Growth:</strong> Expanded capacity and analytics for maturing security operations.</p>
          <p><strong>Scale:</strong> Full enterprise-grade coverage with room for complex environments.</p>
        </div>
        <div className="landing-actions" style={{ marginTop: '20px' }}>
          <Link to="/signup" className="landing-button primary" onClick={() => trackEvent('start_free_clicked', { source: 'pricing_preview' })}>Start Free Account</Link>
          <Link to="/plans" className="landing-button secondary" onClick={() => trackEvent('view_plans_clicked', { source: 'pricing_preview' })}>Compare Plans</Link>
        </div>
      </section>

      <section className="card landing-faq">
        <h2>Questions buyers ask</h2>
        <div className="landing-faq-grid">
          {faqs.map((item) => (
            <article key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-grid">
        {testimonials.map((item) => (
          <article key={item.author} className="card landing-feature-card">
            <h2>“{item.quote}”</h2>
            <p>{item.author}</p>
            <p>{item.company}</p>
          </article>
        ))}
      </section>

      <section id="demo" className="card landing-demo-card">
        <h2>Book a demo</h2>
        <p>Not ready to self-serve? Send your details and we will follow up with rollout guidance and plan fit.</p>
        <form className="landing-demo-form" onSubmit={handleDemoSubmit}>
          <input
            type="text"
            placeholder="Full name"
            value={demoForm.fullName}
            onChange={(e) => setDemoForm((prev) => ({ ...prev, fullName: e.target.value }))}
            required
            disabled={demoSubmitting}
          />
          <input
            type="email"
            placeholder="Work email"
            value={demoForm.email}
            onChange={(e) => setDemoForm((prev) => ({ ...prev, email: e.target.value }))}
            required
            disabled={demoSubmitting}
          />
          <input
            type="text"
            placeholder="Company"
            value={demoForm.company}
            onChange={(e) => setDemoForm((prev) => ({ ...prev, company: e.target.value }))}
            required
            disabled={demoSubmitting}
          />
          <input
            type="text"
            placeholder="Team size"
            value={demoForm.teamSize}
            onChange={(e) => setDemoForm((prev) => ({ ...prev, teamSize: e.target.value }))}
            disabled={demoSubmitting}
          />
          <textarea
            placeholder="What are you trying to improve?"
            value={demoForm.message}
            onChange={(e) => setDemoForm((prev) => ({ ...prev, message: e.target.value }))}
            rows="4"
            disabled={demoSubmitting}
          />
          <div className="landing-actions">
            <button type="submit" className="landing-button primary" disabled={demoSubmitting}>
              {demoSubmitting ? 'Submitting...' : 'Request Demo'}
            </button>
          </div>
          {demoStatus && <p className="landing-demo-status">{demoStatus}</p>}
        </form>
      </section>
    </div>
  );
}