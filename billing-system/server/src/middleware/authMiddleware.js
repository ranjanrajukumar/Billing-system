import jwt from 'jsonwebtoken';
import { User, Role } from '../models/index.js';

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
      permissions: user.Role?.permissions || {}
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Forbidden' });
    return next();
  };
}
