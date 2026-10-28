import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

// Company details printed on every invoice. Edit here if they change.
const COMPANY = {
  name: 'KIAAN FREIGHT SERVICES',
  email: 'info.kfs786@gmail.com',
  phones: '+92 313 5388630 | +92 346 6479976',
  bank: {
    title: 'KIAAN FREIGHT SERVICES',
    account: '56815002772861',
    iban: 'PK70ALFH5681005002772861',
    name: 'Bank Alfalah',
  },
  // Keep each line short enough to fit on one line. Change them to your own policy.
  terms: [
    '1) The exchange rate shown applies to this invoice. If payment is received on a later day, the rate of that day may apply.',
    '2) Any discrepancy in this invoice must be reported within 3 days of receipt, otherwise it will be considered correct and accepted.',
    '3) Extra financial charges may be added to the invoice amount if it is not paid within the agreed days.',
    "4) Goods stored in our godown are at the owner's risk.",
    '5) All legal matters are subject to the jurisdiction of the local courts only.',
  ],
};

// height / width of the two images in api/assets
const TOP_RATIO = 0.2813;
const BOTTOM_RATIO = 0.162;

const LABELS: Record<
  string,
  { dept: string; line: string; master: string; house: string; dO: string }
> = {
  AIR: { dept: 'AIR', line: 'Air Line', master: 'MAWB No.', house: 'HAWB No.', dO: 'Air Line D/O#' },
  SEA: { dept: 'SEA', line: 'Shipping Line', master: 'MBL No.', house: 'HBL No.', dO: 'Line D/O#' },
  ROAD: { dept: 'ROAD', line: 'Transporter', master: 'Waybill No.', house: 'Ref No.', dO: 'D/O#' },
};

// Quotations reuse this layout (title, numbers, note and terms change).
const QUOTE_TERMS = (validUntil: any) => [
  `1) This quotation is valid until ${fmtDate(validUntil)}.`,
  '2) The exchange rate shown applies to this quotation. The rate on the invoice date may differ.',
  "3) Goods stored in our godown are at the owner's risk.",
  '4) All legal matters are subject to the jurisdiction of the local courts only.',
];

export type PdfInvoice = {
  kind?: 'invoice' | 'quotation';
  validUntil?: any; // quotations only
  invoiceNo: string;
  status: string;
  issuedAt: Date;
  total: any;
  lines: {
    label: string;
    amount: any;
    currency?: string | null;
    foreignAmount?: any;
    exRate?: any;
  }[];
  shipment: {
    refNo: string;
    mode: string;
    origin: string;
    destination: string;
    viaPoints?: string[];
    blAwbNo?: string | null;
    hawbNo?: string | null;
    flight?: string | null;
    eta?: any;
    volDivisor?: number | null;
    exRate?: any;
    details?: any;
    items?: { lengthCm?: any; widthCm?: any; heightCm?: any; weightKg: any; qty: number }[];
    customer: {
      name: string;
      address?: string | null;
      phone?: string | null;
      taxNumber?: string | null;
    };
  };
};

export const money = (v: any) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const asset = (name: string) => {
  const p = join(process.cwd(), 'assets', name);
  return existsSync(p) ? p : null;
};

// dd/mm/yyyy from a Date or a yyyy-mm-dd string
export const fmtDate = (v: any) => {
  if (!v) return '';
  if (v instanceof Date) {
    const dd = String(v.getUTCDate()).padStart(2, '0');
    const mm = String(v.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${v.getUTCFullYear()}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
};

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const under1000 = (n: number): string => {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
};

export const inWords = (n: number): string => {
  if (n === 0) return 'Zero';
  const units = ['', 'Thousand', 'Million', 'Billion'];
  const out: string[] = [];
  let i = 0;
  while (n > 0 && i < units.length) {
    const chunk = n % 1000;
    if (chunk) out.unshift(`${under1000(chunk)}${units[i] ? ` ${units[i]}` : ''}`);
    n = Math.floor(n / 1000);
    i++;
  }
  return out.join(' ');
};

export function buildInvoicePdf(inv: PdfInvoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const L = 30;
    const R = W - 30;
    const FULL = R - L;

    const topImg = asset('letterhead-top.png');
    const bottomImg = asset('letterhead-bottom.png');
    const footerTop = H - (bottomImg ? W * BOTTOM_RATIO : 50);

    const drawFooter = () => {
      if (bottomImg) {
        doc.image(bottomImg, 0, footerTop, { width: W });
      } else {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#444')
          .text(`${COMPANY.name}  |  ${COMPANY.phones}  |  ${COMPANY.email}`, L, H - 30, {
            width: FULL,
            align: 'center',
          });
      }
    };
    drawFooter();
    doc.on('pageAdded', drawFooter);

    // a bordered cell with one line of text
    const cell = (
      x: number,
      yy: number,
      w: number,
      h: number,
      text = '',
      o: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; fill?: string } = {},
    ) => {
      doc.lineWidth(0.5).strokeColor('#000');
      if (o.fill) doc.rect(x, yy, w, h).fillAndStroke(o.fill, '#000');
      else doc.rect(x, yy, w, h).stroke();
      if (text) {
        const size = o.size ?? 8;
        doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000');
        doc.text(text, x + 3, yy + (h - size) / 2 + 0.5, {
          width: w - 6,
          height: size + 2,
          ellipsis: true,
          align: o.align ?? 'left',
        });
      }
    };

    // ---- letterhead
    if (topImg) {
      doc.image(topImg, 0, 0, { width: W });
    } else {
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#14213d').text(COMPANY.name, L, 50);
    }

    // ---- data
    const s = inv.shipment;
    const c = s.customer;
    const t = LABELS[s.mode] ?? LABELS.AIR;
    const d: Record<string, any> = s.details && typeof s.details === 'object' ? s.details : {};
    const direction = String(d.direction || 'IMPORT').toUpperCase();
    const isQuote = inv.kind === 'quotation';
    const terms = isQuote ? QUOTE_TERMS(inv.validUntil) : COMPANY.terms;
    const invDate = inv.issuedAt.toLocaleDateString('en-GB');
    const airline = [d.airline, s.flight].filter(Boolean).join(' / ');

    const items = s.items ?? [];
    const pkgs = items.reduce((a, i) => a + i.qty, 0);
    const gross = items.reduce((a, i) => a + Number(i.weightKg) * i.qty, 0);
    const div = s.volDivisor && s.volDivisor > 0 ? s.volDivisor : s.mode === 'ROAD' ? 4000 : 5000;
    const vol = items.reduce(
      (a, i) => a + ((Number(i.lengthCm) * Number(i.widthCm) * Number(i.heightCm)) / div) * i.qty,
      0,
    );
    const cbm = items.reduce(
      (a, i) => a + ((Number(i.lengthCm) * Number(i.widthCm) * Number(i.heightCm)) / 1_000_000) * i.qty,
      0,
    );
    const chText = s.mode === 'SEA' ? `${cbm.toFixed(3)} CBM` : money(Math.max(gross, vol));

    // currencies used on the invoice with their exchange rates
    const cur: { code: string; rate: number }[] = [];
    for (const l of inv.lines) {
      const code = l.currency || 'PKR';
      if (cur.some((z) => z.code === code)) continue;
      cur.push({ code, rate: code === 'PKR' ? 1 : Number(l.exRate ?? s.exRate ?? 0) });
    }

    // ---- boxes
    let y = (topImg ? W * TOP_RATIO : 80) + 8;
    const ROW = 13;
    const LW = 255;
    const RX = L + LW + 6;
    const RW = R - RX;
    const c1 = 62;
    const c2 = 108;
    const c3 = 32;
    const c4 = RW - c1 - c2 - c3;
    const boxH = 32 + 15 + 7 * ROW;

    // right: INVOICE
    cell(RX, y, RW, 32, isQuote ? 'QUOTATION' : 'INVOICE', { bold: true, size: 18, align: 'center' });
    let ry = y + 32;
    cell(RX, ry, c1 + c2, 15, `DEPARTMENT : ${t.dept} - ${direction}`, { bold: true, size: 9 });
    cell(RX + c1 + c2, ry, c3, 15, 'NTN', { bold: true });
    cell(RX + c1 + c2 + c3, ry, c4, 15, c.taxNumber ?? '');
    ry += 15;
    const grid = (l1: string, v2: string, l3: string, v4: string, boldVal = false) => {
      cell(RX, ry, c1, ROW, l1, { bold: true });
      cell(RX + c1, ry, c2, ROW, v2, { bold: boldVal });
      cell(RX + c1 + c2, ry, c3, ROW, l3, { bold: true });
      cell(RX + c1 + c2 + c3, ry, c4, ROW, v4);
      ry += ROW;
    };
    if (isQuote) {
      grid('Quote No.', inv.invoiceNo, 'Date', invDate, true);
      grid('Valid Until', fmtDate(inv.validUntil), '', '', true);
    } else {
      grid('Invoice No.', inv.status === 'PREVIEW' ? 'PREVIEW' : inv.invoiceNo, 'Date', invDate, true);
      grid('Job No.', s.refNo, 'Date', invDate, true);
    }
    grid(t.dO, d.doNo ?? '', 'Date', fmtDate(d.doDate));
    grid('IGM No.', d.igmNo ?? '', 'Date', fmtDate(d.igmDate));
    grid('B/E No.', d.beNo ?? '', 'Date', fmtDate(d.beDate));
    grid('ETD', fmtDate(d.etd), 'ETA', fmtDate(s.eta));
    cell(RX, ry, c1, ROW, 'Cust. Ref No.', { bold: true });
    cell(RX + c1, ry, RW - c1, ROW, d.custRef ?? '');

    // left: customer
    const custH = boxH - 4 * ROW;
    cell(L, y, LW, custH);
    cell(L, y, 62, ROW + 2, 'CUSTOMER', { bold: true, size: 9 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(c.name, L + 4, y + 19, { width: LW - 8, height: 12, ellipsis: true });
    doc.font('Helvetica').fontSize(8);
    let cy = y + 32;
    if (c.address) {
      doc.text(c.address, L + 4, cy, { width: LW - 8, height: custH - 34, ellipsis: true });
      cy = doc.y;
    }
    if (c.phone && cy + 10 < y + custH) doc.text(`Tel: ${c.phone}`, L + 4, cy + 1, { width: LW - 8 });

    // left: airline, shipper, MAWB, HAWB
    let ly = y + custH;
    const l1 = 62;
    const l2 = 108;
    const l3 = 32;
    const l4 = LW - l1 - l2 - l3;
    const lrow = (label: string, value: string, label2?: string, value2?: string) => {
      cell(L, ly, l1, ROW, label, { bold: true });
      if (label2 === undefined) {
        cell(L + l1, ly, LW - l1, ROW, value);
      } else {
        cell(L + l1, ly, l2, ROW, value);
        cell(L + l1 + l2, ly, l3, ROW, label2, { bold: true });
        cell(L + l1 + l2 + l3, ly, l4, ROW, value2 ?? '');
      }
      ly += ROW;
    };
    lrow(t.line, airline);
    lrow('Shipper', d.shipper ?? '');
    lrow(t.master, s.blAwbNo ?? '', 'Date', fmtDate(d.mawbDate));
    lrow(t.house, s.hawbNo ?? '', 'Date', fmtDate(d.hawbDate));

    y += boxH + 8;

    // ---- FROM / TO / COMMODITY / PCS / weights / CURR / EX. RATE
    const w = [95, 95, 95, 35, 60, 60, 35];
    w.push(FULL - w.reduce((a, b) => a + b, 0));
    const heads = ['FROM', 'TO', 'COMMODITY', 'PCS', 'GRS.WEIGHT', 'CH.WEIGHT', 'CURR', 'EX. RATE'];
    let x = L;
    heads.forEach((h, i) => {
      cell(x, y, w[i], 13, h, { bold: true, align: 'center', fill: '#c8c8c8' });
      x += w[i];
    });
    y += 13;
    const dataH = Math.max(40, cur.length * 10 + 8);
    const from = [s.origin, s.viaPoints && s.viaPoints.length ? `Via: ${s.viaPoints.join(', ')}` : '']
      .filter(Boolean)
      .join('\n');
    const vals = [
      from,
      s.destination,
      d.commodity ?? '',
      String(pkgs),
      money(gross),
      chText,
      cur.map((z) => z.code).join('\n'),
      cur.map((z) => (z.rate > 0 ? z.rate.toFixed(6) : '')).join('\n'),
    ];
    x = L;
    vals.forEach((v, i) => {
      doc.lineWidth(0.5).strokeColor('#000').rect(x, y, w[i], dataH).stroke();
      doc
        .font(i === 6 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .fillColor('#000')
        .text(v, x + 3, y + 4, {
          width: w[i] - 6,
          height: dataH - 6,
          ellipsis: true,
          align: i >= 3 ? 'center' : 'left',
        });
      x += w[i];
    });
    y += dataH + 14;

    const ensure = (h: number) => {
      if (y + h > footerTop - 8) {
        doc.addPage();
        y = 40;
      }
    };

    // ---- particulars
    const PCUR = L + 295;
    const PFX = L + 335;
    const PAMT = L + 430;
    ensure(80);
    cell(L, y, 295, 15, 'PARTICULARS', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(PCUR, y, 40, 15, 'Curr', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(PFX, y, 95, 15, 'F/AMOUNT', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(PAMT, y, R - PAMT, 15, 'AMOUNT (PKR)', { bold: true, align: 'center', fill: '#c8c8c8' });
    y += 20;

    const prow = (part: string, curTxt: string, fxTxt: string, amtTxt: string) => {
      ensure(14);
      cell(L, y, 295, 14, part);
      cell(PCUR, y, 40, 14, curTxt, { align: 'center' });
      cell(PFX, y, 95, 14, fxTxt, { align: 'right' });
      cell(PAMT, y, R - PAMT, 14, amtTxt, { align: 'right' });
      y += 14;
    };
    const rowCount = Math.max(5, inv.lines.length);
    for (let i = 0; i < rowCount; i++) {
      const l = inv.lines[i];
      if (!l) {
        prow('', '', '', '');
        continue;
      }
      prow(
        l.label,
        l.currency ?? 'PKR',
        l.foreignAmount != null ? money(l.foreignAmount) : '',
        money(l.amount),
      );
    }

    // ---- total row with amount in words
    const totalNum = Number(inv.total);
    const whole = Math.floor(totalNum + 1e-9);
    const paisa = Math.round((totalNum - whole) * 100);
    const words = `PKR: ${inWords(whole)}${paisa ? ` and ${inWords(paisa)} Paisa` : ''} Only`;
    doc.font('Helvetica-Bold').fontSize(8);
    const wordsH = doc.heightOfString(words, { width: 295 - 8 });
    const th = Math.max(22, wordsH + 8);
    ensure(th);
    doc.lineWidth(0.5).strokeColor('#000').rect(L, y, 295, th).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(words, L + 4, y + 4, { width: 295 - 8 });
    cell(PCUR, y, 40, th, 'TOTAL', { bold: true, align: 'center' });
    cell(PFX, y, 95, th);
    const foreignCodes = new Set(
      inv.lines.filter((l) => l.currency && l.foreignAmount != null).map((l) => l.currency as string),
    );
    if (foreignCodes.size === 1) {
      const code = Array.from(foreignCodes)[0];
      const sum = inv.lines.reduce((a, l) => a + (l.foreignAmount != null ? Number(l.foreignAmount) : 0), 0);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
      doc.text(code, PFX + 5, y + (th - 8) / 2, { width: 35 });
      doc.text(money(sum), PFX + 40, y + (th - 8) / 2, { width: 95 - 45, align: 'right' });
    }
    cell(PAMT, y, R - PAMT, th, money(inv.total), { bold: true, align: 'right' });
    y += th + 16;

    // ---- note instead of a stamp
    ensure(20);
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#000')
      .text(`This is a computer generated ${isQuote ? 'quotation' : 'invoice'}. No signature or stamp is required.`, L, y, {
        width: FULL,
        align: 'center',
      });
    y += 22;

    // ---- banking details
    ensure(80);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#355E9B').text('Banking detail:', L, y);
    y += 18;
    doc.font('Helvetica').fontSize(8.5).fillColor('#000');
    [
      `Account Title: ${COMPANY.bank.title}`,
      `Account Number: ${COMPANY.bank.account}`,
      `IBAN: ${COMPANY.bank.iban}`,
      COMPANY.bank.name,
    ].forEach((line, i) => doc.text(line, L, y + i * 11));
    y += 4 * 11 + 8;

    // ---- terms & conditions (bottom of the page, above the footer)
    const termsH = 14 + terms.length * 9 + 6;
    if (y > footerTop - termsH - 8) {
      doc.addPage();
    }
    const ty = footerTop - termsH - 4;
    doc.lineWidth(0.5).strokeColor('#000').rect(L, ty, FULL, termsH).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('Terms & Conditions:', L + 4, ty + 3);
    doc.font('Helvetica').fontSize(6.5);
    terms.forEach((line, i) =>
      doc.text(line, L + 4, ty + 14 + i * 9, { width: FULL - 8, height: 8, ellipsis: true }),
    );

    doc.end();
  });
}