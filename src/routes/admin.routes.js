const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getAllBookingsAdmin,
  getAllPoolGroupsAdmin,
  getPendingGroupRequests,
  approveGroupRequest,
  rejectGroupRequest,
  getDashboardStats,
  updateUserRole
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

// All routes are admin only
router.use(protect, adminOnly);

// Dashboard
router.get('/dashboard/stats', getDashboardStats);

// Users management
router.get('/users', getAllUsers);
router.patch('/users/:userId/role', updateUserRole);

// Bookings management
router.get('/bookings', getAllBookingsAdmin);

// Pool groups management
router.get('/pool-groups', getAllPoolGroupsAdmin);

// Group requests management
router.get('/group-requests/pending', getPendingGroupRequests);
router.patch('/group-requests/:requestId/approve', approveGroupRequest);
router.patch('/group-requests/:requestId/reject', rejectGroupRequest);

module.exports = router;


