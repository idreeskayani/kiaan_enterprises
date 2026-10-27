const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const getToken = () => localStorage.getItem('token');
export const setToken = (t: string | null) =>
  t ? localStorage.setItem('token', t) : localStorage.removeItem('token');
export const getUser = (): { id: string; email: string; role: string; impersonating?: boolean } | null => {
  try {
    return JSON.parse(localStorage.getItem('user') ?? 'null');
  } catch {
    return null;
  }
};
export const setUser = (u: unknown) =>
  u ? localStorage.setItem('user', JSON.stringify(u)) : localStorage.removeItem('user');

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const m = data?.message;
    throw new Error(Array.isArray(m) ? m.join(', ') : (m ?? `Request failed (${res.status})`));
  }
  return data as T;
}
export async function openClearancePdf(jobId: string, win?: Window | null) {
  const res = await fetch(`${BASE}/clearance/${jobId}/pdf`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    win?.close();
    throw new Error('Could not load the PDF');
  }
  showBlob(await res.blob(), win);
}

function showBlob(blob: Blob, win?: Window | null) {
  const url = URL.createObjectURL(blob);
  if (win && !win.closed) win.location.href = url;
  else window.open(url, '_blank');
}

export async function openPdf(invoiceId: string, win?: Window | null) {
  const res = await fetch(`${BASE}/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    win?.close();
    throw new Error('Could not load the PDF');
  }
  showBlob(await res.blob(), win);
}

// Preview only: the server builds a PDF from the form data and saves nothing.
export async function previewPdf(body: unknown, win?: Window | null) {
  const res = await fetch(`${BASE}/invoices/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    win?.close();
    const data = await res.json().catch(() => null);
    const m = data?.message;
    throw new Error(Array.isArray(m) ? m.join(', ') : (m ?? 'Could not build the preview'));
  }
  showBlob(await res.blob(), win);
}