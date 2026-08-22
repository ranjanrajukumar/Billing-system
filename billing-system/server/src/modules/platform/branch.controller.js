import { Branch, BranchStock, sequelize } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { clearBranchCache } from '../../middleware/branchContext.js';
import { emit, POINTS } from './extensions.service.js';
import { locationsFor } from './locationAccess.service.js';

export const listBranches = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { rows, count } = await Branch.findAndCountAll({
    where: { detstatus: false },
    limit,
    offset,
    order: [['isDefault', 'DESC'], ['branchName', 'ASC']],
  });

  // Whatever the domains want to add to a branch row — today that is inventory
  // contributing a stock total. Platform no longer knows who answers, which is
  // the point: a branch list works whether or not stock is being tracked.
  const contributions = await emit(POINTS.BRANCH_SUMMARY, rows);
  const extrasFor = (id) => contributions.reduce(
    (merged, byBranch) => ({ ...merged, ...(byBranch?.[Number(id)] || {}) }),
    {},
  );

  res.json(paged(
    // `totalStock: 0` by default so the column still renders when nothing
    // contributed one — the client should not have to tell "no stock" apart
    // from "nobody was asked".
    rows.map((branch) => ({ ...branch.toJSON(), totalStock: 0, ...extrasFor(branch.id) })),
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

