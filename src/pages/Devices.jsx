import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [sentinels, setSentinels] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const apiBase = (import.meta.env.VITE_API_URL || `${window.location.origin}/v1`).replace(/\/$/, '');

  const windowsCommand = [
    '$env:IRONGATE_API_BASE = "' + apiBase + '"',
    '$env:IRONGATE_API_KEY = "test-key"',
    '$env:IRONGATE_SENTINEL_ID = "office-main-01"',
    'npm run sentinel'
  ].join('\n');

  const macLinuxCommand = [
    `export IRONGATE_API_BASE="${apiBase}"`,
    'export IRONGATE_API_KEY="test-key"',
    'export IRONGATE_SENTINEL_ID="office-main-01"',
    'npm run sentinel'
  ].join('\n');

  const copyText = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'success', message: `${label} copied.` } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'warning', message: `Could not copy ${label}. Please copy manually.` } }));
    }
  };

  useEffect(() => {
    Promise.all([
      axios.get('/v1/devices'),
      axios.get('/v1/sentinels'),
      axios.get('/v1/events')
    ])
      .then(([devicesRes, sentinelsRes, eventsRes]) => {
        setDevices(devicesRes.data.devices || []);
        setSentinels(sentinelsRes.data.sentinels || []);
        setEvents(eventsRes.data.events || []);
      })
      .catch(() => setError('Unable to load protection data.'))
      .finally(() => setLoading(false));
  }, []);

  const onlineDevices = devices.filter((device) => String(device.status).toLowerCase() === 'online').length;
  const onlineSentinels = sentinels.filter((sentinel) => String(sentinel.status).toLowerCase() === 'online').length;
  const criticalEvents = events.filter((event) => ['critical', 'alert'].includes(String(event.severity || '').toLowerCase())).length;
  const protectionMode = onlineSentinels > 0 ? 'Active 24/7' : 'Attention needed';

  return (
    <div className="page">
      <h1>Assets</h1>
      <div className="banner-panel">
        <p>
          IronGate protects your business continuously by collecting telemetry from connected devices,
          detecting attack signals, and keeping your team informed in real time.
        </p>
      </div>
      {loading ? (
        <p>Loading protected assets...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <>
          <div className="card-grid protection-grid">
            <div className="card stat-card">
              <h2>Protection Mode</h2>
              <p className={`metric ${onlineSentinels > 0 ? 'status-good' : 'status-warning'}`}>{protectionMode}</p>
              <p className="empty-state">Live defense depends on at least one online sentinel.</p>
            </div>
            <div className="card stat-card">
              <h2>Connected Assets</h2>
              <p className="metric">{devices.length}</p>
              <p className="empty-state">{onlineDevices} currently reporting as online.</p>
            </div>
            <div className="card stat-card">
              <h2>Sentinels Online</h2>
              <p className="metric">{onlineSentinels}</p>
              <p className="empty-state">These are continuously collecting security telemetry.</p>
            </div>
            <div className="card stat-card">
              <h2>High-Risk Signals</h2>
              <p className={`metric ${criticalEvents > 0 ? 'status-warning' : 'status-good'}`}>{criticalEvents}</p>
              <p className="empty-state">Critical or alert-level events seen in the latest stream.</p>
            </div>
          </div>

          <div className="card">
            <h2>Add computers and phones to protection</h2>
            <p className="section-intro">
              Run the sentinel on a machine that can observe your business network. Phones, laptops, and servers then
              show up through telemetry and event activity automatically.
            </p>
            <div className="onboarding-steps">
              <div className="onboarding-step">
                <strong>1. Set your API endpoint and key</strong>
                <p>Use your live API URL and key so each office or network segment can report data securely.</p>
              </div>
              <div className="onboarding-step">
                <strong>2. Start a sentinel per location</strong>
                <p>Install one sentinel on each site or VLAN to maintain continuous monitoring coverage.</p>
              </div>
              <div className="onboarding-step">
                <strong>3. Confirm live reporting below</strong>
                <p>When events start arriving, devices appear in the monitored assets table with status updates.</p>
              </div>
            </div>

            <div className="install-snippets">
              <div className="snippet-block">
                <div className="snippet-header">
                  <h3>Windows (PowerShell)</h3>
                  <button type="button" className="snippet-copy" onClick={() => copyText('Windows command', windowsCommand)}>Copy</button>
                </div>
                <pre>{windowsCommand}</pre>
              </div>

              <div className="snippet-block">
                <div className="snippet-header">
                  <h3>Mac/Linux (Terminal)</h3>
                  <button type="button" className="snippet-copy" onClick={() => copyText('Mac/Linux command', macLinuxCommand)}>Copy</button>
                </div>
                <pre>{macLinuxCommand}</pre>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Your monitored equipment</h2>
            <p className="section-intro">Use this view to confirm that every signal maps back to a known device and location.</p>
            {devices.length === 0 ? (
              <p className="empty-state">No assets are currently connected. Add or connect a device to see it here.</p>
            ) : (
              <table className="data-table">
                <caption className="table-caption">Current list of monitored assets and their latest status.</caption>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Area</th>
                    <th>Last Update</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.id}</td>
                      <td>{device.type}</td>
                      <td>
                        <span className={`badge ${device.status === 'Online' ? 'status-online' : 'status-offline'}`}>
                          {device.status}
                        </span>
                      </td>
                      <td>{device.location}</td>
                      <td>{device.lastSeen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
