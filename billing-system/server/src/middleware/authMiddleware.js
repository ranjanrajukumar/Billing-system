import jwt from 'jsonwebtoken';
import { User, Role } from '../models/index.js';
import { setContextUser } from '../utils/requestContext.js';
import { menusForRole } from '../config/menu.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id, { include: Role });
    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid user' });

    req.user = { 
      id: user.id, 
      name: user.name, 
      email: user.email, 
      mobile: user.mobile, 
      role: user.Role?.name,
      profileImagePath: user.profileImagePath,
      profileImageUrl: user.profileImageUrl,
      // Needed by resolveBranch to pin this user to their own branch.
      branchId: user.branchId,
      permissions: user.Role?.permissions || {},
      menus: menusForRole(user.Role)
    };
    // Attribute any database writes in this request to the caller.
    setContextUser(req.user);
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role === 'Admin') return next();
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    return next();
  };
}

const ACTION_BY_METHOD = { GET: 'view', HEAD: 'view', POST: 'create', PUT: 'edit', PATCH: 'edit', DELETE: 'delete' };

/**
 * Enforces the per-role permission matrix stored on the Role record, e.g.
 * `requirePermission('purchases')` checks permissions.purchases.create on POST.
 * A role with no matrix entry at all keeps its existing role-name access, so
 * this can be added to a route without locking out roles that predate it.
 */
export function requirePermission(module) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role === 'Admin') return next();

    const matrix = req.user.permissions || {};
    if (!matrix || Object.keys(matrix).length === 0) return next();

    const action = ACTION_BY_METHOD[req.method] || 'view';
    if (matrix[module]?.[action]) return next();

    return res.status(403).json({ message: `Forbidden: you cannot ${action} ${module}` });
  };
}
