import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, setUser } from '../api';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
       const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(r.accessToken);
      setUser(r.user);
      nav(r.user.role === 'CLEARING_AGENT' ? '/clearance' : '/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h1>Kiaan Cargo</h1>
      {error && <div className="error">{error}</div>}
      <label>Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <br /><br />
      <label>Password</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <br /><br />
      <button disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
    </form>
  );
}