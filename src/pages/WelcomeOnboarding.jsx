import React from 'react';
import { Link } from 'react-router-dom';

const steps = [
  {
    title: 'Choose your starting plan',
    body: 'Compare Starter, Growth, and Scale based on team size, asset volume, and reporting depth.',
    cta: 'Compare Plans',
    to: '/plans'
  },
  {
    title: 'Talk to a product specialist',
    body: 'If you need rollout guidance or buyer support, send a demo request and we will help shape the deployment plan.',
    cta: 'Book a Demo',
    to: '/demo-request'
  },
  {
    title: 'Explore the product flow',
    body: 'See how billing, visibility, and operations work together before your team expands usage.',
    cta: 'Open Billing',
    to: '/billing'
  }
];

export default function WelcomeOnboarding() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  return (
    <div className="page landing-page">
      <section className="card landing-pricing-preview">
        <span className="landing-kicker">Welcome</span>
        <h1>{user?.full_name ? `Welcome, ${user.full_name}.` : 'Welcome to IronGate.'}</h1>
        <p>
          Your account is ready. The fastest path to value is to pick the right plan, understand rollout fit,
          and move into your first operational workflow.
        </p>
      </section>

      <section className="landing-grid">
        {steps.map((step) => (
          <article key={step.title} className="card landing-feature-card">
            <h2>{step.title}</h2>
            <p>{step.body}</p>
            <div className="landing-actions">
              <Link to={step.to} className="landing-button primary">{step.cta}</Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
