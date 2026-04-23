import React, { useState } from 'react';
import { notify } from '../utils/toast';

export default function Settings() {
  const [settings, setSettings] = useState({
    systemName: 'IoT Sentinel Server',
    timezone: 'UTC',
    dataRetention: 90,
    eventAggregation: true,
    rssiThreshold: -80,
    emailNotifications: true,
    alertThreshold: 10,
    slackIntegration: false,
    apiRateLimit: 1000,
    requireHttps: true,
    ipWhitelisting: false
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = () => {
    notify('Preferences saved.', 'success');
  };

  return (
    <div className="page">
      <h1>Preferences</h1>

      <div className="banner-panel">
        <p>Adjust how irongateguardguard stores data, sends notifications, and applies security rules.</p>
      </div>

      <div className="page-action-bar">
        <button className="btn btn-primary" type="button" onClick={handleSave}>Save preferences</button>
      </div>

      <div className="card">
        <h2>General</h2>
        <div className="form-group">
          <label>System Name</label>
          <input 
            type="text" 
            name="systemName"
            value={settings.systemName}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Timezone</label>
          <select name="timezone" value={settings.timezone} onChange={handleChange}>
            <option>UTC</option>
            <option>EST</option>
            <option>PST</option>
            <option>CST</option>
          </select>
        </div>
        <div className="form-group">
          <label>Data Retention (days)</label>
          <input 
            type="number" 
            name="dataRetention"
            value={settings.dataRetention}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="card">
        <h2>Event Processing</h2>
        <div className="form-group">
          <label>
            <input 
              type="checkbox" 
              name="eventAggregation"
              checked={settings.eventAggregation}
              onChange={handleChange}
            />
            Group Similar Events
          </label>
          <small>Combine repeated events in a short time window.</small>
        </div>
        <div className="form-group">
          <label>Signal Alert Threshold (dBm)</label>
          <input 
            type="number" 
            name="rssiThreshold"
            value={settings.rssiThreshold}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="card">
        <h2>Notifications</h2>
        <div className="form-group">
          <label>
            <input 
              type="checkbox" 
              name="emailNotifications"
              checked={settings.emailNotifications}
              onChange={handleChange}
            />
            Email Notifications
          </label>
        </div>
        <div className="form-group">
          <label>
            <input 
              type="checkbox" 
              name="slackIntegration"
              checked={settings.slackIntegration}
              onChange={handleChange}
            />
            Slack Integration
          </label>
        </div>
        <div className="form-group">
          <label>Alert Threshold (events)</label>
          <input 
            type="number" 
            name="alertThreshold"
            value={settings.alertThreshold}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="card">
        <h2>Security</h2>
        <div className="form-group">
          <label>
            <input 
              type="checkbox" 
              name="requireHttps"
              checked={settings.requireHttps}
              onChange={handleChange}
            />
            Require HTTPS
          </label>
        </div>
        <div className="form-group">
          <label>
            <input 
              type="checkbox" 
              name="ipWhitelisting"
              checked={settings.ipWhitelisting}
              onChange={handleChange}
            />
            IP Whitelisting
          </label>
        </div>
        <div className="form-group">
          <label>API Rate Limit (req/min)</label>
          <input 
            type="number" 
            name="apiRateLimit"
            value={settings.apiRateLimit}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="danger-zone">
        <h2>Advanced Actions</h2>
        <p>These actions cannot be undone.</p>
        <button className="btn btn-danger" type="button" onClick={() => {
          if (window.confirm('Clear all events now? This cannot be undone.')) notify('All events were cleared.', 'success');
        }}>
          Clear all events
        </button>
        <button className="btn btn-danger" type="button" onClick={() => {
          if (window.confirm('Reset preferences to defaults? This cannot be undone.')) notify('Preferences were reset to defaults.', 'success');
        }}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
