import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const statDescriptions = {
  'Active Sentinels': 'Collectors currently reporting in and watching your environment.',
  'Threats Detected': 'Potential issues caught automatically before they turn into downtime.',
  'Alerts Today': 'Items your team may want to review or acknowledge today.',
  'System Health': 'Platform availability across ingestion, dashboards, and workflows.'
};

const statDisplayLabels = {
  'Active Sentinels': 'Active Monitors',
  'Threats Detected': 'Issues Caught Early',
  'Alerts Today': 'Items Needing Review',
  'System Health': 'Platform Availability'
};

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const fetchDashboard = () => {
      axios.get('/v1/dashboard')
        .then((response) => {
          setDashboard(response.data);
          setError(null);
        })
        .catch(() => setError('Unable to load dashboard data.'));
    };

    const fetchEvents = () => {
      axios.get('/v1/events')
        .then((response) => {
          setEvents(response.data.events || []);
        })
        .catch(() => {
          // Silently fail for events, dashboard is more important
        });
    };

    // Initial fetch
    fetchDashboard();
    fetchEvents();

    // Set up polling every 5 seconds
    const interval = setInterval(() => {
      fetchDashboard();
      fetchEvents();
    }, 5000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  // Draw pie chart when events data changes
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const drawChart = () => {
      const width = canvas.width = canvas.offsetWidth;
      const height = canvas.height = canvas.offsetHeight;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 30;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      if (events.length === 0) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 16px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No event data yet', centerX, centerY);
        return;
      }

      // Count event types
      const eventTypeCounts = {};
      events.forEach(event => {
        const type = event.event_type || event.type || 'unknown';
        eventTypeCounts[type] = (eventTypeCounts[type] || 0) + 1;
      });

      const total = events.length;
      const colors = ['#ffb100', '#ff28ff', '#00ffff', '#7cff00', '#ff0055', '#00ffd0'];
      let startAngle = 0;

      // Draw pie slices
      Object.entries(eventTypeCounts).forEach(([type, count], index) => {
        const sliceAngle = (count / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = colors[index % colors.length];
        ctx.fill();

        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 2;
        ctx.stroke();

        const labelAngle = startAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius + 30);
        const labelY = centerY + Math.sin(labelAngle) * (radius + 30);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${type}: ${count}`, labelX, labelY);

        startAngle = endAngle;
      });

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.3, 0, 2 * Math.PI);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 14px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Event Types', centerX, centerY - 5);
      ctx.font = '12px Courier New';
      ctx.fillText(`Total: ${total}`, centerX, centerY + 10);
    };

    drawChart();
    window.addEventListener('resize', drawChart);
    return () => window.removeEventListener('resize', drawChart);
  }, [events]);

  if (!dashboard) {
    return (
      <div className="page">
        <h1>Overview</h1>
        <p>Loading your security overview...</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const highPriorityEvents = events.filter((event) => ['alert', 'critical'].includes(event.severity)).length;
  const recommendedMessage = highPriorityEvents > 0
    ? `Review ${highPriorityEvents} high-priority incident${highPriorityEvents === 1 ? '' : 's'} and confirm the affected device owners have been notified.`
    : 'No urgent incidents are active right now. You can review coverage, uptime, and recent activity to keep operations on track.';

  return (
    <div className="page">
      <h1>Overview</h1>
      <div className="viking-banner">
        <h2>Security visibility that is easy to understand</h2>
        <p>IronGate turns device activity, health signals, and incident data into a clear view so teams can make faster, better decisions.</p>
        <div className="trust-strip">
          <span>Live status</span>
          <span>Clear priorities</span>
          <span>Faster incident response</span>
        </div>
      </div>
      <div className="card-grid">
        {dashboard.stats.map((item) => (
          <div key={item.label} className="card stat-card">
            <h2>{item.value}</h2>
            <p>{statDisplayLabels[item.label] || item.label}</p>
            <span className="badge">{item.change}</span>
            <small className="card-support-text">{statDescriptions[item.label] || 'A live performance signal from the IronGate platform.'}</small>
          </div>
        ))}
      </div>
      <div className="card-grid narrative-grid">
        <section className="card value-card">
          <h2>Single workspace</h2>
          <p>Use one workspace for assets, service health, and suspicious activity instead of switching between tools.</p>
        </section>
        <section className="card value-card">
          <h2>Less confusion</h2>
          <p>Reduce alert noise, shrink blind spots, and improve handoffs between operations and IT.</p>
        </section>
        <section className="card value-card">
          <h2>Better context</h2>
          <p>Keep monitoring status clear, device coverage visible, and incident details readable for the whole team.</p>
        </section>
      </div>
      <div className="card-grid">
        <section className="card chart-card">
          <h2>What the platform is seeing</h2>
          <div className="chart-panel">
            <canvas ref={canvasRef}></canvas>
          </div>
        </section>
        <section className="card">
          <h2>What changed recently</h2>
          <ul className="activity-list">
            {dashboard.recentActivity.map((row) => (
              <li key={`${row.time}-${row.event}`}>
                <strong>{row.time}</strong>
                <span>{row.event}</span>
                <em>{row.status}</em>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="card recommendation-card">
        <h2>Recommended next step</h2>
        <p>{recommendedMessage}</p>
      </section>
    </div>
  );
}
