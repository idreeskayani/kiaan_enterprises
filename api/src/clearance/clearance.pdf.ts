import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { fmtDate, inWords, money } from '../invoices/invoice-pdf.js';
import { CHARGE_CODES } from './charges.js';

// ---------------------------------------------------------------------------
// TNI ENTERPRISES details printed on every clearance invoice. EDIT THESE.
// (The address, phones and email are already on the letterhead images.)
// ---------------------------------------------------------------------------
const COMPANY = {
  name: 'TNI ENTERPRISES',
  tagline: 'Customs Clearing & Forwarding Agents',
  address: 'Street # 06, Union Council Road, Near Jamia Masjid Sultan, Dhoke Haidri Koral, Islamabad - 44000',
  email: 'tni.enterprises786@gmail.com',
  phones: '0346-6479976 | 0313-5388630',
  banks: [
    {
      bank: 'Bank ALFALAH',
      title: 'TNI Enterprises',
      account: '5681005002351905',
      iban: 'PK04ALFH5681005002351905',
    },
    {
      bank: 'Askari Bank',
      title: 'TNI Enterprises',
      account: '03320420001293',
      iban: 'PK95ASCM0003320420001293',
    },
  ],
  // Keep each line short enough to fit on one line.
  terms: [
    '1) Duties and taxes are charged as per the assessment and challans issued by Customs.',
    '2) Any discrepancy in this invoice must be reported within 3 days of receipt, otherwise it will be considered correct and accepted.',
    '3) Demurrage, detention and examination charges, if any, are payable by the owner of the goods.',
    '4) Extra financial charges may be added to the invoice amount if it is not paid within the agreed days.',
    '5) Payment must be made only to the TNI Enterprises bank accounts printed on this invoice.',
    '6) All legal matters are subject to the jurisdiction of the local courts only.',
  ],
};

export type ClearancePdfJob = {
  jobNo: string;
  invoiceNo: string;
  payment: string;
  invoicedAt: Date;
  total: any;
  gdNo?: string | null;
  assessableValue?: any;
  customerName: string;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerTax?: string | null;
  details?: any;
  lines: { code: string; amount: any }[];
};

const asset = (name: string) => {
  const p = join(process.cwd(), 'assets', name);
  return existsSync(p) ? p : null;
};

// whole rupees with commas, and the paisa part (blank when zero)
const split = (v: any) => {
  const n = Math.round(Number(v) * 100) / 100;
  const whole = Math.floor(n + 1e-9);
  const paisa = Math.round((n - whole) * 100);
  return {
    rs: whole.toLocaleString('en-US'),
    ps: paisa ? String(paisa).padStart(2, '0') : '',
  };
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

    // "Label: value" with a thin line under it, like the printed bill
    const field = (label: string, value: string, x: number, yy: number, w: number, bold = true) => {
      doc.font('Helvetica').fontSize(8.5).fillColor('#000');
      const lw = doc.widthOfString(label) + 4;
      doc.text(label, x, yy, { lineBreak: false });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      doc.text(value, x + lw, yy, { width: w - lw, height: 11, ellipsis: true, lineBreak: false });
      doc.lineWidth(0.4).strokeColor('#555').moveTo(x, yy + 11.5).lineTo(x + w, yy + 11.5).stroke();
    };

    // ---- letterhead
    if (topImg) {
      doc.image(topImg, 0, 0, { width: W });
    } else {
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#14213d').text(COMPANY.name, L, 34);
      doc.font('Helvetica').fontSize(9).fillColor('#444');
      doc.text(COMPANY.tagline, L, 60);
      doc.text(`${COMPANY.address}`, L, 72);
      doc.text(`${COMPANY.phones}  |  ${COMPANY.email}`, L, 84);
    }

    const d: Record<string, any> = job.details && typeof job.details === 'object' ? job.details : {};
    const has = (v: any) => v != null && String(v).trim() !== '';
    const invDate = job.invoicedAt.toLocaleDateString('en-GB');
    const beDate = has(d.beDate) ? fmtDate(d.beDate) : '';

    let y = topH + 6;
    const HALF = (FULL - 20) / 2;
    const RX = L + HALF + 20;
    const ROWH = 15;

    const ensure = (h: number) => {
      if (y + h > footerTop - 8) {
        doc.addPage();
        y = 40;
      }
    };

    // ---- header, same lines as the printed bill (empty fields are not printed)
    field('', job.invoiceNo, L, y, HALF - 70);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text('Bill Invoice', L + HALF - 60, y - 2, { lineBreak: false });
    field('Dated ', invDate, RX, y, HALF);
    y += ROWH;

    const commodity = has(d.commodity) ? `  ( ${d.commodity} )` : '';
    field('Mr./M/s. ', `${job.customerName}${commodity}`, L, y, FULL);
    y += ROWH;

    const contact = [
      job.customerAddress,
      job.customerPhone ? `Tel: ${job.customerPhone}` : '',
      job.customerTax ? `NTN: ${job.customerTax}` : '',
    ]
      .filter(Boolean)
      .join('   ');
    if (contact) {
      field('Address: ', contact, L, y, FULL, false);
      y += ROWH;
    }

    // the remaining header fields, two per row, skipping the empty ones
    const optional: [string, string][] = (
      [
        ['Express On: ', d.expressOn],
        ['No.Of.Pkgs: ', d.pcs],
        ['Weight: ', has(d.weightKg) ? `${money(d.weightKg)} KG` : ''],
        ['Invoice No: ', d.invoiceRef],
        ['Party Code: ', d.partyCode],
        ['G.D No: ', job.gdNo],
        ['Dated ', beDate],
        ['AWB No: - ', d.blNo],
        ['HAWB No: ', d.hawbNo],
      ] as [string, any][]
    )
      .filter(([, v]) => has(v))
      .map(([k, v]) => [k, String(v)]);
    for (let i = 0; i < optional.length; i += 2) {
      field(optional[i][0], optional[i][1], L, y, HALF);
      if (optional[i + 1]) field(optional[i + 1][0], optional[i + 1][1], RX, y, HALF);
      y += ROWH;
    }
    y += 6;

    // ---- table: info column | code | particulars | Rs. | Ps. (only the charges that were entered)
    const INFO = 112;
    const SNW = 36;
    const RSW = 92;
    const PSW = 34;
    const PW = FULL - INFO - SNW - RSW - PSW;
    const xS = L + INFO;
    const xP = xS + SNW;
    const xR = xP + PW;
    const xPs = xR + RSW;
    const RH = 14;

    const rows = CHARGE_CODES.map((c) => ({
      ...c,
      amount: job.lines.find((l) => l.code === c.code)?.amount,
    })).filter((r) => r.amount != null && Number(r.amount) > 0);

    const av = Number(job.assessableValue);
    const info = [
      av > 0 ? `Value Rs: ${split(av).rs}` : '',
      has(d.igmNo) ? `IGM No: ${d.igmNo}` : '',
      has(d.beNo) ? `B/E S/B No: ${d.beNo}` : '',
      beDate ? `Dated: ${beDate}` : '',
      has(d.demBillNo) ? `Dem.Bill No: ${d.demBillNo}` : '',
      has(d.wNo) ? `W/ No: ${d.wNo}` : '',
      has(d.pcs) ? `No. Pkgs: ${d.pcs}` : '',
    ].filter(Boolean);

    ensure(80);
    cell(L, y, INFO, RH, '', { fill: '#c8c8c8' });
    cell(xS, y, SNW, RH, '', { fill: '#c8c8c8' });
    cell(xP, y, PW, RH, '', { fill: '#c8c8c8' });
    cell(xR, y, RSW, RH, 'Rs.', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xPs, y, PSW, RH, 'Ps.', { bold: true, align: 'center', fill: '#c8c8c8' });
    y += RH;

    const bodyRows = Math.max(rows.length, info.length);
    for (let i = 0; i < bodyRows; i++) {
      const r = rows[i];
      ensure(RH);
      cell(L, y, INFO, RH, info[i] ?? '', { size: 7.5 });
      cell(xS, y, SNW, RH, r?.code ?? '', { align: 'center', size: 7.5 });
      cell(xP, y, PW, RH, r?.label ?? '', { size: 8 });
      const a = r ? split(r.amount) : { rs: '', ps: '' };
      cell(xR, y, RSW, RH, r ? `=${a.rs}=` : '', { bold: true, align: 'right' });
      cell(xPs, y, PSW, RH, a.ps ? `=${a.ps}=` : '', { bold: true, align: 'center' });
      y += RH;
    }

    // ---- total
    const tot = split(job.total);
    ensure(RH);
    cell(L, y, INFO, RH);
    cell(xS, y, SNW, RH, '344', { align: 'center', size: 7.5 });
    cell(xP, y, PW, RH, 'Total', { bold: true, size: 9 });
    cell(xR, y, RSW, RH, `=${tot.rs}=`, { bold: true, size: 9, align: 'right' });
    cell(xPs, y, PSW, RH, tot.ps ? `=${tot.ps}=` : '', { bold: true, align: 'center' });
    y += RH;

    // ---- amount in words
    const totalNum = Number(job.total);
    const whole = Math.floor(totalNum + 1e-9);
    const paisa = Math.round((totalNum - whole) * 100);
    const words = `AMOUNT IN WORDS: -  PKR ${inWords(whole)}${paisa ? ` and ${inWords(paisa)} Paisa` : ''} Only`;
    doc.font('Helvetica-Bold').fontSize(8.5);
    const wh = Math.max(20, doc.heightOfString(words, { width: FULL - 10 }) + 10);
    ensure(wh);
    doc.lineWidth(0.5).strokeColor('#000').rect(L, y, FULL, wh).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000').text(words, L + 5, y + 5, { width: FULL - 10 });
    y += wh + 12;

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
    y += 20;

    // ---- banking details (both accounts side by side)
    const BH = 62;
    ensure(BH + 18);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#355E9B').text('Banking detail:', L, y);
    y += 17;
    const BW = (FULL - 10) / COMPANY.banks.length;
    COMPANY.banks.forEach((b, i) => {
      const bx = L + i * (BW + 10);
      doc.lineWidth(0.5).strokeColor('#999').rect(bx, y, BW, BH).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text(b.bank, bx + 6, y + 5, { width: BW - 12 });
      doc.font('Helvetica').fontSize(8.5);
      doc.text(`Account Title: ${b.title}`, bx + 6, y + 18, { width: BW - 12 });
      doc.text(`Account Number: ${b.account}`, bx + 6, y + 30, { width: BW - 12 });
      doc.text(`IBAN: ${b.iban}`, bx + 6, y + 42, { width: BW - 12 });
    });
    y += BH + 10;

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