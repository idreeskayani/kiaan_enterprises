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
  modeOfTransport?: string | null;
  containers?: string[];
  lines: { code: string; label?: string; amount: any }[];
};

const asset = (name: string) => {
  const p = join(process.cwd(), 'assets', name);
  return existsSync(p) ? p : null;
};

// Same page as the Kiaan Freight invoice (boxed header, grey table headings, banking text, terms box).
// Everything is sized to fit one page; only a very long charge list runs onto a second page.
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
    const mode = has(job.modeOfTransport) ? String(job.modeOfTransport).toUpperCase() : '';

    // ---- charge rows: fixed charges in the bill's order; NOC charges and bilty rent come just before the agency commission (301)
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

    // customs duty breakdown, listed inside the 101 row
    const dRaw: Record<string, any> = job.duties && typeof job.duties === 'object' ? job.duties : {};
    const dutyVals = DUTY_KEYS.map((k) => Math.round(Number(dRaw[k.key]) || 0));
    const dutyTotal = dutyVals.reduce((t, n) => t + n, 0);
    const showDuty = dutyTotal > 0;
    const subs: { label: string; amount: string }[] = showDuty
      ? DUTY_KEYS.map((k, i) => ({ label: k.label, amount: dutyVals[i] ? money(dutyVals[i]) : '' })).filter((x) => x.amount)
      : [];
    const SUB_K = 0.92;
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
    const whole = Math.floor(totalAdj + 1e-9);
    const paisa = Math.round((totalAdj - whole) * 100);
    const words = `PKR: ${inWords(whole)}${paisa ? ` and ${inWords(paisa)} Paisa` : ''} Only`;

    // ---- letterhead images keep their own proportions; the blank strips are cut off
    const topImg = asset('tni-letterhead-top.png');
    const bottomImg = asset('tni-letterhead-bottom.png');
    const imgH = (p: string | null) => {
      if (!p) return 0;
      const im = (doc as any).openImage(p);
      return (im.height * W) / im.width;
    };
    const rawTop = topImg ? imgH(topImg) : 96;
    const rawBot = bottomImg ? imgH(bottomImg) : 44;
    const topH = topImg ? rawTop - 8 : rawTop;
    const botH = bottomImg ? rawBot - 28 : rawBot;
    const footerTop = H - botH;

    const drawFooter = () => {
      if (bottomImg) {
        doc.save();
        doc.rect(0, footerTop, W, botH).clip();
        doc.image(bottomImg, 0, H - rawBot, { width: W });
        doc.restore();
      } else {
        doc.lineWidth(0.5).strokeColor('#999').moveTo(L, footerTop + 8).lineTo(R, footerTop + 8).stroke();
        doc.font('Helvetica').fontSize(8).fillColor('#444')
          .text(`${COMPANY.name}  |  ${COMPANY.phones}  |  ${COMPANY.email}`, L, footerTop + 16, { width: FULL, align: 'center' });
      }
    };
    drawFooter();
    doc.on('pageAdded', drawFooter);

    // one line of text, vertically centred in a box
    const txt = (
      x: number, yy: number, w: number, h: number, text = '',
      o: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; color?: string; italic?: boolean } = {},
    ) => {
      if (!text) return;
      const size = Math.min(o.size ?? 8, Math.max(5.5, h - 2.4));
      const face = o.bold ? (o.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : o.italic ? 'Helvetica-Oblique' : 'Helvetica';
      doc.font(face).fontSize(size).fillColor(o.color ?? '#000');
      doc.text(text, x + 3, yy + (h - size) / 2 + 0.5, {
        width: w - 6, height: size + 2, ellipsis: true, align: o.align ?? 'left', lineBreak: false,
      });
    };
    // a bordered cell with one line of text
    const cell = (
      x: number, yy: number, w: number, h: number, text = '',
      o: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; fill?: string; color?: string; italic?: boolean } = {},
    ) => {
      doc.lineWidth(0.5).strokeColor('#000');
      if (o.fill) doc.rect(x, yy, w, h).fillAndStroke(o.fill, '#000');
      else doc.rect(x, yy, w, h).stroke();
      txt(x, yy, w, h, text, o);
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
      doc.text(COMPANY.address, L, 72);
      doc.text(`${COMPANY.phones}  |  ${COMPANY.email}`, L, 84);
    }

    // ---- header boxes (same sizes as the Kiaan invoice)
    let y = topH + 6;
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
    cell(RX, y, RW, 32, 'INVOICE', { bold: true, size: 18, align: 'center' });
    let ry = y + 32;
    cell(RX, ry, c1 + c2, 15, `DEPARTMENT : CLEARANCE${mode ? ` - ${mode}` : ''}`, { bold: true, size: 9 });
    cell(RX + c1 + c2, ry, c3, 15, 'NTN', { bold: true });
    cell(RX + c1 + c2 + c3, ry, c4, 15, job.customerTax ?? '');
    ry += 15;
    const grid = (l1: string, v2: string, l3: string, v4: string, boldVal = false) => {
      cell(RX, ry, c1, ROW, l1, { bold: true });
      cell(RX + c1, ry, c2, ROW, v2, { bold: boldVal });
      cell(RX + c1 + c2, ry, c3, ROW, l3, { bold: true });
      cell(RX + c1 + c2 + c3, ry, c4, ROW, v4);
      ry += ROW;
    };
    grid('Invoice No.', job.invoiceNo, 'Date', invDate, true);
    grid('Job No.', job.jobNo, 'Date', invDate, true);
    grid('G.D No.', job.gdNo ?? '', 'Date', beDate);
    grid('IGM No.', d.igmNo ?? '', 'W No.', d.wNo ?? '');
    grid('B/E No.', d.beNo ?? '', '', '');
    grid('Express On', d.expressOn ?? '', '', '');
    cell(RX, ry, c1, ROW, 'Cust. Ref No.', { bold: true });
    cell(RX + c1, ry, RW - c1, ROW, d.invoiceRef ?? '');

    // left: customer
    const custH = boxH - 4 * ROW;
    const c = { name: job.customerName, address: job.customerAddress, phone: job.customerPhone };
    cell(L, y, LW, custH);
    cell(L, y, 62, ROW + 2, 'CUSTOMER', { bold: true, size: 9 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(c.name, L + 4, y + 19, { width: LW - 8, height: 12, ellipsis: true });
    doc.font('Helvetica').fontSize(8);
    let cy = y + 32;
    if (has(c.address)) {
      doc.text(String(c.address), L + 4, cy, { width: LW - 8, height: custH - 34, ellipsis: true });
      cy = doc.y;
    }
    if (has(c.phone) && cy + 10 < y + custH) doc.text(`Tel: ${c.phone}`, L + 4, cy + 1, { width: LW - 8 });

    // left: collectorate, VIR, AWB / HAWB, party code
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
    lrow('Collectorate', job.collectorate ?? '');
    lrow('VIR No.', job.virNumber ?? '');
    lrow('AWB/BL No.', d.blNo ?? '', 'HAWB', d.hawbNo ?? '');
    lrow('Party Code', d.partyCode ?? '', 'Dem.', d.demBillNo ?? '');

    y += boxH + 8;

    // ---- MODE / COMMODITY / PCS / WEIGHT / CONTAINER NOS
    const w = [60, 150, 40, 80];
    w.push(FULL - w.reduce((a, b) => a + b, 0));
    const heads = ['MODE', 'COMMODITY', 'PCS', 'WEIGHT (KG)', containers.length > 1 ? 'CONTAINER NOS' : 'CONTAINER NO'];
    let x = L;
    heads.forEach((h, i) => {
      cell(x, y, w[i], 13, h, { bold: true, align: 'center', fill: '#c8c8c8' });
      x += w[i];
    });
    y += 13;
    const contText = containers.join(', ');
    doc.font('Helvetica').fontSize(8);
    const contLines = contText ? Math.min(5, Math.ceil(doc.heightOfString(contText, { width: w[4] - 6 }) / 9.6)) : 0;
    const dataH = Math.max(28, contLines * 9.6 + 8);
    const vals = [mode, d.commodity ?? '', d.pcs ?? '', has(d.weightKg) ? money(d.weightKg) : '', contText];
    x = L;
    vals.forEach((v, i) => {
      doc.lineWidth(0.5).strokeColor('#000').rect(x, y, w[i], dataH).stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(String(v), x + 3, y + 4, {
        width: w[i] - 6, height: dataH - 6, ellipsis: true, align: i === 1 || i === 4 ? 'left' : 'center',
      });
      x += w[i];
    });
    y += dataH + 14;

    // ---- sizes below the table, then squeeze the charge rows so everything stays on one page
    const termsH = 14 + COMPANY.terms.length * 9 + 6;
    doc.font('Helvetica-Bold').fontSize(8);
    const AMTW = 100;
    const TOTW = 56;
    const wordsW = FULL - AMTW - TOTW;
    const th = Math.max(22, doc.heightOfString(words, { width: wordsW - 8 }) + 8);
    const belowTable = th + 16 + 22 + 18 + 4 * 11 + 8 + termsH + 4 + 8;
    const bodyUnits = rows.length + (showDuty ? subs.length * SUB_K + 0.25 : 0);
    const room = footerTop - y - 20 - belowTable;
    let pad = Math.max(0, 5 - rows.length);
    if (room < (bodyUnits + pad) * 14) pad = 0;
    const k = Math.max(0.6, Math.min(1, room / (Math.max(bodyUnits + pad, 1) * 14)));
    const RH = 14 * k;
    const SUBH = RH * SUB_K;

    const ensure = (h: number) => {
      if (y + h > footerTop - 8) {
        doc.addPage();
        y = 40;
      }
    };

    // ---- particulars: CODE | PARTICULARS | AMOUNT (PKR)
    const xC = L;
    const CW = 40;
    const xP = L + CW;
    const xA = R - AMTW;
    const PW = xA - xP;
    ensure(80);
    cell(xC, y, CW, 15, 'CODE', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xP, y, PW, 15, 'PARTICULARS', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xA, y, AMTW, 15, 'AMOUNT (PKR)', { bold: true, align: 'center', fill: '#c8c8c8' });
    y += 20;

    const prow = (code: string, part: string, amt: string, memo = false) => {
      ensure(RH);
      cell(xC, y, CW, RH, code, { align: 'center', size: 7.5 });
      cell(xP, y, PW, RH, part);
      cell(xA, y, AMTW, RH, amt, { align: 'right', color: memo ? '#666' : undefined, italic: memo });
      y += RH;
    };
    for (const r of rows) {
      const memo = psid && r.code === '101'; // PSID: shown, not added
      const label = memo ? `${r.label}  [PAID THROUGH PSID - NOT IN TOTAL]` : r.label;
      if (r.code === '101' && showDuty && subs.length) {
        // big row: the customs duty line followed by where it goes
        const bigH = RH + subs.length * SUBH + 3;
        ensure(bigH);
        cell(xC, y, CW, bigH);
        cell(xP, y, PW, bigH);
        cell(xA, y, AMTW, bigH);
        txt(xC, y, CW, RH, r.code, { align: 'center', size: 7.5 });
        txt(xP, y, PW, RH, label, { bold: true });
        txt(xA, y, AMTW, RH, money(r.amount), { align: 'right', color: memo ? '#666' : undefined, italic: memo });
        doc.lineWidth(0.3).strokeColor('#999').moveTo(xP + 3, y + RH).lineTo(xA + AMTW - 3, y + RH).stroke();
        subs.forEach((sl, n) => {
          const sy = y + RH + 1 + n * SUBH;
          txt(xP + 14, sy, PW - 14, SUBH, sl.label, { size: 7.5 });
          txt(xA, sy, AMTW, SUBH, sl.amount, { size: 7.5, align: 'right' });
        });
        y += bigH;
        continue;
      }
      prow(r.code, label, money(r.amount), memo);
    }
    for (let i = 0; i < pad; i++) prow('', '', '');

    // ---- total row with amount in words
    ensure(th + 16 + 22 + 80);
    doc.lineWidth(0.5).strokeColor('#000').rect(L, y, wordsW, th).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(words, L + 4, y + 4, { width: wordsW - 8 });
    cell(L + wordsW, y, TOTW, th, 'TOTAL', { bold: true, align: 'center' });
    cell(xA, y, AMTW, th, money(totalAdj), { bold: true, align: 'right' });
    y += th + 16;

    // ---- note instead of a stamp
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
      .text('This is a computer generated invoice. No signature or stamp is required.', L, y, { width: FULL, align: 'center' });
    y += 22;

    // ---- banking details: plain text like the Kiaan invoice, both accounts side by side
    ensure(80);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#355E9B').text('Banking detail:', L, y);
    y += 18;
    const BW = FULL / COMPANY.banks.length;
    COMPANY.banks.forEach((b, i) => {
      doc.font('Helvetica').fontSize(8.5).fillColor('#000');
      [`Account Title: ${b.title}`, `Account Number: ${b.account}`, `IBAN: ${b.iban}`, b.bank].forEach((line, n) =>
        doc.text(line, L + i * BW, y + n * 11, { width: BW - 10, lineBreak: false }),
      );
    });
    y += 4 * 11 + 8;

    // ---- terms & conditions (bottom of the page, above the footer)
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
