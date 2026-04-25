
import React from 'react';

export default function DownloadButton({ defaultApiKey = 'test-key' }) {
  // Auto-detect OS
  const getOs = () => {
    const platform = window.navigator.platform.toLowerCase();
    if (platform.includes('win')) return 'windows';
    if (platform.includes('mac') || platform.includes('linux')) return 'maclinux';
    return 'windows'; // fallback
  };
  const os = getOs();
  const apiKey = defaultApiKey;

  const apiBase = (import.meta.env.VITE_API_URL || `${window.location.origin}/v1`).replace(/\/$/, '');
  const sentinelId = 'office-device'; // fallback global default

  const windowsCommand = [
    `$env:irongateguardguard_API_BASE = "${apiBase}"`,
    `$env:irongateguardguard_API_KEY = "${apiKey || 'test-key'}"`,
    `$env:irongateguardguard_SENTINEL_ID = "${sentinelId}"`,
    'npm run sentinel'
  ].join('\n');

  const macLinuxCommand = [
    `export irongateguardguard_API_BASE="${apiBase}"`,
    `export irongateguardguard_API_KEY="${apiKey || 'test-key'}"`,
    `export irongateguardguard_SENTINEL_ID="${sentinelId}"`,
    'npm run sentinel'
  ].join('\n');

  const downloadScript = (value, osType) => {
    try {
      const filename = osType === 'windows' ? 'irongateguardguard-setup.ps1' : 'irongateguardguard-setup.sh';
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

  // Single button, auto-detects everything
  return (
    <div className="global-download-btn" style={{ border: '2px solid red', padding: '1em', margin: '1em 0' }}>
      <div style={{ color: 'red', fontWeight: 'bold', marginBottom: '0.5em' }}>
        [DEBUG] DownloadButton Rendered
      </div>
      <button
        type="button"
        onClick={() => downloadScript(activeCommand, os)}
        style={{ padding: '0.5em 1.5em', fontSize: '1.1em' }}
      >
        Download Setup Script
      </button>
    </div>
  );
}
