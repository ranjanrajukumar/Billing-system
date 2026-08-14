import { Branch, BranchStock, Product, sequelize } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { clearBranchCache } from '../middleware/branchContext.js';
import { branchTotals, stockByBranch, transferStock } from '../services/stock.service.js';
import { locationsFor } from '../services/locationAccess.service.js';

export const listBranches = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await Branch.findAndCountAll({
    where: { detstatus: false },
    limit,
    offset,
    order: [['isDefault', 'DESC'], ['branchName', 'ASC']],
  });

  const totals = await branchTotals();
  const stockByBranchId = new Map(totals.map((row) => [Number(row.branchId), Number(row.totalStock || 0)]));

  res.json(paged(
    rows.map((branch) => ({ ...branch.toJSON(), totalStock: stockByBranchId.get(branch.id) || 0 })),
    count, page, limit,
  ));
});

export const getBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  res.json(branch);
});

export const createBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.create({ ...req.body, authadd: req.user?.id });
  // A new default demotes the previous one.
  if (branch.isDefault) {
    await Branch.update({ isDefault: false }, { where: { id: { [sequelize.Sequelize.Op.ne]: branch.id } } });
  }
  clearBranchCache();
  res.status(201).json(branch);
});

export const updateBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });

  await branch.update({ ...req.body, authlstedit: req.user?.id });
  if (req.body.isDefault) {
    await Branch.update({ isDefault: false }, { where: { id: { [sequelize.Sequelize.Op.ne]: branch.id } } });
  }
  clearBranchCache();
  res.json(branch);
});

export const removeBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  if (branch.isDefault) {
    return res.status(400).json({ message: 'Cannot delete the default branch. Make another branch default first.' });
  }

  const remaining = await BranchStock.sum('stock', { where: { branchId: branch.id } });
  if (Number(remaining || 0) > 0) {
    return res.status(409).json({
      message: `Branch still holds ${remaining} units of stock. Transfer it out before deleting.`,
    });
  }

  await branch.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  clearBranchCache();
  res.status(204).send();
});

/**
 * The locations the signed-in user may work at.
 *
 * Drives the location switcher. Distinct from the full branch list, which an
 * Admin uses to administer places they may never trade at — offering a user a
 * location they cannot write to only produces a 403 one click later.
 */
export const myLocations = asyncHandler(async (req, res) => {
  const locations = await locationsFor(req.user);
  res.json({
    locations,
    current: req.branchId,
    // An Admin may read across everything at once; a granted user works at one
    // location at a time, so the switcher hides the "all" option for them.
    canViewAll: req.user?.role === 'Admin',
  });
});

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
