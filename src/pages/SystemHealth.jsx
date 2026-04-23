import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHealth = () => {
      axios.get('/v1/health')
        .then((response) => {
          setHealth(response.data);
          setError(null);
        })
        .catch(() => setError('Unable to load system health.'));
    };

    // Initial fetch
    fetchHealth();

    // Set up polling every 5 seconds
    const interval = setInterval(fetchHealth, 5000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  if (!health) {
    return (
      <div className="page">
        <h1>Platform Health</h1>
        <p>Loading platform health data...</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Platform Health</h1>
      <div className="banner-panel">
        <p>Track core service performance to make sure monitoring stays reliable and responsive.</p>
      </div>
      <div className="card-grid">
        <div className="card">
          <h3>Processing Load</h3>
          <div className="metric">{health.cpu.toFixed(1)}%</div>
          <div className="progress-bar">
            <div style={{ width: `${health.cpu}%` }} className="progress-fill"></div>
          </div>
        </div>
        <div className="card">
          <h3>Memory Usage</h3>
          <div className="metric">{health.ram.toFixed(1)}%</div>
          <div className="progress-bar">
            <div style={{ width: `${health.ram}%` }} className="progress-fill"></div>
          </div>
        </div>
        <div className="card">
          <h3>Service Uptime</h3>
          <div className="metric status-good">{health.uptime}%</div>
        </div>
        <div className="card">
          <h3>Data Pipeline</h3>
          <div className="metric status-good">✓ {health.database}</div>
        </div>
        <div className="card">
          <h3>Collector Check-ins</h3>
          <div className="metric status-good">● {health.heartbeat}</div>
        </div>
        <div className="card">
          <h3>Response Speed</h3>
          <div className="metric">{health.apiResponseMs}ms</div>
        </div>
      </div>
      <div className="card">
        <h2>Events Processed</h2>
        <p>{health.eventsCount} signals have been processed so far, showing that monitoring is active and current.</p>
      </div>
    </div>
  );
}
