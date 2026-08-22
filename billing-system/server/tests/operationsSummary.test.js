/**
 * The dashboard's operations summary.
 *
 * Two dozen counts across a dozen tables, several of them with raw SQL or a
 * column reference in them. The failure mode is not a wrong number, it is a
 * query that does not run at all — a mistyped column throws at request time and
 * takes the whole dashboard down with it, which is the first screen anybody
 * opens. So the first thing this checks is simply that every band builds.
 *
 * The arithmetic that is worth asserting is the part that is easy to get subtly
 * wrong: the ageing split, and the delta against yesterday.
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
const dashboard = await import('../src/modules/reporting/dashboard.controller.js');
const orders = await import('../src/modules/sales/salesOrder.controller.js');
const fulfilment = await import('../src/modules/warehouse/fulfilment.controller.js');
const invoices = await import('../src/modules/sales/invoice.controller.js');
const stock = await import('../src/modules/inventory/stock.service.js');

const {
  sequelize, Branch, Company, Customer, Invoice, Product, SalesOrderItem,
  StockOwner, User,
} = models;

let branch;
let customer;
let widget;

const USER = { id: 1, name: 'Operator' };
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

function run(handler, { params = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) { status = code; return res; },
      json(payload) { resolve({ status, body: payload }); return res; },
    };
    handler({
      params, body, query, branchId: branch.id,
      user: { id: USER.id, name: USER.name, role: 'Admin', menus: [] },
    }, res, reject);
  });
}

const summary = async () => (await run(dashboard.operations)).body;

/**
 * One figure out of one band, named explicitly.
 *
 * The band has to be given: `receipts` and `issues` are keys in both TODAY and
 * PENDING, and they mean different things there — goods received today versus
 * receipts still waiting to be posted. A lookup across both bands would find
 * whichever came first and quietly assert about the wrong number.
 */
const bandRow = (body, band, key) => {
  const row = body[band].find((m) => m.key === key);
  assert.ok(row, `no ${key} in the ${band} band`);
  return row;
};

before(async () => {
  await sequelize.sync({ force: true });
  await StockOwner.create({ id: 1, ownerName: 'House', ownerCode: 'HOUSE', isHouse: true });
  await Company.create({ name: 'Test Co', state: 'Maharashtra', businessMode: 'Advanced' });
  await User.create({
    id: USER.id, name: USER.name, email: 'ops@example.test', passwordHash: 'not-a-real-hash',
  });
  branch = await Branch.create({ branchName: 'Main', branchCode: 'MAIN', locationType: 'Branch' });
  customer = await Customer.create({
    customerName: 'Acme', state: 'Maharashtra', mobileNumber: '9000000001',
  });
});

after(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  widget = await Product.create({
    productName: `Widget ${Date.now()}${Math.random()}`,
    primaryUnit: 'PCS', purchasePrice: 60, sellingPrice: 100, gstPercent: 18,
  });
  await stock.setBranchStock({
    productId: widget.id, branchId: branch.id, quantity: 500, transaction: null, userId: USER.id,
  });
});

describe('every band builds', () => {
  test('the summary answers without a query error', async () => {
    // The point of this one is coverage, not a value: a mistyped column in any
    // of two dozen queries throws here rather than on the user's first login.
    const { status, body } = await run(dashboard.operations);

    assert.equal(status, 200);
    assert.equal(Array.isArray(body.today), true);
    assert.equal(Array.isArray(body.pending), true);
    assert.ok(body.areas.sales && body.areas.inventory && body.areas.purchasing);
    assert.ok(body.asOf, 'the summary says when it was taken');
  });

  test('every figure is a number, not a null that renders as blank', async () => {
    const body = await summary();

    for (const metric of body.today) {
      assert.equal(typeof metric.value, 'number', `${metric.key} value`);
      assert.equal(Number.isNaN(metric.value), false, `${metric.key} was NaN`);
      assert.ok(metric.label && metric.path, `${metric.key} is missing a label or link`);
    }
    for (const metric of body.pending) {
      for (const half of ['recent', 'overdue', 'total']) {
        assert.equal(typeof metric[half], 'number', `${metric.key}.${half}`);
      }
      assert.equal(metric.total, metric.recent + metric.overdue, `${metric.key} halves must sum`);
    }
    for (const area of Object.values(body.areas)) {
      assert.ok(area.title);
      for (const row of area.rows) assert.equal(typeof row.value, 'number', row.label);
    }
  });
});

describe('today against yesterday', () => {
  test('an invoice raised today lands in today, not yesterday', async () => {
    const before = bandRow(await summary(), 'today', 'invoices');

    await run(invoices.createInvoice, {
      body: {
        customerId: customer.id,
        invoiceDate: today(),
        paymentMethod: 'Cash',
        items: [{ productId: widget.id, quantity: 2, rate: 100, gstPercent: 18 }],
      },
    });

    const after = bandRow(await summary(), 'today', 'invoices');
    assert.equal(after.value, before.value + 1);
    assert.equal(after.previous, before.previous, 'yesterday is untouched');
  });

  test('no comparison is offered when yesterday was empty', async () => {
    // A rise from nothing is not a percentage. Printing "+100%" here invites
    // somebody to read a trend into the first sale of a quiet week.
    const metric = bandRow(await summary(), 'today', 'invoices');
    assert.equal(metric.previous, 0);
    assert.equal(metric.deltaPct, null);
  });

  test('with a figure on both days the delta is a real percentage', async () => {
    // Two yesterday, four today is +100%.
    for (const day of [yesterday(), yesterday()]) {
      await run(invoices.createInvoice, {
        body: {
          customerId: customer.id,
          invoiceDate: day,
          paymentMethod: 'Cash',
          items: [{ productId: widget.id, quantity: 1, rate: 100, gstPercent: 18 }],
        },
      });
    }
    const start = bandRow(await summary(), 'today', 'invoices');
    const wantedToday = start.previous * 2;

    for (let i = start.value; i < wantedToday; i += 1) {
      await run(invoices.createInvoice, {
        body: {
          customerId: customer.id,
          invoiceDate: today(),
          paymentMethod: 'Cash',
          items: [{ productId: widget.id, quantity: 1, rate: 100, gstPercent: 18 }],
        },
      });
    }

    const metric = bandRow(await summary(), 'today', 'invoices');
    assert.equal(metric.value, metric.previous * 2);
    assert.equal(metric.deltaPct, 100);
  });
});

describe('pending work is split by age', () => {
  test('a dispatched, unbilled order arrives in the under-24h half', async () => {
    const before = bandRow(await summary(), 'pending', 'unbilled');

    const { body: created } = await run(orders.create, {
      body: {
        customerId: customer.id,
        orderDate: today(),
        items: [{ productId: widget.id, quantity: 3, rate: 100, gstPercent: 18 }],
      },
    });
    await run(orders.confirm, { params: { id: created.id } });
    await run(fulfilment.allocate, { params: { id: created.id }, body: { branchId: branch.id } });
    const line = await SalesOrderItem.findOne({ where: { orderId: created.id } });
    await line.update({ pickedQty: line.allocatedQty, packedQty: line.allocatedQty });
    await run(fulfilment.dispatch, { params: { id: created.id }, body: {} });

    const after = bandRow(await summary(), 'pending', 'unbilled');
    assert.equal(after.recent, before.recent + 1, 'it went out minutes ago');
    assert.equal(after.overdue, before.overdue, 'and is not overdue yet');
  });

  test('an order dispatched two days ago counts as overdue', async () => {
    // Ageing is the whole reason this band exists: thirty-eight unbilled orders
    // is a normal Tuesday an hour after dispatch and a serious problem a week
    // later, and the total alone cannot tell those apart.
    const { body: created } = await run(orders.create, {
      body: {
        customerId: customer.id,
        orderDate: today(),
        items: [{ productId: widget.id, quantity: 3, rate: 100, gstPercent: 18 }],
      },
    });
    await run(orders.confirm, { params: { id: created.id } });
    await run(fulfilment.allocate, { params: { id: created.id }, body: { branchId: branch.id } });
    const line = await SalesOrderItem.findOne({ where: { orderId: created.id } });
    await line.update({ pickedQty: line.allocatedQty, packedQty: line.allocatedQty });
    await run(fulfilment.dispatch, { params: { id: created.id }, body: {} });

    const before = bandRow(await summary(), 'pending', 'unbilled');

    // Backdate the dispatch, which is what the split is measured from.
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await models.SalesOrder.update(
      { dispatchedAt: twoDaysAgo }, { where: { id: created.id } },
    );

    const after = bandRow(await summary(), 'pending', 'unbilled');
    assert.equal(after.overdue, before.overdue + 1);
    assert.equal(after.recent, before.recent - 1);
    assert.equal(after.total, before.total, 'it moved between halves, it did not appear');
  });

  test('billing the order takes it off the band entirely', async () => {
    const { body: created } = await run(orders.create, {
      body: {
        customerId: customer.id,
        orderDate: today(),
        items: [{ productId: widget.id, quantity: 3, rate: 100, gstPercent: 18 }],
      },
    });
    await run(orders.confirm, { params: { id: created.id } });
    await run(fulfilment.allocate, { params: { id: created.id }, body: { branchId: branch.id } });
    const line = await SalesOrderItem.findOne({ where: { orderId: created.id } });
    await line.update({ pickedQty: line.allocatedQty, packedQty: line.allocatedQty });
    await run(fulfilment.dispatch, { params: { id: created.id }, body: {} });

    const before = bandRow(await summary(), 'pending', 'unbilled');
    await run(invoices.invoiceFromSalesOrder, { params: { id: created.id } });

    const after = bandRow(await summary(), 'pending', 'unbilled');
    assert.equal(after.total, before.total - 1);
  });
});

describe('the area panels', () => {
  test('a low-stock product shows against the reorder row', async () => {
    const scarce = await Product.create({
      productName: `Scarce ${Date.now()}`,
      primaryUnit: 'PCS', purchasePrice: 10, sellingPrice: 20, lowStockThreshold: 50,
    });
    await stock.setBranchStock({
      productId: scarce.id, branchId: branch.id, quantity: 1, transaction: null, userId: USER.id,
    });

    const body = await summary();
    const reorder = body.areas.inventory.rows.find((r) => r.label.includes('reorder'));

    assert.ok(reorder, 'the row is on the panel');
    assert.equal(reorder.value >= 1, true, 'and it counted the scarce product');
    assert.equal(reorder.tone, 'warning', 'and said so in amber');
  });

  test('an unpaid invoice shows against the awaiting-payment row', async () => {
    await Invoice.create({
      invoiceNumber: `INV-TEST-${Date.now()}`,
      invoiceDate: today(),
      branchId: branch.id,
      customerId: customer.id,
      paymentMethod: 'Credit',
      status: 'Unpaid',
      grandTotal: 500,
      amountInWords: 'Five hundred only',
    });

    const body = await summary();
    const unpaid = body.areas.sales.rows.find((r) => r.label.includes('awaiting payment'));
    assert.equal(unpaid.value >= 1, true);
  });
});
