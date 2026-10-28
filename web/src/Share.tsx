import { useEffect, useRef, useState } from 'react';
import { fetchPdfBlob } from './api';
import { fmt } from './components';

type Props = {
  path: string; // API path of the PDF, e.g. /clearance/<id>/pdf
  invoiceNo: string;
  company: string;
  customer?: string;
  total?: number | string;
  label?: string;
  className?: string;
  docLabel?: string; // 'invoice' (default) or 'quotation'
  onShared?: () => void; // called when the PDF is sent / downloaded
  defaultOpen?: boolean; // open the popup straight away
  hideButton?: boolean; // popup only, no button
  onClose?: () => void;
};

// "Share" button + popup: WhatsApp, Gmail, the device share sheet, or just download the PDF.
export function ShareButton({
  path, invoiceNo, company, customer, total, label = 'Share', className = 'ghost small',
  docLabel = 'invoice', onShared, defaultOpen = false, hideButton = false, onClose,
}: Props) {
  const [open, setOpenState] = useState(defaultOpen);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) onClose?.();
  };
  const Doc = docLabel[0].toUpperCase() + docLabel.slice(1);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const fileRef = useRef<File | null>(null);

  // file name = invoice no + customer name, without characters Windows does not allow
  const safe = (v: string) => v.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const filename = `${safe(invoiceNo)}${customer ? ` - ${safe(customer)}` : ''}.pdf`;
  const subject = `${Doc} ${invoiceNo} - ${company}`;
  const text =
    `Assalam o Alaikum,\n\nPlease find attached ${docLabel} ${invoiceNo} from ${company}` +
    `${customer ? ` for ${customer}` : ''}.` +
    `${total != null && total !== '' ? `\nTotal amount: PKR ${fmt(total)}` : ''}\n\nRegards,\n${company}`;

  // load the PDF as soon as the popup opens, so every button below can act instantly
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBlob(null);
    setError('');
    setNote('');
    fileRef.current = null;
    fetchPdfBlob(path)
      .then((b) => {
        if (!alive) return;
        fileRef.current = new File([b], filename, { type: 'application/pdf' });
        setBlob(b);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [open, path, filename]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const file = fileRef.current;
  const canNative =
    !!file && typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [file] });

  function download() {
    if (!blob) return;
    onShared?.();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // WhatsApp / Gmail links cannot carry a file, so the PDF is saved and the message opens ready to send
  const attachNote = `The PDF "${filename}" was saved to your Downloads folder. Attach it to the message that just opened, then send.`;

  function whatsapp() {
    download();
    window.open('https://wa.me/?text=', '_blank'); // opens WhatsApp with no pre-filled text
    setNote(attachNote);
  }
  function gmail() {
    download();
    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
      '_blank',
    );
    setNote(attachNote);
  }
  async function nativeShare() {
    download();
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: subject });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Sharing failed. Use one of the other options.');
    }
  }

  const block = { width: '100%', marginBottom: 8 } as const;

  return (
    <>
      {!hideButton && <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>}
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{docLabel === 'invoice' ? 'Share invoice' : `Send ${docLabel}`}</h3>
            <p className="muted" style={{ margin: '0 0 14px' }}>
              {invoiceNo}{customer ? ` · ${customer}` : ''}
            </p>
            {error && <div className="error">{error}</div>}
            {!blob && !error && <p className="muted">Preparing the PDF...</p>}
            {blob && (
              <>
                {canNative && (
                  <button type="button" style={block} onClick={nativeShare}>
                    Share PDF... (WhatsApp, Mail, other apps)
                  </button>
                )}
                <button type="button" className={canNative ? 'ghost' : undefined} style={block} onClick={whatsapp}>WhatsApp</button>
                <button type="button" className="ghost" style={block} onClick={gmail}>Gmail</button>
                <button type="button" className="ghost" style={block} onClick={download}>Download PDF</button>
                {note && <p className="muted" style={{ margin: '4px 0 0' }}>{note}</p>}
              </>
            )}
            <div className="actions">
              <button type="button" className="ghost" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}