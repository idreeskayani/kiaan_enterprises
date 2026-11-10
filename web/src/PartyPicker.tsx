import { useEffect, useState } from 'react';
import { api } from './api';

export type Party = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
};

type Form = { name: string; phone: string; address: string; taxNumber: string };
const EMPTY: Form = { name: '', phone: '', address: '', taxNumber: '' };
const toForm = (p?: Party | null): Form => ({
  name: p?.name ?? '',
  phone: p?.phone ?? '',
  address: p?.address ?? '',
  taxNumber: p?.taxNumber ?? '',
});
const byName = (a: Party, b: Party) => a.name.localeCompare(b.name);

// Pick a saved customer / vendor, add a new one, or fix the details of the one picked.
// `endpoint` is '/customers' or '/vendors'.
export default function PartyPicker({
  label,
  noun,
  endpoint,
  list,
  value,
  onChange,
  onList,
  onError,
  optional = false,
  emptyLabel = 'Select...',
}: {
  label: string;
  noun: string; // "customer" | "vendor"
  endpoint: string;
  list: Party[];
  value: string; // selected id, '' for none
  onChange: (id: string) => void;
  onList: (next: Party[]) => void;
  onError?: (message: string) => void;
  optional?: boolean;
  emptyLabel?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const selected = list.find((p) => p.id === value) ?? null;

  // show the saved details of whoever is picked
  useEffect(() => {
    if (adding) return;
    setForm(toForm(selected));
    setMsg('');
  }, [selected?.id, selected?.name, selected?.phone, selected?.address, selected?.taxNumber, adding]);

  const dirty =
    !!selected &&
    (form.name !== selected.name ||
      form.phone !== (selected.phone ?? '') ||
      form.address !== (selected.address ?? '') ||
      form.taxNumber !== (selected.taxNumber ?? ''));

  const fail = (e: unknown) => {
    const m = (e as Error).message;
    setMsg(m);
    onError?.(m);
  };

  function pick(v: string) {
    setMsg('');
    if (v === '__new__') {
      setAdding(true);
      setForm(EMPTY);
      onChange('');
      return;
    }
    setAdding(false);
    onChange(v);
  }

  async function saveNew() {
    if (!form.name.trim()) return setMsg(`Enter the ${noun} name`);
    setBusy(true);
    setMsg('');
    try {
      const created: Party = await api(endpoint, {
        method: 'POST',
        body: {
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          address: form.address.trim() || undefined,
          taxNumber: form.taxNumber.trim() || undefined,
        },
      });
      onList([...list, created].sort(byName));
      setAdding(false);
      onChange(created.id);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveChanges() {
    if (!selected) return;
    if (!form.name.trim()) return setMsg(`Enter the ${noun} name`);
    setBusy(true);
    setMsg('');
    try {
      const updated: Party = await api(`${endpoint}/${selected.id}`, {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          taxNumber: form.taxNumber.trim(),
        },
      });
      onList(list.map((p) => (p.id === updated.id ? updated : p)).sort(byName));
      setMsg('Saved');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof Form, v: string) => setForm({ ...form, [k]: v });
  const showFields = adding || !!selected;

  return (
    <div>
      <div className="row">
        <div>
          <label>{label}</label>
          <select value={adding ? '__new__' : value} onChange={(e) => pick(e.target.value)}>
            <option value="">{optional ? emptyLabel : 'Select...'}</option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="__new__">+ Add new {noun}</option>
          </select>
        </div>
      </div>
      {showFields && (
        <>
          <br />
          <div className="row">
            <div><label>Name</label><input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div><label>Phone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            <div><label>Address</label><input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
            <div><label>NTN / Tax number</label><input value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} /></div>
          </div>
          <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
            {adding ? (
              <>
                <button type="button" disabled={busy} onClick={saveNew}>{busy ? 'Saving...' : `Save ${noun}`}</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => pick('')}>Cancel</button>
              </>
            ) : (
              <button type="button" className="ghost" disabled={busy || !dirty} onClick={saveChanges}>
                {busy ? 'Saving...' : 'Save changes'}
              </button>
            )}
            {msg && <span className="muted">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
