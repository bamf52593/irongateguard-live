import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function EventLogs() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ mac: '', ssid: '', sentinel: '' });

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

    // Set up polling every 4 seconds (between 3-5 as requested)
    const interval = setInterval(fetchEvents, 4000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const filteredEvents = events.filter(event => {
    if (filters.mac && !event.mac?.toLowerCase().includes(filters.mac.toLowerCase())) return false;
    if (filters.ssid && !event.ssid?.toLowerCase().includes(filters.ssid.toLowerCase())) return false;
    if (filters.sentinel && event.device_id !== filters.sentinel) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="page">
        <h1>Activity Feed</h1>
        <p>Loading activity...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1>Activity Feed</h1>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Activity Feed</h1>
      <div className="banner-panel">
        <p>Use filters to quickly find the activity you need.</p>
      </div>
      
      <div className="filters">
        <input 
          type="text"
          name="mac"
          placeholder="Filter by device address..."
          aria-label="Filter by device address"
          value={filters.mac}
          onChange={handleFilterChange}
        />
        <input 
          type="text"
          name="ssid"
          placeholder="Filter by network name..."
          aria-label="Filter by network name"
          value={filters.ssid}
          onChange={handleFilterChange}
        />
        <select name="sentinel" value={filters.sentinel} onChange={handleFilterChange} aria-label="Filter by monitoring device">
          <option value="">All monitoring devices</option>
          <option value="sentinel-001">sentinel-001</option>
          <option value="sentinel-002">sentinel-002</option>
          <option value="sentinel-003">sentinel-003</option>
        </select>
        <button className="btn" type="button" onClick={fetchEvents} aria-label="Refresh activity list">Refresh data</button>
      </div>

      <table className="data-table">
        <caption className="table-caption">Recent activity events from monitoring devices and connected networks.</caption>
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Device Address</th>
            <th>Network Name</th>
            <th>Channel</th>
            <th>Signal</th>
            <th>Device ID</th>
          </tr>
        </thead>
        <tbody>
          {filteredEvents.length === 0 && (
            <tr>
              <td colSpan="7">
                <p className="empty-state">No activity matches your current filters.</p>
              </td>
            </tr>
          )}
          {filteredEvents.slice(-20).reverse().map((event, index) => (
            <tr key={`${event.received_at || event.id || index}`}>
              <td>{event.received_at ? new Date(event.received_at).toLocaleTimeString() : 'N/A'}</td>
              <td><span className="badge">{event.type || event.message || 'Unknown'}</span></td>
              <td>{event.mac || 'N/A'}</td>
              <td>{event.ssid || 'N/A'}</td>
              <td>{event.channel || 'N/A'}</td>
              <td>{event.rssi ? `${event.rssi} dBm` : 'N/A'}</td>
              <td>{event.device_id || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}