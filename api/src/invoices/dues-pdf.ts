import PDFDocument from 'pdfkit';
import { BOTTOM_RATIO, COMPANY, TOP_RATIO, asset, fmtDate, inWords, money } from './invoice-pdf.js';

// The company a statement is printed for: letterhead images, bank accounts and the names of the two
// reference columns. Freight (Kiaan) is the default; the clearance section passes TNI Enterprises.
export type DuesBrand = {
  name: string;
  phones: string;
  email: string;
  banks: { bank: string; title: string; account: string; iban: string }[];
  topImage: string;
  bottomImage: string;
  topRatio: number;
  bottomRatio: number;
  // the two reference columns (stored in DuesItem.mawb / DuesItem.hawb)
  refHeads: [string, string];
};

export const KIAAN_BRAND: DuesBrand = {
  name: COMPANY.name,
  phones: COMPANY.phones,
  email: COMPANY.email,
  banks: [
    { bank: COMPANY.bank.name, title: COMPANY.bank.title, account: COMPANY.bank.account, iban: COMPANY.bank.iban },
  ],
  topImage: 'letterhead-top.png',
  bottomImage: 'letterhead-bottom.png',
  topRatio: TOP_RATIO,
  bottomRatio: BOTTOM_RATIO,
  refHeads: ['MAWB', 'HAWB'],
};

// Which invoices a statement lists: the same choices as the filters on the Invoices page.
export type DuesScope = 'ALL' | 'DUES' | 'UNPAID' | 'PAID' | 'DRAFT';
export const DUES_SCOPES: DuesScope[] = ['ALL', 'DUES', 'UNPAID', 'PAID', 'DRAFT'];
// the clearance section also has PARTIAL: only the part-paid invoices
export type StatementScope = DuesScope | 'PARTIAL';

const TITLES: Record<StatementScope, string> = {
  ALL: 'ALL INVOICES',
  DUES: 'REMAINING DUES',
  PARTIAL: 'REMAINING DUES',
  UNPAID: 'UNPAID INVOICES',
  PAID: 'PAID INVOICES',
  DRAFT: 'DRAFT INVOICES',
};

// One invoice on the statement.
export type DuesItem = {
  invoiceNo: string;
  issuedAt: Date | string;
  mawb: string; // clearance statements keep the job no. here
  hawb: string; // ... and the GD no. here
  total: number;
  paid: number;
  remaining: number;
  status?: 'Paid' | 'Partial' | 'Unpaid' | 'Draft'; // missing on reports saved before this field existed
};

export type DuesData = {
  scope?: StatementScope; // missing on reports saved before scopes existed (those are DUES)
  period?: { from?: string; to?: string }; // date filter of the report (YYYY-MM-DD), missing when not filtered
  customer: { name: string; address?: string | null; phone?: string | null; taxNumber?: string | null };
  items: DuesItem[];
  totalInvoiced: number;
  totalPaid: number;
  totalRemaining: number;
};

export type PdfDues = DuesData & {
  brand?: DuesBrand; // Kiaan Freight when missing
  reportNo?: string | null; // only saved / sent reports have a number
  date: Date; // statement date
};

// "01/11/2026 - 11/11/2026", "From 01/11/2026" or "Up to 11/11/2026"
function periodLabel(p: { from?: string; to?: string }) {
  if (p.from && p.to) return `${fmtDate(p.from)} - ${fmtDate(p.to)}`;
  return p.from ? `From ${fmtDate(p.from)}` : `Up to ${fmtDate(p.to)}`;
}

// Customer-facing statement. It never shows costs or profit.
export function buildDuesPdf(data: PdfDues): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const b = data.brand ?? KIAAN_BRAND;
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

    const topImg = asset(b.topImage);
    const bottomImg = asset(b.bottomImage);
    const footerTop = H - (bottomImg ? W * b.bottomRatio : 50);

    const drawFooter = () => {
      if (bottomImg) {
        doc.image(bottomImg, 0, footerTop, { width: W });
      } else {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#444')
          .text(`${b.name}  |  ${b.phones}  |  ${b.email}`, L, H - 30, {
            width: FULL,
            align: 'center',
          });
      }
    };
    drawFooter();
    doc.on('pageAdded', drawFooter);

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

    // ---- letterhead (first page only, like the invoice)
    if (topImg) {
      doc.image(topImg, 0, 0, { width: W });
    } else {
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#14213d').text(b.name, L, 50);
    }

    let y = (topImg ? W * b.topRatio : 80) + 8;
    const c = data.customer;
    const scope: StatementScope = data.scope ?? 'DUES';

    // ---- title bar
    cell(L, y, FULL, 26, `STATEMENT OF ACCOUNT - ${TITLES[scope]}`, { bold: true, size: 14, align: 'center' });
    y += 26;

    // ---- customer (left) and statement details (right)
    const LW = 300;
    const RX = L + LW;
    const RW = R - RX;
    const BOX_H = 56;
    cell(L, y, LW, BOX_H);
    cell(L, y, 62, 14, 'CUSTOMER', { bold: true, size: 9 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(c.name, L + 4, y + 18, { width: LW - 8, height: 12, ellipsis: true });
    doc.font('Helvetica').fontSize(8);
    let cy = y + 30;
    if (c.address) {
      doc.text(c.address, L + 4, cy, { width: LW - 8, height: 14, ellipsis: true });
      cy = Math.min(doc.y, y + 44);
    }
    const contact = [c.phone ? `Tel: ${c.phone}` : '', c.taxNumber ? `NTN: ${c.taxNumber}` : '']
      .filter(Boolean)
      .join('   ');
    if (contact) doc.text(contact, L + 4, cy + 1, { width: LW - 8, height: 10, ellipsis: true });

    const rows: [string, string][] = [
      ['Statement Date', fmtDate(data.date)],
      ['Statement No.', data.reportNo ?? '-'],
      data.period
        ? ['Period', periodLabel(data.period)]
        : ['Currency', 'PKR'],
      [scope === 'DUES' || scope === 'PARTIAL' ? 'Open Invoices' : 'Invoices', String(data.items.length)],
    ];
    const rh = BOX_H / rows.length;
    rows.forEach(([k, v], i) => {
      cell(RX, y + i * rh, 90, rh, k, { bold: true });
      cell(RX + 90, y + i * rh, RW - 90, rh, v, { bold: true });
    });
    y += BOX_H + 12;

    // ---- table
    const cols = [20, 80, 52, 78, 78, 62, 62, 63, 40];
    const heads = ['#', 'INVOICE NO.', 'DATE', b.refHeads[0], b.refHeads[1], 'TOTAL', 'RECEIVED', 'REMAINING', 'STATUS'];
    const aligns: ('left' | 'center' | 'right')[] = [
      'center', 'left', 'center', 'left', 'left', 'right', 'right', 'right', 'center',
    ];
    const ROW = 15;

    const header = () => {
      let x = L;
      heads.forEach((h, i) => {
        cell(x, y, cols[i], 15, h, { bold: true, align: 'center', fill: '#c8c8c8', size: 7.5 });
        x += cols[i];
      });
      y += 15;
    };
    const ensure = (h: number) => {
      if (y + h > footerTop - 8) {
        doc.addPage();
        y = 40;
        header();
      }
    };

    header();
    data.items.forEach((it, i) => {
      ensure(ROW);
      const vals = [
        String(i + 1),
        it.invoiceNo,
        fmtDate(it.issuedAt),
        it.mawb,
        it.hawb,
        money(it.total),
        money(it.paid),
        money(it.remaining),
        it.status ?? (it.paid > 0 ? 'Partial' : 'Unpaid'),
      ];
      let x = L;
      vals.forEach((v, k) => {
        cell(x, y, cols[k], ROW, v, { align: aligns[k], bold: k === 7, size: k === 8 ? 7 : 8 });
        x += cols[k];
      });
      y += ROW;
    });

    // ---- totals
    ensure(40);
    const labelW = cols.slice(0, 5).reduce((a, b) => a + b, 0);
    cell(L, y, labelW, 18, 'TOTAL', { bold: true, align: 'right', fill: '#e6e6e6' });
    let x = L + labelW;
    [data.totalInvoiced, data.totalPaid, data.totalRemaining].forEach((v, k) => {
      cell(x, y, cols[5 + k], 18, money(v), { bold: true, align: 'right', fill: '#e6e6e6' });
      x += cols[5 + k];
    });
    cell(x, y, cols[8], 18, '', { fill: '#e6e6e6' });
    y += 18 + 10;

    // ---- amount in words
    const amount = scope === 'PAID' ? data.totalPaid : data.totalRemaining;
    const whole = Math.floor(amount + 1e-9);
    const paisa = Math.round((amount - whole) * 100);
    const words = `${scope === 'PAID' ? 'Total received' : 'Total remaining dues'}: PKR ${inWords(whole)}${paisa ? ` and ${inWords(paisa)} Paisa` : ''} Only`;
    ensure(24);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text(words, L, y, { width: FULL });
    y = doc.y + 12;

    // ---- note
    ensure(20);
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#000')
      .text('This is a computer generated statement. No signature or stamp is required.', L, y, {
        width: FULL,
        align: 'center',
      });
    y += 22;

    // ---- banking details (one block per bank account, side by side)
    ensure(70);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#355E9B').text('Banking detail:', L, y);
    y += 18;
    const BW = FULL / b.banks.length;
    b.banks.forEach((bk, i) => {
      doc.font('Helvetica').fontSize(8.5).fillColor('#000');
      [`Account Title: ${bk.title}`, `Account Number: ${bk.account}`, `IBAN: ${bk.iban}`, bk.bank].forEach(
        (line, k) => doc.text(line, L + i * BW, y + k * 11, { width: BW - 8 }),
      );
    });

    doc.end();
  });
}
