// Authentication utilities for JWT and password management
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d'; // 7 day token expiry

/**
 * Generate JWT token
 */
export function generateToken(userId, email, role) {
  return jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Verify JWT token and return decoded data
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Middleware: Check if user is authenticated
 */
export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  req.user = decoded;
  next();
}

/**
 * Middleware: Check user role
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

/**
 * Role-based permissions for different endpoints
 */
export const rolePermissions = {
  admin: ['read', 'write', 'delete', 'manage_users', 'manage_settings'],
  operator: ['read', 'write', 'respond_incidents'],
  analyst: ['read', 'analyze'],
  viewer: ['read']
};

/**
 * Check if user has permission
 */
export function hasPermission(userRole, requiredPermission) {
  const permissions = rolePermissions[userRole] || [];
  return permissions.includes(requiredPermission);
}
