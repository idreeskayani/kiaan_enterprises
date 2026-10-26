import { useEffect, useState } from 'react';
import { api } from '../api';

const COMMON = ['USD', 'GBP', 'EUR', 'AED', 'SAR', 'CNY'];

export default function ExchangeRates() {
  const [rows, setRows] = useState<any[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [newCode, setNewCode] = useState('');
  const [newRate, setNewRate] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const list = await api('/exchange-rates');
      setRows(list);
      setEdit(Object.fromEntries(list.map((r: any) => [r.currency, String(Number(r.rate))])));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const saved = new Map<string, any>(rows.map((r) => [r.currency, r]));
  const codes = Array.from(new Set([...COMMON, ...rows.map((r) => r.currency)]));

  async function save(code: string, value: string) {
    setError('');
    if (!(Number(value) > 0)) return setError(`Enter a rate for ${code}`);
    try {
      await api(`/exchange-rates/${code}`, { method: 'PUT', body: { rate: Number(value) } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(code: string) {
    if (!window.confirm(`Remove the saved rate for ${code}?`)) return;
    setError('');
    try {
      await api(`/exchange-rates/${code}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <h1>Exchange rates</h1>
      <p className="muted">
        Set how many PKR you get for 1 unit of each currency. New shipments fill the rate in
        automatically and multiply every foreign amount by it. You can still change the rate on a
        single shipment, and old invoices keep the rate they were created with.
      </p>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Currency</th>
              <th>1 unit = PKR</th>
              <th>Last updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code}>
                <td><b>{code}</b></td>
                <td>
                  <input
                    type="number" min="0" step="any" style={{ maxWidth: 160 }}
                    value={edit[code] ?? ''}
                    onChange={(e) => setEdit({ ...edit, [code]: e.target.value })}
                  />
                </td>
                <td>{saved.get(code) ? new Date(saved.get(code).updatedAt).toLocaleString() : 'Not set'}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="small" onClick={() => save(code, edit[code] ?? '')}>Save</button>
                    {saved.has(code) && (
                      <button className="ghost small" onClick={() => remove(code)}>Remove</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Add another currency</h3>
        <div className="row">
          <div>
            <label>Code (3 letters)</label>
            <input value={newCode} maxLength={3} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="e.g. AUD" />
          </div>
          <div>
            <label>1 unit = PKR</label>
            <input type="number" min="0" step="any" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
          </div>
          <button
            onClick={async () => {
              if (!/^[A-Z]{3}$/.test(newCode) || newCode === 'PKR') return setError('Enter a 3-letter currency code other than PKR');
              await save(newCode, newRate);
              setNewCode('');
              setNewRate('');
            }}
          >
            Add
          </button>
        </div>
      </div>
    </>
  );
}