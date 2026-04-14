import React from 'react';
import { Link } from 'react-router-dom';

const demoSteps = [
  {
    step: 'Step 1',
    title: 'Start with the overview',
    route: '/overview',
    cta: 'Open overview',
    outcome: 'Get a fast summary of system status, active issues, and recent activity.',
    talkTrack: 'Begin with the status cards and the recommended next step so users know where to focus first.'
  },
  {
    step: 'Step 2',
    title: 'Check asset visibility',
    route: '/devices',
    cta: 'Open assets',
    outcome: 'Verify each signal maps to a known device and location.',
    talkTrack: 'Use this page to confirm inventory coverage and quickly spot missing or inactive assets.'
  },
  {
    step: 'Step 3',
    title: 'Review platform health',
    route: '/system-health',
    cta: 'Open platform health',
    outcome: 'Confirm services are healthy, responsive, and receiving check-ins.',
    talkTrack: 'Use uptime and response metrics to validate that monitoring is working as expected.'
  },
  {
    step: 'Step 4',
    title: 'Visualize live coverage',
    route: '/threat-map',
    cta: 'Open coverage map',
    outcome: 'Spot concentrated activity, weak signals, and areas that need attention.',
    talkTrack: 'Use the map to identify hotspots and prioritize follow-up quickly.'
  },
  {
    step: 'Step 5',
    title: 'Open incident review',
    route: '/attack-tracing',
    cta: 'Open incident review',
    outcome: 'Trace events, estimated origin, and timeline details for incident analysis.',
    talkTrack: 'Use the timeline and linked activity to understand what happened and what to do next.'
  }
];

export default function DemoMode() {
  return (
    <div className="page demo-page">
      <section className="demo-hero card">
        <div>
          <span className="landing-kicker">Quick start guide</span>
          <h1>Follow this five-step path to learn the app quickly.</h1>
          <p>
            This guide helps new users learn the key pages in a practical order,
            from overview to detailed incident review.
          </p>
        </div>
        <div className="demo-hero-actions">
          <Link to="/overview" className="landing-button primary">Start now</Link>
          <Link to="/" className="landing-button secondary">Back to home</Link>
        </div>
      </section>

      <section className="demo-steps">
        {demoSteps.map((item) => (
          <article key={item.title} className="card demo-step-card">
            <span className="demo-step-label">{item.step}</span>
            <h2>{item.title}</h2>
            <p className="demo-step-outcome">{item.outcome}</p>
            <p className="demo-step-talk-track">{item.talkTrack}</p>
            <Link to={item.route} className="landing-button secondary demo-step-link">{item.cta}</Link>
          </article>
        ))}
      </section>
    </div>
  );
}