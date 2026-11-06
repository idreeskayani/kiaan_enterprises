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

    // ---- header (layout C): a title bar beside the logo, then BILL TO / SHIPMENT boxes and one customs strip
    const X0 = topImg ? 134 : L; // the logo (part of the letterhead image) ends before this
    const HW = R - X0;
    const BAR_Y = topImg ? 80 : topH + 6;
    const BAR_H = 22;
    const BOX_Y = BAR_Y + BAR_H + 4;
    const BT_W = Math.round(HW * 0.43);
    const SH_X = X0 + BT_W + 4;
    const SH_W = R - SH_X;
    const HEAD_H = 12;
    const LINE_H = 10.5;
    const shipPairs: [string, string][] = (
      [
        ['AWB No: ', d.blNo],
        ['HAWB No: ', d.hawbNo],
        ['Pkgs: ', d.pcs],
        ['Weight: ', has(d.weightKg) ? `${money(d.weightKg)} KG` : ''],
        ['Commodity: ', d.commodity],
        ['Express On: ', d.expressOn],
        ['Party Code: ', d.partyCode],
        ['Invoice Ref: ', d.invoiceRef],
      ] as [string, any][]
    )
      .filter(([, v]) => has(v))
      .map(([kk, v]) => [kk, String(v)]);
    const shipRows = Math.ceil(shipPairs.length / 2);
    const ctrText = containers.join(', ');
    const ctrLabel = containers.length > 1 ? 'Containers: ' : 'Container: ';
    doc.font('Helvetica-Bold').fontSize(8);
    const ctrLW = doc.widthOfString(ctrLabel) + 1;
    doc.font('Helvetica').fontSize(8);
    const ctrLines = hasContainers ? Math.min(2, Math.max(1, Math.ceil(doc.widthOfString(ctrText) / (SH_W - 10 - ctrLW)))) : 0;
    const ctrH = ctrLines ? ctrLines * 9.5 + 2 : 0;
    const BODY_H = Math.max(56, shipRows * LINE_H + 6 + ctrH);
    const boxesBottom = BOX_Y + HEAD_H + BODY_H;
    // customs strip: only the entries that were filled in
    const stripItems = (
      [
        ['G.D No: ', job.gdNo, 1.5],
        ['Dated: ', beDate, 0.8],
        ['Collectorate: ', job.collectorate, 1],
        ['VIR No: ', job.virNumber, 1.2],
      ] as [string, any, number][]
    ).filter(([, v]) => has(v));
    const STRIP_H = 14;
    const stripY = boxesBottom + 4;
    const tableTop = (stripItems.length ? stripY + STRIP_H : boxesBottom) + 7;

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

    // ---- title bar (brand orange) with the invoice number and date
    doc.lineWidth(0.5).rect(X0, BAR_Y, HW, BAR_H).fillAndStroke('#F59E2A', '#000');
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#000')
      .text('BILL INVOICE', X0 + 8, BAR_Y + (BAR_H - 13) / 2 + 1, { lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#000')
      .text(`No. ${job.invoiceNo}     Date ${invDate}`, X0, BAR_Y + (BAR_H - 9) / 2 + 0.5, {
        width: HW - 8,
        align: 'right',
        lineBreak: false,
      });

    // ---- BILL TO
    const bodyY = BOX_Y + HEAD_H;
    cell(X0, BOX_Y, BT_W, HEAD_H, 'BILL TO', { bold: true, size: 8, fill: '#c8c8c8' });
    cell(X0, bodyY, BT_W, BODY_H);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
    const nameH = Math.min(22, doc.heightOfString(job.customerName, { width: BT_W - 10 }));
    doc.text(job.customerName, X0 + 5, bodyY + 4, { width: BT_W - 10, height: nameH, ellipsis: true });
    const addrY = bodyY + 4 + nameH + 2;
    const telNtn = [
      has(job.customerPhone) ? `Tel: ${job.customerPhone}` : '',
      has(job.customerTax) ? `NTN: ${job.customerTax}` : '',
    ]
      .filter(Boolean)
      .join('    ');
    doc.font('Helvetica').fontSize(8);
    if (hasAddress) {
      doc.text(String(job.customerAddress), X0 + 5, addrY, {
        width: BT_W - 10,
        height: Math.max(9, bodyY + BODY_H - addrY - (telNtn ? 13 : 3)),
        ellipsis: true,
      });
    }
    if (telNtn) {
      doc.font('Helvetica').fontSize(8).text(telNtn, X0 + 5, bodyY + BODY_H - 11, {
        width: BT_W - 10,
        height: 9,
        lineBreak: false,
        ellipsis: true,
      });
    }

    // ---- SHIPMENT: label: value lines, two per row (only what was filled in)
    cell(SH_X, BOX_Y, SH_W, HEAD_H, 'SHIPMENT', { bold: true, size: 8, fill: '#c8c8c8' });
    cell(SH_X, bodyY, SH_W, BODY_H);
    const colW = (SH_W - 10) / 2;
    shipPairs.forEach(([kk, v], n) => {
      const px = SH_X + 5 + (n % 2) * colW;
      const py = bodyY + 4 + Math.floor(n / 2) * LINE_H;
      doc.font('Helvetica-Bold').fontSize(8);
      const lw = doc.widthOfString(kk) + 1;
      let size = 8;
      doc.font('Helvetica').fontSize(size);
      while (size > 6 && doc.widthOfString(v) > colW - lw - 6) {
        size -= 0.5;
        doc.fontSize(size);
      }
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(kk, px, py, { lineBreak: false });
      doc.font('Helvetica').fontSize(size).text(v, px + lw, py + (8 - size) * 0.4, {
        width: colW - lw - 6,
        height: 9,
        lineBreak: false,
        ellipsis: true,
      });
    });
    if (hasContainers) {
      const cyy = bodyY + 4 + shipRows * LINE_H + 2;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(ctrLabel, SH_X + 5, cyy, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).text(ctrText, SH_X + 5 + ctrLW, cyy, {
        width: SH_W - 10 - ctrLW,
        height: ctrLines * 9.5,
        ellipsis: true,
      });
    }

    // ---- customs strip: G.D no., date, collectorate, VIR no.
    if (stripItems.length) {
      const wsum = stripItems.reduce((a, it) => a + it[2], 0);
      let sx = L;
      stripItems.forEach(([kk, v, wt]) => {
        const w = (FULL * wt) / wsum;
        doc.lineWidth(0.5).strokeColor('#000').rect(sx, stripY, w, STRIP_H).stroke();
        doc.font('Helvetica-Bold').fontSize(8);
        const lw = doc.widthOfString(kk) + 1;
        let size = 8;
        doc.font('Helvetica').fontSize(size);
        while (size > 6 && doc.widthOfString(String(v)) > w - lw - 8) {
          size -= 0.5;
          doc.fontSize(size);
        }
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(kk, sx + 4, stripY + (STRIP_H - 8) / 2 + 0.5, { lineBreak: false });
        doc.font('Helvetica').fontSize(size).text(String(v), sx + 4 + lw, stripY + (STRIP_H - size) / 2 + 0.5, {
          width: w - lw - 8,
          height: size + 2,
          lineBreak: false,
          ellipsis: true,
        });
        sx += w;
      });
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
        align: 'center',
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