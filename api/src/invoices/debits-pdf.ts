import PDFDocument from 'pdfkit';
import { asset, fmtDate, money } from './invoice-pdf.js';
import { KIAAN_BRAND } from './dues-pdf.js';

// One debit (money we spent / owe a vendor) on the ledger.
export type LedgerItem = {
  date: Date | string;
  label: string; // what the cost was for
  invoiceNo: string;
  ref: string; // MAWB / HAWB of the invoice
  amount: number;
  paid: number;
  remaining: number;
};

export type LedgerVendor = { name: string; items: LedgerItem[] };

export type LedgerData = {
  vendors: LedgerVendor[]; // one block per vendor, entries oldest first
  period?: { from?: string; to?: string };
  payment?: 'PAID' | 'UNPAID' | 'PARTIAL'; // status filter, when used
  date: Date; // statement date
};

const STATUS_TEXT = { PAID: 'Paid only', UNPAID: 'Unpaid only', PARTIAL: 'Part-paid only' };

function periodLabel(p?: { from?: string; to?: string }) {
  if (!p || (!p.from && !p.to)) return 'All dates';
  if (p.from && p.to) return `${fmtDate(p.from)} - ${fmtDate(p.to)}`;
  return p.from ? `From ${fmtDate(p.from)}` : `Up to ${fmtDate(p.to)}`;
}

const sum = (items: LedgerItem[], f: (i: LedgerItem) => number) =>
  Math.round(items.reduce((a, i) => a + f(i), 0) * 100) / 100;

// Vendor ledger (debit statement): every cost per vendor with a running balance of what is still owed.
// It never shows customers, selling prices or profit, so it can be shared with the vendor.
export function buildDebitsPdf(data: LedgerData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const b = KIAAN_BRAND;
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
          .text(`${b.name}  |  ${b.phones}  |  ${b.email}`, L, H - 30, { width: FULL, align: 'center' });
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

    // ---- letterhead (first page only)
    if (topImg) doc.image(topImg, 0, 0, { width: W });
    else doc.font('Helvetica-Bold').fontSize(22).fillColor('#14213d').text(b.name, L, 50);

    let y = (topImg ? W * b.topRatio : 80) + 8;
    const all = data.vendors.flatMap((v) => v.items);
    const single = data.vendors.length === 1;
    const heading = single ? data.vendors[0].name : 'ALL VENDORS';

    // ---- title bar
    cell(L, y, FULL, 26, 'VENDOR LEDGER - DEBIT STATEMENT', { bold: true, size: 14, align: 'center' });
    y += 26;

    // ---- vendor (left) and statement details (right)
    const LW = 300;
    const RX = L + LW;
    const RW = R - RX;
    const BOX_H = 56;
    cell(L, y, LW, BOX_H);
    cell(L, y, 62, 14, 'VENDOR', { bold: true, size: 9 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(heading, L + 4, y + 18, { width: LW - 8, height: 12, ellipsis: true });
    doc.font('Helvetica').fontSize(8);
    if (!single) doc.text(`${data.vendors.length} vendors`, L + 4, y + 31, { width: LW - 8 });

    const rows: [string, string][] = [
      ['Statement Date', fmtDate(data.date)],
      ['Period', periodLabel(data.period)],
      ['Showing', data.payment ? STATUS_TEXT[data.payment] : 'All debits'],
      ['Entries', String(all.length)],
    ];
    const rh = BOX_H / rows.length;
    rows.forEach(([k, v], i) => {
      cell(RX, y + i * rh, 90, rh, k, { bold: true });
      cell(RX + 90, y + i * rh, RW - 90, rh, v, { bold: true });
    });
    y += BOX_H + 12;

    // ---- table
    const cols = [18, 50, 104, 68, 104, 62, 62, 64];
    const heads = ['#', 'DATE', 'COST FOR', 'INVOICE NO.', 'MAWB / HAWB', 'AMOUNT', 'PAID', 'BALANCE'];
    const aligns: ('left' | 'center' | 'right')[] = ['center', 'center', 'left', 'left', 'left', 'right', 'right', 'right'];
    const ROW = 15;
    const labelW = cols.slice(0, 5).reduce((a, c) => a + c, 0);

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
    const totalRow = (text: string, items: LedgerItem[], fill: string) => {
      ensure(18);
      cell(L, y, labelW, 18, text, { bold: true, align: 'right', fill });
      let x = L + labelW;
      [sum(items, (i) => i.amount), sum(items, (i) => i.paid), sum(items, (i) => i.remaining)].forEach((v, k) => {
        cell(x, y, cols[5 + k], 18, money(v), { bold: true, align: 'right', fill });
        x += cols[5 + k];
      });
      y += 18;
    };

    header();
    for (const v of data.vendors) {
      if (!single) {
        ensure(ROW * 2);
        cell(L, y, FULL, ROW, v.name, { bold: true, size: 8.5, fill: '#eef2f7' });
        y += ROW;
      }
      let balance = 0;
      v.items.forEach((it, i) => {
        ensure(ROW);
        balance += it.remaining;
        const vals = [
          String(i + 1),
          fmtDate(it.date),
          it.label,
          it.invoiceNo,
          it.ref,
          money(it.amount),
          money(it.paid),
          money(Math.round(balance * 100) / 100),
        ];
        let x = L;
        vals.forEach((val, k) => {
          cell(x, y, cols[k], ROW, val, { align: aligns[k], bold: k === 7, size: k === 4 || k === 2 ? 7 : 8 });
          x += cols[k];
        });
        y += ROW;
      });
      if (!single) totalRow(`TOTAL - ${v.name}`, v.items, '#f3f3f3');
    }

    // ---- grand total
    totalRow(single ? 'TOTAL' : 'GRAND TOTAL', all, '#e6e6e6');
    y += 12;

    // ---- amount still owed
    const owed = sum(all, (i) => i.remaining);
    ensure(40);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#000')
      .text(`Total balance payable: PKR ${money(owed)}`, L, y, { width: FULL });
    y = doc.y + 12;
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('This is a computer generated statement. No signature or stamp is required.', L, y, {
        width: FULL,
        align: 'center',
      });

    doc.end();
  });
}
