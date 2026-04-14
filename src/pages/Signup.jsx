import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notify } from '../utils/toast';
import { trackEvent } from '../utils/analytics';

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

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:404/v1';
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
        throw new Error(data.error || 'Signup failed');
      }

      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.dispatchEvent(new Event('auth-login-success'));
      notify('Account created. Welcome to IronGate.', 'success');
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
            <h1>Get Started</h1>
            <p>Create your IronGate account in under a minute</p>
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
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

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
