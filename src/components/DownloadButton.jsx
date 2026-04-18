import React, { useState } from 'react';

export default function DownloadButton({ defaultApiKey = '', defaultOs = 'windows' }) {
  const [apiKey, setApiKey] = useState(defaultApiKey);
  const [os, setOs] = useState(defaultOs);

  const apiBase = (import.meta.env.VITE_API_URL || `${window.location.origin}/v1`).replace(/\/$/, '');
  const sentinelId = 'office-device'; // fallback global default

  const windowsCommand = [
    `$env:IRONGATE_API_BASE = "${apiBase}"`,
    `$env:IRONGATE_API_KEY = "${apiKey || 'test-key'}"`,
    `$env:IRONGATE_SENTINEL_ID = "${sentinelId}"`,
    'npm run sentinel'
  ].join('\n');

  const macLinuxCommand = [
    `export IRONGATE_API_BASE="${apiBase}"`,
    `export IRONGATE_API_KEY="${apiKey || 'test-key'}"`,
    `export IRONGATE_SENTINEL_ID="${sentinelId}"`,
    'npm run sentinel'
  ].join('\n');

  const downloadScript = (value, osType) => {
    try {
      const filename = osType === 'windows' ? 'irongate-setup.ps1' : 'irongate-setup.sh';
      const blob = new Blob([`${value}\n`], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'success', message: `Downloaded ${filename}.` } }));
    } catch {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'warning', message: 'Could not download setup script. Please copy manually.' } }));
    }
  };

  const activeCommand = os === 'windows' ? windowsCommand : macLinuxCommand;

  return (
    <div className="global-download-btn">
      <input
        type="text"
        value={apiKey}
        onChange={e => setApiKey(e.target.value)}
        placeholder="API key"
        style={{ width: 120, marginRight: 8 }}
      />
      <select value={os} onChange={e => setOs(e.target.value)} style={{ marginRight: 8 }}>
        <option value="windows">Windows</option>
        <option value="maclinux">Mac/Linux</option>
      </select>
      <button type="button" onClick={() => downloadScript(activeCommand, os)}>
        Download Setup Script
      </button>
    </div>
  );
}
