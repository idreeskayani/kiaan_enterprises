export const STATUSES = [
  'BOOKED',
  'IN_TRANSIT',
  'LANDED',
  'AWAITING_GATEPASS',
  'GATEPASS_ISSUED',
  'DELIVERED',
  'ON_HOLD',
  'CUSTOMS_EXAM',
  'CANCELLED',
];

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED'];

export const label = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());