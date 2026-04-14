import React, { useState } from 'react';
import { notify } from '../utils/toast';

export default function ApiKeys() {
  const [keys, setKeys] = useState([
    { id: 1, name: 'test-key (Default)', key: 'test-key', created: '2026-04-07' }
  ]);
  const [newKeyName, setNewKeyName] = useState('');

  const generateKey = () => {
    if (!newKeyName.trim()) {
      notify('Please enter a key name before creating a key.', 'warning');
      return;
    }
    const newKey = 'sk_' + Math.random().toString(36).substring(2, 15);
    setKeys([...keys, {
      id: keys.length + 1,
      name: newKeyName,
      key: newKey,
      created: new Date().toLocaleDateString()
    }]);
    notify(`API key "${newKeyName}" created.`, 'success');
    setNewKeyName('');
  };

  const deleteKey = (id) => {
    const keyToDelete = keys.find((k) => k.id === id);
    const confirmed = window.confirm(`Remove API key "${keyToDelete?.name || 'this key'}"?`);
    if (!confirmed) return;

    setKeys(keys.filter(k => k.id !== id));
    notify('API key removed.', 'success');
  };

  return (
    <div className="page">
      <h1>Integrations</h1>

      <div className="banner-panel">
        <p>Create and manage API keys for systems that connect to IronGate.</p>
      </div>

      <div className="page-action-bar">
        <button className="btn btn-primary" type="button" onClick={generateKey}>Create API key</button>
      </div>

      <div className="card">
        <h2>Create API Key</h2>
        <div className="form-group">
          <label htmlFor="api-key-name">Key Name</label>
          <input 
            id="api-key-name"
            type="text" 
            placeholder="e.g., Production Key"
            aria-label="API key name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <h2>Active Keys</h2>
        <div className="key-list">
          {keys.map(k => (
            <div key={k.id} className="key-item">
              <div>
                <div className="key-name">{k.name}</div>
                <div className="key-value">{k.key}</div>
              </div>
              <div>
                <span style={{ color: '#666', fontSize: '12px' }}>Created: {k.created}</span>
                <button 
                  className="btn btn-danger"
                  type="button"
                  aria-label={`Delete key ${k.name}`}
                  onClick={() => deleteKey(k.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}