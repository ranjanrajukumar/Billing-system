import { getContext } from '../utils/requestContext.js';

// Never write these values into the log.
const REDACTED_FIELDS = new Set(['passwordHash', 'resetToken', 'resetTokenExpiresAt']);

// Image bytes and bookkeeping columns would drown the log without adding meaning.
const IGNORED_FIELDS = new Set([
  'imageData', 'logoData', 'profileImageData',
  'addondt', 'editondt', 'updatedAt', 'createdAt',
  'authlstedit',
]);

// Logging the log would recurse forever.
const IGNORED_MODELS = new Set(['AuditLog']);

// First match becomes the human-readable label for a record.
const LABEL_FIELDS = [
  'invoiceNumber', 'orderNumber', 'quotationNumber', 'challanNumber', 'returnNumber',
  'purchaseNumber', 'productName', 'customerName', 'supplierName', 'templateName',
  'name', 'email', 'code',
];

const MAX_VALUE_LENGTH = 500;

function serialize(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return `<${value.length} bytes>`;
  if (value instanceof Date) return value.toISOString();
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

function labelFor(instance) {
  for (const field of LABEL_FIELDS) {
    const value = instance?.get?.(field);
    if (value) return String(value);
  }
  return instance?.id != null ? `#${instance.id}` : '';
}

function snapshot(instance) {
  const values = instance?.dataValues || {};
  const result = {};
  for (const [field, value] of Object.entries(values)) {
    if (IGNORED_FIELDS.has(field)) continue;
    result[field] = REDACTED_FIELDS.has(field) ? '<redacted>' : serialize(value);
  }
  return result;
}

function diff(instance) {
  const changed = instance.changed() || [];
  const result = {};
  for (const field of changed) {
    if (IGNORED_FIELDS.has(field)) continue;
    if (REDACTED_FIELDS.has(field)) {
      result[field] = { from: '<redacted>', to: '<redacted>' };
      continue;
    }
    result[field] = { from: serialize(instance.previous(field)), to: serialize(instance.get(field)) };
  }
  return result;
}

/**
 * Set while the schema is being migrated and the defaults seeded.
 *
 * The audit log records what people did. Boot-time seeding is not that: it
 * would write the same "Created Role Admin" lines on every restart, and because
 * audit writes are deliberately un-awaited and untransacted they also race the
 * seeding transactions they are describing — which on SQLite, with its single
 * writer, is an outright lock error.
 */
let suppressed = false;

/** Runs `work` with audit logging turned off, restoring it afterwards. */
export async function withoutAudit(work) {
  suppressed = true;
  try {
    return await work();
  } finally {
    suppressed = false;
  }
}

/**
 * Writes an audit entry. Deliberately fire-and-forget and outside any caller
 * transaction: a failure to log must never roll back or break a real operation.
 */
export function recordAudit(AuditLog, entry) {
  if (suppressed) return;
  const context = getContext() || {};
  AuditLog.create({
    userId: entry.userId ?? context.userId ?? null,
    userName: entry.userName ?? context.userName ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId != null ? String(entry.entityId) : null,
    summary: entry.summary,
    changes: entry.changes || null,
    ipAddress: context.ipAddress || null,
    userAgent: context.userAgent ? String(context.userAgent).slice(0, 255) : null,
    method: context.method || null,
    path: context.path ? String(context.path).slice(0, 255) : null,
  }).catch((error) => {
    console.warn('Audit log write failed:', error.message);
  });
}

/**
 * Registers global hooks so every model write is logged without each controller
 * having to remember to do it.
 */
export function installAuditHooks(sequelize, AuditLog) {
  const modelName = (instance) => instance?.constructor?.name || 'Unknown';

  sequelize.addHook('afterCreate', (instance) => {
    const entity = modelName(instance);
    if (IGNORED_MODELS.has(entity)) return;
    recordAudit(AuditLog, {
      action: 'Create',
      entity,
      entityId: instance.id,
      summary: `Created ${entity} ${labelFor(instance)}`.trim(),
      changes: snapshot(instance),
    });
  });

  sequelize.addHook('afterUpdate', (instance) => {
    const entity = modelName(instance);
    if (IGNORED_MODELS.has(entity)) return;

    const changes = diff(instance);
    if (!Object.keys(changes).length) return;

    // Soft deletes are updates that flip detstatus, so report them as deletions.
    const softDeleted = changes.detstatus && instance.get('detstatus') === true;
    const action = softDeleted ? 'Delete' : 'Update';
    const verb = softDeleted ? 'Deleted' : 'Updated';

    recordAudit(AuditLog, {
      action,
      entity,
      entityId: instance.id,
      summary: `${verb} ${entity} ${labelFor(instance)}`.trim(),
      changes,
    });
  });

  sequelize.addHook('afterDestroy', (instance) => {
    const entity = modelName(instance);
    if (IGNORED_MODELS.has(entity)) return;
    recordAudit(AuditLog, {
      action: 'Delete',
      entity,
      entityId: instance.id,
      summary: `Removed ${entity} ${labelFor(instance)}`.trim(),
      changes: snapshot(instance),
    });
  });
}
