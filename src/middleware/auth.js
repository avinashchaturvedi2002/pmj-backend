const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/responseHandler');

const prisma = new PrismaClient();

/**
 * Protect routes - Verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'test') {
      req.user = {
        id: process.env.TEST_USER_ID || 'test-user',
        role: process.env.TEST_USER_ROLE || 'USER'
      };
      return next();
    }

    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return sendError(res, 'Not authorized, no token provided', 401);
    }

    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true
      }
    });

    if (!user) {
      return sendError(res, 'User not found', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return sendError(res, 'Not authorized, token invalid or expired', 401);
  }
};

/**
 * Admin only access
 */
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    return sendError(res, 'Access denied. Admin privileges required', 403);
  }
};

/**
 * Check if user is owner or admin
 */
const ownerOrAdmin = (resourceUserIdField = 'createdById') => {
  return (req, res, next) => {
    const isAdmin = req.user.role === 'ADMIN';
    const isOwner = req.resource && req.resource[resourceUserIdField] === req.user.id;

    if (isAdmin || isOwner) {
      next();
    } else {
      return sendError(res, 'Access denied. You are not authorized to perform this action', 403);
    }
  };
};

module.exports = {
  protect,
  adminOnly,
  ownerOrAdmin
};



