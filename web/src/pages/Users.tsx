import { useEffect, useState } from 'react';
import { api, setToken, setUser } from '../api';
import { TrashIcon } from '../Icons';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  OPERATOR: 'Freight agent',
  ACCOUNTANT: 'Accountant',
  CLEARING_AGENT: 'Clearance agent',
};
const CREATABLE = ['OPERATOR', 'ACCOUNTANT', 'CLEARING_AGENT'];

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('OPERATOR');

  const [editId, setEditId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const load = () =>
    api('/auth/users').then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setOk('');
    try {
      await api('/auth/users', { method: 'POST', body: { email: email.trim(), password, role } });
      setEmail(''); setPassword('');
      setOk('User created');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEdit(u: any) {
    setEditId(u.id); setNewEmail(u.email); setNewPassword('');
    setError(''); setOk('');
  }

  // become this user; "Return to admin" (top right) brings the admin back
  async function switchTo(u: any) {
    setError(''); setOk('');
    try {
      const r = await api(`/auth/users/${u.id}/impersonate`, { method: 'POST' });
      setToken(r.accessToken);
      setUser({ ...r.user, impersonating: true });
      window.location.href = r.user.role === 'CLEARING_AGENT' ? '/clearance' : '/';
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(u: any) {
    if (!window.confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
    setError(''); setOk('');
    try {
      await api(`/auth/users/${u.id}`, { method: 'DELETE' });
      setOk('User deleted');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save(u: any) {
    setError(''); setOk('');
    const body: Record<string, string> = {};
    if (newEmail.trim() && newEmail.trim() !== u.email) body.email = newEmail.trim();
    if (newPassword) body.password = newPassword;
    if (Object.keys(body).length === 0) return setEditId('');
    try {
      await api(`/auth/users/${u.id}`, { method: 'PATCH', body });
      setEditId('');
      setOk('User updated');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <h1>Users</h1>
      {error && <div className="error">{error}</div>}
      {ok && <div className="muted" style={{ marginBottom: 12 }}>{ok}</div>}

      <form className="card" onSubmit={create}>
        <h3>Create user</h3>
        <div className="row">
          <div style={{ flex: 3 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div style={{ flex: 2 }}>
            <label>Password (min 8 characters)</label>
            <input type="text" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {CREATABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <button>Create</button>
        </div>
      </form>

      <div className="card">
        <h3>All users</h3>
        <table>
          <thead>
            <tr><th>Email</th><th>Role</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) =>
              editId === u.id ? (
                <tr key={u.id}>
                  <td>
                    <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  </td>
                  <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td>
                    <input type="text" placeholder="New password (leave blank to keep)" value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} />
                  </td>
                  <td>
                    <button type="button" className="small" onClick={() => save(u)}>Save</button>{' '}
                    <button type="button" className="ghost small" onClick={() => setEditId('')}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button type="button" className="ghost small" onClick={() => startEdit(u)}>
                      Change email / password
                    </button>{' '}
                    {u.role !== 'ADMIN' && (
                      <button type="button" className="small" onClick={() => switchTo(u)}>
                        Switch account
                      </button>
                    )}{' '}
                    {u.role !== 'ADMIN' && (
                      <button type="button" className="small" style={{ background: '#fee2e2', color: '#991b1b' }}
                        title="Delete user" aria-label="Delete user" onClick={() => remove(u)}>
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}