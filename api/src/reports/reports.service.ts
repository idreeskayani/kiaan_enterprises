import { BadRequestException, Injectable } from '@nestjs/common';
import { ClearancePayment, InvoiceStatus, PaymentDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { KIAAN_BRAND } from '../invoices/dues-pdf.js';
import type { DuesBrand } from '../invoices/dues-pdf.js';
import { TNI_BRAND } from '../clearance/clearance-reports.service.js';
import { buildPeriodReportPdf } from './report-pdf.js';

export type Period = 'day' | 'week' | 'month' | 'year';
export type Section = 'freight' | 'clearance';
export const PERIODS: Period[] = ['day', 'week', 'month', 'year'];

export type ReportRow = {
  key: string;
  label: string;
  invoices: number; // invoices made in the period
  invoiced: number; // their total
  cash: number; // money received in the period, by method
  cheque: number;
  online: number;
  received: number;
  remaining: number; // still unpaid on the invoices made in the period
  profit: number | null; // freight only (invoice total - costs); null for clearance
};

export type PeriodReport = {
  section: Section;
  period: Period;
  from: string;
  to: string;
  customer: string;
  rows: ReportRow[];
  totals: Omit<ReportRow, 'key' | 'label'>;
};

// Pakistan has no daylight saving, so a fixed +5 hours puts every record on the right local day.
const PK_OFFSET_MS = 5 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) => new Date(d.getTime() + PK_OFFSET_MS); // read it with the getUTC... methods
const ymd = (l: Date) => `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`;
const niceDay = (l: Date) => `${pad(l.getUTCDate())} ${MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear()}`;

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // The period a record falls in (weeks run Monday to Sunday).
  private bucket(date: Date, period: Period): { key: string; label: string } {
    const l = local(date);
    if (period === 'day') return { key: ymd(l), label: niceDay(l) };
    if (period === 'month') {
      return { key: `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}`, label: `${MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear()}` };
    }
    if (period === 'year') return { key: String(l.getUTCFullYear()), label: String(l.getUTCFullYear()) };
    const monday = new Date(l.getTime() - ((l.getUTCDay() + 6) % 7) * DAY_MS);
    const sunday = new Date(monday.getTime() + 6 * DAY_MS);
    return { key: ymd(monday), label: `${niceDay(monday)} - ${niceDay(sunday)}` };
  }

  // from / to are yyyy-mm-dd (Pakistan dates). Missing ones default to a sensible span for the period.
  private range(period: Period, from?: string, to?: string) {
    const ok = (v?: string) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!ok(from) || !ok(to)) throw new BadRequestException('Dates must look like 2026-11-30');
    const today = local(new Date());
    const toDay = to ?? ymd(today);
    const t = new Date(`${toDay}T00:00:00Z`);
    let f: Date;
    if (from) f = new Date(`${from}T00:00:00Z`);
    else if (period === 'day') f = new Date(t.getTime() - 29 * DAY_MS);
    else if (period === 'week') f = new Date(t.getTime() - 83 * DAY_MS);
    else if (period === 'month') f = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 11, 1));
    else f = new Date(Date.UTC(t.getUTCFullYear() - 4, 0, 1));
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) throw new BadRequestException('Invalid date');
    if (f > t) throw new BadRequestException('"From" must be before "To"');
    const fromDay = ymd(f);
    return {
      from: fromDay,
      to: toDay,
      gte: new Date(`${fromDay}T00:00:00+05:00`),
      lte: new Date(`${toDay}T23:59:59.999+05:00`),
    };
  }

  private blank(key: string, label: string, profit: number | null): ReportRow {
    return { key, label, invoices: 0, invoiced: 0, cash: 0, cheque: 0, online: 0, received: 0, remaining: 0, profit };
  }

  private finish(
    section: Section,
    period: Period,
    r: { from: string; to: string },
    customer: string,
    map: Map<string, ReportRow>,
    hasProfit: boolean,
  ): PeriodReport {
    const rows = [...map.values()].sort((a, b) => a.key.localeCompare(b.key)).map((x) => ({
      ...x,
      invoiced: r2(x.invoiced),
      cash: r2(x.cash),
      cheque: r2(x.cheque),
      online: r2(x.online),
      received: r2(x.received),
      remaining: r2(x.remaining),
      profit: x.profit == null ? null : r2(x.profit),
    }));
    const sum = (f: (x: ReportRow) => number) => r2(rows.reduce((a, x) => a + f(x), 0));
    return {
      section,
      period,
      from: r.from,
      to: r.to,
      customer,
      rows,
      totals: {
        invoices: rows.reduce((a, x) => a + x.invoices, 0),
        invoiced: sum((x) => x.invoiced),
        cash: sum((x) => x.cash),
        cheque: sum((x) => x.cheque),
        online: sum((x) => x.online),
        received: sum((x) => x.received),
        remaining: sum((x) => x.remaining),
        profit: hasProfit ? sum((x) => x.profit ?? 0) : null,
      },
    };
  }

  private addPayment(row: ReportRow, method: string, amount: number) {
    if (method === 'CASH') row.cash += amount;
    else if (method === 'CHEQUE') row.cheque += amount;
    else row.online += amount;
    row.received += amount;
  }

  // ---- freight: issued and paid invoices (drafts and cancelled ones are not sales)
  async freight(period: Period, from?: string, to?: string, customer = ''): Promise<PeriodReport> {
    const r = this.range(period, from, to);
    const name = customer.trim();
    const like = { contains: name, mode: 'insensitive' as const };
    const customerWhere: Prisma.InvoiceWhereInput = name
      ? { OR: [{ customer: { name: like } }, { shipment: { customer: { name: like } } }] }
      : {};

    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          ...customerWhere,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] },
          issuedAt: { gte: r.gte, lte: r.lte },
        },
        select: { issuedAt: true, total: true, status: true, dueAmount: true, costs: { select: { amount: true } } },
      }),
      this.prisma.payment.findMany({
        where: {
          direction: PaymentDirection.CREDIT,
          invoiceId: { not: null },
          paidAt: { gte: r.gte, lte: r.lte },
          invoice: customerWhere,
        },
        select: { paidAt: true, amount: true, method: true },
      }),
    ]);

    const map = new Map<string, ReportRow>();
    const get = (d: Date) => {
      const b = this.bucket(d, period);
      if (!map.has(b.key)) map.set(b.key, this.blank(b.key, b.label, 0));
      return map.get(b.key) as ReportRow;
    };
    for (const i of invoices) {
      const row = get(i.issuedAt);
      const total = Number(i.total);
      row.invoices += 1;
      row.invoiced += total;
      row.remaining += i.status === InvoiceStatus.PAID ? 0 : Number(i.dueAmount) > 0 ? Number(i.dueAmount) : total;
      row.profit = (row.profit ?? 0) + (total - i.costs.reduce((a, c) => a + Number(c.amount), 0));
    }
    for (const p of payments) this.addPayment(get(p.paidAt), p.method, Number(p.amount));
    return this.finish('freight', period, r, name, map, true);
  }

  // ---- clearance: invoiced jobs (drafts are not sales)
  async clearance(period: Period, from?: string, to?: string, customer = ''): Promise<PeriodReport> {
    const r = this.range(period, from, to);
    const name = customer.trim();
    const nameWhere = name ? { customerName: { contains: name, mode: 'insensitive' as const } } : {};

    const [jobs, payments] = await Promise.all([
      this.prisma.clearanceJob.findMany({
        where: {
          ...nameWhere,
          invoiceNo: { not: null },
          payment: { in: [ClearancePayment.UNPAID, ClearancePayment.PARTIAL, ClearancePayment.PAID] },
          invoicedAt: { gte: r.gte, lte: r.lte },
        },
        select: { invoicedAt: true, total: true, payment: true, dueAmount: true },
      }),
      this.prisma.payment.findMany({
        where: {
          direction: PaymentDirection.CREDIT,
          clearanceJobId: { not: null },
          paidAt: { gte: r.gte, lte: r.lte },
          clearanceJob: nameWhere,
        },
        select: { paidAt: true, amount: true, method: true },
      }),
    ]);

    const map = new Map<string, ReportRow>();
    const get = (d: Date) => {
      const b = this.bucket(d, period);
      if (!map.has(b.key)) map.set(b.key, this.blank(b.key, b.label, null));
      return map.get(b.key) as ReportRow;
    };
    for (const j of jobs) {
      if (!j.invoicedAt) continue;
      const row = get(j.invoicedAt);
      const total = Number(j.total);
      row.invoices += 1;
      row.invoiced += total;
      row.remaining +=
        j.payment === ClearancePayment.PAID ? 0 : j.payment === ClearancePayment.PARTIAL ? Number(j.dueAmount) : total;
    }
    for (const p of payments) this.addPayment(get(p.paidAt), p.method, Number(p.amount));
    return this.finish('clearance', period, r, name, map, false);
  }

  report(section: Section, period: Period, from?: string, to?: string, customer?: string) {
    return section === 'freight'
      ? this.freight(period, from, to, customer)
      : this.clearance(period, from, to, customer);
  }

  async pdf(section: Section, period: Period, from?: string, to?: string, customer?: string) {
    const rep = await this.report(section, period, from, to, customer);
    const brand: DuesBrand = section === 'freight' ? KIAAN_BRAND : TNI_BRAND;
    const buffer = await buildPeriodReportPdf(rep, brand);
    return { buffer, filename: `${this.fileTitle(rep)}.pdf` };
  }

  // CSV opens in Excel. The BOM keeps non-English names readable.
  async csv(section: Section, period: Period, from?: string, to?: string, customer?: string) {
    const rep = await this.report(section, period, from, to, customer);
    // text is quoted, numbers are left plain so Excel reads them as numbers
    const q = (v: string | number | null) =>
      v == null ? '' : typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`;
    const head = ['Period', 'Invoices', 'Invoiced', 'Cash', 'Cheque', 'Online', 'Received', 'Remaining dues'];
    if (rep.totals.profit != null) head.push('Profit');
    const line = (label: string, x: Omit<ReportRow, 'key' | 'label'>) => {
      const cols: (string | number | null)[] = [label, x.invoices, x.invoiced, x.cash, x.cheque, x.online, x.received, x.remaining];
      if (rep.totals.profit != null) cols.push(x.profit);
      return cols.map(q).join(',');
    };
    const lines = [head.map(q).join(','), ...rep.rows.map((x) => line(x.label, x)), line('TOTAL', rep.totals)];
    return { buffer: Buffer.from('\ufeff' + lines.join('\r\n') + '\r\n', 'utf8'), filename: `${this.fileTitle(rep)}.csv` };
  }

  private fileTitle(rep: PeriodReport) {
    const who = rep.customer ? ` - ${rep.customer.replace(/[\\/:*?"<>|]+/g, ' ').trim()}` : '';
    const kind = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[rep.period];
    return `${kind} report ${rep.from} to ${rep.to}${who}`;
  }
}
