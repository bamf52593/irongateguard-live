import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get('/v1/devices')
      .then((response) => setDevices(response.data.devices))
      .catch(() => setError('Unable to load devices.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1>Assets</h1>
      <div className="banner-panel">
        <p>See the devices currently under protection, where they are deployed, and whether they are still reporting normally.</p>
      </div>
      {loading ? (
        <p>Loading protected assets...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
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
      )}
    </div>
  );
}
