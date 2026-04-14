import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import AppErrorBoundary from './components/AppErrorBoundary';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ComparePlans from './pages/ComparePlans';
import WelcomeOnboarding from './pages/WelcomeOnboarding';
import DemoRequest from './pages/DemoRequest';

// Pages
import Landing from './pages/Landing';
import DemoMode from './pages/DemoMode';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import SystemHealth from './pages/SystemHealth';
import SentinelList from './pages/SentinelList';
import EventLogs from './pages/EventLogs';
import ThreatMap from './pages/ThreatMap';
import AttackTracing from './pages/AttackTracing';
import ApiKeys from './pages/ApiKeys';
import UserAccounts from './pages/UserAccounts';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import RevenueAnalytics from './pages/RevenueAnalytics';

function PrivateRoute({ children }) {
  const isAuthenticated = !!localStorage.getItem('authToken');
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
  const [toasts, setToasts] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('authToken'));
  const [showAccessUnlockedBanner, setShowAccessUnlockedBanner] = useState(false);
  const [subscriptionGate, setSubscriptionGate] = useState({
    loading: !!localStorage.getItem('authToken'),
    isPaid: false,
    plan: 'free',
    status: 'free'
  });
  const previousPaidRef = useRef(false);
  const paywallBypassEnabled = ['true', '1', 'yes'].includes(
    String(import.meta.env.VITE_BILLING_PAYWALL_BYPASS || 'false').toLowerCase()
  );

  const isPaidSubscription = (plan, status) => {
    if (!plan || plan === 'free') return false;
    return ['active', 'trialing', 'past_due'].includes(status);
  };

  const loadSubscriptionGate = async ({ background = false } = {}) => {
    const token = localStorage.getItem('authToken');

    if (!token) {
      setSubscriptionGate({ loading: false, isPaid: false, plan: 'free', status: 'free' });
      return;
    }

    if (!background) {
      setSubscriptionGate((prev) => ({ ...prev, loading: true }));
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/v1';
      const response = await fetch(`${apiUrl}/billing/subscription`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        setIsAuthenticated(false);
        setSubscriptionGate({ loading: false, isPaid: false, plan: 'free', status: 'free' });
        return;
      }

      const data = await response.json();
      const plan = data?.subscription?.plan || 'free';
      const status = data?.subscription?.status || 'free';
      const isPaid = isPaidSubscription(plan, status);

      setSubscriptionGate({ loading: false, isPaid, plan, status });
    } catch (error) {
      setSubscriptionGate({ loading: false, isPaid: false, plan: 'free', status: 'free' });
    }
  };

  useEffect(() => {
    const handleToast = (event) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const toast = {
        id,
        message: event.detail?.message || 'Action completed.',
        type: event.detail?.type || 'info'
      };

      setToasts((prev) => [...prev, toast]);

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3200);
    };

    const handleAuthLogin = () => {
      setIsAuthenticated(true);
      loadSubscriptionGate({ background: false });
    };

    const handleAuthLogout = () => {
      setIsAuthenticated(false);
      setSubscriptionGate({ loading: false, isPaid: false, plan: 'free', status: 'free' });
    };

    const handleBillingStatusChanged = () => {
      loadSubscriptionGate({ background: true });
    };

    window.addEventListener('app-toast', handleToast);
    window.addEventListener('auth-login-success', handleAuthLogin);
    window.addEventListener('auth-logout', handleAuthLogout);
    window.addEventListener('billing-status-updated', handleBillingStatusChanged);

    return () => {
      window.removeEventListener('app-toast', handleToast);
      window.removeEventListener('auth-login-success', handleAuthLogin);
      window.removeEventListener('auth-logout', handleAuthLogout);
      window.removeEventListener('billing-status-updated', handleBillingStatusChanged);
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadSubscriptionGate({ background: false });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      previousPaidRef.current = false;
      setShowAccessUnlockedBanner(false);
      return;
    }

    if (!previousPaidRef.current && subscriptionGate.isPaid) {
      setShowAccessUnlockedBanner(true);
    }

    previousPaidRef.current = subscriptionGate.isPaid;
  }, [isAuthenticated, subscriptionGate.isPaid]);

  useEffect(() => {
    if (!showAccessUnlockedBanner) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowAccessUnlockedBanner(false);
    }, 9000);

    return () => window.clearTimeout(timer);
  }, [showAccessUnlockedBanner]);

  const isPaywallActive = isAuthenticated
    && !subscriptionGate.loading
    && !subscriptionGate.isPaid
    && !paywallBypassEnabled;

  return (
    <BrowserRouter>
      {isAuthenticated && <a href="#main-content" className="skip-link">Skip to main content</a>}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
      
      {isAuthenticated ? (
        <div className="app-layout">
          <Sidebar billingLocked={isPaywallActive} />
          <main className="main-content" id="main-content" tabIndex="-1">
            {showAccessUnlockedBanner && !isPaywallActive && (
              <div className="payment-unlocked-banner" role="status" aria-live="polite">
                <div>
                  <strong>Payment confirmed.</strong> Your subscription is active and full access is now unlocked.
                </div>
                <button type="button" onClick={() => setShowAccessUnlockedBanner(false)}>
                  Dismiss
                </button>
              </div>
            )}
            {subscriptionGate.loading ? (
              <div className="app-loading-state">Checking subscription status...</div>
            ) : (
              <AppErrorBoundary>
                <Routes>
                  {isPaywallActive ? (
                    <>
                      <Route path="/welcome" element={<WelcomeOnboarding />} />
                      <Route path="/plans" element={<ComparePlans />} />
                      <Route path="/demo-request" element={<DemoRequest />} />
                      <Route path="/billing" element={<Billing />} />
                      <Route path="/billing/success" element={<Billing />} />
                      <Route path="/billing/cancel" element={<Billing />} />
                      <Route path="*" element={<Navigate to="/welcome" replace />} />
                    </>
                  ) : (
                    <>
                      <Route path="/" element={<Landing />} />
                      <Route path="/quick-start" element={<DemoMode />} />
                      <Route path="/demo-mode" element={<DemoMode />} />
                      <Route path="/welcome" element={<WelcomeOnboarding />} />
                      <Route path="/plans" element={<ComparePlans />} />
                      <Route path="/demo-request" element={<DemoRequest />} />
                      <Route path="/overview" element={<Dashboard />} />
                      <Route path="/devices" element={<Devices />} />
                      <Route path="/system-health" element={<SystemHealth />} />
                      <Route path="/sentinels" element={<SentinelList />} />
                      <Route path="/events" element={<EventLogs />} />
                      <Route path="/threat-map" element={<ThreatMap />} />
                      <Route path="/attack-tracing" element={<AttackTracing />} />
                      <Route path="/api-keys" element={<ApiKeys />} />
                      <Route path="/users" element={<UserAccounts />} />
                      <Route path="/revenue" element={<RevenueAnalytics />} />
                      <Route path="/billing" element={<Billing />} />
                      <Route path="/billing/success" element={<Billing />} />
                      <Route path="/billing/cancel" element={<Billing />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </>
                  )}
                </Routes>
              </AppErrorBoundary>
            )}
          </main>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/quick-start" element={<DemoMode />} />
          <Route path="/demo-mode" element={<DemoMode />} />
          <Route path="/plans" element={<ComparePlans />} />
          <Route path="/demo-request" element={<DemoRequest />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default App;