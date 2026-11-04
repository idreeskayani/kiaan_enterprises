import { useState } from 'react';
import { api } from './api';
import { fmt } from './components';

export type PayMethod = '' | 'CASH' | 'CHEQUE' | 'ONLINE';
export type PayInfo = { method: PayMethod; reference: string; image: string };

export const emptyPay: PayInfo = { method: '', reference: '', image: '' };

const METHODS: { value: Exclude<PayMethod, ''>; text: string }[] = [
  { value: 'CASH', text: 'Cash' },
  { value: 'CHEQUE', text: 'Cheque' },
  { value: 'ONLINE', text: 'Online transfer' },
];
export const methodText = (m?: string | null) => METHODS.find((x) => x.value === m)?.text ?? '';

// '' when the payment details are complete, otherwise the message to show
export function payError(p: PayInfo): string {
  if (!p.method) return 'Choose how it was paid: cash, cheque or online transfer';
  if (p.method === 'CHEQUE' && !p.reference.trim()) return 'Enter the cheque number';
  return '';
}

// the part of the request body that carries the payment details
export function payBody(p: PayInfo) {
  return {
    method: p.method,
    reference: p.method === 'CASH' ? undefined : p.reference.trim() || undefined,
    image: p.image || undefined,
  };
}

// Shrinks a photo so it stays small in the database (max 1280px wide/high, JPEG).
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error('Could not read the picture'));
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not a picture'));
    };
    img.src = url;
  });
}

// Payment method buttons, cheque / reference number and an optional picture.
export function PayFields({
  value,
  onChange,
  disabled,
}: {
  value: PayInfo;
  onChange: (p: PayInfo) => void;
  disabled?: boolean;
}) {
  const [picError, setPicError] = useState('');

  async function pick(file?: File) {
    setPicError('');
    if (!file) return;
    try {
      onChange({ ...value, image: await shrink(file) });
    } catch (e) {
      setPicError((e as Error).message);
    }
  }

  return (
    <div className="payfields">
      <label>Payment method</label>
      <div className="paymethods">
        {METHODS.map((m) => (
          <button
            type="button"
            key={m.value}
            disabled={disabled}
            className={value.method === m.value ? 'active' : ''}
            onClick={() => onChange({ ...value, method: m.value })}
          >
            {m.text}
          </button>
        ))}
      </div>

      {value.method === 'CHEQUE' && (
        <>
          <label>Cheque number</label>
          <input
            value={value.reference}
            disabled={disabled}
            placeholder="Cheque number"
            onChange={(e) => onChange({ ...value, reference: e.target.value })}
          />
        </>
      )}
      {value.method === 'ONLINE' && (
        <>
          <label>Transaction / reference no. (optional)</label>
          <input
            value={value.reference}
            disabled={disabled}
            placeholder="Transaction reference"
            onChange={(e) => onChange({ ...value, reference: e.target.value })}
          />
        </>
      )}

      {value.method && (
        <>
          <label>Picture (optional)</label>
          {value.image ? (
            <div className="paypic">
              <img src={value.image} alt="Payment proof" />
              <button
                type="button"
                className="ghost small"
                disabled={disabled}
                onClick={() => onChange({ ...value, image: '' })}
              >
                Remove
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept="image/*"
              disabled={disabled}
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          )}
          {picError && <div className="error" style={{ marginTop: 6 }}>{picError}</div>}
        </>
      )}
    </div>
  );
}

// "Cheque #1234 · View pic" under a payment badge: the latest payment of a row.
export function PaymentNote({ p }: { p?: any }) {
  if (!p) return null;

  async function view() {
    const win = window.open('', '_blank');
    try {
      const { image } = await api<{ image: string | null }>(`/invoices/payments/${p.id}/image`);
      if (!image) throw new Error('No picture');
      const blob = await (await fetch(image)).blob();
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else window.open(url, '_blank');
    } catch {
      win?.close();
    }
  }

  return (
    <span className="due" style={{ color: '#6b7686', fontWeight: 400 }}>
      {p.direction === 'CREDIT' ? 'Received' : 'Paid'} PKR {fmt(p.amount)} · {methodText(p.method)}
      {p.reference ? ` #${p.reference}` : ''}
      {p.hasImage && (
        <>
          {' · '}
          <a href="#" onClick={(e) => { e.preventDefault(); view(); }}>View pic</a>
        </>
      )}
    </span>
  );
}
