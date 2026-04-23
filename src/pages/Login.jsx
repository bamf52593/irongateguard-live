import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notify } from '../utils/toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const isPaidSubscription = (plan, status) => {
    if (!plan || plan === 'free') return false;
    return ['active', 'trialing', 'past_due'].includes(status);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/v1';
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store token and user info
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Dispatch custom event for App.jsx to listen
      window.dispatchEvent(new Event('auth-login-success'));

      notify(`Welcome back, ${data.user.full_name}!`, 'success');

      // Admins always go directly to the dashboard — no subscription check needed.
      let destination = '/overview';
      if (data.user.role !== 'admin') {
        try {
          const subResponse = await fetch(`${apiUrl}/billing/subscription`, {
            headers: {
              Authorization: `Bearer ${data.token}`
            }
          });

          if (subResponse.ok) {
            const subData = await subResponse.json();
            const plan = subData?.subscription?.plan || 'free';
            const status = subData?.subscription?.status || 'free';
            destination = isPaidSubscription(plan, status) ? '/overview' : '/billing';
          } else {
            destination = '/billing';
          }
        } catch (subErr) {
          console.warn('Subscription check failed after login, defaulting to billing route.', subErr);
          destination = '/billing';
        }
      }

      // Give time for auth state to update before route transition.
      setTimeout(() => {
        navigate(destination);
      }, 100);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid email or password');
      notify(err.message || 'Login failed', 'warning');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>irongateguard</h1>
            <p>Security Visibility Platform</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@irongateguard.com"
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
                placeholder="Enter your password"
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
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="login-info">
            <p>
              New here? <Link to="/signup">Create your account</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
