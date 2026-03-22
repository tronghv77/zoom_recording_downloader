import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ZoomAccount, CreateAccountInput } from '../../shared/types';

export function AccountsPage() {
  const [accounts, setAccounts] = useState<ZoomAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ZoomAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.account.list();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }

  async function handleTestConnection(id: string) {
    try {
      setTestingId(id);
      const result = await api.account.testConnection(id);
      if (result) {
        setError(null);
      } else {
        setError('Connection test failed - check credentials');
      }
      loadAccounts();
    } catch (err: any) {
      setError(err.message || 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete account "${name}"? This cannot be undone.`)) return;
    try {
      await api.account.delete(id);
      setError(null);
      loadAccounts();
    } catch (err: any) {
      setError(err.message || 'Failed to delete account');
    }
  }

  function handleEdit(account: ZoomAccount) {
    setEditingAccount(account);
    setShowForm(true);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingAccount(null);
    loadAccounts();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Zoom Accounts</h2>
        <button
          className="btn btn-primary"
          onClick={() => { setEditingAccount(null); setShowForm(!showForm); }}
        >
          {showForm ? 'Cancel' : '+ Add Account'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          <button className="alert-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {showForm && (
        <AccountForm
          account={editingAccount}
          onSaved={handleFormClose}
          onCancel={() => { setShowForm(false); setEditingAccount(null); }}
        />
      )}

      {loading ? (
        <div className="empty-state">Loading accounts...</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Account ID</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{account.email}</td>
                  <td className="text-mono">{account.accountId.substring(0, 12)}...</td>
                  <td>
                    <span className={`status-badge status-${account.status}`}>
                      {account.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleTestConnection(account.id)}
                      disabled={testingId === account.id}
                    >
                      {testingId === account.id ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleEdit(account)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(account.id, account.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center">
                    No accounts added yet. Click "+ Add Account" to connect a Zoom account.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface AccountFormProps {
  account: ZoomAccount | null;
  onSaved: () => void;
  onCancel: () => void;
}

function AccountForm({ account, onSaved, onCancel }: AccountFormProps) {
  const isEdit = !!account;
  const [form, setForm] = useState<CreateAccountInput>({
    name: account?.name || '',
    email: account?.email || '',
    clientId: account?.clientId || '',
    clientSecret: account?.clientSecret || '',
    accountId: account?.accountId || '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function updateField(field: keyof CreateAccountInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Validate
    if (!form.name.trim()) { setFormError('Account name is required'); return; }
    if (!form.email.trim()) { setFormError('Email is required'); return; }
    if (!form.clientId.trim()) { setFormError('Client ID is required'); return; }
    if (!form.clientSecret.trim() && !isEdit) { setFormError('Client Secret is required'); return; }
    if (!form.accountId.trim()) { setFormError('Account ID is required'); return; }

    try {
      setSaving(true);
      if (isEdit) {
        await api.account.update(account!.id, {
          name: form.name,
          clientId: form.clientId,
          clientSecret: form.clientSecret || undefined,
          accountId: form.accountId,
        });
      } else {
        await api.account.create(form);
      }
      onSaved();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save account');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <h3>{isEdit ? 'Edit Account' : 'Add Zoom Account'}</h3>

      {formError && <div className="alert alert-error">{formError}</div>}

      <div className="form-row">
        <div className="form-group">
          <label>Account Name</label>
          <input
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="e.g. Company Main Account"
            required
          />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="admin@company.com"
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label>Account ID (Server-to-Server OAuth)</label>
        <input
          value={form.accountId}
          onChange={(e) => updateField('accountId', e.target.value)}
          placeholder="From Zoom App > General > Account ID"
          required
        />
        <small>Found in Zoom Marketplace → Your App → App Credentials</small>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Client ID</label>
          <input
            value={form.clientId}
            onChange={(e) => updateField('clientId', e.target.value)}
            placeholder="From Zoom Marketplace App"
            required
          />
        </div>
        <div className="form-group">
          <label>Client Secret</label>
          <input
            type="password"
            value={form.clientSecret}
            onChange={(e) => updateField('clientSecret', e.target.value)}
            placeholder={isEdit ? '(unchanged if empty)' : 'From Zoom Marketplace App'}
            required={!isEdit}
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update Account' : 'Save & Test Connection'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
