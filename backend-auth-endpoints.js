// backend-auth-endpoints.js - Add these routes to your existing backend.js
// This file shows the auth endpoints to add to backend.js

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { sendDemoRequestNotification } from './email-service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

// Mock user database (replace with real database in production)
const users = [
  {
    id: '1',
    email: 'admin@irongate.local',
    password_hash: crypto.createHash('sha256').update('Admin@123').digest('hex'),
    full_name: 'System Admin',
    role: 'admin'
  },
  {
    id: '2',
    email: 'operator@irongate.local',
    password_hash: crypto.createHash('sha256').update('Operator@123').digest('hex'),
    full_name: 'Security Operator',
    role: 'operator'
  },
  {
    id: '3',
    email: 'analyst@irongate.local',
    password_hash: crypto.createHash('sha256').update('Analyst@123').digest('hex'),
    full_name: 'Security Analyst',
    role: 'analyst'
  },
  {
    id: '4',
    email: 'viewer@irongate.local',
    password_hash: crypto.createHash('sha256').update('Viewer@123').digest('hex'),
    full_name: 'Dashboard Viewer',
    role: 'viewer'
  }
];

const demoRequests = [];

async function findUserByEmail(email, db) {
  if (db?.isDbEnabled?.()) {
    const result = await db.query(
      'SELECT id, email, password_hash, full_name, role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    return result.rows[0] || null;
  }

  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findUserById(id, db) {
  if (db?.isDbEnabled?.()) {
    const result = await db.query(
      'SELECT id, email, password_hash, full_name, role FROM users WHERE id::text = $1 LIMIT 1',
      [String(id)]
    );
    return result.rows[0] || null;
  }

  return users.find(u => u.id === String(id)) || null;
}

async function createUser({ email, password, fullName }, db) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const safeFullName = String(fullName || '').trim();
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  if (db?.isDbEnabled?.()) {
    const existing = await findUserByEmail(normalizedEmail, db);
    if (existing) {
      throw new Error('Email is already registered');
    }

    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'viewer', 'active', NOW(), NOW())
       RETURNING id, email, full_name, role`,
      [normalizedEmail, passwordHash, safeFullName || null]
    );

    return result.rows[0];
  }

  const existing = users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (existing) {
    throw new Error('Email is already registered');
  }

  const created = {
    id: String(users.length + 1),
    email: normalizedEmail,
    password_hash: passwordHash,
    full_name: safeFullName || 'New User',
    role: 'viewer'
  };
  users.push(created);

  return {
    id: created.id,
    email: created.email,
    full_name: created.full_name,
    role: created.role
  };
}

async function storeDemoRequest({ fullName, email, company, teamSize, message }, db, ipAddress) {
  const payload = {
    fullName: String(fullName || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    company: String(company || '').trim(),
    teamSize: String(teamSize || '').trim(),
    message: String(message || '').trim()
  };

  if (db?.isDbEnabled?.()) {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, created_at)
       VALUES (NULL, 'demo_request_submitted', 'lead', $1, $2::jsonb, $3, NOW())`,
      [payload.email, JSON.stringify(payload), ipAddress || null]
    );
    return payload;
  }

  demoRequests.push({
    ...payload,
    ipAddress: ipAddress || null,
    createdAt: new Date().toISOString()
  });
  return payload;
}

/**
 * POST /v1/auth/login
 * Login endpoint - accepts email and password
 */
export function setupAuthEndpoints(app, db = null) {
  app.post('/v1/public/demo-request', async (req, res) => {
    try {
      const { fullName, email, company, teamSize, message } = req.body;

      if (!fullName || !email || !company) {
        return res.status(400).json({ error: 'Full name, company, and email are required' });
      }

      const saved = await storeDemoRequest({ fullName, email, company, teamSize, message }, db, req.ip);
      await sendDemoRequestNotification(saved);

      res.status(201).json({
        success: true,
        lead: saved,
        message: 'Demo request received. We will follow up shortly.'
      });
    } catch (error) {
      console.error('Demo request error:', error);
      res.status(500).json({ error: 'Unable to submit demo request' });
    }
  });

  app.post('/v1/auth/signup', async (req, res) => {
    try {
      const { email, password, fullName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const createdUser = await createUser({ email, password, fullName }, db);

      if (db?.isDbEnabled?.()) {
        await db.query(
          `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, created_at)
           VALUES ($1, 'signup_completed', 'conversion', $2, $3::jsonb, $4, NOW())`,
          [
            createdUser.id,
            createdUser.email,
            JSON.stringify({ source: 'auth_signup', role: createdUser.role }),
            req.ip || null
          ]
        );
      }

      const token = jwt.sign(
        { userId: createdUser.id, email: createdUser.email, role: createdUser.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );

      res.status(201).json({
        token,
        user: {
          id: createdUser.id,
          email: createdUser.email,
          full_name: createdUser.full_name,
          role: createdUser.role
        }
      });
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('already registered')) {
        return res.status(409).json({ error: error.message });
      }

      console.error('Signup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/v1/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const user = await findUserByEmail(email, db);

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

      if (user.password_hash !== passwordHash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /v1/auth/verify
   * Verify token endpoint
   */
  app.post('/v1/auth/verify', async (req, res) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const decoded = jwt.verify(token, JWT_SECRET);

      const user = await findUserById(decoded.userId, db);

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      res.json({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        }
      });
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  /**
   * POST /v1/auth/logout
   * Logout endpoint (typically just frontend clears token)
   */
  app.post('/v1/auth/logout', (req, res) => {
    res.json({ message: 'Logged out successfully' });
  });

  /**
   * GET /v1/auth/me
   * Get current user endpoint
   */
  app.get('/v1/auth/me', async (req, res) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await findUserById(decoded.userId, db);

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });
}

/**
 * Middleware: Verify token
 */
export function verifyTokenMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: Check role permission
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
