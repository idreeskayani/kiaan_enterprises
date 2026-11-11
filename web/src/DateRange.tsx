import { useState } from 'react';

// From / To date filter used on every list and dashboard.
// Dates are "YYYY-MM-DD" (empty = no limit); the API reads them as ?from=&to=.
export type DateRangeState = {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  active: boolean; // a date is chosen
  bad: boolean; // "From" is after "To"
  qs: string; // "from=2026-11-01&to=2026-11-11", empty when no dates
  label: string; // "2026-11-01 to 2026-11-11" for messages
};

export function useDateRange(initialFrom = '', initialTo = ''): DateRangeState {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return {
    from,
    to,
    setFrom,
    setTo,
    active: !!(from || to),
    bad: !!from && !!to && from > to,
    qs: p.toString(),
    label: `${from || '…'} to ${to || '…'}`,
  };
}

// "?a=1" + dates -> "?a=1&from=..&to=.."  (or "?from=..&to=.." / "" when nothing to add)
export const withDates = (path: string, r: Pick<DateRangeState, 'qs'>) =>
  r.qs ? `${path}${path.includes('?') ? '&' : '?'}${r.qs}` : path;

// local calendar date (not UTC) as YYYY-MM-DD
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function DateRange({
  from, to, setFrom, setTo, bad,
}: Pick<DateRangeState, 'from' | 'to' | 'setFrom' | 'setTo'> & { bad?: boolean }) {
  const set = (a: string, b: string) => { setFrom(a); setTo(b); };
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return (
    <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <label>From date</label>
        <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <label>To date</label>
        <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      </div>
      <button type="button" className="ghost small" onClick={() => set(ymd(now), ymd(now))}>Today</button>
      <button type="button" className="ghost small" onClick={() => set(ymd(new Date(y, m, 1)), ymd(now))}>This month</button>
      <button type="button" className="ghost small" onClick={() => set(ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0)))}>Last month</button>
      <button type="button" className="ghost small" onClick={() => set(ymd(new Date(y, 0, 1)), ymd(now))}>This year</button>
      {(from || to) && <button type="button" className="ghost small" onClick={() => set('', '')}>Clear dates</button>}
      {bad && <span className="error" style={{ margin: 0 }}>"From" must be before "To"</span>}
    </div>
  );
}
