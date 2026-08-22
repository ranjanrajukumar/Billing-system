import { sequelize, Branch, Product } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { stockByBranch, transferStock } from './stock.service.js';

/**
 * Stock seen per location.
 *
 * These two lived on the branch controller, which put platform code in the
 * business of moving stock. They are inventory operations that happen to be
 * addressed under `/branches` — a location is where the question is asked, not
 * what the question is about.
 *
 * The URLs are unchanged, because breaking them would be a change to the API
 * for no reason the caller could see. `routes/index.js` mounts these ahead of
 * the branch router; wiring modules together is the composition root's job, and
 * the only place allowed to know about all of them.
 */

/** Per-branch quantities for one product. */
export const productStock = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.productId, detstatus: false } });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const rows = await stockByBranch(product.id);
  const branches = await Branch.findAll({ where: { detstatus: false } });
  const byId = new Map(branches.map((b) => [b.id, b]));

  res.json({
    productId: product.id,
    productName: product.productName,
    total: Number(product.stock || 0),
    branches: rows.map((row) => ({
      branchId: Number(row.branchId),
      branchName: byId.get(Number(row.branchId))?.branchName || 'Unknown',
      stock: Number(row.stock || 0),
    })),
  });
});

/** Moves stock straight from one location to another. */
export const transfer = asyncHandler(async (req, res) => {
  await sequelize.transaction(async (transaction) => {
    await transferStock({
      productId: req.body.productId,
      fromBranchId: req.body.fromBranchId,
      toBranchId: req.body.toBranchId,
      quantity: Number(req.body.quantity),
      transaction,
      userId: req.user?.id,
    });
  });
  res.status(201).json({ message: 'Stock transferred' });
});
