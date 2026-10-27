import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { fmtDate, inWords, money } from '../invoices/invoice-pdf.js';

// ---------------------------------------------------------------------------
// TNI ENTERPRISES details printed on every clearance invoice. EDIT THESE.
// ---------------------------------------------------------------------------
const COMPANY = {
  name: 'TNI ENTERPRISES',
  tagline: 'Customs Clearing & Forwarding Agents',
  address: 'Office address, City',
  email: 'email@example.com',
  phones: '+92 000 0000000',
  ntn: 'NTN: 0000000-0',
  bank: {
    title: 'TNI ENTERPRISES',
    name: 'Bank name, Branch',
    account: '0000000000000',
    iban: 'PK00XXXX0000000000000000',
  },
  // Keep each line short enough to fit on one line.
  terms: [
    '1) Duties and taxes are charged as per the assessment and challans issued by Customs.',
    '2) Any discrepancy in this invoice must be reported within 3 days of receipt, otherwise it will be considered correct.',
    '3) Demurrage, detention and examination charges, if any, are payable by the owner of the goods.',
    '4) Extra financial charges may be added if the invoice is not paid within the agreed days.',
    '5) All legal matters are subject to the jurisdiction of the local courts only.',
  ],
};

const LABELS: Record<string, { master: string; house: string }> = {
  AIR: { master: 'MAWB NO.', house: 'HAWB NO.' },
  SEA: { master: 'MBL NO.', house: 'HBL NO.' },
  ROAD: { master: 'WAYBILL NO.', house: 'REF NO.' },
};

export type ClearancePdfJob = {
  jobNo: string;
  invoiceNo: string;
  payment: string;
  invoicedAt: Date;
  total: any;
  gdNo?: string | null;
  customerName: string;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerTax?: string | null;
  details?: any;
  freightInvoiceNo?: string | null;
  lines: { label: string; amount: any }[];
};

const asset = (name: string) => {
  const p = join(process.cwd(), 'assets', name);
  return existsSync(p) ? p : null;
};

export function buildClearancePdf(job: ClearancePdfJob): Promise<Buffer> {
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

    // letterhead images keep their own proportions
    const topImg = asset('tni-letterhead-top.png');
    const bottomImg = asset('tni-letterhead-bottom.png');
    const imgH = (p: string | null) => {
      if (!p) return 0;
      const im = (doc as any).openImage(p);
      return (im.height * W) / im.width;
    };
    const topH = topImg ? imgH(topImg) : 96;
    const botH = bottomImg ? imgH(bottomImg) : 44;
    const footerTop = H - botH;

    const drawFooter = () => {
      if (bottomImg) {
        doc.image(bottomImg, 0, footerTop, { width: W });
      } else {
        doc.lineWidth(0.5).strokeColor('#999').moveTo(L, footerTop + 8).lineTo(R, footerTop + 8).stroke();
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#444')
          .text(`${COMPANY.name}  |  ${COMPANY.phones}  |  ${COMPANY.email}`, L, footerTop + 16, {
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

    // ---- header
    if (topImg) {
      doc.image(topImg, 0, 0, { width: W });
    } else {
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#14213d').text(COMPANY.name, L, 34);
      doc.font('Helvetica').fontSize(9).fillColor('#444');
      doc.text(COMPANY.tagline, L, 60);
      doc.text(`${COMPANY.address}  |  ${COMPANY.phones}  |  ${COMPANY.email}`, L, 72);
      doc.text(COMPANY.ntn, L, 84);
    }

    const d: Record<string, any> = job.details && typeof job.details === 'object' ? job.details : {};
    const t = LABELS[String(d.mode ?? '').toUpperCase()] ?? { master: 'MASTER NO.', house: 'HOUSE NO.' };
    const invDate = job.invoicedAt.toLocaleDateString('en-GB');

    let y = topH + 8;
    cell(L, y, FULL, 24, 'INVOICE', { bold: true, size: 16, align: 'center', fill: '#e6e6e6' });
    y += 24;

    // ---- customer (left) and invoice details (right)
    const ROW = 15;
    const boxH = ROW * 5;
    const LW = 215;
    const RX = L + LW + 6;
    const RW = R - RX;
    const c1 = 62;
    const c2 = 130;
    const c3 = 38;
    const c4 = RW - c1 - c2 - c3;

    cell(L, y, LW, boxH);
    cell(L, y, 62, ROW, 'CUSTOMER', { bold: true, size: 8 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(job.customerName, L + 4, y + ROW + 3, { width: LW - 8, height: 12, ellipsis: true });
    doc.font('Helvetica').fontSize(8);
    let cy = y + ROW + 17;
    if (job.customerAddress) {
      doc.text(job.customerAddress, L + 4, cy, { width: LW - 8, height: 22, ellipsis: true });
      cy = Math.min(doc.y, y + boxH - 22);
    }
    if (job.customerPhone) {
      doc.text(`Tel: ${job.customerPhone}`, L + 4, cy, { width: LW - 8, height: 10 });
      cy += 10;
    }
    if (job.customerTax && cy + 8 <= y + boxH) {
      doc.text(`NTN: ${job.customerTax}`, L + 4, cy, { width: LW - 8, height: 10 });
    }

    let ry = y;
    const grid = (l1: string, v2: string, l3: string, v4: string, boldVal = false) => {
      cell(RX, ry, c1, ROW, l1, { bold: true });
      cell(RX + c1, ry, c2, ROW, v2, { bold: boldVal });
      cell(RX + c1 + c2, ry, c3, ROW, l3, { bold: true });
      cell(RX + c1 + c2 + c3, ry, c4, ROW, v4);
      ry += ROW;
    };
    grid('Invoice No.', job.invoiceNo, 'Date', invDate, true);
    grid('GD No.', job.gdNo ?? '', 'Job', job.jobNo, true);
    grid('IGM No.', d.igmNo ?? '', 'Date', fmtDate(d.igmDate));
    grid('B/E Date', fmtDate(d.beDate), 'Ref', d.custRef ?? '');
    cell(RX, ry, c1, ROW, 'Freight Inv.', { bold: true });
    cell(RX + c1, ry, RW - c1, ROW, job.freightInvoiceNo ?? '');
    y += boxH + 8;

    // ---- consignment
    const w = [70, 70, 38, 100, 32, 55, 85];
    w.push(FULL - w.reduce((a, b) => a + b, 0));
    const heads = ['FROM', 'TO', 'MODE', 'COMMODITY', 'PCS', 'GRS.WT (KG)', t.master, t.house];
    let x = L;
    heads.forEach((h, i) => {
      cell(x, y, w[i], 13, h, { bold: true, align: 'center', fill: '#c8c8c8', size: 7 });
      x += w[i];
    });
    y += 13;
    const dataH = 30;
    const vals = [
      d.origin ?? '',
      d.destination ?? '',
      d.mode ?? '',
      d.commodity ?? '',
      d.pcs ?? '',
      d.weightKg ? money(d.weightKg) : '',
      d.blNo ?? '',
      [d.hawbNo, d.flight].filter(Boolean).join('\n'),
    ];
    x = L;
    vals.forEach((v, i) => {
      doc.lineWidth(0.5).strokeColor('#000').rect(x, y, w[i], dataH).stroke();
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#000')
        .text(String(v), x + 3, y + 4, {
          width: w[i] - 6,
          height: dataH - 6,
          ellipsis: true,
          align: i >= 4 && i <= 5 ? 'center' : 'left',
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
    const AMT = 110;
    const SNW = 28;
    const PW = FULL - SNW - AMT;
    ensure(80);
    cell(L, y, SNW, 15, 'S#', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(L + SNW, y, PW, 15, 'PARTICULARS', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(L + SNW + PW, y, AMT, 15, 'AMOUNT (PKR)', { bold: true, align: 'center', fill: '#c8c8c8' });
    y += 15;

    const rows = Math.max(5, job.lines.length);
    for (let i = 0; i < rows; i++) {
      const l = job.lines[i];
      ensure(14);
      cell(L, y, SNW, 14, l ? String(i + 1) : '', { align: 'center' });
      cell(L + SNW, y, PW, 14, l?.label ?? '');
      cell(L + SNW + PW, y, AMT, 14, l ? money(l.amount) : '', { align: 'right' });
      y += 14;
    }

    // ---- total with amount in words
    const totalNum = Number(job.total);
    const whole = Math.floor(totalNum + 1e-9);
    const paisa = Math.round((totalNum - whole) * 100);
    const words = `PKR: ${inWords(whole)}${paisa ? ` and ${inWords(paisa)} Paisa` : ''} Only`;
    doc.font('Helvetica-Bold').fontSize(8);
    const WW = FULL - AMT - 50;
    const th = Math.max(22, doc.heightOfString(words, { width: WW - 8 }) + 8);
    ensure(th);
    doc.lineWidth(0.5).strokeColor('#000').rect(L, y, WW, th).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(words, L + 4, y + 4, { width: WW - 8 });
    cell(L + WW, y, 50, th, 'TOTAL', { bold: true, align: 'center' });
    cell(L + WW + 50, y, AMT, th, money(job.total), { bold: true, align: 'right' });
    y += th + 16;

    // ---- note instead of a stamp
    ensure(20);
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#000')
      .text('This is a computer generated invoice. No signature or stamp is required.', L, y, {
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
    const termsH = 14 + COMPANY.terms.length * 9 + 6;
    if (y > footerTop - termsH - 8) doc.addPage();
    const ty = footerTop - termsH - 4;
    doc.lineWidth(0.5).strokeColor('#000').rect(L, ty, FULL, termsH).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('Terms & Conditions:', L + 4, ty + 3);
    doc.font('Helvetica').fontSize(6.5);
    COMPANY.terms.forEach((line, i) =>
      doc.text(line, L + 4, ty + 14 + i * 9, { width: FULL - 8, height: 8, ellipsis: true }),
    );

    doc.end();
  });
}