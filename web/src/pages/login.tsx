import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, setUser } from '../api';
import './login.css';

// Put these 4 photos in web/public/images/ (see instructions). Add/remove slides freely.
const SLIDES = [
  { img: '/images/air.jpg', label: 'Air freight', text: 'Fast, reliable cargo by air' },
  { img: '/images/sea.jpg', label: 'Sea freight', text: 'Container shipping across the world' },
  { img: '/images/road.jpg', label: 'Road transport', text: 'Door-to-door delivery on time' },
  ];

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    SLIDES.forEach((s) => { new Image().src = s.img; }); // preload
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 6000);
    return () => clearInterval(t);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(r.accessToken);
      setUser(r.user);
      nav(r.user.role === 'ADMIN' ? '/users' : r.user.role === 'CLEARING_AGENT' ? '/clearance' : '/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lg-page">
      <div className="lg-bg" aria-hidden="true">
        {SLIDES.map((s, i) => (
          <div
            key={s.img}
            className={`lg-slide${i === idx ? ' active' : ''}`}
            style={{ backgroundImage: `url(${s.img})` }}
          />
        ))}
        <div className="lg-overlay" />
      </div>

      <div className="lg-caption" aria-hidden="true">
        <div key={idx} className="lg-caption-text">
          <strong>{SLIDES[idx].label}</strong>
          <span>{SLIDES[idx].text}</span>
        </div>
        <div className="lg-dots">
          {SLIDES.map((_, i) => (
            <i key={i} className={i === idx ? 'on' : ''} />
          ))}
        </div>
      </div>

      <form className="lg-card" onSubmit={submit}>
        <div className="lg-brand">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#1d4ed8" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M12 2 3 7v10l9 5 9-5V7z" />
            <path d="M3 7l9 5 9-5M12 12v10" />
          </svg>
          <div>
            <h1>Kiaan Cargo</h1>
            <p>Freight · Clearance · Logistics</p>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="lg-field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="lg-field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="lg-btn" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </div>
  );
}