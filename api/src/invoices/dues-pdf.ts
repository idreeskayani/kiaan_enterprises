import PDFDocument from 'pdfkit';
import { BOTTOM_RATIO, COMPANY, TOP_RATIO, asset, fmtDate, inWords, money } from './invoice-pdf.js';

// One unpaid / part-paid invoice on the statement.
export type DuesItem = {
  invoiceNo: string;
  issuedAt: Date | string;
  mawb: string;
  hawb: string;
  total: number;
  paid: number;
  remaining: number;
};

export type DuesData = {
  customer: { name: string; address?: string | null; phone?: string | null; taxNumber?: string | null };
  items: DuesItem[];
  totalInvoiced: number;
  totalPaid: number;
  totalRemaining: number;
};

export type PdfDues = DuesData & {
  reportNo?: string | null; // only saved / sent reports have a number
  date: Date; // statement date
};

// Customer-facing statement. It never shows costs or profit.
export function buildDuesPdf(data: PdfDues): Promise<Buffer> {
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
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#14213d').text(COMPANY.name, L, 50);
    }

    let y = (topImg ? W * TOP_RATIO : 80) + 8;
    const c = data.customer;

    // ---- title bar
    cell(L, y, FULL, 26, 'STATEMENT OF ACCOUNT - REMAINING DUES', { bold: true, size: 14, align: 'center' });
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
      ['Currency', 'PKR'],
      ['Open Invoices', String(data.items.length)],
    ];
    const rh = BOX_H / rows.length;
    rows.forEach(([k, v], i) => {
      cell(RX, y + i * rh, 90, rh, k, { bold: true });
      cell(RX + 90, y + i * rh, RW - 90, rh, v, { bold: true });
    });
    y += BOX_H + 12;

    // ---- table
    const cols = [20, 80, 52, 78, 78, 62, 62, 63, 40];
    const heads = ['#', 'INVOICE NO.', 'DATE', 'MAWB', 'HAWB', 'TOTAL', 'RECEIVED', 'REMAINING', 'STATUS'];
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
        it.paid > 0 ? 'Partial' : 'Unpaid',
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
    const whole = Math.floor(data.totalRemaining + 1e-9);
    const paisa = Math.round((data.totalRemaining - whole) * 100);
    const words = `Total remaining dues: PKR ${inWords(whole)}${paisa ? ` and ${inWords(paisa)} Paisa` : ''} Only`;
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

    // ---- banking details
    ensure(70);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#355E9B').text('Banking detail:', L, y);
    y += 18;
    doc.font('Helvetica').fontSize(8.5).fillColor('#000');
    [
      `Account Title: ${COMPANY.bank.title}`,
      `Account Number: ${COMPANY.bank.account}`,
      `IBAN: ${COMPANY.bank.iban}`,
      COMPANY.bank.name,
    ].forEach((line, i) => doc.text(line, L, y + i * 11));

    doc.end();
  });
}
