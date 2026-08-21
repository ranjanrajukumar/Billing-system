import cron from 'node-cron';
import { Op } from 'sequelize';
import { sequelize, Subscription, Invoice, InvoiceItem, Customer, Product, Payment } from '../models/index.js';
import { calculateInvoice } from '../utils/invoiceMath.js';
import { sendInvoiceEmail } from './email.service.js';
import { buildInvoicePdf } from './pdf.service.js';
import { Company } from '../models/index.js';

export const startBillingCron = () => {
  // Run every day at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('Running recurring billing cron job...');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const subscriptions = await Subscription.findAll({
        where: {
          status: 'Active',
          detstatus: false,
          nextBillingDate: { [Op.lte]: today }
        },
        include: [{ model: Customer }, { model: Product }]
      });

      console.log(`Found ${subscriptions.length} subscriptions due for billing.`);

      for (const sub of subscriptions) {
        await processSubscription(sub);
      }
    } catch (error) {
      console.error('Error running billing cron:', error);
    }
  });
};

async function processSubscription(sub) {
  try {
    await sequelize.transaction(async (transaction) => {
      // 1. Create Invoice
      const product = sub.Product;
      const company = await Company.findOne({ transaction });
      const companyState = company?.state || process.env.COMPANY_STATE || sub.Customer.state;

      const items = [{
        productId: product.id,
        quantity: 1,
        rate: sub.amount,
        discount: 0,
        gstPercent: product.gstPercent || 0,
        um: product.primaryUnit || 'PCS'
      }];

      const totals = calculateInvoice(items, sub.Customer.state, companyState, {
        couponDiscount: 0,
        pointsDiscount: 0,
        charges: {}
      });

      const year = new Date().getFullYear();
      const count = await Invoice.count({ where: { invoiceNumber: { [Op.like]: `INV-${year}-%` } }, transaction });
      const invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, '0')}`;

      const invoice = await Invoice.create({
        invoiceNumber,
        invoiceDate: new Date(),
        customerId: sub.customerId,
        paymentMethod: 'Cash', // Default for subscription, might be auto-charged later
        subtotal: totals.subtotal,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        grandTotal: totals.grandTotal,
        roundOff: totals.roundOff,
        amountInWords: totals.amountInWords,
        notes: `Recurring subscription billing (${sub.frequency})`,
        currency: sub.currency,
        exchangeRate: 1.0,
        subscriptionId: sub.id,
        status: 'Unpaid' // Waiting for payment
      }, { transaction });

      await InvoiceItem.create({
        invoiceId: invoice.id,
        productId: product.id,
        quantity: 1,
        rate: sub.amount,
        discount: 0,
        gstPercent: product.gstPercent || 0,
        gstAmount: items[0].gstAmount || 0,
        amount: items[0].amount || 0,
        um: product.primaryUnit || 'PCS',
        primaryQty: 1
      }, { transaction });

      // 2. Update nextBillingDate
      const nextDate = new Date(sub.nextBillingDate);
      if (sub.frequency === 'Daily') nextDate.setDate(nextDate.getDate() + 1);
      else if (sub.frequency === 'Weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (sub.frequency === 'Monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      else if (sub.frequency === 'Yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
      
      await sub.update({ nextBillingDate: nextDate }, { transaction });

      // 3. Email Invoice
      if (sub.Customer.email) {
        const fullInvoice = await Invoice.findOne({
          where: { id: invoice.id },
          include: [{ model: Customer }, { model: InvoiceItem, include: Product }],
          transaction
        });
        const template = company?.defaultInvoiceTemplate || 'standard';
        const buffer = await buildInvoicePdf(fullInvoice, company, template, 'TAX INVOICE');
        await sendInvoiceEmail(sub.Customer.email, fullInvoice, buffer);
        await invoice.update({ emailStatus: 'Sent' }, { transaction });
      }

      console.log(`Successfully billed subscription ${sub.id}, generated invoice ${invoice.invoiceNumber}`);
    });
  } catch (error) {
    console.error(`Failed to process subscription ${sub.id}:`, error);
  }
}
