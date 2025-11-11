const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper function to convert number to words (Indian format)
function numberToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  if (num === 0) return 'Zero';
  
  let words = '';
  
  // Crores
  if (num >= 10000000) {
    words += numberToWords(Math.floor(num / 10000000)) + ' Crore ';
    num %= 10000000;
  }
  
  // Lakhs
  if (num >= 100000) {
    words += numberToWords(Math.floor(num / 100000)) + ' Lakh ';
    num %= 100000;
  }
  
  // Thousands
  if (num >= 1000) {
    words += numberToWords(Math.floor(num / 1000)) + ' Thousand ';
    num %= 1000;
  }
  
  // Hundreds
  if (num >= 100) {
    words += ones[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  
  // Tens and ones
  if (num >= 20) {
    words += tens[Math.floor(num / 10)] + ' ';
    num %= 10;
  } else if (num >= 10) {
    words += teens[num - 10] + ' ';
    num = 0;
  }
  
  if (num > 0) {
    words += ones[num] + ' ';
  }
  
  return words.trim();
}

function amountInWords(amount) {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  
  let words = 'INR ' + numberToWords(rupees) + ' Rupees';
  if (paise > 0) {
    words += ' and ' + numberToWords(paise) + ' Paise';
  }
  words += ' Only';
  return words;
}

class InvoiceGenerator {
  async generateInvoice(sale, store, customer) {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔍 INVOICE GENERATION DEBUG:');
        console.log('Sale ID:', sale.id);
        console.log('Invoice Number:', sale.invoiceNumber);
        console.log('Sale Items Count:', sale.items?.length || 0);
        console.log('Sale Items Sample:', sale.items?.[0] ? {
          name: sale.items[0].name,
          unitPrice: sale.items[0].unitPrice,
          quantity: sale.items[0].quantity,
          taxRate: sale.items[0].taxRate
        } : 'No items');
        console.log('Store:', store?.name);
        console.log('Customer:', customer?.name);
        
        // Create invoices directory
        const invoicesDir = path.join(__dirname, '../invoices');
        if (!fs.existsSync(invoicesDir)) {
          fs.mkdirSync(invoicesDir, { recursive: true });
        }

        const fileName = `${sale.invoiceNumber}.pdf`;
        const filePath = path.join(invoicesDir, fileName);
        
        const doc = new PDFDocument({ margin: 15, size: 'A4' });
        const stream = fs.createWriteStream(filePath);
        
        doc.pipe(stream);

        // ===== HEADER SECTION =====
        const pageWidth = 595;
        const margin = 15;
        
        // Company Logo (if exists) - Left side
        const logoPath = path.join(__dirname, '../assets/logo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, margin, 40, { width: 50, height: 50 });
        }
        
        // Company Name (Large, Bold) - Always centered
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#000000').text('SS ENTERPRISES', margin, 50, {
          width: pageWidth - 2 * margin - 220,
          align: 'center'
        });
        
        // Invoice Number Box (Top Right) - Wider for longer invoice numbers
        const invoiceBoxWidth = 215;
        const invoiceBoxX = pageWidth - margin - invoiceBoxWidth;
        doc.rect(invoiceBoxX, 50, invoiceBoxWidth, 45).stroke();
        doc.fontSize(10).font('Helvetica-Bold').text('Invoice No.:', invoiceBoxX + 10, 60);
        doc.fontSize(9).font('Helvetica').text(sale.invoiceNumber, invoiceBoxX + 10, 73, { 
          width: invoiceBoxWidth - 20, 
          align: 'left' 
        });
        doc.fontSize(10).font('Helvetica-Bold').text('Dated:', invoiceBoxX + 115, 60);
        const invoiceDate = new Date(sale.saleDate);
        const day = invoiceDate.getDate().toString().padStart(2, '0');
        const month = invoiceDate.toLocaleDateString('en-US', { month: 'short' });
        const year = invoiceDate.getFullYear();
        doc.fontSize(9).font('Helvetica').text(`${day} ${month} ${year}`, invoiceBoxX + 115, 73);

        // Company Details (Address, GST, Email)
        doc.fontSize(9).font('Helvetica');
        // Format store address properly
        let storeAddress = 'C-7/61, Sector-7, Rohini Delhi-110085';
        if (store.address) {
          if (typeof store.address === 'object') {
            const parts = [];
            if (store.address.street) parts.push(store.address.street);
            if (store.address.city) parts.push(store.address.city);
            if (store.address.state) parts.push(store.address.state);
            if (store.address.zipCode) parts.push(store.address.zipCode);
            if (store.address.country) parts.push(store.address.country);
            storeAddress = parts.join(', ') || storeAddress;
          } else {
            storeAddress = store.address;
          }
        }
        doc.text(storeAddress, margin, 105);
        doc.text(`GSTIN/UIN: 08AGFPK7804C1ZQ`, margin, 120);
        doc.text(`E-Mail: ${store.email || 'ssenterprise255@gmail.com'}`, margin, 135);

        // ===== CONSIGNEE AND BUYER BOXES =====
        const boxY = 180;
        const boxHeight = 95;
        const boxWidth = 257;
        
        // Helper function to wrap text manually
        const wrapText = (text, maxWidth) => {
          const words = text.split(' ');
          const lines = [];
          let currentLine = '';
          
          words.forEach(word => {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const testWidth = doc.widthOfString(testLine, { fontSize: 8 });
            
            if (testWidth > maxWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          });
          
          if (currentLine) {
            lines.push(currentLine);
          }
          
          return lines.slice(0, 3); // Maximum 3 lines
        };
        
        // Consignee Box (Left)
        doc.rect(margin, boxY, boxWidth, boxHeight).stroke();
        doc.fontSize(10).font('Helvetica-Bold').text('Consignee (Ship to)', margin + 5, boxY + 5, { lineBreak: false });
        doc.fontSize(8).font('Helvetica');
        doc.text(customer.name || 'N/A', margin + 5, boxY + 20, { lineBreak: false });
        
        // Address with manual wrapping - ZERO GAP
        doc.fontSize(8);
        const addressLines = wrapText(customer.address || 'Address not provided', boxWidth - 15);
        let currentY = boxY + 33;
        addressLines.forEach((line, index) => {
          doc.text(line, margin + 5, currentY, { lineBreak: false });
          currentY += 10; // 10px per line
        });
        
        // DYNAMIC positioning - NO empty space
        doc.fontSize(8);
        const phoneY = currentY + 6; // Just 6px gap after address
        doc.text(`Phone: ${customer.phone || 'N/A'}`, margin + 5, phoneY, { lineBreak: false });
        doc.text(`GSTIN/UIN: ${customer.gstNumber || 'N/A'}`, margin + 5, phoneY + 13, { lineBreak: false });
        
        // Buyer Box (Right)
        doc.rect(margin + boxWidth, boxY, boxWidth, boxHeight).stroke();
        doc.fontSize(10).font('Helvetica-Bold').text('Buyer (Bill to)', margin + boxWidth + 5, boxY + 5, { lineBreak: false });
        doc.fontSize(8).font('Helvetica');
        doc.text(customer.name || 'N/A', margin + boxWidth + 5, boxY + 20, { lineBreak: false });
        
        // Address with manual wrapping - ZERO GAP
        doc.fontSize(8);
        const addressLines2 = wrapText(customer.address || 'Address not provided', boxWidth - 15);
        let currentY2 = boxY + 33;
        addressLines2.forEach((line, index) => {
          doc.text(line, margin + boxWidth + 5, currentY2, { lineBreak: false });
          currentY2 += 10; // 10px per line
        });
        
        // DYNAMIC positioning - NO empty space
        doc.fontSize(8);
        const phoneY2 = currentY2 + 6; // Just 6px gap after address
        doc.text(`Phone: ${customer.phone || 'N/A'}`, margin + boxWidth + 5, phoneY2, { lineBreak: false });
        doc.text(`GSTIN/UIN: ${customer.gstNumber || 'N/A'}`, margin + boxWidth + 5, phoneY2 + 13, { lineBreak: false });

        // ===== ITEMS TABLE =====
        const tableTop = 290;
        
        // Add logo before table (top-left of table area) if exists
        const tableLogo = path.join(__dirname, '../assets/logo.png');
        if (fs.existsSync(tableLogo)) {
          doc.image(tableLogo, margin, tableTop - 50, { width: 40, height: 40 });
        }
        
        const colWidths = {
          sl: 24,
          description: 120,
          hsn: 46,
          qty: 28,
          unitPrice: 52,
          discount: 46,
          taxable: 52,
          cgst: 43,
          sgst: 43,
          igst: 43,
          amount: 60
        }; // Total: 557px - perfect fit!
        
        // Table Header
        doc.rect(margin, tableTop, pageWidth - 2 * margin, 20).fillAndStroke('#f0f0f0', '#000');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000');
        
        let colX = margin;
        doc.text('SI', colX, tableTop + 6, { width: colWidths.sl, align: 'center' });
        colX += colWidths.sl;
        doc.text('Description of Goods', colX, tableTop + 6, { width: colWidths.description, align: 'center' });
        colX += colWidths.description;
        doc.text('HSN/SAC', colX, tableTop + 6, { width: colWidths.hsn, align: 'center' });
        colX += colWidths.hsn;
        doc.text('Qty', colX, tableTop + 6, { width: colWidths.qty, align: 'center' });
        colX += colWidths.qty;
        doc.text('Unit Price', colX, tableTop + 6, { width: colWidths.unitPrice, align: 'center' });
        colX += colWidths.unitPrice;
        doc.text('Discount', colX, tableTop + 6, { width: colWidths.discount, align: 'center' });
        colX += colWidths.discount;
        doc.text('Taxable', colX, tableTop + 6, { width: colWidths.taxable, align: 'center' });
        colX += colWidths.taxable;
        doc.text('CGST', colX, tableTop + 6, { width: colWidths.cgst, align: 'center' });
        colX += colWidths.cgst;
        doc.text('SGST', colX, tableTop + 6, { width: colWidths.sgst, align: 'center' });
        colX += colWidths.sgst;
        doc.text('IGST', colX, tableTop + 6, { width: colWidths.igst, align: 'center' });
        colX += colWidths.igst;
        doc.text('Amount', colX, tableTop + 6, { width: colWidths.amount, align: 'center' });

        // Table Items
        let itemY = tableTop + 25;
        doc.font('Helvetica').fontSize(8);
        
        sale.items.forEach((item, index) => {
          // 🔥 FIX: Convert PostgreSQL strings to numbers
          const unitPrice = parseFloat(item.unitPrice || 0);
          const discount = parseFloat(item.discount || 0);
          const quantity = parseInt(item.quantity || 1);
          const taxRate = parseFloat(item.taxRate || 5);
          
          const taxableAmount = (unitPrice - discount) * quantity;
          const cgst = taxRate > 5 ? taxableAmount * 0.09 : taxableAmount * 0.025;
          const sgst = taxRate > 5 ? taxableAmount * 0.09 : taxableAmount * 0.025;
          const igst = 0; // For same state, IGST is 0
          
          colX = margin;
          doc.text((index + 1).toString(), colX, itemY, { width: colWidths.sl, align: 'center' });
          colX += colWidths.sl;
          doc.text(item.name || 'Product', colX, itemY, { width: colWidths.description, align: 'center' });
          colX += colWidths.description;
          doc.text('90031900', colX, itemY, { width: colWidths.hsn, align: 'center' });
          colX += colWidths.hsn;
          doc.text(quantity.toString(), colX, itemY, { width: colWidths.qty, align: 'center' });
          colX += colWidths.qty;
          doc.text(unitPrice.toFixed(2), colX, itemY, { width: colWidths.unitPrice, align: 'center' });
          colX += colWidths.unitPrice;
          doc.text(discount.toFixed(2), colX, itemY, { width: colWidths.discount, align: 'center' });
          colX += colWidths.discount;
          doc.text(taxableAmount.toFixed(2), colX, itemY, { width: colWidths.taxable, align: 'center' });
          colX += colWidths.taxable;
          doc.text(cgst.toFixed(2), colX, itemY, { width: colWidths.cgst, align: 'center' });
          colX += colWidths.cgst;
          doc.text(sgst.toFixed(2), colX, itemY, { width: colWidths.sgst, align: 'center' });
          colX += colWidths.sgst;
          doc.text(igst.toFixed(2), colX, itemY, { width: colWidths.igst, align: 'center' });
          colX += colWidths.igst;
          doc.text(item.totalAmount.toFixed(2), colX, itemY, { width: colWidths.amount, align: 'center' });
          
          itemY += 20;
        });

        // Total Row
        doc.rect(margin, itemY, pageWidth - 2 * margin, 20).stroke();
        doc.font('Helvetica-Bold');
        
        // 🔥 FIX: Convert PostgreSQL strings to numbers
        const subtotal = parseFloat(sale.subtotal || 0);
        const totalDiscount = parseFloat(sale.totalDiscount || 0);
        const totalTax = parseFloat(sale.totalTax || 0);
        const totalAmount = parseFloat(sale.totalAmount || 0);
        
        colX = margin;
        doc.text('Total', colX, itemY + 5, { width: colWidths.sl + colWidths.description + colWidths.hsn, align: 'center' });
        colX += colWidths.sl + colWidths.description + colWidths.hsn;
        doc.text(sale.items.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0).toString(), colX, itemY + 5, { width: colWidths.qty, align: 'center' });
        colX += colWidths.qty;
        doc.text(subtotal.toFixed(2), colX, itemY + 5, { width: colWidths.unitPrice, align: 'center' });
        colX += colWidths.unitPrice;
        doc.text(totalDiscount.toFixed(2), colX, itemY + 5, { width: colWidths.discount, align: 'center' });
        colX += colWidths.discount;
        doc.text((subtotal - totalDiscount).toFixed(2), colX, itemY + 5, { width: colWidths.taxable, align: 'center' });
        colX += colWidths.taxable;
        doc.text((totalTax / 2).toFixed(2), colX, itemY + 5, { width: colWidths.cgst, align: 'center' });
        colX += colWidths.cgst;
        doc.text((totalTax / 2).toFixed(2), colX, itemY + 5, { width: colWidths.sgst, align: 'center' });
        colX += colWidths.sgst;
        doc.text('0.00', colX, itemY + 5, { width: colWidths.igst, align: 'center' });
        colX += colWidths.igst;
        doc.text(totalAmount.toFixed(2), colX, itemY + 5, { width: colWidths.amount, align: 'center' });

        // Grand Total
        itemY += 20;
        doc.rect(margin, itemY, pageWidth - 2 * margin, 20).fillAndStroke('#f0f0f0', '#000');
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(10);
        doc.text('Grand Total', margin, itemY + 5, { width: pageWidth - 2 * margin - colWidths.amount - 10, align: 'center' });
        doc.text(totalAmount.toFixed(2), pageWidth - margin - colWidths.amount, itemY + 5, { width: colWidths.amount, align: 'center' });

        // Amount in Words
        itemY += 30;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('Amount Chargeable (in words):', margin, itemY);
        doc.font('Helvetica');
        doc.text(amountInWords(totalAmount), margin, itemY + 15, { width: pageWidth - 2 * margin });

        // ===== TAX BREAKDOWN TABLE =====
        itemY += 55;
        const taxColWidths = { hsn: 45, taxable: 70, cgstRate: 33, cgstAmt: 43, sgstRate: 33, sgstAmt: 43, igstRate: 33, igstAmt: 43, totalTax: 140 }; // Total: 560px
        const totalTaxColumnStart = pageWidth - margin - taxColWidths.totalTax;
        
        // Draw header box WITHOUT Total Tax area (so no lines through Total Tax)
        doc.rect(margin, itemY, totalTaxColumnStart - margin, 25).fillAndStroke('#f0f0f0', '#000');
        
        // Draw Total Tax box separately (clean, no internal lines)
        doc.rect(totalTaxColumnStart, itemY, taxColWidths.totalTax, 25).fillAndStroke('#f0f0f0', '#000');
        
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
        
        // Draw vertical lines for tax columns (ONLY in the left section, not in Total Tax)
        let lineX = margin + taxColWidths.hsn;
        doc.moveTo(lineX, itemY).lineTo(lineX, itemY + 25).stroke();
        lineX += taxColWidths.taxable;
        doc.moveTo(lineX, itemY).lineTo(lineX, itemY + 25).stroke();
        
        // CGST columns
        lineX += taxColWidths.cgstRate;
        doc.moveTo(lineX, itemY + 12).lineTo(lineX, itemY + 25).stroke(); // Rate/Amount divider
        lineX += taxColWidths.cgstAmt;
        doc.moveTo(lineX, itemY).lineTo(lineX, itemY + 25).stroke();
        
        // SGST columns  
        lineX += taxColWidths.sgstRate;
        doc.moveTo(lineX, itemY + 12).lineTo(lineX, itemY + 25).stroke(); // Rate/Amount divider
        lineX += taxColWidths.sgstAmt;
        doc.moveTo(lineX, itemY).lineTo(lineX, itemY + 25).stroke();
        
        // IGST columns
        lineX += taxColWidths.igstRate;
        doc.moveTo(lineX, itemY + 12).lineTo(lineX, itemY + 25).stroke(); // Rate/Amount divider
        lineX += taxColWidths.igstAmt;
        doc.moveTo(lineX, itemY).lineTo(lineX, itemY + 25).stroke();
        
        // Draw horizontal line for second row - ONLY in the left section
        doc.moveTo(margin + taxColWidths.hsn + taxColWidths.taxable, itemY + 12)
           .lineTo(totalTaxColumnStart, itemY + 12).stroke();
        
        colX = margin;
        doc.text('HSN/SAC', colX, itemY + 8, { width: taxColWidths.hsn, align: 'center' });
        colX += taxColWidths.hsn;
        doc.text('Taxable Value', colX, itemY + 8, { width: taxColWidths.taxable, align: 'center' });
        colX += taxColWidths.taxable;
        
        // CGST header and sub-headers
        let cgstX = colX;
        doc.text('CGST', cgstX, itemY + 2, { width: taxColWidths.cgstRate + taxColWidths.cgstAmt, align: 'center' });
        doc.text('Rate', cgstX, itemY + 14, { width: taxColWidths.cgstRate, align: 'center' });
        doc.text('Amount', cgstX + taxColWidths.cgstRate, itemY + 14, { width: taxColWidths.cgstAmt, align: 'center' });
        colX += taxColWidths.cgstRate + taxColWidths.cgstAmt;
        
        // SGST header and sub-headers
        let sgstX = colX;
        doc.text('SGST', sgstX, itemY + 2, { width: taxColWidths.sgstRate + taxColWidths.sgstAmt, align: 'center' });
        doc.text('Rate', sgstX, itemY + 14, { width: taxColWidths.sgstRate, align: 'center' });
        doc.text('Amount', sgstX + taxColWidths.sgstRate, itemY + 14, { width: taxColWidths.sgstAmt, align: 'center' });
        colX += taxColWidths.sgstRate + taxColWidths.sgstAmt;
        
        // IGST header and sub-headers
        let igstX = colX;
        doc.text('IGST', igstX, itemY + 2, { width: taxColWidths.igstRate + taxColWidths.igstAmt, align: 'center' });
        doc.text('Rate', igstX, itemY + 14, { width: taxColWidths.igstRate, align: 'center' });
        doc.text('Amount', igstX + taxColWidths.igstRate, itemY + 14, { width: taxColWidths.igstAmt, align: 'center' });
        colX += taxColWidths.igstRate + taxColWidths.igstAmt;
        
        // Total Tax header - Single line, clear and bold
        doc.font('Helvetica-Bold').fontSize(8);
        doc.text('Total Tax', totalTaxColumnStart, itemY + 8, { width: taxColWidths.totalTax, align: 'center' });

        itemY += 25;
        doc.font('Helvetica').fontSize(8);
        const taxableValue = subtotal - totalDiscount;
        const taxRate = parseFloat(sale.items[0]?.taxRate || 5);
        const cgstRate = taxRate / 2;
        const sgstRate = taxRate / 2;
        const cgstAmount = totalTax / 2;
        const sgstAmount = totalTax / 2;
        
        colX = margin;
        doc.text('90031900', colX, itemY + 3, { width: taxColWidths.hsn, align: 'center' });
        colX += taxColWidths.hsn;
        doc.text(taxableValue.toFixed(2), colX, itemY + 3, { width: taxColWidths.taxable, align: 'center' });
        colX += taxColWidths.taxable;
        doc.text(`${cgstRate}%`, colX, itemY + 3, { width: taxColWidths.cgstRate, align: 'center' });
        doc.text(cgstAmount.toFixed(2), colX + taxColWidths.cgstRate, itemY + 3, { width: taxColWidths.cgstAmt, align: 'center' });
        colX += taxColWidths.cgstRate + taxColWidths.cgstAmt;
        doc.text(`${sgstRate}%`, colX, itemY + 3, { width: taxColWidths.sgstRate, align: 'center' });
        doc.text(sgstAmount.toFixed(2), colX + taxColWidths.sgstRate, itemY + 3, { width: taxColWidths.sgstAmt, align: 'center' });
        colX += taxColWidths.sgstRate + taxColWidths.sgstAmt;
        doc.text('0%', colX, itemY + 3, { width: taxColWidths.igstRate, align: 'center' });
        doc.text('0.00', colX + taxColWidths.igstRate, itemY + 3, { width: taxColWidths.igstAmt, align: 'center' });
        colX += taxColWidths.igstRate + taxColWidths.igstAmt;
        doc.text(totalTax.toFixed(2), colX, itemY + 3, { width: taxColWidths.totalTax, align: 'center' });

        itemY += 20;
        doc.rect(margin, itemY, pageWidth - 2 * margin, 15).stroke();
        doc.font('Helvetica-Bold');
        
        colX = margin;
        doc.text('Total', colX, itemY + 3, { width: taxColWidths.hsn, align: 'center' });
        colX += taxColWidths.hsn;
        doc.text(taxableValue.toFixed(2), colX, itemY + 3, { width: taxColWidths.taxable, align: 'center' });
        colX += taxColWidths.taxable + taxColWidths.cgstRate;
        doc.text(cgstAmount.toFixed(2), colX, itemY + 3, { width: taxColWidths.cgstAmt, align: 'center' });
        colX += taxColWidths.cgstAmt + taxColWidths.sgstRate;
        doc.text(sgstAmount.toFixed(2), colX, itemY + 3, { width: taxColWidths.sgstAmt, align: 'center' });
        colX += taxColWidths.sgstAmt + taxColWidths.igstRate;
        doc.text('0.00', colX, itemY + 3, { width: taxColWidths.igstAmt, align: 'center' });
        colX += taxColWidths.igstAmt;
        doc.text(totalTax.toFixed(2), colX, itemY + 3, { width: taxColWidths.totalTax, align: 'center' });

        // Tax Amount in Words
        itemY += 25;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('Tax Amount (in words):', margin, itemY);
        doc.font('Helvetica');
        doc.text(amountInWords(totalTax), margin, itemY + 12);

        // ===== FOOTER =====
        itemY += 50;
        
        // Bank Details (Left)
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text("Company's Bank Details", margin, itemY);
        doc.font('Helvetica').fontSize(8);
        doc.text('Bank Name: Kotak Mahindra Bank', margin, itemY + 15);
        doc.text('A/c No.: 2512756649', margin, itemY + 27);
        doc.text('Branch & IFSC Code: KKBK0004485', margin, itemY + 39);

        // Declaration (Right)
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Declaration:', pageWidth - margin - 250, itemY);
        doc.font('Helvetica').fontSize(8);
        doc.text('We declare that this invoice shows the actual price of the goods', pageWidth - margin - 250, itemY + 15, { width: 240 });
        doc.text('described and that all particulars are true and correct.', pageWidth - margin - 250, itemY + 27, { width: 240 });

        // Company Name and Signatory
        doc.fontSize(9).font('Helvetica');
        doc.text('for SS ENTERPRISES', pageWidth - margin - 150, itemY + 60, { align: 'right' });
        doc.fontSize(8);
        doc.text('Authorised Signatory', pageWidth - margin - 150, itemY + 90, { align: 'right' });

        doc.end();

        stream.on('finish', () => {
          resolve(filePath);
        });

        stream.on('error', (err) => {
          reject(err);
        });

      } catch (error) {
        console.error('❌ INVOICE GENERATION ERROR:');
        console.error('Error Type:', error.constructor.name);
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        console.error('Sale Data:', {
          id: sale?.id,
          invoiceNumber: sale?.invoiceNumber,
          itemsCount: sale?.items?.length,
          subtotal: sale?.subtotal,
          totalAmount: sale?.totalAmount
        });
        reject(error);
      }
    });
  }
}

module.exports = new InvoiceGenerator();
