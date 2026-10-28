import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { fmtDate, inWords, money } from '../invoices/invoice-pdf.js';
import { CHARGE_CODES, DUTY_KEYS } from './charges.js';

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
  collectorate?: string | null;
  virNumber?: string | null;
  duties?: any;
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

    const d: Record<string, any> = job.details && typeof job.details === 'object' ? job.details : {};
    const has = (v: any) => v != null && String(v).trim() !== '';
    const invDate = job.invoicedAt.toLocaleDateString('en-GB');
    const beDate = has(d.beDate) ? fmtDate(d.beDate) : '';
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
    const rows = CHARGE_CODES.map((c) => ({
      ...c,
      amount: job.lines.find((l) => l.code === c.code)?.amount,
    })).filter((r) => r.amount != null && Number(r.amount) > 0);

    // customs duty breakdown: printed as its own block only when it was entered
    const dRaw: Record<string, any> = job.duties && typeof job.duties === 'object' ? job.duties : {};
    const dutyVals = DUTY_KEYS.map((k) => Math.round(Number(dRaw[k.key]) || 0));
    const dutyTotal = dutyVals.reduce((t, n) => t + n, 0);
    const showDuty = dutyTotal > 0;
    // lines listed inside the 101 row: each duty head that has an amount (they add up to the 101 amount)
    const subs: { label: string; amount: string }[] = showDuty
      ? DUTY_KEYS.map((k, i) => ({ label: k.label, amount: dutyVals[i] ? split(dutyVals[i]).rs : '' })).filter((x) => x.amount)
      : [];
    const SUB_K = 0.92; // sub-line height as a share of a normal row
    // customs duty (101) always equals the sum of its breakdown; the bill total follows
    let totalAdj = Number(job.total);
    if (showDuty) {
      const r101 = rows.find((r) => r.code === '101');
      const old = r101 ? Number(r101.amount) : 0;
      if (r101) (r101 as any).amount = dutyTotal;
      else rows.unshift({ ...CHARGE_CODES.find((c) => c.code === '101')!, amount: dutyTotal } as any);
      totalAdj += dutyTotal - old;
    }
    const totalNum = totalAdj;
    const whole = Math.floor(totalNum + 1e-9);
    const paisa = Math.round((totalNum - whole) * 100);
    const words = `AMOUNT IN WORDS: -  PKR ${inWords(whole)}${paisa ? ` and ${inWords(paisa)} Paisa` : ''} Only`;
    doc.font('Helvetica-Bold').fontSize(8.5);
    const wh = Math.max(20, doc.heightOfString(words, { width: FULL - 10 }) + 10);

    // letterhead images keep their own proportions
    const topImg = asset('tni-letterhead-top.png');
    const bottomImg = asset('tni-letterhead-bottom.png');
    const imgH = (p: string | null) => {
      if (!p) return 0;
      const im = (doc as any).openImage(p);
      return (im.height * W) / im.width;
    };
    // ---- fit everything on ONE page: squeeze the row heights first, then the letterhead images
    const BH = 46;
    const NOTE_H = 15;
    const termsH = 12 + COMPANY.terms.length * 8.2 + 5;
    const hasAddress = has(job.customerAddress);
    const hasTelNtn = has(job.customerPhone) || has(job.customerTax);
    const hasTracking = has(job.collectorate) || has(job.virNumber);
    const hdrRows = 2 + (hasTracking ? 1 : 0) + (hasAddress ? 1 : 0) + (hasTelNtn ? 1 : 0) + Math.ceil(optional.length / 2);
    // the 101 row grows by its breakdown lines
    const bodyUnits = rows.length + (showDuty ? subs.length * SUB_K + 0.25 : 0);
    const rawTop = topImg ? imgH(topImg) : 96;
    const rawBot = bottomImg ? imgH(bottomImg) : 44;
    const topH = topImg ? rawTop - 8 : rawTop; // blank strip under the banner
    const botH = bottomImg ? rawBot - 28 : rawBot; // blank strip above the address
    const ROWH = 14; // header rows keep a fixed pitch so the lines stay perfectly aligned
    // space that does not shrink: gaps, words box, note, banking, terms
    const fixedExtra = 6 + 6 + (wh + 12) + NOTE_H + (16 + BH + 8) + (termsH + 4 + 6) + hdrRows * ROWH;
    // only the table rows are squeezed (the letterhead keeps its full width)
    const k = Math.max(0.5, Math.min(1, (H - topH - botH - fixedExtra) / ((bodyUnits + 2) * 14)));
    const RH = 14 * k;
    const SUBH = RH * SUB_K;
    const imgW = W;
    const imgX = 0;
    const footerTop = H - botH;

    const drawFooter = () => {
      if (bottomImg) {
          doc.save();
        doc.rect(0, footerTop, W, botH).clip();
        doc.image(bottomImg, 0, H - rawBot, { width: W });
        doc.restore();
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

    // one line of text, vertically centred in a box
    const txt = (
      x: number,
      yy: number,
      w: number,
      h: number,
      text = '',
      o: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right' } = {},
    ) => {
      if (!text) return;
      const size = Math.min(o.size ?? 8, Math.max(5.5, h - 2.4));
      doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000');
      doc.text(text, x + 3, yy + (h - size) / 2 + 0.5, {
        width: w - 6,
        height: size + 2,
        ellipsis: true,
        align: o.align ?? 'left',
        lineBreak: false,
      });
    };

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
      txt(x, yy, w, h, text, o);
    };

    // "Label: value" with a thin line under it. Label and value share one baseline.
    const field = (label: string, value: string, x: number, yy: number, w: number, bold = true, boldLabel = false) => {
      doc.font(boldLabel ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000');
      const lw = doc.widthOfString(label) + 3;
      doc.text(label, x, yy, { lineBreak: false });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      let size = 9;
      doc.fontSize(size);
      while (size > 7 && doc.widthOfString(value) > w - lw) {
        size -= 0.5;
        doc.fontSize(size);
      }
      doc.text(value, x + lw, yy + (9 - size) * 0.75, { width: w - lw, height: 12, ellipsis: true, lineBreak: false });
      doc.lineWidth(0.4).strokeColor('#555').moveTo(x, yy + 12.5).lineTo(x + w, yy + 12.5).stroke();
    };

    // ---- letterhead
    if (topImg) {
      doc.save();
      doc.rect(0, 0, W, topH).clip();
      doc.image(topImg, 0, 0, { width: W });
      doc.restore();
    } else {
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#14213d').text(COMPANY.name, L, 34);
      doc.font('Helvetica').fontSize(9).fillColor('#444');
      doc.text(COMPANY.tagline, L, 60);
      doc.text(`${COMPANY.address}`, L, 72);
      doc.text(`${COMPANY.phones}  |  ${COMPANY.email}`, L, 84);
    }


    let y = topH + 6;
    const HALF = (FULL - 20) / 2;
    const RX = L + HALF + 20;

    // everything is sized to fit on one page, so a page is never added
    const ensure = (_h: number) => {};

    // ---- header, same lines as the printed bill (empty fields are not printed)
    // invoice no. on the left, the title centred on the page, the date on the right
    field('', job.invoiceNo, L, y, 170);
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor('#000')
      .text('Bill Invoice', L, y - 3, { width: FULL, align: 'center', lineBreak: false, underline: true });
    field('Dated ', invDate, R - 150, y, 150);
    y += ROWH;

    // tracking: collectorate and VIR number, right under the invoice number
    if (hasTracking) {
      if (has(job.collectorate)) field('Collectorate: ', String(job.collectorate), L, y, FULL - 190);
      if (has(job.virNumber)) field('VIR No: ', String(job.virNumber), R - 175, y, 175);
      y += ROWH;
    }

    const commodity = has(d.commodity) ? `  ( ${d.commodity} )` : '';
    field('Mr./M/s. ', `${job.customerName}${commodity}`, L, y, FULL);
    y += ROWH;

    if (hasAddress) {
      field('Address: ', String(job.customerAddress), L, y, FULL, false);
      y += ROWH;
    }

    // telephone and NTN: separate bold fields, each in its own place on one row
    if (hasTelNtn) {
      if (has(job.customerPhone)) field('Tel: ', String(job.customerPhone), L, y, HALF, true, true);
      if (has(job.customerTax)) field('NTN: ', String(job.customerTax), RX, y, HALF, true, true);
      y += ROWH;
    }

    for (let i = 0; i < optional.length; i += 2) {
      field(optional[i][0], optional[i][1], L, y, HALF);
      if (optional[i + 1]) field(optional[i + 1][0], optional[i + 1][1], RX, y, HALF);
      y += ROWH;
    }
    y += 6;

    // ---- table: code | particulars | Rs. | Ps. (only the charges that were entered)
    const INFO = 0;
    const SNW = 36;
    const RSW = 92;
    const PSW = 34;
    const PW = FULL - INFO - SNW - RSW - PSW;
    const xS = L + INFO;
    const xP = xS + SNW;
    const xR = xP + PW;
    const xPs = xR + RSW;


    ensure(80);
    cell(xS, y, SNW, RH, '', { fill: '#c8c8c8' });
    cell(xP, y, PW, RH, '', { fill: '#c8c8c8' });
    cell(xR, y, RSW, RH, 'Rs.', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xPs, y, PSW, RH, 'Ps.', { bold: true, align: 'center', fill: '#c8c8c8' });
    y += RH;

    for (const r of rows) {
      const a = split(r.amount);
      if (r.code === '101' && showDuty && subs.length) {
        // big row: the customs duty line followed by where it goes
        const bigH = RH + subs.length * SUBH + 3;
        cell(xS, y, SNW, bigH);
        cell(xP, y, PW, bigH);
        cell(xR, y, RSW, bigH);
        cell(xPs, y, PSW, bigH);
        txt(xS, y, SNW, RH, r.code, { align: 'center', size: 7.5 });
        txt(xP, y, PW, RH, r.label, { size: 8, bold: true });
        txt(xR, y, RSW, RH, a.rs, { bold: true, align: 'right' });
        txt(xPs, y, PSW, RH, a.ps, { bold: true, align: 'center' });
        doc.lineWidth(0.3).strokeColor('#999').moveTo(xP + 3, y + RH).lineTo(xR + RSW - 3, y + RH).stroke();
        subs.forEach((sl, n) => {
          const sy = y + RH + 1 + n * SUBH;
          txt(xP + 14, sy, PW - 14, SUBH, sl.label, { size: 7.5 });
          if (sl.amount) txt(xR, sy, RSW, SUBH, sl.amount, { size: 7.5, align: 'right' });
        });
        y += bigH;
        continue;
      }
      cell(xS, y, SNW, RH, r.code, { align: 'center', size: 7.5 });
      cell(xP, y, PW, RH, r.label, { size: 8 });
      cell(xR, y, RSW, RH, a.rs, { bold: true, align: 'right' });
      cell(xPs, y, PSW, RH, a.ps, { bold: true, align: 'center' });
      y += RH;
    }

    // ---- total
    const tot = split(totalAdj);
    ensure(RH);
    cell(xS, y, SNW, RH, '344', { align: 'center', size: 7.5 });
    cell(xP, y, PW, RH, 'Total', { bold: true, size: 9 });
    cell(xR, y, RSW, RH, tot.rs, { bold: true, size: 9, align: 'right' });
    cell(xPs, y, PSW, RH, tot.ps, { bold: true, align: 'center' });
    y += RH;

    // ---- amount in words
    ensure(wh);
    doc.lineWidth(0.5).strokeColor('#000').rect(L, y, FULL, wh).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000').text(words, L + 5, y + 5, { width: FULL - 10 });
    y += wh + 12;

    // ---- note instead of a stamp
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#000')
      .text('This is a computer generated invoice. No signature or stamp is required.', L, y, {
        width: FULL,
        align: 'center',
      });
    y += NOTE_H;

    // ---- banking details (both accounts side by side)
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#355E9B').text('Banking detail:', L, y);
    y += 16;
    const BW = (FULL - 10) / COMPANY.banks.length;
    COMPANY.banks.forEach((b, i) => {
      const bx = L + i * (BW + 10);
      doc.lineWidth(0.5).strokeColor('#999').rect(bx, y, BW, BH).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text(b.bank, bx + 6, y + 4, { width: BW - 12 });
      doc.font('Helvetica').fontSize(8.5);
      doc.text(`Account Title: ${b.title}`, bx + 6, y + 15, { width: BW - 12 });
      doc.text(`Account Number: ${b.account}`, bx + 6, y + 25, { width: BW - 12 });
      doc.text(`IBAN: ${b.iban}`, bx + 6, y + 35, { width: BW - 12 });
    });
    y += BH + 8;

    // ---- terms & conditions (bottom of the page, above the footer)
    const ty = footerTop - termsH - 4;
    doc.lineWidth(0.5).strokeColor('#000').rect(L, ty, FULL, termsH).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('Terms & Conditions:', L + 4, ty + 3);
    doc.font('Helvetica').fontSize(6.5);
    COMPANY.terms.forEach((line, i) =>
      doc.text(line, L + 4, ty + 12 + i * 8.2, { width: FULL - 8, height: 8, ellipsis: true }),
    );

    doc.end();
  });
}