import { Op } from 'sequelize';
import {
  ApprovalRequest, ApprovalRule, Branch, Expense, PurchaseOrder,
  sequelize, StockAdjustment, StockCount, StockTransfer, User,
} from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { APPROVAL_DOCUMENTS, APPROVAL_OPERATORS } from '../../models/approvalRule.model.js';
import { decide, RULE_FIELDS } from './approval.service.js';

/**
 * The approval queue and the rules behind it.
 *
 * Approving a request here only records the decision. The document's own
 * controller decides what that means for it — a stock adjustment applies its
 * quantities, a purchase order becomes orderable — because the consequences of
 * "approved" differ per document and belong with the document.
 */

/** The status a document moves to when its request is decided. */
const DOCUMENT_MODELS = {
  PurchaseOrder: { model: PurchaseOrder, approved: 'Approved', rejected: 'Rejected' },
  StockTransfer: { model: StockTransfer, approved: 'Approved', rejected: 'Rejected' },
  StockAdjustment: { model: StockAdjustment, approved: 'Pending', rejected: 'Rejected' },
  StockCount: { model: StockCount, approved: 'Pending', rejected: 'Cancelled' },
  Expense: { model: Expense, approved: 'Approved', rejected: 'Rejected' },
};

export const listRequests = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = { detstatus: false };
  if (req.query.status) where.status = req.query.status;
  if (req.query.documentType) where.documentType = req.query.documentType;
  if (req.branchScope) where.branchId = { [Op.or]: [req.branchScope, null] };

  // "Mine to decide" — what a manager opening the screen actually wants.
  if (req.query.mine === 'true' && req.user.role !== 'Admin') {
    where.approverRole = req.user.role;
  }

  const { rows, count } = await ApprovalRequest.findAndCountAll({
    where,
    include: [
      { model: ApprovalRule, attributes: ['id', 'name', 'field', 'operator', 'threshold'] },
      { model: User, as: 'requester', attributes: ['id', 'name'] },
      { model: User, as: 'decider', attributes: ['id', 'name'] },
      { model: Branch, attributes: ['id', 'branchName'] },
    ],
    limit,
    offset,
    order: [['status', 'ASC'], ['id', 'DESC']],
  });
  res.json(paged(rows, count, page, limit));
});

export const pendingCount = asyncHandler(async (req, res) => {
  const where = { status: 'Pending', detstatus: false };
  if (req.user.role !== 'Admin') where.approverRole = req.user.role;
  res.json({ pending: await ApprovalRequest.count({ where }) });
});

/** Approve or reject, and move the document's own status with it. */
async function applyDecision(req, res, approved) {
  const result = await sequelize.transaction(async (transaction) => {
    const request = await decide({
      requestId: req.params.id,
      approved,
      user: req.user,
      note: req.body.note || req.body.reason || null,
      transaction,
    });

    const target = DOCUMENT_MODELS[request.documentType];
    if (target) {
      const document = await target.model.findByPk(request.documentId, { transaction, lock: transaction.LOCK.UPDATE });
      if (document) {
        await document.update({
          status: approved ? target.approved : target.rejected,
          ...(approved && 'approvedBy' in document.dataValues
            ? { approvedBy: req.user.id, approvedAt: new Date() }
            : {}),
          authlstedit: req.user.id,
        }, { transaction });
      }
    }

    return request;
  });

  res.json(result);
}

export const approveRequest = asyncHandler((req, res) => applyDecision(req, res, true));
export const rejectRequest = asyncHandler((req, res) => applyDecision(req, res, false));

// ---- Rules ----

/** The vocabulary a rule can be written in, for the rule editor. */
export const ruleOptions = asyncHandler(async (_req, res) => {
  res.json({
    documentTypes: APPROVAL_DOCUMENTS,
    operators: APPROVAL_OPERATORS,
    fields: Object.entries(RULE_FIELDS).map(([key, label]) => ({ key, label })),
  });
});

export const listRules = asyncHandler(async (req, res) => {
  const where = { detstatus: false };
  if (req.query.documentType) where.documentType = req.query.documentType;

  const rows = await ApprovalRule.findAll({
    where,
    order: [['documentType', 'ASC'], ['priority', 'ASC']],
  });
  res.json(rows);
});

function validateRule(body) {
  if (!APPROVAL_DOCUMENTS.includes(body.documentType)) {
    throw Object.assign(new Error(`${body.documentType} is not a document that can be approved`), { status: 400 });
  }
  if (!RULE_FIELDS[body.field]) {
    throw Object.assign(new Error(`${body.field} is not a field a rule can test`), { status: 400 });
  }
  if (!APPROVAL_OPERATORS.includes(body.operator)) {
    throw Object.assign(new Error(`${body.operator} is not a valid comparison`), { status: 400 });
  }
}

export const createRule = asyncHandler(async (req, res) => {
  validateRule(req.body);
  const rule = await ApprovalRule.create({ ...req.body, authadd: req.user.id });
  res.status(201).json(rule);
});

export const updateRule = asyncHandler(async (req, res) => {
  const rule = await ApprovalRule.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!rule) return res.status(404).json({ message: 'Approval rule not found' });

  validateRule({ ...rule.toJSON(), ...req.body });
  await rule.update({ ...req.body, authlstedit: req.user.id });
  res.json(rule);
});

export const removeRule = asyncHandler(async (req, res) => {
  const rule = await ApprovalRule.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!rule) return res.status(404).json({ message: 'Approval rule not found' });

  await rule.update({ detstatus: true, authdel: req.user.id, delondt: new Date() });
  res.status(204).send();
});
