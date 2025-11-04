const express = require('express');
const router = express.Router();
const {
  createPoolGroup,
  getAllPoolGroups,
  getPoolGroupById,
  joinPoolGroup,
  updateMemberStatus,
  leavePoolGroup,
  deletePoolGroup,
  getMyPoolGroups,
  setGroupPackage,
  approvePackage,
  checkGroupPaymentStatus,
  lockGroup
} = require('../controllers/poolingController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Get my pool groups
router.get('/my/groups', getMyPoolGroups);

// CRUD routes
router.route('/')
  .post(createPoolGroup)
  .get(getAllPoolGroups);

router.route('/:id')
  .get(getPoolGroupById)
  .delete(deletePoolGroup);

// Join/Leave pool group
router.post('/:id/join', joinPoolGroup);
router.delete('/:groupId/leave', leavePoolGroup);

// Approve/Reject member (Admin or Creator)
router.patch('/:groupId/members/:memberId', updateMemberStatus);

// Package selection and approval
router.post('/:groupId/set-package', setGroupPackage);
router.post('/:groupId/approve-package', approvePackage);

// Payment status and group locking
router.get('/:groupId/payment-status', checkGroupPaymentStatus);
router.post('/:groupId/lock', lockGroup);

module.exports = router;



