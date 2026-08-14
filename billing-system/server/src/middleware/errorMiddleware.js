export function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

export function errorHandler(error, _req, res, _next) {
  let status = error.status || error.statusCode || 500;
  let message = error.message || 'Internal server error';

  // Unique indexes span soft-deleted rows, so duplicates are a client error, not a 500.
  if (error.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    const field = error.errors?.[0]?.path;
    message = field ? `A record with this ${field} already exists` : 'A record with these details already exists';
  }

  // Model validation failures are bad input, not server faults.
  if (error.name === 'SequelizeValidationError') {
    status = 400;
    message = error.errors?.[0]?.message || 'Validation failed';
  }

  // Multer surfaces upload problems (oversized file, unexpected field) as client errors.
  if (error.name === 'MulterError') {
    status = 400;
    message = error.code === 'LIMIT_FILE_SIZE' ? 'File is too large (maximum 2MB)' : error.message;
  }

  if (error.name === 'SequelizeForeignKeyConstraintError') {
    status = 409;
    message = 'This record is referenced by other data and cannot be changed';
  }

  // Two billing counters reaching for the same product at the same instant is
  // ordinary shop life, not a server fault. The database serialises them and
  // one loses its lock; that one is told to try again rather than being shown
  // a 500. The transaction has already rolled back, so a retry is safe.
  if (isLockContention(error)) {
    status = 409;
    message = 'Another counter was updating this item at the same moment. Nothing was saved — please try again.';
  }

  res.status(status).json({
    message,
    errors: error.errors || undefined,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
  });
}

/**
 * Whether an error is the database refusing a concurrent write rather than
 * something genuinely wrong. Covers MySQL deadlocks and lock-wait timeouts,
 * SQL Server deadlock victims, and SQLite's single-writer BUSY.
 */
function isLockContention(error) {
  const codes = new Set([
    'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT',   // MySQL / MariaDB
    'SQLITE_BUSY', 'SQLITE_LOCKED',               // SQLite
    '40001', '1205',                              // SQL Server deadlock victim
  ]);

  const candidates = [
    error.original?.code, error.parent?.code, error.code,
    String(error.original?.number ?? ''), String(error.parent?.number ?? ''),
  ];

  if (candidates.some((code) => code && codes.has(code))) return true;

  // Sequelize wraps a lock wait as a timeout error with the driver code nested.
  return error.name === 'SequelizeTimeoutError'
    || (error.name === 'SequelizeDatabaseError' && /deadlock|lock wait|database is locked/i.test(error.message || ''));
}
