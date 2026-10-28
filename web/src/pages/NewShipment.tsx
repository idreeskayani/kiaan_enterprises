import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, previewPdf } from '../api';
import { ShareButton } from '../Share';
import { Breakdown, fmt} from '../components';

type Item = { lengthCm: string; widthCm: string; heightCm: string; weightKg: string; qty: string };
type Extra = { label: string; amount: string; currency: string; exRate: string };
const blank: Item = { lengthCm: '', widthCm: '', heightCm: '', weightKg: '', qty: '1' };
const num = (s: string) => Number(s) || 0;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const NEW = '__new__';
const CURRENCIES = ['USD', 'GBP', 'EUR', 'AED', 'SAR', 'CNY', 'PKR'];

const NAMES: Record<
  string,
  { master: string; house: string; carrier: string; line: string; freight: string }
> = {
  AIR: { master: 'MAWB No.', house: 'HAWB No.', carrier: 'Flight', line: 'Air Line', freight: 'Air Freight' },
  SEA: { master: 'MBL No.', house: 'HBL No.', carrier: 'Vessel', line: 'Shipping Line', freight: 'Sea Freight' },
  ROAD: { master: 'Waybill No.', house: 'Ref No.', carrier: 'Vehicle', line: 'Transporter', freight: 'Road Freight' },
};

export default function NewShipment() {
  const nav = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [past, setPast] = useState<any[]>([]);
  const [fx, setFx] = useState<Record<string, number>>({});

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
  const [freightLabel, setFreightLabel] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [exRate, setExRate] = useState('');
  const [ratePerUnit, setRatePerUnit] = useState('');
  const [minCharge, setMinCharge] = useState('');
  const [fuelPct, setFuelPct] = useState('');
  const [handling, setHandling] = useState('');
  const [volDivisor, setVolDivisor] = useState('');
  const [freightOverride, setFreightOverride] = useState('');
  const [doCharges, setDoCharges] = useState('');
  const [extras, setExtras] = useState<Extra[]>([]);
  const [saveRate, setSaveRate] = useState(true);
  
  // shipment details
  const [goodsValue, setGoodsValue] = useState('');
  const [blAwbNo, setBlAwbNo] = useState('');
  const [hawbNo, setHawbNo] = useState('');
  const [flight, setFlight] = useState('');
  const [eta, setEta] = useState('');
  const [det, setDet] = useState<Record<string, string>>({ direction: 'IMPORT' });
  const [showMore, setShowMore] = useState(false);
  const [items, setItems] = useState<Item[]>([{ ...blank }]);

  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api('/customers'), api('/rate-cards'), api('/shipments'), api('/exchange-rates')])
      .then(([c, r, s, e]) => {
        setCustomers(c);
        setRates(r);
        setPast(s);
        setFx(Object.fromEntries(e.map((x: any) => [x.currency, Number(x.rate)])));
      })
      .catch((err) => setError(err.message));
  }, []);

  // picking a currency fills in its saved exchange rate
  useEffect(() => {
    if (currency !== 'PKR') setExRate(fx[currency] ? String(fx[currency]) : '');
  }, [currency, fx]);


  const customerId = customerSel && customerSel !== NEW ? customerSel : '';
  const names = NAMES[mode] ?? NAMES.AIR;

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
  const exOk = currency === 'PKR' || num(exRate) > 0;
  const extrasOk = extras.every(
    (e) =>
      !(e.label.trim() && num(e.amount) > 0) ||
      e.currency === 'PKR' ||
      e.currency === currency ||
      num(e.exRate) > 0,
  );
  const ready =
    !!origin.trim() && !!destination.trim() && itemsValid && hasFreight && exOk && extrasOk;
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
    freightLabel: freightLabel.trim() || undefined,
    currency,
    exRate: currency === 'PKR' ? undefined : num(exRate),
    doCharges: doCharges !== '' ? num(doCharges) : undefined,
    blAwbNo: blAwbNo.trim() || undefined,
    hawbNo: hawbNo.trim() || undefined,
    flight: flight.trim() || undefined,
    extraCharges: extras
      .filter((e) => e.label.trim() && num(e.amount) > 0)
      .map((e) => ({
        label: e.label.trim(),
        amount: num(e.amount),
        currency: e.currency,
        exRate: e.currency === 'PKR' || e.currency === currency ? undefined : num(e.exRate),
      })),
    details: Object.fromEntries(Object.entries(det).filter(([, v]) => v.trim())),
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
    mode, origin, destination, goodsValue, freightLabel, currency, exRate,
    ratePerUnit, minCharge, fuelPct, handling, volDivisor, freightOverride, doCharges,
    items, extras,
  ]);

  const setItem = (idx: number, k: keyof Item, v: string) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));
  const setExtra = (idx: number, patch: Partial<Extra>) =>
    setExtras(extras.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const setD = (k: string, v: string) => setDet({ ...det, [k]: v });

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
    if (!origin.trim() || !destination.trim()) return 'Enter the origin and destination';
    if (!hasFreight) return 'Enter the freight rate or a total freight amount';
    if (!exOk) return `Enter the exchange rate (PKR per 1 ${currency})`;
    if (!extrasOk) return 'Enter the exchange rate for the other charges';
    if (!itemsValid) return 'Fill in the size and weight of every package';
    return '';
  }

  // ---- quotation: saved as a draft, marked "sent" only when it is actually sent
  const savedRef = useRef(false); // true once this form has produced a quotation
  const [sendQuote, setSendQuote] = useState<any>(null);

  const quotationBody = () => ({ ...body(), customerId, eta: eta || undefined });

  async function saveQuotation(send: boolean) {
    const problem = check();
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      if (saveRate && num(ratePerUnit) > 0) await saveRateCard();
      const q = await api('/quotations', { method: 'POST', body: quotationBody() });
      savedRef.current = true;
      if (send) setSendQuote(q); // opens the send popup (WhatsApp / Gmail / download)
      else nav('/quotations');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Leaving the page without sending: keep a complete form as a draft quotation.
  const autoSave = useRef<() => void>(() => {});
  autoSave.current = () => {
    if (savedRef.current || check()) return;
    savedRef.current = true;
    api('/quotations', { method: 'POST', body: quotationBody(), keepalive: true }).catch(() => {});
  };
  useEffect(() => {
    const onHide = () => autoSave.current();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      autoSave.current();
    };
  }, []);

  async function viewQuotation() {
    const problem = check();
    if (problem) return setError(problem);

    const win = window.open('', '_blank');
    setBusy(true);
    setError('');
    try {
      await previewPdf(quotationBody(), win, '/quotations/preview');
    } catch (err) {
      win?.close();
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const unit = mode === 'SEA' ? 'CBM' : 'kg';
  const MORE: [string, string, 'text' | 'date'][] = [
    ['custRef', 'Customer ref no.', 'text'],
    ['mawbDate', `${names.master} date`, 'date'],
    ['hawbDate', `${names.house} date`, 'date'],
    ['etd', 'ETD', 'date'],
    ['doNo', 'D/O no.', 'text'],
    ['doDate', 'D/O date', 'date'],
    ['igmNo', 'IGM no.', 'text'],
    ['igmDate', 'IGM date', 'date'],
    ['beNo', 'B/E no.', 'text'],
    ['beDate', 'B/E date', 'date'],
  ];

  return (
    <form onSubmit={(e) => e.preventDefault()}>
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
              <div><label>NTN / Tax number</label><input value={cTax} onChange={(e) => setCTax(e.target.value)} /></div>
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
            <label>Direction</label>
            <select value={det.direction} onChange={(e) => setD('direction', e.target.value)}>
              <option value="IMPORT">Import</option>
              <option value="EXPORT">Export</option>
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
            <label>Origin (from)</label>
            <input list="places" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. (MAN) MANCHESTER, UNITED KINGDOM" />
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
            <label>Destination (to)</label>
            <input list="places" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. (KHI) KARACHI AIRPORT" />
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
          <div style={{ flex: 2 }}>
            <label>Description on invoice</label>
            <input value={freightLabel} onChange={(e) => setFreightLabel(e.target.value)} placeholder={`e.g. ${names.freight} & EXW Cost`} />
          </div>
          <div>
            <label>Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {currency !== 'PKR' && (
            <div>
              <label>Exchange rate (1 {currency} = PKR)</label>
              <input type="number" min="0" step="any" value={exRate} onChange={(e) => setExRate(e.target.value)} />
              <span className="muted">
                {fx[currency] ? `Saved rate: ${fx[currency]}` : 'No saved rate. Set it under Exchange rates.'}
              </span>
            </div>
          )}
        </div>
        <br />
        <div className="row">
          <div>
            <label>Rate per {unit} ({currency})</label>
            <input type="number" min="0" step="any" value={ratePerUnit} onChange={(e) => setRatePerUnit(e.target.value)} />
          </div>
          <div>
            <label>Minimum charge ({currency})</label>
            <input type="number" min="0" step="any" value={minCharge} onChange={(e) => setMinCharge(e.target.value)} />
          </div>
          <div>
            <label>Fuel surcharge %</label>
            <input type="number" min="0" step="any" value={fuelPct} onChange={(e) => setFuelPct(e.target.value)} />
          </div>
          <div>
            <label>Handling ({currency})</label>
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
            <label>Override total freight ({currency})</label>
            <input
              type="number" min="0" step="any" value={freightOverride}
              placeholder="Leave empty to calculate from the rate"
              onChange={(e) => setFreightOverride(e.target.value)}
            />
          </div>
          <div>
            <label>D/O charges (PKR)</label>
            <input type="number" min="0" step="any" value={doCharges} onChange={(e) => setDoCharges(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 22 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={saveRate} onChange={(e) => setSaveRate(e.target.checked)} />
              Save this rate for this route
            </label>
          </div>
        </div>
        <p className="muted">
          A freight amount replaces the calculated freight (no fuel or handling is added). D/O charges
          are in PKR and are added on top.
        </p>
      </div>

      <div className="card">
        <h3>Other charges</h3>
        {extras.map((e, idx) => (
          <div className="row" key={idx} style={{ marginBottom: 10 }}>
            <div style={{ flex: 3 }}>
              <label>Description</label>
              <input value={e.label} placeholder="e.g. Export License & Docs Fee" onChange={(ev) => setExtra(idx, { label: ev.target.value })} />
            </div>
            <div>
              <label>Amount</label>
              <input type="number" min="0" step="any" value={e.amount} onChange={(ev) => setExtra(idx, { amount: ev.target.value })} />
            </div>
            <div>
              <label>Currency</label>
              <select
                value={e.currency}
                onChange={(ev) =>
                  setExtra(idx, {
                    currency: ev.target.value,
                    exRate: fx[ev.target.value] ? String(fx[ev.target.value]) : '',
                  })
                }
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {e.currency !== 'PKR' && e.currency !== currency && (
              <div>
                <label>1 {e.currency} = PKR</label>
                <input type="number" min="0" step="any" value={e.exRate} onChange={(ev) => setExtra(idx, { exRate: ev.target.value })} />
              </div>
            )}
            <button type="button" className="ghost small" onClick={() => setExtras(extras.filter((_, i) => i !== idx))}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ghost"
          onClick={() => setExtras([...extras, { label: '', amount: '', currency, exRate: '' }])}
        >
          + Add charge
        </button>
      </div>

      <div className="card">
        <h3>Shipment details</h3>
        <div className="row">
          <div>
            <label>{names.line}</label>
            <input value={det.airline ?? ''} onChange={(e) => setD('airline', e.target.value)} placeholder="e.g. QATAR AIRWAYS- QR" />
          </div>
          <div>
            <label>Shipper</label>
            <input value={det.shipper ?? ''} onChange={(e) => setD('shipper', e.target.value)} />
          </div>
          <div>
            <label>Commodity</label>
            <input value={det.commodity ?? ''} onChange={(e) => setD('commodity', e.target.value)} />
          </div>
        </div>
        <br />
        <div className="row">
          <div>
            <label>{names.master}</label>
            <input value={blAwbNo} onChange={(e) => setBlAwbNo(e.target.value)} />
          </div>
          <div>
            <label>{names.house}</label>
            <input value={hawbNo} onChange={(e) => setHawbNo(e.target.value)} />
          </div>
          <div>
            <label>{names.carrier} (optional)</label>
            <input value={flight} onChange={(e) => setFlight(e.target.value)} />
          </div>
          <div>
            <label>ETA</label>
            <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
          </div>
          <div>
            <label>Goods value (optional)</label>
            <input type="number" min="0" step="any" value={goodsValue} onChange={(e) => setGoodsValue(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="ghost small" onClick={() => setShowMore(!showMore)}>
            {showMore ? 'Hide extra invoice fields' : 'Show extra invoice fields (D/O, IGM, B/E, ETD, dates)'}
          </button>
        </div>
        {showMore && (
          <div className="grid" style={{ marginTop: 12 }}>
            {MORE.map(([key, text, type]) => (
              <div key={key}>
                <label>{text}</label>
                <input type={type} value={det[key] ?? ''} onChange={(e) => setD(key, e.target.value)} />
              </div>
            ))}
          </div>
        )}
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
        <button type="button" className="ghost" disabled={busy} onClick={viewQuotation}>
          View quotation
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => saveQuotation(false)}>
          {busy ? 'Saving...' : 'Save draft'}
        </button>
        <button type="button" disabled={busy} onClick={() => saveQuotation(true)}>
          Send quotation
        </button>
      </div>

      {sendQuote && (
        <ShareButton
          hideButton
          defaultOpen
          docLabel="quotation"
          path={`/quotations/${sendQuote.id}/pdf`}
          invoiceNo={sendQuote.quoteNo}
          company="Kiaan Freight Services"
          customer={sendQuote.customer?.name}
          total={sendQuote.total}
          onShared={() => api(`/quotations/${sendQuote.id}/send`, { method: 'POST' }).catch(() => {})}
          onClose={() => nav('/quotations')}
        />
      )}
    </form>
  );
}