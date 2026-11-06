import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { fmtDate, inWords, money } from '../invoices/invoice-pdf.js';
import { CHARGE_CODES, DUTY_KEYS } from './charges.js';

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
  // the client paid the duties & taxes through PSID: line 101 is printed but not added to the total
  paidThroughPsid?: boolean;
  // container numbers of the consignment
  containers?: string[];
  // in print order; NOC (219) and bilty (220) lines carry their own label
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
    const str = (v: any) => (has(v) ? String(v) : '');
    const invDate = job.invoicedAt.toLocaleDateString('en-GB');
    const beDate = has(d.beDate) ? fmtDate(d.beDate) : '';
    const labelOf = (code: string) => CHARGE_CODES.find((c) => c.code === code)?.label ?? '';
    const rows = job.lines
      .filter((l) => l.amount != null && Number(l.amount) > 0)
      .map((l) => ({ code: l.code, label: l.label || labelOf(l.code), amount: l.amount as any }));
    const psid = !!job.paidThroughPsid;

    // customs duty breakdown: printed inside the 101 row only when it was entered
    const dRaw: Record<string, any> = job.duties && typeof job.duties === 'object' ? job.duties : {};
    const dutyVals = DUTY_KEYS.map((k) => Math.round(Number(dRaw[k.key]) || 0));
    const dutyTotal = dutyVals.reduce((t, n) => t + n, 0);
    const showDuty = dutyTotal > 0;
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
      else rows.unshift({ code: '101', label: labelOf('101'), amount: dutyTotal });
      if (!psid) totalAdj += dutyTotal - old;
    }
    // the 101 line carries a note when the client paid it through PSID
    const r101p = rows.find((r) => r.code === '101');
    if (psid && r101p) r101p.label = `${r101p.label}  [PAID THROUGH PSID - NOT IN TOTAL]`;
    const whole = Math.floor(totalAdj + 1e-9);
    const paisa = Math.round((totalAdj - whole) * 100);
    const words = `PKR: ${inWords(whole)}${paisa ? ` and ${inWords(paisa)} Paisa` : ''} Only`;

    // ---- text helpers (same look as the Kiaan freight invoice) --------------------------
    // the biggest font size (down to `min`) at which the text fits in `w`
    const fitSize = (text: string, w: number, size: number, font: string, min = 5.5) => {
      doc.font(font);
      let sz = size;
      doc.fontSize(sz);
      while (sz > min && doc.widthOfString(text) > w) {
        sz -= 0.25;
        doc.fontSize(sz);
      }
      return sz;
    };

    // one line of text, vertically centred in a box; it shrinks to fit instead of being cut off
    const txt = (
      x: number,
      yy: number,
      w: number,
      h: number,
      text = '',
      o: { bold?: boolean; italic?: boolean; color?: string; size?: number; align?: 'left' | 'center' | 'right' } = {},
    ) => {
      if (!text) return;
      const font = o.italic ? 'Helvetica-Oblique' : o.bold ? 'Helvetica-Bold' : 'Helvetica';
      const size = fitSize(text, w - 6, Math.min(o.size ?? 8, Math.max(5.5, h - 2.4)), font);
      doc.fillColor(o.color ?? '#000');
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
      o: { bold?: boolean; italic?: boolean; color?: string; size?: number; align?: 'left' | 'center' | 'right'; fill?: string } = {},
    ) => {
      doc.lineWidth(0.5).strokeColor('#000');
      if (o.fill) doc.rect(x, yy, w, h).fillAndStroke(o.fill, '#000');
      else doc.rect(x, yy, w, h).stroke();
      txt(x, yy, w, h, text, o);
    };

    // ---- header boxes (laid out exactly like the Kiaan freight invoice) ------------------
    const ROW = 12.5;
    const TITLE_H = 30;
    const DEPT_H = 14;
    const LW = 255;
    const RX = L + LW + 6;
    const RW = R - RX;
    const c1 = 62;
    const c2 = 108;
    const c3 = 32;
    const c4 = RW - c1 - c2 - c3;

    // a row is either a pair (label | value | label | value) or one wide value.
    // A wide value that is too long for one line is wrapped, and its row grows, so nothing is cut off.
    type GRow = { l1: string; v1: string; l2?: string; v2?: string; bold?: boolean; h: number; wrap?: boolean; size?: number };
    const wide = (label: string, value: string, valueW: number): GRow => {
      doc.font('Helvetica').fontSize(8);
      let sz = 8;
      while (sz > 6.5 && doc.widthOfString(value) > valueW - 6) {
        sz -= 0.5;
        doc.fontSize(sz);
      }
      if (doc.widthOfString(value) <= valueW - 6) return { l1: label, v1: value, h: ROW, size: sz };
      doc.fontSize(7);
      const hh = doc.heightOfString(value, { width: valueW - 6 });
      return { l1: label, v1: value, h: Math.max(ROW, hh + 5), wrap: true, size: 7 };
    };
    const pair = (l1: string, v1: string, l2: string, v2: string, bold = false): GRow => ({
      l1, v1, l2, v2, bold, h: ROW,
    });

    // right box: BILL INVOICE
    const rightRows: GRow[] = [
      pair('Invoice No.', job.invoiceNo, 'Date', invDate, true),
      pair('G.D No.', str(job.gdNo), 'Date', beDate, true),
      wide('Collectorate', str(job.collectorate), RW - c1), // full width, so the whole name can be read
      pair('VIR No.', str(job.virNumber), 'Express', str(d.expressOn)),
      pair('AWB No.', str(d.blNo), 'HAWB', str(d.hawbNo)),
      pair('Party Code', str(d.partyCode), 'Ref', str(d.invoiceRef)),
      wide('Job No.', job.jobNo, RW - c1),
    ];
    const rightH = TITLE_H + DEPT_H + rightRows.reduce((a, r) => a + r.h, 0);

    // left box: customer, then commodity / packages / weight / container
    const l1 = 62;
    const l2 = 108;
    const l3 = 32;
    const l4 = LW - l1 - l2 - l3;
    const listed = (job.containers ?? []).filter(Boolean);
    const container = listed.length ? listed.join(', ') : str(d.containerNo ?? d.container ?? d.containerNumber);
    const leftRows: GRow[] = [
      wide('Commodity', str(d.commodity), LW - l1),
      pair('No. Of Pkgs', str(d.pcs), 'Weight', has(d.weightKg) ? `${money(d.weightKg)} KG` : ''),
      wide('Container No.', container, LW - l1),
    ];
    const leftRowsH = leftRows.reduce((a, r) => a + r.h, 0);
    const boxH = Math.max(rightH, leftRowsH + 60);
    const custH = boxH - leftRowsH;

    // ---- one page: only the charge rows are squeezed, the rest keeps its size -------------
    const BH = 46;
    const NOTE_H = 16;
    const termsH = 12 + COMPANY.terms.length * 8.2 + 5;
    doc.font('Helvetica-Bold').fontSize(8);
    const wordsW = 36 + (FULL - 36 - 92 - 34) - 62 - 8; // words box: code + particulars, less the TOTAL cell
    const th = Math.max(22, doc.heightOfString(words, { width: wordsW }) + 8);

    // letterhead images keep their own proportions
    const topImg = asset('tni-letterhead-top.png');
    const bottomImg = asset('tni-letterhead-bottom.png');
    const imgH = (p: string | null) => {
      if (!p) return 0;
      const im = (doc as any).openImage(p);
      return (im.height * W) / im.width;
    };
    const rawTop = topImg ? imgH(topImg) : 96;
    const rawBot = bottomImg ? imgH(bottomImg) : 44;
    const topH = topImg ? rawTop - 8 : rawTop; // blank strip under the banner
    const botH = bottomImg ? rawBot - 28 : rawBot; // blank strip above the address
    const footerTop = H - botH;
    const ty = footerTop - termsH - 4; // terms box sits right above the footer

    const bodyUnits = 1 + rows.length + (showDuty ? subs.length * SUB_K + 0.25 : 0); // 1 = column heads
    const fixed = topH + 6 + boxH + 8 + th + 14 + NOTE_H + (16 + BH + 6) + (termsH + 4) + 4;
    const RH = Math.max(7, Math.min(14, (H - botH - fixed) / bodyUnits));
    const SUBH = RH * SUB_K;

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

    // right: BILL INVOICE
    cell(RX, y, RW, TITLE_H, 'BILL INVOICE', { bold: true, size: 18, align: 'center' });
    let ry = y + TITLE_H;
    cell(RX, ry, c1 + c2, DEPT_H, 'DEPARTMENT : CUSTOMS CLEARANCE', { bold: true, size: 9 });
    cell(RX + c1 + c2, ry, c3, DEPT_H, 'NTN', { bold: true });
    cell(RX + c1 + c2 + c3, ry, c4, DEPT_H, str(job.customerTax));
    ry += DEPT_H;
    for (const r of rightRows) {
      cell(RX, ry, c1, r.h, r.l1, { bold: true });
      if (r.l2 === undefined) {
        if (r.wrap) {
          doc.lineWidth(0.5).strokeColor('#000').rect(RX + c1, ry, RW - c1, r.h).stroke();
          doc.font('Helvetica').fontSize(r.size ?? 7).fillColor('#000');
          doc.text(r.v1, RX + c1 + 3, ry + 2.5, { width: RW - c1 - 6 });
        } else {
          cell(RX + c1, ry, RW - c1, r.h, r.v1, { size: r.size });
        }
      } else {
        cell(RX + c1, ry, c2, r.h, r.v1, { bold: r.bold });
        cell(RX + c1 + c2, ry, c3, r.h, r.l2, { bold: true });
        cell(RX + c1 + c2 + c3, ry, c4, r.h, r.v2 ?? '');
      }
      ry += r.h;
    }

    // left: customer
    cell(L, y, LW, custH);
    cell(L, y, 62, ROW + 2, 'CUSTOMER', { bold: true, size: 9 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    doc.text(job.customerName, L + 4, y + 19, { width: LW - 8, height: 12, ellipsis: true });
    doc.font('Helvetica').fontSize(8);
    let cy = y + 32;
    if (has(job.customerAddress)) {
      doc.text(String(job.customerAddress), L + 4, cy, { width: LW - 8, height: custH - 34 - 11, ellipsis: true });
      cy = doc.y;
    }
    if (has(job.customerPhone) && cy + 10 < y + custH) {
      doc.text(`Tel: ${job.customerPhone}`, L + 4, cy + 1, { width: LW - 8 });
    }

    // left: commodity, packages, weight, container
    let ly = y + custH;
    for (const r of leftRows) {
      cell(L, ly, l1, r.h, r.l1, { bold: true });
      if (r.l2 === undefined) {
        cell(L + l1, ly, LW - l1, r.h, r.v1, { size: r.size });
      } else {
        cell(L + l1, ly, l2, r.h, r.v1);
        cell(L + l1 + l2, ly, l3, r.h, r.l2, { bold: true });
        cell(L + l1 + l2 + l3, ly, l4, r.h, r.v2 ?? '');
      }
      ly += r.h;
    }

    y += boxH + 8;

    // ---- table: code | particulars | Rs. | Ps. (only the charges that were entered)
    const SNW = 36;
    const RSW = 92;
    const PSW = 34;
    const PW = FULL - SNW - RSW - PSW;
    const xS = L;
    const xP = xS + SNW;
    const xR = xP + PW;
    const xPs = xR + RSW;

    cell(xS, y, SNW, RH, 'CODE', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xP, y, PW, RH, 'PARTICULARS', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xR, y, RSW, RH, 'Rs.', { bold: true, align: 'center', fill: '#c8c8c8' });
    cell(xPs, y, PSW, RH, 'Ps.', { bold: true, align: 'center', fill: '#c8c8c8' });
    y += RH;

    for (const r of rows) {
      const a = split(r.amount);
      const note = psid && r.code === '101' ? { italic: true, color: '#555' } : { bold: true };
      if (r.code === '101' && showDuty && subs.length) {
        // big row: the customs duty line followed by where it goes
        const bigH = RH + subs.length * SUBH + 3;
        cell(xS, y, SNW, bigH);
        cell(xP, y, PW, bigH);
        cell(xR, y, RSW, bigH);
        cell(xPs, y, PSW, bigH);
        txt(xS, y, SNW, RH, r.code, { align: 'center', size: 7.5 });
        txt(xP, y, PW, RH, r.label, { size: 8, bold: true });
        txt(xR, y, RSW, RH, a.rs, { ...note, align: 'right' });
        txt(xPs, y, PSW, RH, a.ps, { ...note, align: 'center' });
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
      cell(xR, y, RSW, RH, a.rs, { ...note, align: 'right' });
      cell(xPs, y, PSW, RH, a.ps, { ...note, align: 'center' });
      y += RH;
    }

    // ---- total row with the amount in words (same as the Kiaan invoice)
    const tot = split(totalAdj);
    const TW = 62;
    doc.lineWidth(0.5).strokeColor('#000').rect(xS, y, SNW + PW - TW, th).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(words, xS + 4, y + 4, { width: wordsW });
    cell(xR - TW, y, TW, th, 'TOTAL', { bold: true, align: 'center' });
    cell(xR, y, RSW, th, tot.rs, { bold: true, size: 10, align: 'right' });
    cell(xPs, y, PSW, th, tot.ps, { bold: true, align: 'center' });
    y += th + 14;

    // ---- note instead of a stamp: centred on the page
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#000')
      .text('This is a computer generated invoice. No signature or stamp is required.', L, y, {
        width: FULL,
        align: 'center',
        lineBreak: false,
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

    // ---- terms & conditions (bottom of the page, above the footer)
    doc.lineWidth(0.5).strokeColor('#000').rect(L, ty, FULL, termsH).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('Terms & Conditions:', L + 4, ty + 3);
    doc.font('Helvetica').fontSize(6.5);
    COMPANY.terms.forEach((line, i) =>
      doc.text(line, L + 4, ty + 12 + i * 8.2, { width: FULL - 8, height: 8, ellipsis: true }),
    );

    doc.end();
  });
}
