/**
 * The seam between billing, inventory and the warehouse.
 *
 * Three systems have an opinion about the same goods — the sales order commits
 * them, the warehouse moves them, the invoice charges for them — and the one
 * thing that must survive all three is:
 *
 *   Stock leaves the location exactly once.
 *
 * These tests drive the real controllers rather than the services underneath,
 * because the bug this is guarding against is not in any single function. It is
 * in two code paths each doing something individually correct: dispatch takes
 * the goods out, and then the invoice takes them out again.
 *
 * Runs against a throwaway in-memory SQLite database, created and destroyed by
 * the test. It must never be pointed at a real one — these tests sell stock
 * down and drive reservations to zero to prove the arithmetic, and doing that
 * to a live shop's balances would be indistinguishable from a bug.
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

// Imported after the environment is set, or the models would connect to
// whatever the developer's .env points at — which is the live database.
const models = await import('../src/models/index.js');
const invoices = await import('../src/modules/sales/invoice.controller.js');
const orders = await import('../src/modules/sales/salesOrder.controller.js');
const fulfilment = await import('../src/modules/warehouse/fulfilment.controller.js');
const stock = await import('../src/modules/inventory/stock.service.js');

const {
  sequelize, Branch, Company, Customer, Invoice, Product, StockOwner, User,
  SalesOrder, SalesOrderItem, BranchStock, StockMovement,
} = models;

let branch;
let customer;
let widget;

const USER = { id: 1, name: 'Test Operator' };

/**
 * Drives an express handler and returns what it answered.
 *
 * `asyncHandler` funnels a rejection into `next`, so a handler that threw looks
 * exactly like one that did nothing at all unless `next` is watched for it.
 * Rethrowing here is what lets a test say "this is refused" and mean it.
 */
function run(handler, { body = {}, params = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) { status = code; return res; },
      json(payload) { resolve({ status, body: payload }); return res; },
    };
    handler({ body, params, query, user: USER, branchId: branch.id }, res, reject);
  });
}

/** The house balance for the widget: what is on the shelf, and what is held. */
async function balance() {
  const row = await BranchStock.findOne({
    where: { productId: widget.id, branchId: branch.id, ownerId: 1 },
  });
  return {
    stock: Number(row?.stock || 0),
    reserved: Number(row?.reservedQuantity || 0),
    available: Number(row?.stock || 0) - Number(row?.reservedQuantity || 0),
  };
}

/** Every ledger row this invoice wrote, whatever the movement was called. */
const ledgerFor = (invoiceId) => StockMovement.count({
  where: { referenceType: 'Invoice', referenceId: invoiceId },
});

/** An order for `quantity` widgets, ready to be confirmed. */
async function placeOrder(quantity = 10) {
  const { body } = await run(orders.create, {
    body: {
      customerId: customer.id,
      orderDate: '2026-08-22',
      items: [{ productId: widget.id, quantity, rate: 100, gstPercent: 18 }],
    },
  });
  return SalesOrder.findByPk(body.id, { include: [SalesOrderItem] });
}

/** Walks an order all the way to the loading bay without dispatching it. */
async function packOrder(order) {
  await run(fulfilment.allocate, { params: { id: order.id }, body: { branchId: branch.id } });
  const line = await SalesOrderItem.findOne({ where: { orderId: order.id } });
  await line.update({ pickedQty: line.allocatedQty, packedQty: line.allocatedQty });
  return line;
}

before(async () => {
  await sequelize.sync({ force: true });

  // The house owner is row 1 by convention throughout the system.
  await StockOwner.create({ id: 1, ownerName: 'House', ownerCode: 'HOUSE', isHouse: true });

  // Orders and invoices both record who raised them, so the user has to exist
  // before either can be written.
  await User.create({
    id: USER.id, name: USER.name, email: 'operator@example.test',
    passwordHash: 'not-a-real-hash',
  });

  await Company.create({
    name: 'Test Traders', state: 'Maharashtra',
    businessMode: 'Advanced', allowNegativeStock: false,
  });

  branch = await Branch.create({
    branchName: 'Mumbai Store 01', branchCode: 'MUM01', locationType: 'Branch',
  });
  customer = await Customer.create({
    customerName: 'Acme Retail', state: 'Maharashtra', mobileNumber: '9000000001',
  });
});

after(async () => {
  await sequelize.close();
});

// A clean product and a clean shelf per test: these deliberately drive the same
// balance to zero from several directions, and a leftover reservation from the
// previous test would look exactly like the bug being tested for.
beforeEach(async () => {
  widget = await Product.create({
    productName: `Widget ${Date.now()}${Math.random()}`,
    primaryUnit: 'PCS', purchasePrice: 60, sellingPrice: 100, gstPercent: 18,
  });
  await stock.setBranchStock({
    productId: widget.id, branchId: branch.id, quantity: 100,
    transaction: null, userId: USER.id,
  });
});

describe('a sales order holds stock without moving it', () => {
  test('confirming reserves the quantity, and the shelf does not change', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });

    const after = await balance();
    assert.equal(after.stock, 100, 'nothing has physically moved');
    assert.equal(after.reserved, 10, 'ten are spoken for');
    assert.equal(after.available, 90);
  });

  test('cancelling gives the reservation back', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    await run(orders.cancel, { params: { id: order.id } });

    const after = await balance();
    assert.equal(after.reserved, 0, 'the hold is released, not stranded');
    assert.equal(after.available, 100);
  });
});

describe('billing an order the warehouse has not dispatched', () => {
  test('the invoice is the stock event, and consumes the reservation', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });

    const { status, body: invoice } = await run(invoices.invoiceFromSalesOrder, {
      params: { id: order.id },
    });
    assert.equal(status, 201);

    const after = await balance();
    assert.equal(after.stock, 90, 'the ten billed have left the shelf');
    assert.equal(after.reserved, 0, 'and the hold went with them');
    assert.equal(after.available, 90);
    assert.equal(await ledgerFor(invoice.id), 1, 'the movement is in the ledger');
  });

  test('the reservation does not make the order refuse its own stock', async () => {
    // The whole shelf committed to one order. Availability is stock minus
    // reserved, so anything that checks availability without accounting for
    // whose reservation it is refuses to sell goods that are already sold.
    const order = await placeOrder(100);
    await run(orders.confirm, { params: { id: order.id } });
    assert.equal((await balance()).available, 0);

    const { status } = await run(invoices.invoiceFromSalesOrder, { params: { id: order.id } });
    assert.equal(status, 201);
    assert.deepEqual(await balance(), { stock: 0, reserved: 0, available: 0 });
  });
});

describe('billing an order the warehouse has already dispatched', () => {
  test('dispatch takes the stock out and releases the hold', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    await packOrder(order);
    await run(fulfilment.dispatch, { params: { id: order.id }, body: {} });

    const after = await balance();
    assert.equal(after.stock, 90, 'the goods are out of the building');
    assert.equal(after.reserved, 0, 'the hold left with them rather than stranding');
  });

  test('a fully committed order can still be dispatched', async () => {
    // The same trap as billing: the order reserved everything, so an
    // availability check that counts its own hold against it makes the order
    // impossible to ship.
    const order = await placeOrder(100);
    await run(orders.confirm, { params: { id: order.id } });
    await packOrder(order);

    const { status } = await run(fulfilment.dispatch, { params: { id: order.id }, body: {} });
    assert.equal(status, 200);
    assert.deepEqual(await balance(), { stock: 0, reserved: 0, available: 0 });
  });

  test('the invoice that follows moves no stock at all', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    await packOrder(order);
    await run(fulfilment.dispatch, { params: { id: order.id }, body: {} });

    const before = await balance();
    const { body: invoice } = await run(invoices.invoiceFromSalesOrder, {
      params: { id: order.id },
    });

    assert.deepEqual(await balance(), before, 'the shelf is untouched by the bill');
    assert.equal(await ledgerFor(invoice.id), 0, 'and the bill claims no movement');
    assert.equal(Number(invoice.grandTotal) > 0, true, 'but it is still a real bill');
  });

  test('a short shipment bills what went, not what was ordered', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    const line = await packOrder(order);
    // Only six of the ten made it into a box.
    await line.update({ pickedQty: 6, packedQty: 6 });
    await run(fulfilment.dispatch, { params: { id: order.id }, body: {} });

    const { body: invoice } = await run(invoices.invoiceFromSalesOrder, {
      params: { id: order.id },
    });
    const billed = invoice.InvoiceItems.reduce((sum, i) => sum + Number(i.quantity), 0);
    assert.equal(billed, 6, 'the customer is not charged for four boxes they never got');
  });

  test('cancelling that invoice does not invent the stock back', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    await packOrder(order);
    await run(fulfilment.dispatch, { params: { id: order.id }, body: {} });
    const { body: invoice } = await run(invoices.invoiceFromSalesOrder, {
      params: { id: order.id },
    });

    const before = await balance();
    await run(invoices.removeInvoice, { params: { id: invoice.id } });

    assert.deepEqual(
      await balance(), before,
      'the goods are on a van; cancelling the paperwork does not bring them home',
    );
  });
});

describe('an order is billed once', () => {
  test('a second invoice is refused rather than deducting twice', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    await run(invoices.invoiceFromSalesOrder, { params: { id: order.id } });

    const afterFirst = await balance();
    await assert.rejects(
      () => run(invoices.invoiceFromSalesOrder, { params: { id: order.id } }),
      /already invoiced/,
    );
    assert.deepEqual(await balance(), afterFirst, 'the refusal moved nothing');
  });

  test('cancelling the bill makes the order billable again', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    const { body: first } = await run(invoices.invoiceFromSalesOrder, { params: { id: order.id } });
    await run(invoices.removeInvoice, { params: { id: first.id } });

    assert.equal((await balance()).stock, 100, 'cancelling put the stock back');

    const { status } = await run(invoices.invoiceFromSalesOrder, { params: { id: order.id } });
    assert.equal(status, 201);
    assert.equal((await balance()).stock, 90, 'and the second bill took it out once');
  });

  test('an order that is already billed cannot be cancelled behind the bill', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    await run(invoices.invoiceFromSalesOrder, { params: { id: order.id } });

    const { status } = await run(orders.cancel, { params: { id: order.id } });
    assert.equal(status, 409);
  });

  test('an order whose goods have gone cannot be cancelled either', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    await packOrder(order);
    await run(fulfilment.dispatch, { params: { id: order.id }, body: {} });

    const { status, body } = await run(orders.cancel, { params: { id: order.id } });
    assert.equal(status, 409);
    assert.match(body.message, /sales return/);
  });
});

describe('a counter sale is unaffected', () => {
  test('an invoice with no order behind it deducts exactly as it always did', async () => {
    const { body: invoice } = await run(invoices.createInvoice, {
      body: {
        customerId: customer.id,
        invoiceDate: '2026-08-22',
        paymentMethod: 'Cash',
        items: [{ productId: widget.id, quantity: 4, rate: 100, gstPercent: 18 }],
      },
    });

    assert.equal(invoice.salesOrderId, null, 'no order, no link');
    assert.equal((await balance()).stock, 96);
    assert.equal(await ledgerFor(invoice.id), 1);
  });

  test('selling more than is on the shelf is still refused', async () => {
    await assert.rejects(
      () => run(invoices.createInvoice, {
        body: {
          customerId: customer.id,
          invoiceDate: '2026-08-22',
          paymentMethod: 'Cash',
          items: [{ productId: widget.id, quantity: 500, rate: 100, gstPercent: 18 }],
        },
      }),
      /Insufficient stock/,
    );
    assert.equal((await balance()).stock, 100, 'the refusal moved nothing');
  });
});

describe('the invoice records which order it came from', () => {
  test('the link and the printed order number agree', async () => {
    const order = await placeOrder(10);
    await run(orders.confirm, { params: { id: order.id } });
    const { body: invoice } = await run(invoices.invoiceFromSalesOrder, { params: { id: order.id } });

    const saved = await Invoice.findByPk(invoice.id);
    assert.equal(saved.salesOrderId, order.id);
    assert.equal(saved.orderNumber, order.orderNumber);
  });
});
