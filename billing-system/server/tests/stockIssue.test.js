/**
 * Store issue and material return.
 *
 * The pair exists to answer one question the rest of the system cannot: what
 * left the store without being sold, and how much of it is still out. Two rules
 * hold that answer up, and both are easy to break with perfectly reasonable
 * code:
 *
 *   Nothing comes back that did not go out.
 *   Only good material returns to stock.
 *
 * A return is an inbound movement raised by whoever is at the counter, so with
 * no ceiling on it the store gets credited with material it never issued — and
 * the resulting quantity is real, the paperwork complete, and nothing about it
 * looks wrong. Most of what follows is that ceiling, pushed at from several
 * directions.
 *
 * Runs against a throwaway in-memory SQLite database, created and destroyed by
 * the test. It must never be pointed at a real one — these tests drive stock
 * and lot balances to zero to prove the arithmetic, and doing that to a live
 * store's figures would be indistinguishable from a bug.
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
const issues = await import('../src/modules/inventory/stockIssue.controller.js');
const service = await import('../src/modules/inventory/stockIssue.service.js');
const stock = await import('../src/modules/inventory/stock.service.js');

const {
  sequelize, Branch, Company, Department, Product, ProductBatch, StockOwner, User,
  StockIssueItem, StockMovement, BranchStock,
} = models;

let branch;
let department;
let widget;

const USER = { id: 1, name: 'Storekeeper' };

/** Drives an express handler and returns what it answered; rejections surface. */
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

/** What the shelf holds. */
async function onShelf() {
  const row = await BranchStock.findOne({
    where: { productId: widget.id, branchId: branch.id, ownerId: 1 },
  });
  return Number(row?.stock || 0);
}

/** What the lots add up to. Should always equal the shelf. */
async function inLots() {
  const total = await ProductBatch.sum('quantity', {
    where: { productId: widget.id, branchId: branch.id, detstatus: false },
  });
  return Number(total || 0);
}

const movementsOfType = (type) => StockMovement.count({
  where: { productId: widget.id, movementType: type },
});

/** A Draft issue of `quantity`, to the maintenance department by default. */
async function draftIssue(quantity = 12, overrides = {}) {
  const { body } = await run(issues.createIssue, {
    body: {
      issueDate: '2026-08-22',
      purpose: 'Maintenance',
      departmentId: department.id,
      jobNumber: 'JOB-4471',
      items: [{ productId: widget.id, quantity }],
      ...overrides,
    },
  });
  return body;
}

/** A posted issue, ready to be returned against. */
async function postedIssue(quantity = 12, overrides = {}) {
  const draft = await draftIssue(quantity, overrides);
  const { body } = await run(issues.postIssue, { params: { id: draft.id } });
  return body;
}

before(async () => {
  await sequelize.sync({ force: true });

  await StockOwner.create({ id: 1, ownerName: 'House', ownerCode: 'HOUSE', isHouse: true });
  await Company.create({ name: 'Test Works', state: 'Maharashtra', businessMode: 'Advanced' });
  await User.create({
    id: USER.id, name: USER.name, email: 'store@example.test', passwordHash: 'not-a-real-hash',
  });

  branch = await Branch.create({
    branchName: 'Works Store', branchCode: 'WKS01', locationType: 'Warehouse',
  });
  department = await Department.create({ name: 'Maintenance', code: 'MNT' });
});

after(async () => {
  await sequelize.close();
});

// A clean product and a clean shelf per test: several of these drive the same
// balance to zero from different directions, and material left outstanding by
// the previous test would look exactly like the bug being tested for.
beforeEach(async () => {
  widget = await Product.create({
    productName: `Bearing ${Date.now()}${Math.random()}`,
    primaryUnit: 'PCS', purchasePrice: 50, sellingPrice: 90,
  });
  await stock.setBranchStock({
    productId: widget.id, branchId: branch.id, quantity: 100,
    transaction: null, userId: USER.id,
  });
});

describe('a draft has not issued anything', () => {
  test('saving a voucher moves no stock', async () => {
    const draft = await draftIssue(12);
    assert.equal(draft.status, 'Draft');
    assert.equal(await onShelf(), 100, 'a draft is paperwork, not a movement');
    assert.equal(await movementsOfType('Issue'), 0);
  });

  test('an issue with nobody to issue it to is refused', async () => {
    await assert.rejects(
      () => run(issues.createIssue, {
        body: { issueDate: '2026-08-22', items: [{ productId: widget.id, quantity: 5 }] },
      }),
      /who the material is going to/,
    );
  });

  test('a draft can be cancelled outright', async () => {
    const draft = await draftIssue(12);
    const { status } = await run(issues.removeIssue, { params: { id: draft.id } });
    assert.equal(status, 200);
    assert.equal(await onShelf(), 100);
  });
});

describe('issuing takes the material out', () => {
  test('posting deducts the stock and says so in the ledger', async () => {
    const issue = await postedIssue(12);

    assert.equal(issue.status, 'Issued');
    assert.equal(await onShelf(), 88);
    assert.equal(await movementsOfType('Issue'), 1, 'recorded as an issue, not an adjustment');
    assert.equal(issue.progress.outstanding, 12);
  });

  test('posting twice is refused', async () => {
    const issue = await postedIssue(12);
    await assert.rejects(
      () => run(issues.postIssue, { params: { id: issue.id } }),
      /already Issued/,
    );
    assert.equal(await onShelf(), 88, 'the refusal moved nothing');
  });

  test('a posted voucher cannot be deleted', async () => {
    const issue = await postedIssue(12);
    await assert.rejects(
      () => run(issues.removeIssue, { params: { id: issue.id } }),
      /Return the material against it instead/,
    );
  });

  test('issuing more than the store holds is refused', async () => {
    const draft = await draftIssue(500);
    await assert.rejects(
      () => run(issues.postIssue, { params: { id: draft.id } }),
      /Insufficient stock/,
    );
    assert.equal(await onShelf(), 100);
  });

  test('a consumable is closed the moment it is issued', async () => {
    // Nothing is coming back, so leaving it Issued would park it on the
    // outstanding report for ever.
    const issue = await postedIssue(12, { returnable: false, purpose: 'Consumption' });
    assert.equal(issue.status, 'Closed');
    assert.equal(await onShelf(), 88, 'it still left the store');

    const { body } = await run(issues.outstandingIssues, {});
    assert.equal(
      body.data.some((r) => r.id === issue.id), false,
      'and it is not something anybody is waiting for',
    );
  });
});

describe('returning material', () => {
  test('good material goes back on the shelf', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    const { body: document } = await run(issues.createReturn, {
      params: { id: issue.id },
      body: { returnDate: '2026-08-25', items: [{ issueItemId: line.id, quantity: 5 }] },
    });
    assert.equal(await onShelf(), 88, 'a draft return has not put anything back yet');

    await run(issues.postReturn, { params: { id: document.id } });

    assert.equal(await onShelf(), 93);
    assert.equal(await movementsOfType('Issue Return'), 1);

    const { body: after } = await run(issues.getIssue, { params: { id: issue.id } });
    assert.equal(after.progress.returned, 5);
    assert.equal(after.progress.outstanding, 7);
    assert.equal(after.status, 'Issued', 'seven are still out');
  });

  test('damaged material closes the line without going back into stock', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    const { body: document } = await run(issues.createReturn, {
      params: { id: issue.id },
      body: { items: [{ issueItemId: line.id, quantity: 4, condition: 'Damaged' }] },
    });
    await run(issues.postReturn, { params: { id: document.id } });

    assert.equal(await onShelf(), 88, 'scrap is not stock — it stays out');
    assert.equal(await movementsOfType('Issue Return'), 0);

    const { body: after } = await run(issues.getIssue, { params: { id: issue.id } });
    assert.equal(after.progress.scrapped, 4);
    assert.equal(after.progress.outstanding, 8, 'but nobody is waiting for it either');
  });

  test('one return can carry both conditions', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    const { body: document } = await run(issues.createReturn, {
      params: { id: issue.id },
      body: {
        items: [
          { issueItemId: line.id, quantity: 7, condition: 'Good' },
          { issueItemId: line.id, quantity: 2, condition: 'Damaged' },
        ],
      },
    });
    await run(issues.postReturn, { params: { id: document.id } });

    assert.equal(await onShelf(), 95, 'only the seven good ones came back');
    const { body: after } = await run(issues.getIssue, { params: { id: issue.id } });
    assert.deepEqual(
      { returned: after.progress.returned, scrapped: after.progress.scrapped, outstanding: after.progress.outstanding },
      { returned: 7, scrapped: 2, outstanding: 3 },
    );
  });

  test('returning everything closes the voucher', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    const { body: document } = await run(issues.createReturn, {
      params: { id: issue.id },
      body: { items: [{ issueItemId: line.id, quantity: 12 }] },
    });
    await run(issues.postReturn, { params: { id: document.id } });

    const { body: after } = await run(issues.getIssue, { params: { id: issue.id } });
    assert.equal(after.status, 'Closed');
    assert.equal(after.progress.outstanding, 0);
    assert.equal(await onShelf(), 100, 'the store is exactly where it started');
  });

  test('a posted return cannot be deleted', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];
    const { body: document } = await run(issues.createReturn, {
      params: { id: issue.id },
      body: { items: [{ issueItemId: line.id, quantity: 5 }] },
    });
    await run(issues.postReturn, { params: { id: document.id } });

    await assert.rejects(
      () => run(issues.removeReturn, { params: { id: document.id } }),
      /already put stock back/,
    );
  });
});

describe('nothing comes back that did not go out', () => {
  test('returning more than was issued is refused', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    await assert.rejects(
      () => run(issues.createReturn, {
        params: { id: issue.id },
        body: { items: [{ issueItemId: line.id, quantity: 13 }] },
      }),
      /only 12 is still out/,
    );
    assert.equal(await onShelf(), 88, 'the refusal put nothing back');
  });

  test('two lines of one return cannot add up to more than is out', async () => {
    // Each line is individually within the outstanding figure. Checking them
    // one at a time would let both through.
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    await assert.rejects(
      () => run(issues.createReturn, {
        params: { id: issue.id },
        body: {
          items: [
            { issueItemId: line.id, quantity: 8 },
            { issueItemId: line.id, quantity: 8 },
          ],
        },
      }),
      /still out/,
    );
  });

  test('a second return cannot exceed what the first one left', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    const { body: first } = await run(issues.createReturn, {
      params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity: 9 }] },
    });
    await run(issues.postReturn, { params: { id: first.id } });

    await assert.rejects(
      () => run(issues.createReturn, {
        params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity: 4 }] },
      }),
      /only 3 is still out/,
    );
    assert.equal(await onShelf(), 97);
  });

  test('two drafts raised against the same stock cannot both post', async () => {
    // Both were valid when they were saved; only one can be true by the time
    // they are posted, and the check that matters is the one inside the lock.
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    const { body: a } = await run(issues.createReturn, {
      params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity: 8 }] },
    });
    const { body: b } = await run(issues.createReturn, {
      params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity: 8 }] },
    });

    await run(issues.postReturn, { params: { id: a.id } });
    await assert.rejects(
      () => run(issues.postReturn, { params: { id: b.id } }),
      /only 4 is still out/,
    );
    assert.equal(await onShelf(), 96, 'only the first one put anything back');
  });

  test('returning against a line from another voucher is refused', async () => {
    const mine = await postedIssue(12);
    const theirs = await postedIssue(5);

    await assert.rejects(
      () => run(issues.createReturn, {
        params: { id: mine.id },
        body: { items: [{ issueItemId: theirs.StockIssueItems[0].id, quantity: 1 }] },
      }),
      /is not on issue/,
    );
  });

  test('nothing can be returned against a draft', async () => {
    const draft = await draftIssue(12);
    await assert.rejects(
      () => run(issues.createReturn, {
        params: { id: draft.id },
        body: { items: [{ issueItemId: draft.StockIssueItems[0].id, quantity: 1 }] },
      }),
      /nothing can come back/,
    );
  });
});

describe('lots stay straight', () => {
  test('an issue spanning two lots is recorded as two lines, and returns to the right one', async () => {
    // Two lots, and an issue big enough to need both.
    await ProductBatch.bulkCreate([
      { productId: widget.id, branchId: branch.id, batchNumber: 'B-OLD', expiryDate: '2026-10-01', quantity: 40 },
      { productId: widget.id, branchId: branch.id, batchNumber: 'B-NEW', expiryDate: '2027-04-01', quantity: 60 },
    ]);
    assert.equal(await inLots(), 100);

    const issue = await postedIssue(50);
    assert.equal(issue.StockIssueItems.length, 2, 'one row per lot, because that is what left');

    const [older, newer] = issue.StockIssueItems.sort((a, b) => b.quantity - a.quantity);
    assert.equal(Number(older.quantity), 40, 'the lot expiring first went first');
    assert.equal(Number(newer.quantity), 10);
    assert.equal(await onShelf(), 50);
    assert.equal(await inLots(), 50, 'the lots agree with the shelf');

    // Ten of the older lot come back.
    const { body: document } = await run(issues.createReturn, {
      params: { id: issue.id }, body: { items: [{ issueItemId: older.id, quantity: 10 }] },
    });
    await run(issues.postReturn, { params: { id: document.id } });

    assert.equal(await onShelf(), 60);
    assert.equal(await inLots(), 60, 'still agreeing, which is what the audit checks');

    const restored = await ProductBatch.findByPk(older.batchId);
    assert.equal(Number(restored.quantity), 10, 'back in the lot it came out of');
  });
});

describe('closing off what is not coming back', () => {
  test('the remainder is written off, and no stock moves', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    const { body: document } = await run(issues.createReturn, {
      params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity: 4 }] },
    });
    await run(issues.postReturn, { params: { id: document.id } });
    const shelf = await onShelf();

    const { body: closed } = await run(issues.closeIssue, {
      params: { id: issue.id }, body: { remarks: 'Used on the job' },
    });

    assert.equal(closed.status, 'Closed');
    assert.equal(closed.progress.outstanding, 0);
    assert.equal(closed.progress.consumed, 8, 'the eight that were used are accounted for');
    assert.equal(closed.progress.scrapped, 0, 'and not confused with damaged goods');
    assert.equal(await onShelf(), shelf, 'closing is bookkeeping, not a movement');

    // Nothing came back on a return note for those eight, so the drift check
    // must not treat the close-off as an unexplained figure.
    assert.deepEqual(await service.reconcileIssue(issue.id), []);
  });

  test('a closed voucher takes no more returns', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];
    await run(issues.closeIssue, { params: { id: issue.id } });

    await assert.rejects(
      () => run(issues.createReturn, {
        params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity: 1 }] },
      }),
      /still out/,
    );
  });
});

describe('the outstanding figures agree with the documents', () => {
  test('reconciling an issue after several returns finds no drift', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    for (const [quantity, condition] of [[3, 'Good'], [2, 'Damaged'], [4, 'Good']]) {
      const { body: document } = await run(issues.createReturn, {
        params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity, condition }] },
      });
      await run(issues.postReturn, { params: { id: document.id } });
    }

    assert.deepEqual(await service.reconcileIssue(issue.id), [],
      'the stored outstanding figure is what the return documents say');

    const stored = await StockIssueItem.findByPk(line.id);
    assert.equal(Number(stored.returnedQty), 7);
    assert.equal(Number(stored.scrappedQty), 2);
    assert.equal(await onShelf(), 95, 'only the good seven came back');
  });

  test('a cancelled draft return does not count against the issue', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];

    const { body: document } = await run(issues.createReturn, {
      params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity: 12 }] },
    });
    await run(issues.removeReturn, { params: { id: document.id } });

    // The whole quantity is available to return again.
    const { body: second } = await run(issues.createReturn, {
      params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity: 12 }] },
    });
    const { status } = await run(issues.postReturn, { params: { id: second.id } });
    assert.equal(status, 200);
    assert.equal(await onShelf(), 100);
  });
});

describe('the outstanding report', () => {
  test('lists what is still out, with how long it has been out', async () => {
    const issue = await postedIssue(12, { returnable: true, purpose: 'Loan' });

    const { body } = await run(issues.outstandingIssues, {});
    const row = body.data.find((r) => r.id === issue.id);

    assert.ok(row, 'the voucher is on the report');
    assert.equal(row.progress.outstanding, 12);
    assert.equal(typeof row.daysOut, 'number');
    assert.equal(body.totals.units >= 12, true);
  });

  test('a voucher drops off it once everything is settled', async () => {
    const issue = await postedIssue(12);
    const line = issue.StockIssueItems[0];
    const { body: document } = await run(issues.createReturn, {
      params: { id: issue.id }, body: { items: [{ issueItemId: line.id, quantity: 12 }] },
    });
    await run(issues.postReturn, { params: { id: document.id } });

    const { body } = await run(issues.outstandingIssues, {});
    assert.equal(body.data.some((r) => r.id === issue.id), false);
  });
});
