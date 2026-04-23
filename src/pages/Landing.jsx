import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../utils/analytics';

const valueBlocks = [
  {
    title: 'Know immediately when something is wrong',
    body: 'irongateguardguard shows you the most important alerts first — plain and simple — so you can act without needing a security background.'
  },
  {
    title: 'See everything in one place',
    body: 'All your devices, threats, and status checks in a single screen. No jumping between tools or spreadsheets.'
  },
  {
    title: 'Grows with your business',
    body: 'Start with a small setup and expand as you hire, add devices, or bring on a dedicated IT team. Nothing to reinstall.'
  }
];

const trustPoints = [
  'Live system telemetry and security events in one interface',
  'Built-in billing, usage governance, and operational controls',
  'Role-ready workflows for admins, operators, analysts, and viewers'
];

const faqs = [
  {
    q: 'Do I need to be technical to use this?',
    a: 'No. irongateguardguard is built for business owners and managers too. The dashboard uses plain language, and setup takes minutes — no IT background needed.'
  },
  {
    q: 'How fast can I get started?',
    a: 'Most people are up and monitoring within the same day they sign up. Connect your devices, pick a plan, and the dashboard is live.'
  },
  {
    q: 'What if my business grows?',
    a: 'Just upgrade your plan. Your data, devices, and settings stay exactly as they are. No migration, no reinstall.'
  },
  {
    q: 'Do we need a long IT project?',
    a: 'No. Start small with one location or team, see the value, then expand when you\'re ready.'
  }
];

const testimonials = [
  {
    quote: 'I\'m a business owner, not an IT person. irongateguardguard was the first security tool I actually understood on day one.',
    author: 'Owner',
    company: 'Local Retail Chain'
  },
  {
    quote: 'We have one IT person for 40 staff. irongateguardguard lets him watch everything without burning out on manual checks.',
    author: 'Operations Manager',
    company: 'Regional Service Company'
  },
  {
    quote: 'Our security team uses it for deep analysis. Our execs use it to see if we\'re protected. Same tool, works for both.',
    author: 'Head of IT',
    company: 'Mid-size Manufacturing Company'
  }
];

const proofSignals = [
  'Works for solo owners, growing teams, and enterprise IT departments',
  'Plain-English alerts — no security degree required',
  'Up and running in minutes, not months'
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
      const apiUrl = import.meta.env.VITE_API_URL || '/v1';
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
          <span className="landing-kicker">Protects businesses of every size — no IT background needed</span>
          <h1>Protect Your Business. Grow With Confidence.</h1>
          <h2 style={{ fontWeight: 400, color: '#f7dd9b', marginTop: '0.5em' }}>All-in-one security and operations for every business size.</h2>
          <p>
            irongateguardguard gives you instant visibility, actionable alerts, and peace of mind—no IT degree required. Start free, upgrade anytime, and scale as you grow.
          </p>
          <div className="landing-actions">
            <Link to="/signup" className="landing-button primary" style={{ fontSize: '1.2em', padding: '1em 2em' }} onClick={() => trackEvent('start_free_clicked', { source: 'landing_hero' })}>Start Free</Link>
            <Link to="/plans" className="landing-button secondary" style={{ fontSize: '1.1em' }} onClick={() => trackEvent('view_plans_clicked', { source: 'landing_hero' })}>See Pricing</Link>
            <Link to="/login" className="landing-button tertiary" style={{ fontSize: '1.1em' }} onClick={() => trackEvent('sign_in_clicked', { source: 'landing_hero' })}>Sign In</Link>
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
        <h2>Built for every business, every IT level</h2>
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
        <h2>Pick the plan that fits your size — upgrade anytime</h2>
        <div className="landing-outcome-list">
          <p><strong>Starter:</strong> Fast launch for lean teams needing immediate operational visibility.</p>
          <p><strong>Starter:</strong> Perfect for small businesses and solo owners. Simple setup, essential protection.</p>
          <p><strong>Growth:</strong> For growing businesses with a small IT team. More devices, deeper insights.</p>
          <p><strong>Scale:</strong> For large organizations and enterprise IT teams. Full coverage, advanced controls.</p>
        </div>
        <div className="landing-actions" style={{ marginTop: '20px' }}>
          <Link to="/signup" className="landing-button primary" onClick={() => trackEvent('start_free_clicked', { source: 'pricing_preview' })}>Start Free Account</Link>
          <Link to="/plans" className="landing-button secondary" onClick={() => trackEvent('view_plans_clicked', { source: 'pricing_preview' })}>Compare Plans</Link>
        </div>
      </section>

      <section className="card landing-faq">
        <h2>Common questions</h2>
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
