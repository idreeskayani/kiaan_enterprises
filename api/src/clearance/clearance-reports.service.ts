import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClearancePayment, DuesReportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildDuesPdf } from '../invoices/dues-pdf.js';
import type { DuesBrand, DuesData, DuesItem, StatementScope } from '../invoices/dues-pdf.js';
import { COMPANY } from './clearance.pdf.js';
import { dayRange } from '../common/date-range.js';

// Which invoices a clearance statement lists: the same choices as the filters on the clearance invoices page.
export type ClearanceScope = Exclude<StatementScope, 'DUES'>;
export const CLEARANCE_SCOPES: ClearanceScope[] = ['ALL', 'PARTIAL', 'UNPAID', 'PAID', 'DRAFT'];

// TNI Enterprises letterhead, bank accounts, and Job / GD columns instead of MAWB / HAWB.
export const TNI_BRAND: DuesBrand = {
  name: COMPANY.name,
  phones: COMPANY.phones,
  email: COMPANY.email,
  banks: COMPANY.banks,
  topImage: 'tni-letterhead-top.png',
  bottomImage: 'tni-letterhead-bottom.png',
  topRatio: 0.2453,
  bottomRatio: 0.2301,
  refHeads: ['JOB NO.', 'GD NO.'],
};

const round = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ClearanceReportsService {
  constructor(private prisma: PrismaService) {}

  private safeName(v: string) {
    return v.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // The jobs a statement lists. Drafts only show up in the DRAFT and never in the others.
  private paymentWhere(scope: ClearanceScope): Prisma.ClearanceJobWhereInput['payment'] {
    switch (scope) {
      case 'ALL':
        return { in: [ClearancePayment.UNPAID, ClearancePayment.PARTIAL, ClearancePayment.PAID] };
      case 'PARTIAL':
        return ClearancePayment.PARTIAL;
      case 'UNPAID':
        return ClearancePayment.UNPAID;
      case 'PAID':
        return ClearancePayment.PAID;
      default:
        return ClearancePayment.DRAFT;
    }
  }

  private async statementFor(customer: string, scope: ClearanceScope, from?: string, to?: string): Promise<DuesData> {
    const name = customer.trim();
    if (!name) throw new BadRequestException('Choose the customer');
    const range = dayRange(from, to);
    const jobs = await this.prisma.clearanceJob.findMany({
      where: {
        customerName: { equals: name, mode: 'insensitive' },
        invoiceNo: { not: null },
        payment: this.paymentWhere(scope),
        // invoice date; an unsent draft has none yet, so its created date counts
        ...(range && { OR: [{ invoicedAt: range }, { invoicedAt: null, createdAt: range }] }),
      },
      orderBy: { invoicedAt: 'asc' },
    });

    // the customer's details come from their newest job of any kind
    const latest = await this.prisma.clearanceJob.findFirst({
      where: { customerName: { equals: name, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) throw new NotFoundException('Customer not found');

    const items: DuesItem[] = jobs.map((j) => {
      const total = Number(j.total);
      const remaining =
        j.payment === ClearancePayment.PAID
          ? 0
          : j.payment === ClearancePayment.PARTIAL
            ? Number(j.dueAmount)
            : total;
      return {
        invoiceNo: j.invoiceNo ?? '',
        issuedAt: j.invoicedAt ?? j.createdAt,
        mawb: j.jobNo, // shown in the JOB NO. column
        hawb: j.gdNo ?? '', // shown in the GD NO. column
        total: round(total),
        paid: round(total - remaining),
        remaining: round(remaining),
        status:
          j.payment === ClearancePayment.DRAFT
            ? 'Draft'
            : remaining <= 0
              ? 'Paid'
              : remaining < total
                ? 'Partial'
                : 'Unpaid',
      };
    });
    const sum = (f: (i: DuesItem) => number) => round(items.reduce((a, i) => a + f(i), 0));
    return {
      scope,
      period: from || to ? { from: from || undefined, to: to || undefined } : undefined,
      customer: {
        name: latest.customerName,
        address: latest.customerAddress,
        phone: latest.customerPhone,
        taxNumber: latest.customerTax,
      },
      items,
      totalInvoiced: sum((i) => i.total),
      totalPaid: sum((i) => i.paid),
      totalRemaining: sum((i) => i.remaining),
    };
  }

  // "View report": built from today's figures, nothing is saved.
  async livePdf(customer: string, scope: ClearanceScope, from?: string, to?: string) {
    const data = await this.statementFor(customer, scope, from, to);
    const buffer = await buildDuesPdf({ ...data, brand: TNI_BRAND, date: new Date() });
    return { buffer, filename: `Statement - ${this.safeName(data.customer.name)}.pdf` };
  }

  private async nextReportNo() {
    const prefix = `CR-${new Date().getFullYear()}-`;
    const last = await this.prisma.clearanceReport.findFirst({
      where: { reportNo: { startsWith: prefix } },
      orderBy: { reportNo: 'desc' },
      select: { reportNo: true },
    });
    const n = last ? Number(last.reportNo.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(n + 1).padStart(5, '0')}`;
  }

  private static readonly listSelect = {
    id: true,
    reportNo: true,
    customerName: true,
    scope: true,
    status: true,
    totalDue: true,
    invoiceCount: true,
    createdAt: true,
  };

  // "Save draft" (DRAFT) or a copy of what was shared (SENT). The figures are frozen in the snapshot.
  async save(customer: string, scope: ClearanceScope, status: 'DRAFT' | 'SENT' = 'DRAFT', from?: string, to?: string) {
    const data = await this.statementFor(customer, scope, from, to);
    if (data.items.length === 0) {
      throw new BadRequestException(
        from || to ? 'This customer has no invoices in the selected dates' : 'This customer has no invoices for this report',
      );
    }
    return this.prisma.clearanceReport.create({
      data: {
        reportNo: await this.nextReportNo(),
        customerName: data.customer.name,
        scope,
        status: status === 'SENT' ? DuesReportStatus.SENT : DuesReportStatus.DRAFT,
        totalDue: data.totalRemaining,
        invoiceCount: data.items.length,
        snapshot: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      },
      select: ClearanceReportsService.listSelect,
    });
  }

  // only drafts: a report that was sent leaves the list (it stays stored as a record)
  listDrafts(customer: string) {
    return this.prisma.clearanceReport.findMany({
      where: {
        customerName: { equals: customer.trim(), mode: 'insensitive' },
        status: DuesReportStatus.DRAFT,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: ClearanceReportsService.listSelect,
    });
  }

  async markSent(reportId: string) {
    const rep = await this.prisma.clearanceReport.findUnique({ where: { id: reportId }, select: { id: true } });
    if (!rep) throw new NotFoundException('Report not found');
    await this.prisma.clearanceReport.update({
      where: { id: reportId },
      data: { status: DuesReportStatus.SENT },
    });
    return { sent: true };
  }

  // Only drafts can be deleted. A sent report is kept as the record of what the customer received.
  async remove(reportId: string) {
    const rep = await this.prisma.clearanceReport.findUnique({ where: { id: reportId }, select: { status: true } });
    if (!rep) throw new NotFoundException('Report not found');
    if (rep.status === DuesReportStatus.SENT) throw new ConflictException('A sent report cannot be deleted');
    await this.prisma.clearanceReport.delete({ where: { id: reportId } });
    return { deleted: true };
  }

  // A saved report, printed exactly as it was saved.
  async savedPdf(reportId: string) {
    const rep = await this.prisma.clearanceReport.findUnique({ where: { id: reportId } });
    if (!rep) throw new NotFoundException('Report not found');
    const data = rep.snapshot as unknown as DuesData;
    const buffer = await buildDuesPdf({ ...data, brand: TNI_BRAND, reportNo: rep.reportNo, date: rep.createdAt });
    return { buffer, filename: `${rep.reportNo} - ${this.safeName(data.customer.name)}.pdf` };
  }
}
