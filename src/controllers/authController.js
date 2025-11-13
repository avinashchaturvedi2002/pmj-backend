const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { generateToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { isValidEmail, isValidPassword } = require('../utils/validation');

const prisma = new PrismaClient();


exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return sendError(res, 'Please provide all required fields', 400);
    }

    if (!isValidEmail(email)) {
      return sendError(res, 'Please provide a valid email address', 400);
    }

    if (!isValidPassword(password)) {
      return sendError(res, 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number', 400);
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return sendError(res, 'User already exists with this email', 400);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'USER'
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true
      }
    });

    // Generate token
    const token = generateToken(user.id, user.role);

    sendSuccess(res, { user, token }, 'User registered successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return sendError(res, 'Please provide email and password', 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return sendError(res, 'Invalid credentials', 401);
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return sendError(res, 'Invalid credentials', 401);
    }

    // Generate token
    const token = generateToken(user.id, user.role);

    sendSuccess(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};


exports.getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            trips: true,
            bookings: true,
            poolGroups: true
          }
        }
      }
    });

    sendSuccess(res, { user }, 'User profile retrieved successfully');
  } catch (error) {
    next(error);
  }
};


exports.updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (email) {
      if (!isValidEmail(email)) {
        return sendError(res, 'Please provide a valid email address', 400);
      }
      updateData.email = email;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        updatedAt: true
      }
    });

    sendSuccess(res, { user }, 'Profile updated successfully');
  } catch (error) {
    if (error.code === 'P2002') {
      return sendError(res, 'Email already in use', 400);
    }
    next(error);
  }
};


exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 'Please provide current and new password', 400);
    }

    if (!isValidPassword(newPassword)) {
      return sendError(res, 'New password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number', 400);
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return sendError(res, 'Current password is incorrect', 401);
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    sendSuccess(res, {}, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};


exports.logout = async (req, res) => {
  sendSuccess(res, {}, 'Logout successful');
};



