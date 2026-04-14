import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function SentinelList() {
  const [sentinels, setSentinels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isOnline = (lastCheckIn) => {
    if (!lastCheckIn) return false;
    const now = new Date();
    const checkInTime = new Date(lastCheckIn);
    const diffSeconds = (now - checkInTime) / 1000;
    return diffSeconds <= 30;
  };

  useEffect(() => {
    const fetchSentinels = () => {
      axios.get('/v1/sentinels')
        .then((response) => {
          const sentinelsData = response.data.sentinels.map(sentinel => ({
            ...sentinel,
            status: isOnline(sentinel.lastCheckIn) ? 'Online' : 'Offline',
            lastCheckIn: sentinel.lastCheckIn || new Date().toISOString()
          }));
          setSentinels(sentinelsData);
          setLoading(false);
          setError(null);
        })
        .catch(() => {
          setError('Unable to load sentinels.');
          setLoading(false);
        });
    };

    // Initial fetch
    fetchSentinels();

    // Set up polling every 5 seconds
    const interval = setInterval(fetchSentinels, 5000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="page">
        <h1>Monitoring Devices</h1>
        <p>Loading monitoring devices...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1>Monitoring Devices</h1>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Monitoring Devices</h1>
      <div className="banner-panel">
        <p>These are the devices sending monitoring data to IronGate right now.</p>
      </div>
      <table className="data-table">
        <caption className="table-caption">Monitoring devices currently sending status and event data.</caption>
        <thead>
          <tr>
            <th>Device ID</th>
            <th>Status</th>
            <th>Events</th>
            <th>Last Update</th>
            <th>Uptime</th>
            <th>Average Signal</th>
          </tr>
        </thead>
        <tbody>
          {sentinels.length === 0 && (
            <tr>
              <td colSpan="6">
                <p className="empty-state">No monitoring devices are available right now.</p>
              </td>
            </tr>
          )}
          {sentinels.map(s => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td><span className={`badge ${s.status === 'Online' ? 'status-online' : 'status-offline'}`}>● {s.status}</span></td>
              <td>{s.events}</td>
              <td>{s.lastSeen}</td>
              <td>{s.uptime}</td>
              <td>{s.avgRssi} dBm</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}