import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ZoomAccount } from '../../shared/types';

export function AccountsPage() {
  const [accounts, setAccounts] = useState<ZoomAccount[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    const data = await api.account.list();
    setAccounts(data);
  }

  async function handleTestConnection(id: string) {
    const result = await api.account.testConnection(id);
    alert(result ? 'Connection successful!' : 'Connection failed!');
    loadAccounts();
  }

  async function handleDelete(id: string) {
    if (confirm('Are you sure you want to delete this account?')) {
      await api.account.delete(id);
      loadAccounts();
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Zoom Accounts</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          + Add Account
        </button>
      </div>

      {showForm && <AccountForm onSaved={() => { setShowForm(false); loadAccounts(); }} />}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{account.email}</td>
                <td>
                  <span className={`status-badge status-${account.status}`}>
                    {account.status}
                  </span>
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => handleTestConnection(account.id)}>
                    Test
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(account.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center">No accounts added yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    clientId: '',
    clientSecret: '',
    accountId: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api.account.create(form);
    onSaved();
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <h3>Add Zoom Account</h3>
      <div className="form-group">
        <label>Account Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </div>
      <div className="form-group">
        <label>Email</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </div>
      <div className="form-group">
        <label>Client ID</label>
        <input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required />
      </div>
      <div className="form-group">
        <label>Client Secret</label>
        <input type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} required />
      </div>
      <div className="form-group">
        <label>Account ID (Server-to-Server)</label>
        <input value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} required />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">Save</button>
      </div>
    </form>
  );
}
