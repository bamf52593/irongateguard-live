import React, { useState } from 'react';
import { notify } from '../utils/toast';

export default function UserAccounts() {
  const [users, setUsers] = useState([
    { id: 1, name: 'Admin User', email: 'admin@iotsentinel.local', role: 'Admin', status: 'Active' },
    { id: 2, name: 'Operator', email: 'operator@iotsentinel.local', role: 'Operator', status: 'Active' },
    { id: 3, name: 'Viewer', email: 'viewer@iotsentinel.local', role: 'Viewer', status: 'Inactive' }
  ]);

  return (
    <div className="page">
      <h1>Team Access</h1>

      <div className="banner-panel">
        <p>Manage user access, roles, and account status.</p>
      </div>

      <div className="page-action-bar">
        <button className="btn btn-primary" type="button" onClick={() => notify('User creation form is not connected yet.', 'info')}>Add user</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <span className="badge">{u.role}</span>
              </td>
              <td>
                <span className={`badge ${u.status === 'Active' ? 'status-online' : ''}`}>
                  {u.status}
                </span>
              </td>
              <td>
                <button className="btn btn-sm" type="button" aria-label={`Edit user ${u.name}`} onClick={() => notify(`Edit for ${u.name} is not connected yet.`, 'info')}>Edit</button>
                <button className="btn btn-sm btn-danger" type="button" aria-label={`Delete user ${u.name}`} onClick={() => notify(`Remove for ${u.name} is not connected yet.`, 'warning')}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}