import { Op } from 'sequelize';
import { ApprovalRequest, ApprovalRule } from '../models/index.js';
import { getConfig } from './config.service.js';

/**
 * Configurable approvals.
 *
 * A document is checked against the active rules for its type; the first one it
 * trips decides who has to sign it off. Thresholds live in the database because
 * they are a business decision — ₹100,000 is a rounding error to one company
 * and a month's takings to another — so none of them appear in this file.
 */

/**
 * Fields a rule may test. A whitelist rather than free property access: a rule
 * is user-supplied configuration, and it should not be able to reach into
 * arbitrary parts of a document.
 */
export const RULE_FIELDS = {
  grandTotal: 'Document total',
  totalAmount: 'Total amount',
  amount: 'Amount',
  quantity: 'Total quantity',
  totalQuantity: 'Total quantity',
  discountPercent: 'Discount %',
  discountAmount: 'Discount amount',
  varianceQty: 'Variance quantity',
  varianceValue: 'Variance value',
};

const COMPARE = {
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '==': (a, b) => a === b,
};

/**
 * The rule a document trips, or null when it needs no approval.
 * Rules are tried in priority order, so a specific rule can be placed ahead of
 * a general one.
 */
export async function matchRule({ documentType, values, branchId = null, transaction }) {
  const { modules } = await getConfig();
  if (!modules.has('approvals')) return null;

  const rules = await ApprovalRule.findAll({
    where: {
      documentType,
      isActive: true,
      detstatus: false,
      [Op.or]: [{ branchId: null }, { branchId: branchId ?? null }],
    },
    order: [['priority', 'ASC'], ['id', 'ASC']],
    transaction,
  });

  for (const rule of rules) {
    if (!RULE_FIELDS[rule.field]) continue;
    const actual = Number(values?.[rule.field]);
    if (!Number.isFinite(actual)) continue;
    if (COMPARE[rule.operator]?.(actual, Number(rule.threshold))) return { rule, actual };
  }
  return null;
}

/**
 * Raises a sign-off request if the document trips a rule.
 * Returns the request, or null when the document may proceed unapproved.
 */
export async function requestApproval({
  documentType, documentId, documentNumber, values, branchId = null, userId = null, transaction,
}) {
  const match = await matchRule({ documentType, values, branchId, transaction });
  if (!match) return null;

  const { rule, actual } = match;
  return ApprovalRequest.create({
    documentType,
    documentId,
    documentNumber,
    ruleId: rule.id,
    branchId,
    status: 'Pending',
    amount: actual,
    approverRole: rule.approverRole,
    // Spelled out now, so the request still reads correctly if the rule changes.
    reason: `${RULE_FIELDS[rule.field]} ${actual} ${rule.operator} ${Number(rule.threshold)} — needs ${rule.approverRole} approval`,
    requestedBy: userId,
    authadd: userId,
  }, { transaction });
}

/** Whether this user may decide a given request. Admin can approve anything. */
export function canDecide(user, request) {
  if (!user) return false;
  if (user.role === 'Admin') return true;
  return !request.approverRole || request.approverRole === user.role;
}

/**
 * Records a decision. The caller applies whatever the decision means for its
 * own document — this service owns the request, not the workflow it gates.
 */
export async function decide({ requestId, approved, user, note = null, transaction }) {
  const request = await ApprovalRequest.findOne({
    where: { id: requestId, detstatus: false },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!request) throw Object.assign(new Error('Approval request not found'), { status: 404 });
  if (request.status !== 'Pending') {
    throw Object.assign(new Error(`This request was already ${request.status.toLowerCase()}`), { status: 409 });
  }
  if (!canDecide(user, request)) {
    throw Object.assign(
      new Error(`Only ${request.approverRole} may decide this request`),
      { status: 403 },
    );
  }

  await request.update({
    status: approved ? 'Approved' : 'Rejected',
    decidedBy: user.id,
    decidedAt: new Date(),
    decisionNote: note,
    authlstedit: user.id,
  }, { transaction });

  return request;
}

/** Cancels any pending request for a document, e.g. when the document is voided. */
export async function cancelFor({ documentType, documentId, userId, transaction }) {
  return ApprovalRequest.update(
    { status: 'Cancelled', decidedBy: userId, decidedAt: new Date(), authlstedit: userId },
    { where: { documentType, documentId, status: 'Pending', detstatus: false }, transaction },
  );
}

/** Whether a document is clear to proceed — approved, or never needed approval. */
export async function isCleared({ documentType, documentId, transaction }) {
  const pending = await ApprovalRequest.count({
    where: { documentType, documentId, status: 'Pending', detstatus: false },
    transaction,
  });
  if (pending > 0) return false;

  const rejected = await ApprovalRequest.count({
    where: { documentType, documentId, status: 'Rejected', detstatus: false },
    transaction,
  });
  return rejected === 0;
}
