/**
 * Taking the money at the counter.
 *
 * Three things have to stay true, and each is wrong in a way that looks fine on
 * the day and is unpickable a month later:
 *
 *   Change is not revenue.        Tendering ₹500 for a ₹327 bill pays ₹327.
 *   Credit is not a tender.       It is whatever the tenders did not cover.
 *   Cash reaches the drawer.      Or the shift count is short by exactly the
 *                                 amount taken, with nothing to explain it.
 *
 * Runs against a throwaway in-memory SQLite database.
 *
 *   node --test tests/
 */
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.AUTO_MIGRATE = 'false';
process.env.DISABLE_JOBS = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-for-anything-real-0000';

import assert from 'node:assert/strict';
import test, { before, after, beforeEach, describe } from 'node:test';

const models = await import('../src/models/index.js');
const invoices = await import('../src/modules/sales/invoice.controller.js');
const tender = await import('../src/modules/sales/tender.service.js');
const stock = await import('../src/modules/inventory/stock.service.js');

const {
  sequelize, Branch, CashRegister, CashTransaction, Company, Customer, Invoice,
  Payment, Product, StockOwner, User,
} = models;

let branch;
let customer;
let widget;

const USER = { id: 1, name: 'Cashier' };
const today = () => new Date().toISOString().slice(0, 10);

function run(handler, { body = {}, params = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) { status = code; return res; },
      json(payload) { resolve({ status, body: payload }); return res; },
    };
    handler({
      body, params, query, branchId: branch.id,
      user: { id: USER.id, name: USER.name, role: 'Admin', menus: [] },
    }, res, reject);
  });
}

/** A one-line sale for `rate`, however it is being paid for. */
const sale = (extra) => run(invoices.createInvoice, {
  body: {
    customerId: customer.id,
    invoiceDate: today(),
    items: [{ productId: widget.id, quantity: 1, rate: 1000, gstPercent: 0 }],
    ...extra,
  },
});

const paymentsOn = (invoiceId) => Payment.findAll({
  where: { invoiceId, detstatus: false }, order: [['id', 'ASC']],
});

before(async () => {
  await sequelize.sync({ force: true });
  await StockOwner.create({ id: 1, ownerName: 'House', ownerCode: 'HOUSE', isHouse: true });
  await Company.create({ name: 'Counter Co', state: 'Maharashtra', creditDays: 30 });
  await User.create({
    id: USER.id, name: USER.name, email: 'till@example.test', passwordHash: 'not-a-real-hash',
  });
  branch = await Branch.create({ branchName: 'Shop', branchCode: 'SHOP', locationType: 'Branch' });
  customer = await Customer.create({
    customerName: 'Walk-in', state: 'Maharashtra', mobileNumber: '9000000009',
  });
});

after(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  widget = await Product.create({
    productName: `Item ${Date.now()}${Math.random()}`,
    primaryUnit: 'PCS', purchasePrice: 400, sellingPrice: 1000, gstPercent: 0,
  });
  await stock.setBranchStock({
    productId: widget.id, branchId: branch.id, quantity: 100, transaction: null, userId: USER.id,
  });
  // Every test starts with no till open; the ones that want one open it.
  await CashRegister.destroy({ where: {}, force: true });
  await CashTransaction.destroy({ where: {}, force: true });
});

describe('the tender arithmetic', () => {
  test('change is worked out, never recorded', () => {
    // ₹500 handed over for a ₹327 bill pays ₹327. Recording ₹500 would
    // overstate both the day's takings and the drawer.
    assert.equal(tender.changeDue(500, 327), 173);
    assert.equal(tender.changeDue(327, 327), 0);
    assert.equal(tender.changeDue(300, 327), 0, 'a short tender is not negative change');
  });

  test('tendering more than the bill is refused, not trimmed', () => {
    assert.throws(
      () => tender.normaliseTender({ payments: [{ paymentMethod: 'Cash', amount: 500 }] }, 327),
      /more than the bill/,
    );
  });

  test('credit is not a way of paying', () => {
    assert.throws(
      () => tender.normaliseTender({ payments: [{ paymentMethod: 'Credit', amount: 100 }] }, 500),
      /not a way of paying/,
    );
  });

  test('the old single-method shape still means paid in full', () => {
    const result = tender.normaliseTender({ paymentMethod: 'Cash' }, 500);
    assert.equal(result.paid, 500);
    assert.equal(result.onCredit, 0);
    assert.equal(result.method, 'Cash');
  });

  test('the old Credit shape now means nothing was tendered', () => {
    const result = tender.normaliseTender({ paymentMethod: 'Credit' }, 500);
    // Nothing tendered: no payment rows, nothing paid, the whole bill on account.
    assert.deepEqual([result.lines.length, result.paid, result.onCredit], [0, 0, 500]);
    assert.equal(result.method, 'Credit');
  });

  test('the header method is the largest component, not the first', () => {
    // A mostly-cash sale should read as a cash sale on every list that shows
    // one method.
    const result = tender.normaliseTender({
      payments: [
        { paymentMethod: 'Card', amount: 100 },
        { paymentMethod: 'Cash', amount: 400 },
      ],
    }, 500);
    assert.equal(result.method, 'Cash');
  });

  test('blank rows on the split panel are ignored', () => {
    const result = tender.normaliseTender({
      payments: [
        { paymentMethod: 'Cash', amount: 500 },
        { paymentMethod: 'Card', amount: '' },
      ],
    }, 500);
    assert.equal(result.lines.length, 1);
  });
});

describe('a split-payment sale', () => {
  test('records one payment per method and reads as paid', async () => {
    const { body: invoice } = await sale({
      payments: [
        { paymentMethod: 'Cash', amount: 600 },
        { paymentMethod: 'UPI', amount: 400, referenceNumber: 'UPI-8891' },
      ],
    });

    const payments = await paymentsOn(invoice.id);
    assert.equal(payments.length, 2);
    assert.deepEqual(payments.map((p) => p.paymentMethod), ['Cash', 'UPI']);
    assert.equal(payments.find((p) => p.paymentMethod === 'UPI').referenceNumber, 'UPI-8891');
    assert.equal(invoice.status, 'Paid');
    assert.equal(invoice.paymentMethod, 'Cash', 'the larger half names the sale');
  });

  test('a part tender leaves the rest on account, with a due date', async () => {
    const { body: invoice } = await sale({
      payments: [{ paymentMethod: 'Cash', amount: 400 }],
    });

    assert.equal(invoice.status, 'Partially Paid');
    assert.ok(invoice.dueDate, 'the unpaid part is aged like any other credit');
    const payments = await paymentsOn(invoice.id);
    assert.equal(Number(payments[0].amount), 400);
  });

  test('tendering nothing is a credit sale', async () => {
    const { body: invoice } = await sale({ paymentMethod: 'Credit' });

    assert.equal(invoice.status, 'Unpaid');
    assert.ok(invoice.dueDate);
    assert.equal((await paymentsOn(invoice.id)).length, 0, 'nothing was received, so nothing is recorded');
  });

  test('overpaying is refused and no invoice is left behind', async () => {
    const before = await Invoice.count();
    await assert.rejects(
      () => sale({ payments: [{ paymentMethod: 'Cash', amount: 2000 }] }),
      /more than the bill/,
    );
    assert.equal(await Invoice.count(), before, 'the whole transaction rolled back');
  });
});

describe('cash reaches the drawer', () => {
  const openTill = () => CashRegister.create({
    registerName: 'Counter 1', branchId: branch.id, status: 'Open', openingBalance: 2000,
  });

  test('a cash sale is recorded against the open till', async () => {
    const till = await openTill();
    const { body: invoice } = await sale({ paymentMethod: 'Cash' });

    const movements = await CashTransaction.findAll({ where: { registerId: till.id } });
    assert.equal(movements.length, 1);
    assert.equal(movements[0].entryType, 'Cash Sale');
    assert.equal(Number(movements[0].amountIn), 1000);
    assert.equal(Number(movements[0].balance), 3000, 'the drawer went up by what was taken');
    assert.equal(movements[0].referenceNumber, invoice.invoiceNumber, 'traceable back to the bill');
  });

  test('only the cash half of a split sale reaches the till', async () => {
    const till = await openTill();
    await sale({
      payments: [
        { paymentMethod: 'Cash', amount: 300 },
        { paymentMethod: 'Card', amount: 700 },
      ],
    });

    const movements = await CashTransaction.findAll({ where: { registerId: till.id } });
    assert.equal(movements.length, 1);
    assert.equal(Number(movements[0].amountIn), 300, 'the card money is not in the drawer');
  });

  test('a card-only sale touches no till at all', async () => {
    const till = await openTill();
    await sale({ paymentMethod: 'Card' });
    assert.equal(await CashTransaction.count({ where: { registerId: till.id } }), 0);
  });

  test('with no till open the sale still goes through', async () => {
    // Plenty of shops never open a register. Refusing the sale would be a far
    // worse answer than an uncounted drawer.
    const { status, body: invoice } = await sale({ paymentMethod: 'Cash' });
    assert.equal(status, 201);
    assert.equal(invoice.status, 'Paid');
    assert.equal(await CashTransaction.count(), 0);
  });
});
