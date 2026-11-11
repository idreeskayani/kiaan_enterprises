import PDFDocument from 'pdfkit';
import { asset, fmtDate } from '../invoices/invoice-pdf.js';
import type { DuesBrand } from '../invoices/dues-pdf.js';
import type { PeriodReport } from './reports.service.js';

// whole rupees: the report is for reading across, not for pennies
const rs = (v: number | null) =>
  v == null ? '' : Math.round(v).toLocaleString('en-US', { maximumFractionDigits: 0 });

const TITLES = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' } as const;

// Period summary on the company letterhead (same look as the customer statements).
export function buildPeriodReportPdf(rep: PeriodReport, b: DuesBrand): Promise<Buffer> {
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
    const hasProfit = rep.totals.profit != null;

    const topImg = asset(b.topImage);
    const bottomImg = asset(b.bottomImage);
    const footerTop = H - (bottomImg ? W * b.bottomRatio : 50);
    const drawFooter = () => {
      if (bottomImg) doc.image(bottomImg, 0, footerTop, { width: W });
      else {
        doc.font('Helvetica').fontSize(8).fillColor('#444')
          .text(`${b.name}  |  ${b.phones}  |  ${b.email}`, L, H - 30, { width: FULL, align: 'center' });
      }
    };
    drawFooter();
    doc.on('pageAdded', drawFooter);

    const cell = (
      x: number, yy: number, w: number, h: number, text = '',
      o: { bold?: boolean; align?: 'left' | 'center' | 'right'; fill?: string; size?: number } = {},
    ) => {
      doc.lineWidth(0.5).strokeColor('#000');
      if (o.fill) doc.rect(x, yy, w, h).fillAndStroke(o.fill, '#000');
      else doc.rect(x, yy, w, h).stroke();
      if (text) {
        const size = o.size ?? 7.5;
        doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000');
        doc.text(text, x + 3, yy + (h - size) / 2 + 0.5, { width: w - 6, height: size + 2, ellipsis: true, align: o.align ?? 'left' });
      }
    };

    if (topImg) doc.image(topImg, 0, 0, { width: W });
    else doc.font('Helvetica-Bold').fontSize(22).fillColor('#14213d').text(b.name, L, 50);

    let y = (topImg ? W * b.topRatio : 80) + 8;
    cell(L, y, FULL, 26, `${TITLES[rep.period]} SALES & COLLECTION REPORT`, { bold: true, size: 14, align: 'center' });
    y += 26;
    const who = rep.customer ? `Customer: ${rep.customer}` : 'All customers';
    cell(L, y, FULL, 16, `Period: ${fmtDate(rep.from)} to ${fmtDate(rep.to)}     |     ${who}     |     Amounts in PKR`, { size: 8 });
    y += 16 + 10;

    // columns (profit only when the section has costs)
    const cols = hasProfit ? [85, 32, 66, 56, 56, 56, 66, 66, 52] : [111, 40, 74, 60, 60, 60, 70, 60];
    const heads = hasProfit
      ? ['PERIOD', 'INV.', 'INVOICED', 'CASH', 'CHEQUE', 'ONLINE', 'RECEIVED', 'REMAINING', 'PROFIT']
      : ['PERIOD', 'INV.', 'INVOICED', 'CASH', 'CHEQUE', 'ONLINE', 'RECEIVED', 'REMAINING'];
    const RH = 15;
    const header = () => {
      let x = L;
      heads.forEach((h, i) => {
        cell(x, y, cols[i], RH, h, { bold: true, align: 'center', fill: '#c8c8c8', size: 7 });
        x += cols[i];
      });
      y += RH;
    };
    const rowCells = (label: string, v: Omit<PeriodReport['rows'][number], 'key' | 'label'>) => [
      label, String(v.invoices), rs(v.invoiced), rs(v.cash), rs(v.cheque), rs(v.online), rs(v.received), rs(v.remaining),
      ...(hasProfit ? [rs(v.profit)] : []),
    ];
    const draw = (vals: string[], o: { bold?: boolean; fill?: string }) => {
      let x = L;
      vals.forEach((v, i) => {
        cell(x, y, cols[i], RH, v, { ...o, align: i === 0 ? 'left' : 'right' });
        x += cols[i];
      });
      y += RH;
    };

    header();
    if (rep.rows.length === 0) {
      cell(L, y, FULL, RH, 'No invoices or payments in this period.', { align: 'center' });
      y += RH;
    }
    for (const r of rep.rows) {
      if (y + RH * 2 > footerTop - 8) {
        doc.addPage();
        y = 40;
        header();
      }
      draw(rowCells(r.label, r), {});
    }
    if (y + RH * 2 > footerTop - 8) {
      doc.addPage();
      y = 40;
    }
    draw(rowCells('TOTAL', rep.totals), { bold: true, fill: '#e6e6e6' });

    y += 12;
    doc.font('Helvetica').fontSize(7).fillColor('#444').text(
      'Invoiced = invoices made in the period. Received = money received in the period (by the date it came in). ' +
        'Remaining = still unpaid on the invoices made in the period.',
      L, y, { width: FULL },
    );
    doc.end();
  });
}
