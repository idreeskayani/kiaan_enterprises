import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getUser } from '../api';
import { TrashIcon } from '../Icons';
import { Badge } from '../components';
import { STATUSES, label } from '../constants';

export default function Shipments() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const canDelete = getUser()?.role === 'OPERATOR';

  function load() {
    api(`/shipments${status ? `?status=${status}` : ''}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }

  useEffect(load, [status]);

  async function remove(s: any) {
    if (!window.confirm(`Delete shipment ${s.refNo}? This cannot be undone.`)) return;
    setError('');
    try {
      await api(`/shipments/${s.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, flex: 3 }}>Shipments</h1>
        <div>
          <select
            value={status}
            onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </div>
        <Link to="/shipments/new"><button>+ New shipment</button></Link>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Ref</th><th>Customer</th><th>Mode</th><th>Route</th><th>Status</th><th>Created</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/shipments/${s.id}`}>{s.refNo}</Link></td>
                <td>{s.customer?.name}</td>
                <td>{s.mode}</td>
                <td>{[s.origin, ...(s.viaPoints ?? []), s.destination].join(' → ')}</td>
                <td><Badge status={s.status} /></td>
                <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                <td>
                  {canDelete && (
                    <button
                      className="small"
                      style={{ background: '#fee2e2', color: '#991b1b' }}
                      title="Delete shipment"
                      aria-label="Delete shipment"
                      onClick={() => remove(s)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="muted">No shipments found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}