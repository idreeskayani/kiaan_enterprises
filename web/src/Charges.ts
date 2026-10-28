// Charges printed on the TNI bill invoice, in the same order (same list as the API).
export const CHARGE_CODES: { code: string; label: string }[] = [
  { code: '101', label: 'Customs Duties & Taxes. PUNJAB CESS' },
  { code: '102', label: 'INVOICE FINE' },
  { code: '103', label: '5% Sales Tax' },
  { code: '104', label: 'Delivery Order Charges' },
  { code: '105', label: 'MISDECLARTION IN INVOICE VA LUE' },
  { code: '106', label: 'Terminal Tax C.A.A' },
  { code: '108', label: 'Go down Rent / Gate Pass Cash' },
  { code: '110', label: 'Bill of Entry Fee' },
  { code: '111', label: 'Customs Entry Weboc token' },
  { code: '201', label: 'Loading /RE PACKING' },
  { code: '202', label: 'Customs Gate Out' },
  { code: '203', label: 'Customs Entry Weboc' },
  { code: '204', label: 'Packing / Wiring and sealing' },
  { code: '205', label: 'Handling Charges' },
  { code: '206', label: 'Sundries misc.' },
  { code: '207', label: 'MCD Documentation Verification Charges' },
  { code: '209', label: 'Service Charges Plus Customs' },
  { code: '210', label: 'Carriage Airport to Islamabad' },
  { code: '213', label: 'Airline DO Charges' },
  { code: '214', label: 'Other Expanses' },
  { code: '215', label: 'Dog Snuffing' },
  { code: '301', label: 'Agency Commission' },
  { code: '0212', label: 'GST. On Ag. Commission @17%' },
];

// Duties & taxes of the assessed items (same heads as WeBOC "Duties Information").
export const DUTY_KEYS: { key: string; label: string }[] = [
  { key: 'cess', label: 'CESS' },
  { key: 'customsDuty', label: 'Customs Duty' },
  { key: 'salesTax', label: 'Sales Tax' },
  { key: 'additionalSalesTax', label: 'Additional Sales Tax' },
  { key: 'incomeTax', label: 'Income Tax' },
];

export const TRANSPORT_MODES: [string, string][] = [
  ['AIR', 'Air'],
  ['SEA', 'Sea'],
  ['ROAD', 'Road'],
  ['RAIL', 'Rail'],
];

// VIR number = PREFIX-SERIAL-DDMMYYYY, e.g. IPAF-0569-11022024.
// The prefix depends on the mode of transport. Only AIR is known (from the PSW screen);
// add the others here once you have them, until then type the VIR number by hand.
export const VIR_PREFIX: Record<string, string> = {
  AIR: 'IPAF',
  SEA: '',
  ROAD: '',
  RAIL: '',
};

export function buildVir(mode: string, serial: string, beDate: string) {
  const prefix = VIR_PREFIX[mode];
  const s = serial.replace(/\D/g, '');
  if (!prefix || !s || !/^\d{4}-\d{2}-\d{2}$/.test(beDate)) return null;
  const [y, m, d] = beDate.split('-');
  return `${prefix}-${s.padStart(4, '0')}-${d}${m}${y}`;
}


// Collectorates from the PSW Goods Declaration drop-down (spelling as shown on PSW).
// The field also accepts any typed text, so a collectorate missing here can still be entered.
export const COLLECTORATES: string[] = [
  'Collectorate of Customs Enforcement, Islamabad',
  'Collectorate of Customs, Airport, Lahore - ICG',
  'Collectorate of Customs, Airport, Lahore - Imports',
  'EPZ Risalpur - Import',
  'EPZ Saindak - Import',
  'Faisalabad Air Freight Unit - Imports',
  'Gaddani - Import',
  'Gaddani Import-Bulk',
  'Gaddani Oil Terminal',
  'Gilgit Skardu Air Freight Unit - Import',
  'Hyderabad Sukkur Bulk',
  'International Transit Trade Air Islamabad-Import',
  'International Transit Trade Air Karachi-Import',
  'International Transit Trade Air Lahore-Import',
  'International Transit Trade Air Multan-Import',
  'International Transit Trade Air Peshawar-Import',
  'International Transit Trade Air Sialkot-Import',
  'International Transit Trade Gabd',
  'International Transit Trade Taftan',
  'International Transit Trade, Ghulam Khan',
  'International Transit Trade, Gwadar',
  'International Transit Trade, Gwadar Bulk',
  'International Transit Trade, Karachi',
  'International Transit Trade, Karachi Bulk',
  'International Transit Trade, Peshawar',
  'International Transit Trade, Quetta',
  'Karachi Air Freight Unit',
  'Karachi Air Frieght Unit-(ICG)',
  'MCC Peshawer, Khapakh - Import',
  'MCC Peshawer, Kharlachi - Import',
  'MCC Peshawer, Shaheedano - Import',
  'MCC Appraisement Karachi East - Import',
  'MCC Appraisement Karachi West - Import',
  'MCC Appraisement Lahore EPZ-Import',
  'MCC Appraisement SAPT Karachi',
  'MCC Appraisement West Lahore-Import',
  'MCC Appraisement, Lahore - Imports',
  'MCC Appraisment - East Wharf, Import - Bulk',
  'MCC Appraisment - West Wharf, Import - Bulk',
  'MCC D.I Khan AFU Import',
  'MCC Faisalabad, Import',
  'MCC Gawadar Bulk - Import',
  'MCC Gujranwala, EPZ - Import',
  'MCC Gwadar Free Zone for TP-Import',
  'MCC Gwadar Import',
  'MCC Gwadar, Chidgee, Panjgoor - Import',
  'MCC Gwadar, EPZ Duddar - Import',
  'MCC Gwadar, Gabd (BP250) - Import',
  'MCC Gwadar, GFZ - Import',
  'MCC Gwadar, Rideeq, Mand - Import',
  'MCC Hyderabad - Import',
  'MCC JIAP, Karachi Paper Less Jinnah - Import',
  'MCC Multan, Import',
  'MCC Oil Section Kemari',
  'MCC Peshawar, Angoor Adda - Import',
  'Multan Air Freight Unit, Import',
  'New Islamabad Airfreight Unit Imports',
  'New Islamabad Airfreight Unit Imports - ICG',
  'Peshawar Air Freight Unit, Import',
  'Peshawar Torkham Imports',
  'Port Qasim (imports), karachi',
  'Quetta Air Freight Unit - Import',
  'Sialkot Air Freight Unit - Import - ICG',
  'Sialkot Air Freight Unit, Import',
  'Sust Dry Port-Imports, Gilgit - Baltistan',
  'Transit Trade Gilgit Baltistan',
];