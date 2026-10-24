import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, openPdf, previewPdf } from '../api';
import { Breakdown } from '../components';

type Item = { lengthCm: string; widthCm: string; heightCm: string; weightKg: string; qty: string };
const blank: Item = { lengthCm: '', widthCm: '', heightCm: '', weightKg: '', qty: '1' };
const num = (s: string) => Number(s) || 0;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const NEW = '__new__';

export default function NewShipment() {
  const nav = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [past, setPast] = useState<any[]>([]);

  // customer
  const [customerSel, setCustomerSel] = useState('');
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cTax, setCTax] = useState('');

  // route
  const [mode, setMode] = useState('AIR');
  const [origin, setOrigin] = useState('');
  const [via, setVia] = useState<string[]>([]);
  const [destination, setDestination] = useState('');

  // freight
  const [ratePerUnit, setRatePerUnit] = useState('');
  const [minCharge, setMinCharge] = useState('');
  const [fuelPct, setFuelPct] = useState('');
  const [handling, setHandling] = useState('');
  const [volDivisor, setVolDivisor] = useState('');
  const [doCharges, setDoCharges] = useState('');
  const [freightOverride, setFreightOverride] = useState('');
  const [saveRate, setSaveRate] = useState(true);

  // shipment details
  const [goodsValue, setGoodsValue] = useState('');
  const [blAwbNo, setBlAwbNo] = useState('');
  const [eta, setEta] = useState('');
  const [items, setItems] = useState<Item[]>([{ ...blank }]);

  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api('/customers'), api('/rate-cards'), api('/shipments')])
      .then(([c, r, s]) => {
        setCustomers(c);
        setRates(r);
        setPast(s);
      })
      .catch((e) => setError(e.message));
  }, []);

  const customerId = customerSel && customerSel !== NEW ? customerSel : '';

  // places typed before (optional suggestions)
  const places = useMemo(() => {
    const set = new Set<string>();
    rates.forEach((r) => { set.add(r.origin); set.add(r.destination); });
    past.forEach((s) => {
      set.add(s.origin);
      set.add(s.destination);
      (s.viaPoints ?? []).forEach((p: string) => set.add(p));
    });
    return Array.from(set).sort();
  }, [rates, past]);

  // saved route matching the typed origin and destination
  const matched = useMemo(
    () =>
      origin.trim() && destination.trim()
        ? rates.find((r) => r.mode === mode && same(r.origin, origin) && same(r.destination, destination))
        : undefined,
    [rates, mode, origin, destination],
  );
  const matchedId = matched?.id ?? '';

  useEffect(() => {
    if (matched) {
      setRatePerUnit(String(Number(matched.ratePerUnit)));
      setMinCharge(String(Number(matched.minCharge)));
      setFuelPct(String(Number(matched.fuelPct)));
      setHandling(String(Number(matched.handling)));
    }
    setSaveRate(!matched);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedId]);

  const itemsValid = items.every(
    (i) => num(i.lengthCm) > 0 && num(i.widthCm) > 0 && num(i.heightCm) > 0 && num(i.weightKg) > 0 && num(i.qty) >= 1,
  );
  const hasFreight = freightOverride !== '' || num(ratePerUnit) > 0;
  const ready = !!origin.trim() && !!destination.trim() && itemsValid && hasFreight;
  const routeText = [origin, ...via, destination].map((p) => p.trim()).filter(Boolean).join(' → ');

  const body = () => ({
    mode,
    origin: origin.trim(),
    destination: destination.trim(),
    viaPoints: via.map((p) => p.trim()).filter(Boolean),
    goodsValue: num(goodsValue),
    rate: {
      ratePerUnit: num(ratePerUnit),
      minCharge: num(minCharge),
      fuelPct: num(fuelPct),
      handling: num(handling),
      volDivisor: num(volDivisor) >= 1 ? Math.floor(num(volDivisor)) : undefined,
    },
    freightOverride: freightOverride !== '' ? num(freightOverride) : undefined,
    doCharges: doCharges !== '' ? num(doCharges) : undefined,
    items: items.map((i) => ({
      lengthCm: num(i.lengthCm),
      widthCm: num(i.widthCm),
      heightCm: num(i.heightCm),
      weightKg: num(i.weightKg),
      qty: Math.max(1, Math.floor(num(i.qty))),
    })),
  });

  // live calculation (debounced)
  useEffect(() => {
    if (!ready) {
      setQuote(null);
      return;
    }
    const t = setTimeout(() => {
      api('/shipments/quote', { method: 'POST', body: body() })
        .then((q) => {
          setQuote(q);
          setError('');
        })
        .catch((e) => {
          setQuote(null);
          setError(e.message);
        });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode, origin, destination, goodsValue,
    ratePerUnit, minCharge, fuelPct, handling, volDivisor, doCharges, freightOverride,
    JSON.stringify(items),
  ]);

  const setItem = (idx: number, k: keyof Item, v: string) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));

  async function saveCustomer() {
    if (!cName.trim()) return setError('Enter the customer name');
    try {
      const c = await api('/customers', {
        method: 'POST',
        body: {
          name: cName.trim(),
          phone: cPhone.trim() || undefined,
          address: cAddress.trim() || undefined,
          taxNumber: cTax.trim() || undefined,
        },
      });
      setCustomers([...customers, c].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerSel(c.id);
      setCName(''); setCPhone(''); setCAddress(''); setCTax('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveRateCard() {
    const o = origin.trim();
    const d = destination.trim();
    const data = {
      ratePerUnit: num(ratePerUnit),
      minCharge: num(minCharge),
      fuelPct: num(fuelPct),
      handling: num(handling),
    };
    const existing = rates.find((r) => r.mode === mode && same(r.origin, o) && same(r.destination, d));
    try {
      if (existing) await api(`/rate-cards/${existing.id}`, { method: 'PATCH', body: data });
      else await api('/rate-cards', { method: 'POST', body: { mode, origin: o, destination: d, ...data } });
    } catch {
      // the shipment is still created even if saving the route fails
    }
  }

  function check() {
    if (!customerId) return 'Select a customer or add a new one';
    if (!ready) return 'Fill in the route, freight rate (or freight amount) and all package sizes';
    return '';
  }

  async function submit(withInvoice: boolean) {
    const problem = check();
    if (problem) return setError(problem);

    // open the tab now (on click) so the browser does not block it later
    const win = withInvoice ? window.open('', '_blank') : null;
    setBusy(true);
    setError('');
    try {
      if (saveRate && num(ratePerUnit) > 0) await saveRateCard();
      const s = await api('/shipments', {
        method: 'POST',
        body: { ...body(), customerId, blAwbNo: blAwbNo || undefined, eta: eta || undefined },
      });
      if (withInvoice) {
        try {
          const inv = await api(`/invoices/shipment/${s.id}`, { method: 'POST' });
          await openPdf(inv.id, win);
        } catch (err) {
          win?.close();
          window.alert(`Shipment ${s.refNo} was created, but the invoice failed: ${(err as Error).message}`);
        }
      }
      nav(`/shipments/${s.id}`);
    } catch (err) {
      win?.close();
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function viewInvoice() {
    const problem = check();
    if (problem) return setError(problem);

    const win = window.open('', '_blank');
    setBusy(true);
    setError('');
    try {
      await previewPdf(
        { ...body(), customerId, blAwbNo: blAwbNo || undefined, eta: eta || undefined },
        win,
      );
    } catch (err) {
      win?.close();
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const unit = mode === 'SEA' ? 'CBM' : 'kg';

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <h1>New shipment</h1>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h3>Customer</h3>
        <div className="row">
          <div>
            <label>Customer</label>
            <select value={customerSel} onChange={(e) => setCustomerSel(e.target.value)}>
              <option value="">Select...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value={NEW}>+ Add new customer</option>
            </select>
          </div>
        </div>
        {customerSel === NEW && (
          <>
            <br />
            <div className="row">
              <div><label>Name</label><input value={cName} onChange={(e) => setCName(e.target.value)} /></div>
              <div><label>Phone</label><input value={cPhone} onChange={(e) => setCPhone(e.target.value)} /></div>
              <div><label>Address</label><input value={cAddress} onChange={(e) => setCAddress(e.target.value)} /></div>
              <div><label>Tax number</label><input value={cTax} onChange={(e) => setCTax(e.target.value)} /></div>
              <button type="button" onClick={saveCustomer}>Save customer</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3>Route</h3>
        <div className="row">
          <div>
            <label>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="AIR">Air</option>
              <option value="SEA">Sea</option>
              <option value="ROAD">Road</option>
            </select>
          </div>
          <div>
            <label>Saved routes</label>
            <select
              value=""
              onChange={(e) => {
                const r = rates.find((x) => x.id === e.target.value);
                if (r) {
                  setOrigin(r.origin);
                  setDestination(r.destination);
                  setVia([]);
                }
              }}
            >
              <option value="">Pick a saved route...</option>
              {rates.filter((r) => r.mode === mode).map((r) => (
                <option key={r.id} value={r.id}>{r.origin} → {r.destination}</option>
              ))}
            </select>
          </div>
        </div>
        <br />
        <div className="row">
          <div>
            <label>Origin</label>
            <input list="places" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Dubai" />
          </div>
          {via.map((v, idx) => (
            <div key={idx}>
              <label>Stop {idx + 1}</label>
              <input
                list="places"
                value={v}
                onChange={(e) => setVia(via.map((x, i) => (i === idx ? e.target.value : x)))}
                placeholder="e.g. Saudi Arabia"
              />
              <button
                type="button"
                className="ghost small"
                style={{ marginTop: 6 }}
                onClick={() => setVia(via.filter((_, i) => i !== idx))}
              >
                Remove stop
              </button>
            </div>
          ))}
          <div>
            <label>Destination</label>
            <input list="places" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Pakistan" />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="ghost small" onClick={() => setVia([...via, ''])}>
            + Add stop
          </button>
        </div>
        <datalist id="places">
          {places.map((p) => <option key={p} value={p} />)}
        </datalist>
        {routeText && <p><b>Route:</b> {routeText}</p>}
        <p className="muted">
          {matched
            ? 'Saved route found: its freight rates were filled in below. You can change them for this shipment.'
            : origin.trim() && destination.trim()
              ? 'New route: enter your freight rate below.'
              : 'Type any places, or pick a saved route. Rates are matched on origin and destination.'}
        </p>
      </div>

      <div className="card">
        <h3>Freight</h3>
        <div className="row">
          <div>
            <label>Rate per {unit}</label>
            <input type="number" min="0" step="any" value={ratePerUnit} onChange={(e) => setRatePerUnit(e.target.value)} />
          </div>
          <div>
            <label>Minimum charge</label>
            <input type="number" min="0" step="any" value={minCharge} onChange={(e) => setMinCharge(e.target.value)} />
          </div>
          <div>
            <label>Fuel surcharge %</label>
            <input type="number" min="0" step="any" value={fuelPct} onChange={(e) => setFuelPct(e.target.value)} />
          </div>
          <div>
            <label>Exworx (fixed)</label>
            <input type="number" min="0" step="any" value={handling} onChange={(e) => setHandling(e.target.value)} />
          </div>
          {mode !== 'SEA' && (
            <div>
              <label>Volumetric divisor</label>
              <input
                type="number" min="1" step="1" value={volDivisor}
                placeholder={mode === 'ROAD' ? '4000' : '5000'}
                onChange={(e) => setVolDivisor(e.target.value)}
              />
            </div>
          )}
        </div>
        <br />
        <div className="row">
          <div>
            <label>DO charges (PKR)</label>
            <input type="number" min="0" step="any" value={doCharges} onChange={(e) => setDoCharges(e.target.value)} />
          </div>
          <div>
            <label>Override total freight (optional)</label>
            <input
              type="number" min="0" step="any" value={freightOverride}
              placeholder="Leave empty to calculate from the rate"
              onChange={(e) => setFreightOverride(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 22 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={saveRate} onChange={(e) => setSaveRate(e.target.checked)} />
              Save this rate for this route
            </label>
          </div>
        </div>
        <p className="muted">
          A freight amount replaces the calculated freight (no fuel or handling is added). DO charges are
          always added on top, so leave them at 0 if your override already includes them.
        </p>
      </div>

      <div className="card">
        <h3>Shipment details</h3>
        <div className="row">
          <div>
            <label>Goods value (optional)</label>
            <input type="number" min="0" step="any" value={goodsValue} onChange={(e) => setGoodsValue(e.target.value)} />
          </div>
          <div>
            <label>BL / AWB number</label>
            <input value={blAwbNo} onChange={(e) => setBlAwbNo(e.target.value)} />
          </div>
          <div>
            <label>ETA</label>
            <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Packages (cm / kg)</h3>
        {items.map((it, idx) => (
          <div className="row" key={idx} style={{ marginBottom: 10 }}>
            {(['lengthCm', 'widthCm', 'heightCm', 'weightKg', 'qty'] as (keyof Item)[]).map((k) => (
              <div key={k}>
                <label>{{ lengthCm: 'Length', widthCm: 'Width', heightCm: 'Height', weightKg: 'Weight', qty: 'Qty' }[k]}</label>
                <input type="number" min="0" step="any" value={it[k]} onChange={(e) => setItem(idx, k, e.target.value)} />
              </div>
            ))}
            {items.length > 1 && (
              <button type="button" className="ghost small" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => setItems([...items, { ...blank }])}>
          + Add package
        </button>
      </div>

      {quote && <Breakdown q={quote} />}

      <div className="row" style={{ gap: 10 }}>
        <button disabled={busy}>{busy ? 'Saving...' : 'Create shipment'}</button>
        <button type="button" className="ghost" disabled={busy} onClick={viewInvoice}>
          View invoice
        </button>
        <button type="button" disabled={busy} onClick={() => submit(true)}>
          Generate invoice
        </button>
      </div>
    </form>
  );
}