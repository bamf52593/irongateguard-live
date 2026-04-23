import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notify } from '../utils/toast';
import { trackEvent } from '../utils/analytics';
import DownloadButton from '../components/DownloadButton';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    trackEvent('signup_view', { source: 'signup_page' }, { onceKey: 'signup_view' });
  }, []);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    trackEvent('signup_submitted', { email });

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/v1';
      const response = await fetch(`${apiUrl}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName
        })
      });

      const data = await response.json();

      if (!response.ok) {
        trackEvent('signup_failed', { email, error: data.error });
        throw new Error(data.error || 'Signup failed');
      }

      trackEvent('signup_success', { email, userId: data.user?.id });
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.dispatchEvent(new Event('auth-login-success'));
      notify('Account created. Welcome to irongateguard.', 'success');
      navigate('/welcome');
    } catch (err) {
      setError(err.message || 'Unable to create account');
      notify(err.message || 'Signup failed', 'warning');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Start Free – No Credit Card Required</h1>
            <h2 style={{ fontWeight: 400, color: '#f7dd9b', marginTop: '0.5em' }}>Instant access to security and operations tools for your business.</h2>
            <p>Create your irongateguard account in under a minute and unlock all features. Upgrade anytime.</p>
          </div>

          <form onSubmit={handleSignup}>
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Operator"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
                disabled={loading}
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              style={{ fontSize: '1.1em', padding: '0.8em 0' }}
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Start Free Now'}
            </button>

          </form>

          {/* DownloadButton for setup script */}
          <div style={{ marginTop: '2em', textAlign: 'center' }}>
            <h3>Download Setup Script</h3>
            <p style={{ color: '#bbb', marginBottom: '0.5em' }}>After creating your account, download the setup script to connect your first device.</p>
            <DownloadButton />
          </div>

          <div className="login-info">
            <p>
              Already have an account? <Link to="/login">Sign in here</Link>.
            </p>
            <p>
              New accounts start with viewer access and can upgrade from Billing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
