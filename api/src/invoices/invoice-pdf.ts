import PDFDocument from 'pdfkit';

export type PdfInvoice = {
  invoiceNo: string;
  status: string;
  issuedAt: Date;
  total: any;
  lines: { label: string; amount: any }[];
  shipment: {
    refNo: string;
    mode: string;
    origin: string;
    destination: string;
    viaPoints?: string[];
    blAwbNo: string | null;
    customer: {
      name: string;
      address: string | null;
      phone: string | null;
      taxNumber: string | null;
    };
  };
};

const money = (v: any) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildInvoicePdf(inv: PdfInvoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text('Kiaan Enterprises', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#555').text('Cargo & Freight Services', 50, 78);
    doc.fillColor('#000').fontSize(18).font('Helvetica-Bold').text('INVOICE', 380, 50, { width: 165, align: 'right' });
    doc.fontSize(10).font('Helvetica');
    doc.text(`No: ${inv.invoiceNo}`, 380, 76, { width: 165, align: 'right' });
    doc.text(`Date: ${inv.issuedAt.toISOString().slice(0, 10)}`, 380, 90, { width: 165, align: 'right' });
    const payment = inv.status === 'PAID' ? 'PAID' : inv.status === 'PREVIEW' ? 'PREVIEW' : 'UNPAID';
    doc.text(`Payment: ${payment}`, 380, 104, { width: 165, align: 'right' });
    doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#999').stroke();

    // Bill to + shipment info
    const c = inv.shipment.customer;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('BILL TO', 50, 145);
    doc.font('Helvetica').text(c.name, 50, 160);
    let y = 174;
    if (c.address) { doc.text(c.address, 50, y); y += 14; }
    if (c.phone) { doc.text(c.phone, 50, y); y += 14; }
    if (c.taxNumber) { doc.text(`Tax No: ${c.taxNumber}`, 50, y); y += 14; }

    const s = inv.shipment;
    doc.font('Helvetica-Bold').text('SHIPMENT', 330, 145);
    doc.font('Helvetica');
    doc.text(`Ref: ${s.refNo}`, 330, 160);
    doc.text(`Mode: ${s.mode}`, 330, 174);
    doc.text(`Route: ${[s.origin, ...(s.viaPoints ?? []), s.destination].join(' to ')}`, 330, 188, { width: 215 });
    if (s.blAwbNo) doc.text(`BL/AWB: ${s.blAwbNo}`, 330, 216);

    // Table header
    let ty = Math.max(y, 225) + 25;
    doc.rect(50, ty, 495, 22).fill('#eeeeee');
    doc.fillColor('#000').font('Helvetica-Bold');
    doc.text('Description', 58, ty + 6, { width: 360 });
    doc.text('Amount (PKR)', 430, ty + 6, { width: 107, align: 'right' });
    ty += 28;

    // Rows
    doc.font('Helvetica');
    for (const line of inv.lines) {
      if (ty > 740) { doc.addPage(); ty = 60; }
      doc.text(line.label, 58, ty, { width: 360 });
      doc.text(money(line.amount), 430, ty, { width: 107, align: 'right' });
      ty += 22;
      doc.moveTo(50, ty - 5).lineTo(545, ty - 5).strokeColor('#dddddd').stroke();
    }

    // Total
    ty += 10;
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL', 58, ty, { width: 360 });
    doc.text(money(inv.total), 430, ty, { width: 107, align: 'right' });

    doc.font('Helvetica').fontSize(9).fillColor('#777')
      .text('Thank you for your business.', 50, 780, { width: 495, align: 'center' });

    doc.end();
  });
}
