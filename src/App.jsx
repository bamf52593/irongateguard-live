import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

const PUBLIC_SEO_BY_PATH = {
  '/': {
    title: 'irongateguardguard | Security Monitoring for Every Business Size',
    description: 'irongateguardguard helps businesses monitor devices, detect threats early, and stay secure with plain-English security visibility.'
  },
  '/plans': {
    title: 'Compare Plans | irongateguardguard',
    description: 'Compare irongateguardguard Starter, Growth, and Scale plans to find the right fit for your business and IT maturity level.'
  },
  '/demo-request': {
    title: 'Request a Demo | irongateguardguard',
    description: 'Book a guided irongateguardguard demo and get rollout recommendations for your business size and technical needs.'
  },
  '/signup': {
    title: 'Create Your Account | irongateguardguard',
    description: 'Create an irongateguardguard account and start monitoring your business security posture in minutes.'
  },
  '/login': {
    title: 'Sign In | irongateguardguard',
    description: 'Sign in to irongateguardguard to access your security dashboard, alerts, and monitoring tools.'
  }
};

function setOrCreateMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', name);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function setCanonicalUrl(url) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

function SeoMetaManager() {
  const location = useLocation();

  useEffect(() => {
    const isPublicPath = Object.prototype.hasOwnProperty.call(PUBLIC_SEO_BY_PATH, location.pathname);
    const seo = PUBLIC_SEO_BY_PATH[location.pathname] || {
      title: 'irongateguardguard | IoT Sentinel Dashboard',
      description: 'irongateguardguard security monitoring platform for device visibility and threat detection.'
    };

    document.title = seo.title;
    setOrCreateMeta('description', seo.description);
    setOrCreateMeta('robots', isPublicPath ? 'index,follow' : 'noindex,nofollow');

    const canonicalPath = location.pathname === '/' ? '' : location.pathname;
    setCanonicalUrl(`${window.location.origin}${canonicalPath}`);
  }, [location.pathname]);

  return null;
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
      const apiUrl = import.meta.env.VITE_API_URL || '/v1';
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

  const isAdminUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.role === 'admin'; } catch { return false; } })();

  const isPaywallActive = isAuthenticated
    && !subscriptionGate.loading
    && !subscriptionGate.isPaid
    && !paywallBypassEnabled
    && !isAdminUser;

  return (
    <BrowserRouter>
      <SeoMetaManager />
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
