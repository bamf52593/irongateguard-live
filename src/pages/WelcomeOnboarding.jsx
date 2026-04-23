import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const paths = {
  beginner: {
    label: 'I\'m new to this',
    description: 'No IT background. I just want to know my business is protected.',
    steps: [
      {
        title: 'Start with the dashboard',
        body: 'The dashboard shows you everything important in plain English. Green means good. Red means action needed.',
        cta: 'Go to Dashboard',
        to: '/dashboard'
      },
      {
        title: 'Pick a plan that fits your size',
        body: 'Not sure which plan? The Starter plan covers most small businesses. You can always upgrade later.',
        cta: 'See Plans',
        to: '/plans'
      },
      {
        title: 'Book a walkthrough',
        body: 'Want someone to explain it in plain terms? Book a free demo and we\'ll walk you through everything.',
        cta: 'Book a Demo',
        to: '/demo-request'
      }
    ]
  },
  intermediate: {
    label: 'I have some IT experience',
    description: 'I manage devices and basic security but I\'m not a specialist.',
    steps: [
      {
        title: 'Connect your devices',
        body: 'Head to Devices to register your hardware. irongateguardguard will start monitoring them immediately.',
        cta: 'Manage Devices',
        to: '/devices'
      },
      {
        title: 'Review live events',
        body: 'The Event Logs page shows everything happening across your network. Filter by severity to focus on what matters.',
        cta: 'View Events',
        to: '/events'
      },
      {
        title: 'Set up your plan and billing',
        body: 'Choose the plan that matches your device count and team size. Billing is self-service — no contracts.',
        cta: 'Open Billing',
        to: '/billing'
      }
    ]
  },
  expert: {
    label: 'I\'m an IT professional',
    description: 'I run security operations and need full visibility and controls.',
    steps: [
      {
        title: 'Review system health',
        body: 'Check platform availability, ingestion status, and sentinel health from the System Health page.',
        cta: 'System Health',
        to: '/health'
      },
      {
        title: 'Configure sentinels and API keys',
        body: 'Set up your sentinels for automated monitoring and generate API keys for integrations.',
        cta: 'Manage Sentinels',
        to: '/sentinels'
      },
      {
        title: 'Explore billing and usage controls',
        body: 'Review your usage, overage thresholds, and plan limits. Scale plan is recommended for large environments.',
        cta: 'Open Billing',
        to: '/billing'
      }
    ]
  }
};

export default function WelcomeOnboarding() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const [selected, setSelected] = useState(null);
  const activePath = selected ? paths[selected] : null;

  return (
    <div className="page landing-page">
      <section className="card landing-pricing-preview">
        <span className="landing-kicker">Welcome</span>
        <h1>{user?.full_name ? `Welcome, ${user.full_name}.` : 'Welcome to irongateguardguard.'}</h1>
        <p>Your account is ready. Tell us where you're starting from and we'll point you in the right direction.</p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '20px' }}>
          {Object.entries(paths).map(([key, path]) => (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`landing-button ${selected === key ? 'primary' : 'secondary'}`}
            >
              {path.label}
            </button>
          ))}
        </div>
        {activePath && (
          <p style={{ marginTop: '12px', opacity: 0.7, fontSize: '0.9rem' }}>{activePath.description}</p>
        )}
      </section>

      {activePath && (
        <section className="landing-grid">
          {activePath.steps.map((step) => (
            <article key={step.title} className="card landing-feature-card">
              <h2>{step.title}</h2>
              <p>{step.body}</p>
              <div className="landing-actions">
                <Link to={step.to} className="landing-button primary">{step.cta}</Link>
              </div>
            </article>
          ))}
        </section>
      )}

      {!activePath && (
        <section className="card landing-faq" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ opacity: 0.6 }}>Select your experience level above to see your recommended starting steps.</p>
        </section>
      )}
    </div>
  );
}
