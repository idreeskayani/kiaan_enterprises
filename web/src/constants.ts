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
export const CLEARANCE_STATUSES = [
  'PENDING',
  'DOCS_RECEIVED',
  'GD_FILED',
  'ASSESSED',
  'DUTY_PAID',
  'EXAMINATION',
  'RELEASED',
  'ON_HOLD',
  'CANCELLED',
];

export const PAYMENT_STATES = ['UNINVOICED', 'UNPAID', 'PARTIAL', 'PAID'];

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED'];

export const label = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());