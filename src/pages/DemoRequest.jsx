import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../utils/analytics';

export default function DemoRequest() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const [form, setForm] = useState({
    fullName: user?.full_name || '',
    email: user?.email || '',
    company: '',
    teamSize: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    trackEvent('demo_request_view', { source: 'demo_request_page' }, { onceKey: 'demo_request_view' });
  }, []);

  const onChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus('');

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:404/v1';
      const response = await fetch(`${apiUrl}/public/demo-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit demo request');
      }

      setStatus(data.message || 'Demo request received.');
      setForm((prev) => ({ ...prev, company: '', teamSize: '', message: '' }));
    } catch (error) {
      setStatus(error.message || 'Unable to submit demo request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page landing-page">
      <section className="card landing-demo-card">
        <span className="landing-kicker">Book a Demo</span>
        <h1>Talk to a product specialist.</h1>
        <p>
          Share your environment, team size, and goals. We will follow up with plan guidance and rollout recommendations.
        </p>
        <form className="landing-demo-form" onSubmit={onSubmit}>
          <input type="text" placeholder="Full name" value={form.fullName} onChange={onChange('fullName')} required disabled={submitting} />
          <input type="email" placeholder="Work email" value={form.email} onChange={onChange('email')} required disabled={submitting} />
          <input type="text" placeholder="Company" value={form.company} onChange={onChange('company')} required disabled={submitting} />
          <input type="text" placeholder="Team size" value={form.teamSize} onChange={onChange('teamSize')} disabled={submitting} />
          <textarea placeholder="What are you trying to improve?" value={form.message} onChange={onChange('message')} rows="5" disabled={submitting} />
          <div className="landing-actions">
            <button type="submit" className="landing-button primary" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Request Demo'}
            </button>
            <Link to="/plans" className="landing-button secondary">Compare Plans</Link>
          </div>
          {status && <p className="landing-demo-status">{status}</p>}
        </form>
      </section>
    </div>
  );
}
