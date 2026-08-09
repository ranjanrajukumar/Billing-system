import { runWithContext } from '../utils/requestContext.js';

/**
 * Opens an async-local scope for each request so audit hooks can attribute
 * database changes to the user who caused them.
 */
export function requestContext(req, _res, next) {
  runWithContext({
    userId: null,
    userName: null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
    method: req.method,
    path: req.originalUrl,
  }, () => next());
}
