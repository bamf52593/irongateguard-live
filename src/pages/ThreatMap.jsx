import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

export default function ThreatMap() {
  const canvasRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEvents = () => {
    axios.get('/v1/events')
      .then((response) => {
        setEvents(response.data.events || []);
        setLoading(false);
        setError(null);
      })
      .catch(() => {
        setError('Unable to load events.');
        setLoading(false);
      });
  };

  useEffect(() => {
    // Initial fetch
    fetchEvents();

    // Set up polling every 10 seconds
    const interval = setInterval(fetchEvents, 10000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loading) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    // Clear with cyber background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Draw cyber grid
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i <= height; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // Draw hub
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HUB', width / 2, height / 2);

    // Group events by device_id and calculate density
    const deviceDensity = {};
    events.forEach(event => {
      const deviceId = event.device_id || 'unknown';
      if (!deviceDensity[deviceId]) {
        deviceDensity[deviceId] = { count: 0, avgRssi: -70 };
      }
      deviceDensity[deviceId].count++;
      if (event.rssi) {
        deviceDensity[deviceId].avgRssi = (deviceDensity[deviceId].avgRssi + event.rssi) / 2;
      }
    });

    // Draw devices based on event density
    const devices = Object.entries(deviceDensity).slice(0, 8).map(([deviceId, data], index) => {
      const angle = (index / 8) * Math.PI * 2;
      const distance = 100 + (data.count * 10);
      return {
        x: width / 2 + Math.cos(angle) * distance,
        y: height / 2 + Math.sin(angle) * distance,
        rssi: data.avgRssi,
        label: deviceId.slice(-4),
        density: data.count
      };
    });

    devices.forEach(d => {
      let color, radius;
      const intensity = Math.min(d.density / 10, 1); // Scale based on event count

      if (d.rssi > -50) {
        color = `rgba(0, 255, 0, ${0.6 + intensity * 0.4})`;
        radius = 15 + intensity * 10;
      } else if (d.rssi > -70) {
        color = `rgba(255, 255, 0, ${0.6 + intensity * 0.4})`;
        radius = 12 + intensity * 8;
      } else {
        color = `rgba(255, 0, 0, ${0.6 + intensity * 0.4})`;
        radius = 10 + intensity * 6;
      }

      // Glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Reset shadow
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.label, d.x, d.y);
    });
  }, [events, loading]);

  if (loading) {
    return (
      <div className="page">
        <h1>Coverage Map</h1>
        <p>Loading live coverage data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1>Coverage Map</h1>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Coverage Map</h1>
      <div className="banner-panel">
        <p>This view helps you see where activity is concentrated, which assets are noisier than expected, and where attention may be needed first.</p>
      </div>
      <div className="threat-panel">
        <section className="card threat-card">
          <h2>Live coverage view</h2>
          <div className="map-container">
            <canvas ref={canvasRef}></canvas>
          </div>
        </section>
        <aside className="threat-legend-panel">
          <div className="threat-legend">
            <span><span className="legend-dot" style={{ background: '#28a745' }}></span> Strong connection and healthy activity</span>
            <span><span className="legend-dot" style={{ background: '#ffc107' }}></span> Moderate signal or elevated noise</span>
            <span><span className="legend-dot" style={{ background: '#dc3545' }}></span> Weak signal or potential risk hotspot</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
