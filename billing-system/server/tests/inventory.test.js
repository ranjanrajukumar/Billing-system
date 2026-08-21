/**
 * The inventory engine, exercised against both scenarios it has to serve:
 * packaged sizes that are counted, and loose stock that is measured.
 *
 * Runs against a throwaway in-memory SQLite database, created and destroyed by
 * the test. It must never be pointed at a real one — these tests deliberately
 * sell stock down to zero and drive quantities negative to prove they are
 * refused, and doing that to a live shop's balances would be indistinguishable
 * from a bug.
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
import test, { before, after, describe } from 'node:test';

// Imported after the environment is set, or the models would connect to
// whatever the developer's .env points at — which is the live database.
const models = await import('../src/models/index.js');
const engine = await import('../src/services/inventoryEngine.service.js');
const uom = await import('../src/services/uom.service.js');
const containers = await import('../src/services/container.service.js');
const stock = await import('../src/services/stock.service.js');

const {
  sequelize, Branch, Product, ProductUom, ProductVariant, StockOwner, StockMovement,
} = models;

/** Base unit is the gram, so every quantity below is an exact integer. */
const GRAM = 'G';

let branch;
let otherBranch;
let seed;          // Bulk + packaged
let pouch100;
let pouch250;
let otherSeed;     // Same unit names, different conversions

before(async () => {
  await sequelize.sync({ force: true });

  // The house owner is row 1 by convention throughout the system — the goods
  // the business owns, as opposed to a 3PL client's.
  await StockOwner.create({ id: 1, ownerName: 'House', ownerCode: 'HOUSE', isHouse: true });

  branch = await Branch.create({ branchName: 'Mumbai Store 01', branchCode: 'MUM01', locationType: 'Branch' });
  otherBranch = await Branch.create({ branchName: 'Pune Store', branchCode: 'PUN01', locationType: 'Branch' });

  seed = await Product.create({
    productName: 'Cauliflower Seeds',
    stockMode: 'Both',
    baseUnitCode: GRAM,
    primaryUnit: GRAM,
    allowCustomQty: true,
    purchasePrice: 2,
    sellingPrice: 4,
  });

  // Per-product conversions. The bucket is 10kg *for this product*.
  await ProductUom.bulkCreate([
    { productId: seed.id, unitCode: 'G', factorToBase: 1, isBase: true, isQuickPick: true, displayOrder: 1 },
    { productId: seed.id, unitCode: 'KG', factorToBase: 1000, isQuickPick: true, displayOrder: 2 },
    { productId: seed.id, unitCode: 'BUCKET', factorToBase: 10000, canSell: false, displayOrder: 3 },
  ]);

  [pouch100, pouch250] = await ProductVariant.bulkCreate([
    { productId: seed.id, variantName: '100g', sku: 'CS-100', barcode: '8901000000101', packSize: 100, packUnitCode: GRAM, sellingPrice: 45 },
    { productId: seed.id, variantName: '250g', sku: 'CS-250', barcode: '8901000000250', packSize: 250, packUnitCode: GRAM, sellingPrice: 100 },
  ], { returning: true });

  // A second product whose bucket is a different size, to prove the conversion
  // is not attached to the word "bucket".
  otherSeed = await Product.create({
    productName: 'Tomato Seeds', stockMode: 'Bulk', baseUnitCode: GRAM, primaryUnit: GRAM,
  });
  await ProductUom.bulkCreate([
    { productId: otherSeed.id, unitCode: 'G', factorToBase: 1, isBase: true },
    { productId: otherSeed.id, unitCode: 'BUCKET', factorToBase: 5000, canSell: false },
  ]);
});

after(async () => {
  await sequelize.close();
});

const bulkOf = async (product, at = branch) => stock.getBranchStock(product.id, at.id, null, 1, 0);
const packsOf = async (variant, at = branch) => stock.getBranchStock(seed.id, at.id, null, 1, variant.id);

describe('unit conversion', () => {
  test('1 kg is 1000 g', async () => {
    const result = await uom.toBaseQty({ product: seed, unitCode: 'KG', quantity: 1 });
    assert.equal(result.baseQty, 1000);
    assert.equal(result.baseUnit, GRAM);
  });

  test('1 bucket is 10 kg for this product', async () => {
    const result = await uom.toBaseQty({ product: seed, unitCode: 'BUCKET', quantity: 1 });
    assert.equal(result.baseQty, 10000);
  });

  test('the same unit name converts differently for a different product', async () => {
    const ours = await uom.toBaseQty({ product: seed, unitCode: 'BUCKET', quantity: 1 });
    const theirs = await uom.toBaseQty({ product: otherSeed, unitCode: 'BUCKET', quantity: 1 });
    assert.equal(ours.baseQty, 10000);
    assert.equal(theirs.baseQty, 5000);
  });

  test('an unknown unit is refused rather than guessed', async () => {
    await assert.rejects(
      () => uom.toBaseQty({ product: seed, unitCode: 'BARREL', quantity: 1 }),
      /not a unit configured/,
    );
  });

  test('a purchase-only unit cannot be sold', async () => {
    await assert.rejects(
      () => uom.toBaseQty({ product: seed, unitCode: 'BUCKET', quantity: 1, intent: 'sell' }),
      /not a selling unit/,
    );
  });

  test('base units read back as a human quantity', async () => {
    const readable = await uom.fromBaseQty({ product: seed, baseQty: 8890 });
    assert.equal(readable.baseQty, 8890);
    assert.equal(readable.label, '8.89 KG');
  });
});

describe('bulk stock: purchase in one unit, sell in another', () => {
  test('receiving 5 buckets adds 50,000 g', async () => {
    const result = await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 5, unitCode: 'BUCKET',
      direction: 'in', movementType: 'Purchase',
    });
    assert.equal(result.baseQty, 50000);
    assert.equal(await bulkOf(seed), 50000);
  });

  test('selling 1 kg deducts exactly 1,000 g', async () => {
    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 1, unitCode: 'KG',
      direction: 'out', movementType: 'Sale',
    });
    assert.equal(await bulkOf(seed), 49000);
  });

  test('selling 100 g deducts exactly 100 g', async () => {
    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 100, unitCode: 'G',
      direction: 'out', movementType: 'Sale',
    });
    assert.equal(await bulkOf(seed), 48900);
  });

  test('selling 10 g deducts exactly 10 g', async () => {
    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 10, unitCode: 'G',
      direction: 'out', movementType: 'Sale',
    });
    // The figure the specification asks for, reached by the stated route.
    assert.equal(await bulkOf(seed), 48890);
  });

  test('a fractional quantity is not rounded away', async () => {
    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 0.5, unitCode: 'G',
      direction: 'out', movementType: 'Sale',
    });
    assert.equal(await bulkOf(seed), 48889.5);
    // Put it back so later tests read round numbers.
    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 0.5, unitCode: 'G',
      direction: 'in', movementType: 'Adjustment In',
    });
    assert.equal(await bulkOf(seed), 48890);
  });
});

describe('packaged stock stays separate from bulk', () => {
  test('receiving pouches does not touch loose stock', async () => {
    const looseBefore = await bulkOf(seed);

    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 250, variantId: pouch100.id,
      direction: 'in', movementType: 'Purchase',
    });
    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 120, variantId: pouch250.id,
      direction: 'in', movementType: 'Purchase',
    });

    assert.equal(await packsOf(pouch100), 250);
    assert.equal(await packsOf(pouch250), 120);
    assert.equal(await bulkOf(seed), looseBefore, 'loose stock must be untouched');
  });

  test('selling two 100g packs reduces only that size', async () => {
    const looseBefore = await bulkOf(seed);

    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 2, variantId: pouch100.id,
      direction: 'out', movementType: 'Sale',
    });

    assert.equal(await packsOf(pouch100), 248, '250 packs less 2 is 248 packs');
    assert.equal(await packsOf(pouch250), 120, 'the other size is unaffected');
    assert.equal(await bulkOf(seed), looseBefore, 'loose stock is unaffected');
  });

  test('a pack size from another product is refused', async () => {
    await assert.rejects(
      () => engine.applyMovement({
        productId: otherSeed.id, branchId: branch.id, quantity: 1,
        variantId: pouch100.id, direction: 'out',
      }),
      /does not belong to this product/,
    );
  });

  test('the snapshot reports both worlds without blending them', async () => {
    const snapshot = await engine.inventorySnapshot({ productId: seed.id, branchId: branch.id });
    assert.equal(snapshot.bulk.stock, 48890);
    assert.equal(snapshot.bulk.label, '48.89 KG');
    const sizes = Object.fromEntries(snapshot.packaged.map((row) => [row.variantName, row.stock]));
    assert.equal(sizes['100g'], 248);
    assert.equal(sizes['250g'], 120);
  });
});

describe('availability', () => {
  test('selling more than exists is refused', async () => {
    const before = await bulkOf(seed);
    await assert.rejects(
      () => engine.applyMovement({
        productId: seed.id, branchId: branch.id, quantity: 999, unitCode: 'KG',
        direction: 'out', movementType: 'Sale',
      }),
      /Insufficient stock/,
    );
    assert.equal(await bulkOf(seed), before, 'a refused sale must not move stock');
  });

  test('a refused packaged sale leaves the pack count alone', async () => {
    const before = await packsOf(pouch250);
    await assert.rejects(
      () => engine.applyMovement({
        productId: seed.id, branchId: branch.id, quantity: 5000, variantId: pouch250.id,
        direction: 'out', movementType: 'Sale',
      }),
      /Insufficient stock/,
    );
    assert.equal(await packsOf(pouch250), before);
  });
});

describe('concurrency', () => {
  test('simultaneous sales of the last stock cannot both succeed', async () => {
    const product = await Product.create({
      productName: 'Contended Line', stockMode: 'Bulk', baseUnitCode: GRAM, primaryUnit: GRAM,
    });
    await ProductUom.create({ productId: product.id, unitCode: 'G', factorToBase: 1, isBase: true });

    await engine.applyMovement({
      productId: product.id, branchId: branch.id, quantity: 100, unitCode: 'G',
      direction: 'in', movementType: 'Purchase',
    });

    // Ten tills each trying to take 20 from a shelf holding 100.
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => engine.applyMovement({
        productId: product.id, branchId: branch.id, quantity: 20, unitCode: 'G',
        direction: 'out', movementType: 'Sale',
      })),
    );

    const succeeded = attempts.filter((attempt) => attempt.status === 'fulfilled').length;
    const remaining = await stock.getBranchStock(product.id, branch.id, null, 1, 0);

    // However the race resolves, the books must balance and stock must not go
    // negative: what is left is exactly what was not sold.
    assert.equal(remaining, 100 - succeeded * 20, 'balance must match the sales that succeeded');
    assert.ok(remaining >= 0, 'stock must never go negative');
    assert.ok(succeeded <= 5, 'at most five sales of 20 can come out of 100');
  });
});

describe('transfers', () => {
  test('stock leaves the source and arrives at the destination', async () => {
    const fromBefore = await bulkOf(seed);
    const toBefore = await bulkOf(seed, otherBranch);

    const result = await engine.transferBetweenLocations({
      productId: seed.id, fromBranchId: branch.id, toBranchId: otherBranch.id,
      quantity: 1, unitCode: 'KG',
    });

    assert.equal(result.baseQty, 1000);
    assert.equal(await bulkOf(seed), fromBefore - 1000);
    assert.equal(await bulkOf(seed, otherBranch), toBefore + 1000);
  });

  test('a transfer to the same location is refused', async () => {
    await assert.rejects(
      () => engine.transferBetweenLocations({
        productId: seed.id, fromBranchId: branch.id, toBranchId: branch.id, quantity: 1, unitCode: 'KG',
      }),
      /must be different locations/,
    );
  });

  test('a transfer that cannot be sourced moves nothing at either end', async () => {
    const fromBefore = await bulkOf(seed, otherBranch);
    const toBefore = await bulkOf(seed);

    await assert.rejects(
      () => engine.transferBetweenLocations({
        productId: seed.id, fromBranchId: otherBranch.id, toBranchId: branch.id,
        quantity: 500, unitCode: 'KG',
      }),
      /Insufficient stock/,
    );

    assert.equal(await bulkOf(seed, otherBranch), fromBefore, 'source unchanged');
    assert.equal(await bulkOf(seed), toBefore, 'destination unchanged — no half-transfer');
  });
});

describe('returns and adjustments', () => {
  test('a return restores the exact quantity', async () => {
    const before = await bulkOf(seed);
    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: 250, unitCode: 'G',
      direction: 'in', movementType: 'Sales Return',
    });
    assert.equal(await bulkOf(seed), before + 250);
  });

  test('a count shortfall is posted as an adjustment', async () => {
    const counted = 40000;
    const before = await bulkOf(seed);
    const difference = counted - before;

    await engine.applyMovement({
      productId: seed.id, branchId: branch.id, quantity: Math.abs(difference), unitCode: 'G',
      direction: difference > 0 ? 'in' : 'out',
      movementType: difference > 0 ? 'Adjustment In' : 'Adjustment Out',
      notes: 'Physical count',
    });

    assert.equal(await bulkOf(seed), counted);
  });
});

describe('repackaging bridges the two balances', () => {
  test('filling pouches moves substance from loose to packed, conserving it', async () => {
    const looseBefore = await bulkOf(seed);
    const packsBefore = await packsOf(pouch100);

    const result = await engine.repackage({
      productId: seed.id, branchId: branch.id, variantId: pouch100.id, packCount: 10,
    });

    assert.equal(result.looseQty, 1000, '10 pouches of 100g is 1,000g');
    assert.equal(await bulkOf(seed), looseBefore - 1000);
    assert.equal(await packsOf(pouch100), packsBefore + 10);
  });

  test('opening packs puts the substance back', async () => {
    const looseBefore = await bulkOf(seed);
    const packsBefore = await packsOf(pouch100);

    await engine.repackage({
      productId: seed.id, branchId: branch.id, variantId: pouch100.id, packCount: 4, toPacks: false,
    });

    assert.equal(await bulkOf(seed), looseBefore + 400);
    assert.equal(await packsOf(pouch100), packsBefore - 4);
  });
});

describe('containers', () => {
  let drum;
  let tracked;

  before(async () => {
    tracked = await Product.create({
      productName: 'Groundnut Oil', stockMode: 'Bulk', baseUnitCode: 'ML',
      primaryUnit: 'ML', trackContainers: true,
    });
    await ProductUom.bulkCreate([
      { productId: tracked.id, unitCode: 'ML', factorToBase: 1, isBase: true },
      { productId: tracked.id, unitCode: 'L', factorToBase: 1000 },
      { productId: tracked.id, unitCode: 'DRUM', factorToBase: 15000, canSell: false },
    ]);

    await engine.applyMovement({
      productId: tracked.id, branchId: branch.id, quantity: 1, unitCode: 'DRUM',
      direction: 'in', movementType: 'Purchase',
    });
    drum = await containers.receiveContainer({
      productId: tracked.id, branchId: branch.id, containerCode: 'DRUM-001',
      containerType: 'Drum', capacityQty: 15000,
    });
  });

  test('a received container starts sealed and full', () => {
    assert.equal(drum.status, 'Sealed');
    assert.equal(Number(drum.remainingQty), 15000);
  });

  test('a sealed container cannot be drawn from', async () => {
    await assert.rejects(
      () => engine.applyMovement({
        productId: tracked.id, branchId: branch.id, quantity: 1, unitCode: 'L',
        direction: 'out', movementType: 'Sale',
      }),
      /Open another container first/,
    );
  });

  test('opening does not change the quantity', async () => {
    await containers.openContainer({ containerId: drum.id });
    const reopened = await models.ProductContainer.findByPk(drum.id);
    assert.equal(reopened.status, 'Open');
    assert.equal(Number(reopened.remainingQty), 15000);
  });

  test('selling draws down the open container and the location together', async () => {
    await engine.applyMovement({
      productId: tracked.id, branchId: branch.id, quantity: 1, unitCode: 'L',
      direction: 'out', movementType: 'Sale',
    });
    await engine.applyMovement({
      productId: tracked.id, branchId: branch.id, quantity: 100, unitCode: 'ML',
      direction: 'out', movementType: 'Sale',
    });

    const after = await models.ProductContainer.findByPk(drum.id);
    assert.equal(Number(after.remainingQty), 13900, '15,000 less 1,000 less 100');

    const reconciliation = await containers.reconcileContainers({
      productId: tracked.id, branchId: branch.id,
    });
    assert.ok(reconciliation.agrees, 'vessel detail must agree with the location balance');
  });

  test('a duplicate container code at the same location is refused', async () => {
    await assert.rejects(
      () => containers.receiveContainer({
        productId: tracked.id, branchId: branch.id, containerCode: 'DRUM-001',
        capacityQty: 15000,
      }),
      /already exists/,
    );
  });
});

describe('the ledger explains every balance', () => {
  test('no movement happens without a ledger row', async () => {
    const product = await Product.create({
      productName: 'Ledger Probe', stockMode: 'Bulk', baseUnitCode: GRAM, primaryUnit: GRAM,
    });
    await ProductUom.create({ productId: product.id, unitCode: 'G', factorToBase: 1, isBase: true });

    await engine.applyMovement({
      productId: product.id, branchId: branch.id, quantity: 500, unitCode: 'G',
      direction: 'in', movementType: 'Purchase',
    });
    await engine.applyMovement({
      productId: product.id, branchId: branch.id, quantity: 125, unitCode: 'G',
      direction: 'out', movementType: 'Sale',
    });

    const rows = await StockMovement.findAll({
      where: { productId: product.id, branchId: branch.id },
      order: [['id', 'ASC']],
    });

    assert.equal(rows.length, 2);
    // The ledger must reconstruct the balance without reading the balance.
    const net = rows.reduce((total, row) => total + Number(row.quantity), 0);
    assert.equal(net, 375);
    assert.equal(await stock.getBranchStock(product.id, branch.id, null, 1, 0), 375);
    // And each row must carry the balance either side of itself.
    assert.equal(Number(rows[0].previousQuantity), 0);
    assert.equal(Number(rows[0].currentQuantity), 500);
    assert.equal(Number(rows[1].currentQuantity), 375);
  });

  test('a movement records which balance it touched', async () => {
    const rows = await StockMovement.findAll({
      where: { productId: seed.id, branchId: branch.id },
    });
    assert.ok(rows.some((row) => Number(row.variantId) === 0), 'loose movements recorded');
    assert.ok(rows.some((row) => Number(row.variantId) === pouch100.id), 'packaged movements recorded');
  });
});
