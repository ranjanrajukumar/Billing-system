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

  res.status(status).json({
    message,
    errors: error.errors || undefined,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
  });
}
