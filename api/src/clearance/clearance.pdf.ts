import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { fmtDate, inWords, money } from '../invoices/invoice-pdf.js';
import { BILTY_CHARGE_CODE, CHARGE_CODES, DUTY_KEYS, NOC_CHARGE_CODE } from './charges.js';

// ---------------------------------------------------------------------------
// TNI ENTERPRISES details printed on every clearance invoice. EDIT THESE.
// (The address, phones and email are already on the letterhead images.)
// ---------------------------------------------------------------------------
export const COMPANY = {
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
  payment: string | null;
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
  // the client paid the duties & taxes through PSID: printed, but not part of the total
  paidThroughPsid?: boolean;
  containers?: string[];
  lines: { code: string; label?: string; amount: any }[];
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
    // fixed charges in the bill's order; the NOC charges and the bilty rent come just before the agency commission (301)
    const dynamicRows = job.lines
      .filter((l) => (l.code === NOC_CHARGE_CODE || l.code === BILTY_CHARGE_CODE) && Number(l.amount) > 0)
      .map((l) => ({ code: l.code, label: l.label ?? '', amount: l.amount }));
    const rows: { code: string; label: string; amount: any }[] = [];
    for (const c of CHARGE_CODES) {
      if (c.code === '301') rows.push(...dynamicRows);
      const amount = job.lines.find((l) => l.code === c.code)?.amount;
      if (amount != null && Number(amount) > 0) rows.push({ ...c, amount });
    }
    const psid = !!job.paidThroughPsid;
    const containers = (job.containers ?? []).filter((c) => has(c));
    const hasContainers = containers.length > 0;

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
      // paid through PSID: the line is printed but the bill total does not include it
      if (!psid) totalAdj += dutyTotal - old;
    }
    const totalNum = totalAdj;
    const whole = Math.floor(totalNum + 1e-9);
    const paisa = Math.round((totalNum - whole) * 100);
    const words = `PKR: ${inWords(whole)}${paisa ? ` and ${inWords(paisa)} Paisa` : ''} Only`;

    // letterhead images keep their own proportions
    const topImg = asset('tni-letterhead-top.png');
    const bottomImg = asset('tni-letterhead-bottom.png');
    const imgH = (p: string | null) => {
      if (!p) return 0;
      const im = (doc as any).openImage(p);
      return (im.height * W) / im.width;
    };
    // ---- the header uses the Kiaan invoice layout: customer box on the left, INVOICE box on the right.
    // The INVOICE box starts in the white space beside the logo, so the table keeps normal-size rows.
    const BH = 44;
    const BANK_HEAD = 14;
    const termsH = 11 + COMPANY.terms.length * 7.8 + 4;
    const hasAddress = has(job.customerAddress);
    const rawTop = topImg ? imgH(topImg) : 96;
    const rawBot = bottomImg ? imgH(bottomImg) : 44;
    const topH = topImg ? rawTop - 8 : rawTop; // blank strip under the banner
    const botH = bottomImg ? rawBot - 28 : rawBot; // blank strip above the address

    // table columns: code | particulars | Rs. | Ps.
    const SNW = 36;
    const RSW = 92;
    const PSW = 34;
    const PW = FULL - SNW - RSW - PSW;
    const xS = L;
    const xP = xS + SNW;
    const xR = xP + PW;
    const xPs = xR + RSW;
    // total row: amount in words, then the TOTAL label cell, then the amount
    const TOTW = 62;
    const WORDW = SNW + PW - TOTW;
    doc.font('Helvetica-Bold').fontSize(8);
    const th = Math.max(20, doc.heightOfString(words, { width: WORDW - 8 }) + 8);

    // header boxes: the same layout as the Kiaan invoice (customer box left, INVOICE box right, same top)
    const ROW = 12;
    const LW = 255;
    const RX = L + LW + 6;
    const RW = R - RX;
    const c1 = 60;
    const c2 = 106;
    const c3 = 40;
    const c4 = RW - c1 - c2 - c3;
    const TITLE_H = 26;
    const DEPT_H = 14;
    const RIGHT_ROWS = 6;
    const boxTop = topH + 6;
    const rightH = TITLE_H + DEPT_H + RIGHT_ROWS * ROW;
    const ctrText = containers.join(', ');
    doc.font('Helvetica').fontSize(8);
    const ctrLines = hasContainers && doc.widthOfString(ctrText) > LW - 60 - 8 ? 2 : 1;
    const CTR_H = ctrLines * ROW;
    const LOW_ROWS = 2; // commodity, pkgs | weight (the container row follows)
    const lowH = LOW_ROWS * ROW + CTR_H;
    const boxH = Math.max(rightH, 70 + lowH);
    const boxBottom = boxTop + boxH;
    const tableTop = boxBottom + 8;

    // space that does not shrink: header boxes, total row, banking, terms
    const fixedExtra = tableTop - topH + (th + 8) + (BANK_HEAD + BH + 6) + (termsH + 8);
    const freeH = H - topH - botH - fixedExtra;
    const subCount = (two: boolean) => (two ? Math.ceil(subs.length / 2) : subs.length);
    const unitsFor = (two: boolean) => rows.length + (showDuty && subs.length ? subCount(two) * SUB_K + 0.25 : 0) + 1;
    const kFor = (two: boolean) => Math.max(0.5, Math.min(1, freeH / (unitsFor(two) * 14)));
    // the duty breakdown is one line each; it goes into two columns only when that keeps the rows bigger
    const twoCol = subs.length > 1 && kFor(false) < 0.85;
    const k = kFor(twoCol);
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
      o: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; color?: string; italic?: boolean } = {},
    ) => {
      if (!text) return;
      let size = Math.min(o.size ?? 8, Math.max(5.5, h - 2));
      const face = o.bold ? (o.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : o.italic ? 'Helvetica-Oblique' : 'Helvetica';
      doc.font(face).fontSize(size).fillColor(o.color ?? '#000');
      while (size > 6 && doc.widthOfString(text) > w - 6) {
        size -= 0.5;
        doc.fontSize(size);
      }
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
      o: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; fill?: string; color?: string; italic?: boolean } = {},
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


    let y = tableTop;
    // everything is sized to fit on one page, so a page is never added
    const ensure = (_h: number) => {};
    const sv = (v: any) => (has(v) ? String(v) : '');

    // ---- right box: BILL INVOICE, department / NTN, then the numbers
    const boxExtra = boxH - rightH;
    cell(RX, boxTop, RW, TITLE_H, 'BILL INVOICE', { bold: true, size: 18, align: 'center' });
    let ry = boxTop + TITLE_H;
    cell(RX, ry, c1 + c2, DEPT_H, 'DEPARTMENT : CUSTOMS CLEARANCE', { bold: true, size: 9 });
    cell(RX + c1 + c2, ry, c3, DEPT_H, 'NTN', { bold: true });
    cell(RX + c1 + c2 + c3, ry, c4, DEPT_H, sv(job.customerTax));
    ry += DEPT_H;
    const grid = (l1: string, v2: string, l3?: string, v4?: string, boldVal = false, h = ROW) => {
      cell(RX, ry, c1, h, l1, { bold: true });
      if (l3 === undefined) {
        cell(RX + c1, ry, RW - c1, h, v2, { bold: boldVal });
      } else {
        cell(RX + c1, ry, c2, h, v2, { bold: boldVal });
        cell(RX + c1 + c2, ry, c3, h, l3, { bold: true });
        cell(RX + c1 + c2 + c3, ry, c4, h, v4 ?? '', { bold: boldVal });
      }
      ry += h;
    };
    grid('Invoice No.', job.invoiceNo, 'Date', invDate, true);
    grid('G.D No.', sv(job.gdNo), 'Date', beDate);
    grid('Collectorate', sv(job.collectorate), 'VIR', sv(job.virNumber));
    grid('AWB No.', sv(d.blNo), 'HAWB', sv(d.hawbNo));
    grid('Party Code', sv(d.partyCode), 'Express', sv(d.expressOn));
    grid('Job No.', sv(job.jobNo), 'Ref', sv(d.invoiceRef), false, ROW + boxExtra);

    // ---- left box: customer, then commodity, packages / weight and the container numbers
    const custH = boxH - lowH;
    cell(L, boxTop, LW, custH);
    cell(L, boxTop, 62, ROW + 2, 'CUSTOMER', { bold: true, size: 9 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(job.customerName, L + 4, boxTop + 18, { width: LW - 8, height: 12, ellipsis: true });
    doc.font('Helvetica').fontSize(8);
    let cy = boxTop + 31;
    if (hasAddress) {
      doc.text(String(job.customerAddress), L + 4, cy, { width: LW - 8, height: custH - 34, ellipsis: true });
      cy = doc.y;
    }
    if (has(job.customerPhone) && cy + 10 < boxTop + custH) {
      doc.text(`Tel: ${job.customerPhone}`, L + 4, cy + 1, { width: LW - 8 });
    }
    let ly = boxTop + custH;
    const l4 = LW - 60 - 106 - 40;
    cell(L, ly, 60, ROW, 'Commodity', { bold: true });
    cell(L + 60, ly, LW - 60, ROW, sv(d.commodity));
    ly += ROW;
    cell(L, ly, 60, ROW, 'No. Of Pkgs', { bold: true });
    cell(L + 60, ly, 106, ROW, sv(d.pcs));
    cell(L + 166, ly, 40, ROW, 'Weight', { bold: true });
    cell(L + 206, ly, l4, ROW, has(d.weightKg) ? `${money(d.weightKg)} KG` : '');
    ly += ROW;
    cell(L, ly, 60, CTR_H, containers.length > 1 ? 'Container Nos' : 'Container No.', { bold: true });
    if (ctrLines === 1) {
      cell(L + 60, ly, LW - 60, CTR_H, ctrText);
    } else {
      cell(L + 60, ly, LW - 60, CTR_H);
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#000')
        .text(ctrText, L + 63, ly + 3, { width: LW - 60 - 6, height: CTR_H - 4, ellipsis: true });
    }
    y = tableTop;

    // ---- table: code | particulars | Rs. | Ps. (only the charges that were entered)
    ensure(80);
    cell(xS, y, SNW, RH, 'CODE', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xP, y, PW, RH, 'PARTICULARS', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xR, y, RSW, RH, 'Rs.', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xPs, y, PSW, RH, 'Ps.', { bold: true, align: 'center', fill: '#c8c8c8' });
    y += RH;

    for (const r of rows) {
      const a = split(r.amount);
      if (r.code === '101' && showDuty && subs.length) {
        // big row: the customs duty line followed by where it goes
        const bigH = RH + subCount(twoCol) * SUBH + 3;
        cell(xS, y, SNW, bigH);
        cell(xP, y, PW, bigH);
        cell(xR, y, RSW, bigH);
        cell(xPs, y, PSW, bigH);
        txt(xS, y, SNW, RH, r.code, { align: 'center', size: 7.5 });
        const memo = psid && r.code === '101'; // PSID: shown, not added
        txt(xP, y, PW, RH, memo ? `${r.label}  [PAID THROUGH PSID - NOT IN TOTAL]` : r.label, { size: 8, bold: true });
        txt(xR, y, RSW, RH, a.rs, { bold: true, align: 'right', color: memo ? '#666' : undefined, italic: memo });
        txt(xPs, y, PSW, RH, a.ps, { bold: true, align: 'center', color: memo ? '#666' : undefined, italic: memo });
        doc.lineWidth(0.3).strokeColor('#999').moveTo(xP + 3, y + RH).lineTo(xR + RSW - 3, y + RH).stroke();
        const perCol = subCount(twoCol);
        const colW = (PW - 14) / 2;
        subs.forEach((sl, n) => {
          if (twoCol) {
            // two columns inside the particulars cell: label left, amount right
            const col = n < perCol ? 0 : 1;
            const sy = y + RH + 1 + (col ? n - perCol : n) * SUBH;
            const sx = xP + 10 + col * colW;
            txt(sx, sy, colW - 6, SUBH, sl.label, { size: 7.5 });
            txt(sx, sy, colW - 6, SUBH, sl.amount, { size: 7.5, align: 'right' });
          } else {
            const sy = y + RH + 1 + n * SUBH;
            txt(xP + 14, sy, PW - 14, SUBH, sl.label, { size: 7.5 });
            if (sl.amount) txt(xR, sy, RSW, SUBH, sl.amount, { size: 7.5, align: 'right' });
          }
        });
        y += bigH;
        continue;
      }
      const memo = psid && r.code === '101'; // PSID: shown, not added
      cell(xS, y, SNW, RH, r.code, { align: 'center', size: 7.5 });
      cell(xP, y, PW, RH, memo ? `${r.label}  [PAID THROUGH PSID - NOT IN TOTAL]` : r.label, { size: 8 });
      cell(xR, y, RSW, RH, a.rs, { bold: true, align: 'right', color: memo ? '#666' : undefined, italic: memo });
      cell(xPs, y, PSW, RH, a.ps, { bold: true, align: 'center', color: memo ? '#666' : undefined, italic: memo });
      y += RH;
    }

    // ---- total row: amount in words | TOTAL | amount (as on the Kiaan invoice)
    const tot = split(totalAdj);
    ensure(th);
    doc.lineWidth(0.5).strokeColor('#000').rect(xS, y, WORDW, th).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(words, xS + 4, y + 4, { width: WORDW - 8 });
    cell(xS + WORDW, y, TOTW, th, 'TOTAL', { bold: true, align: 'center' });
    cell(xR, y, RSW, th, tot.rs, { bold: true, size: 9, align: 'right' });
    cell(xPs, y, PSW, th, tot.ps, { bold: true, align: 'center' });
    y += th + 8;

    // ---- banking details (both accounts side by side); the computer-generated note shares the heading line
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#355E9B').text('Banking detail:', L, y, { lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor('#000')
      .text('This is a computer generated invoice. No signature or stamp is required.', L, y + 3, {
        width: FULL,
        align: 'right',
        lineBreak: false,
      });
    y += BANK_HEAD;
    const BW = (FULL - 10) / COMPANY.banks.length;
    COMPANY.banks.forEach((b, i) => {
      const bx = L + i * (BW + 10);
      doc.lineWidth(0.5).strokeColor('#999').rect(bx, y, BW, BH).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text(b.bank, bx + 6, y + 3, { width: BW - 12, lineBreak: false });
      doc.font('Helvetica').fontSize(8);
      doc.text(`Account Title: ${b.title}`, bx + 6, y + 13.5, { width: BW - 12, lineBreak: false });
      doc.text(`Account Number: ${b.account}`, bx + 6, y + 23, { width: BW - 12, lineBreak: false });
      doc.text(`IBAN: ${b.iban}`, bx + 6, y + 32.5, { width: BW - 12, lineBreak: false });
    });
    y += BH + 6;

    // ---- terms & conditions (bottom of the page, above the footer)
    const ty = footerTop - termsH - 4;
    doc.lineWidth(0.5).strokeColor('#000').rect(L, ty, FULL, termsH).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('Terms & Conditions:', L + 4, ty + 3);
    doc.font('Helvetica').fontSize(6.5);
    COMPANY.terms.forEach((line, i) =>
      doc.text(line, L + 4, ty + 11 + i * 7.8, { width: FULL - 8, height: 8, ellipsis: true }),
    );

    doc.end();
  });
}