export function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

export function errorHandler(error, _req, res, _next) {
  const status = error.status || error.statusCode || 500;
  res.status(status).json({
    message: error.message || 'Internal server error',
    errors: error.errors || undefined,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
  });
}
