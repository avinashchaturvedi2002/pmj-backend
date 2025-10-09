const express = require('express');
const router = express.Router();
const {
  createBooking,
  getAllBookings,
  getBookingById,
  cancelBooking,
  confirmBooking
} = require('../controllers/bookingController');
const { protect, adminOnly } = require('../middleware/auth');

// All routes are protected
router.use(protect);

router.route('/')
  .post(createBooking)
  .get(getAllBookings);

router.get('/:id', getBookingById);
router.patch('/:id/cancel', cancelBooking);

// Admin only
router.patch('/:id/confirm', adminOnly, confirmBooking);

module.exports = router;


