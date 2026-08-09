import { Op, fn, col } from 'sequelize';
import { AuditLog } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = {};

  if (req.query.action) where.action = req.query.action;
  if (req.query.entity) where.entity = req.query.entity;
  if (req.query.entityId) where.entityId = String(req.query.entityId);
  if (req.query.userId) where.userId = req.query.userId;

  if (req.query.from || req.query.to) {
    where.addondt = {};
    if (req.query.from) where.addondt[Op.gte] = new Date(`${req.query.from}T00:00:00`);
    if (req.query.to) where.addondt[Op.lte] = new Date(`${req.query.to}T23:59:59`);
  }

  if (req.query.search) {
    const term = `%${req.query.search}%`;
    where[Op.or] = [
      { summary: { [Op.like]: term } },
      { userName: { [Op.like]: term } },
      { entity: { [Op.like]: term } },
    ];
  }

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    limit,
    offset,
    order: [['addondt', 'DESC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

/** Distinct values so the UI can build its filter dropdowns. */
export const auditFilters = asyncHandler(async (_req, res) => {
  const [entities, users] = await Promise.all([
    AuditLog.findAll({ attributes: [[fn('DISTINCT', col('entity')), 'entity']], order: [['entity', 'ASC']], raw: true }),
    AuditLog.findAll({
      attributes: ['userId', 'userName'],
      where: { userId: { [Op.ne]: null } },
      group: ['userId', 'userName'],
      order: [['userName', 'ASC']],
      raw: true,
    }),
  ]);

  res.json({
    entities: entities.map((row) => row.entity).filter(Boolean),
    users,
    actions: ['Create', 'Update', 'Delete', 'Login', 'LoginFailed', 'PasswordReset'],
  });
});

/** Everything that ever happened to one record. */
export const entityHistory = asyncHandler(async (req, res) => {
  const rows = await AuditLog.findAll({
    where: { entity: req.params.entity, entityId: String(req.params.entityId) },
    order: [['addondt', 'DESC'], ['id', 'DESC']],
  });
  res.json({ entity: req.params.entity, entityId: req.params.entityId, history: rows });
});
