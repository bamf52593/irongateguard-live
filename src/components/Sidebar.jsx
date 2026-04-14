import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import lockIcon from '../assets/old-lock.png';
import '../styles/Sidebar.css';

export default function Sidebar({ billingLocked = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  })();
  const isAdmin = currentUser?.role === 'admin';

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('auth-logout'));
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <img src={lockIcon} alt="Old iron lock" className="brand-icon" />
          <h2>IronGate</h2>
        </div>
      </div>
      <nav className="sidebar-nav">
        <div className="sidebar-nav-links">
          {!billingLocked && (
            <>
              <Link to="/" className={isActive('/') ? 'active' : ''}>Home</Link>
              <Link to="/quick-start" className={isActive('/quick-start') || isActive('/demo-mode') ? 'active' : ''}>Quick Start</Link>
              <Link to="/overview" className={isActive('/overview') ? 'active' : ''}>Overview</Link>
              <Link to="/devices" className={isActive('/devices') ? 'active' : ''}>Assets</Link>
              <Link to="/system-health" className={isActive('/system-health') ? 'active' : ''}>Platform Health</Link>
              <Link to="/sentinels" className={isActive('/sentinels') ? 'active' : ''}>Monitoring Devices</Link>
              <Link to="/events" className={isActive('/events') ? 'active' : ''}>Activity Feed</Link>
              <Link to="/threat-map" className={isActive('/threat-map') ? 'active' : ''}>Coverage Map</Link>
              <Link to="/attack-tracing" className={isActive('/attack-tracing') ? 'active' : ''}>Incident Review</Link>
              <Link to="/api-keys" className={isActive('/api-keys') ? 'active' : ''}>Integrations</Link>
              <Link to="/users" className={isActive('/users') ? 'active' : ''}>Team Access</Link>
              {isAdmin && <Link to="/revenue" className={isActive('/revenue') ? 'active' : ''}>Revenue</Link>}
            </>
          )}
          <Link to="/billing" className={isActive('/billing') ? 'active' : ''}>Billing</Link>
          {!billingLocked && <Link to="/settings" className={isActive('/settings') ? 'active' : ''}>Preferences</Link>}
        </div>
        <button onClick={handleLogout} className="sidebar-logout">
          Sign Out
        </button>
      </nav>
    </aside>
  );
}