const express = require('express');
const router = express.Router();
const {
  getAllBuses,
  getBusById,
  getAvailableSeats,
  createBus,
  updateBus,
  deleteBus
} = require('../controllers/busController');
const { protect, adminOnly } = require('../middleware/auth');

// Public/Protected routes
router.use(protect);

router.get('/', getAllBuses);
router.get('/:id', getBusById);
router.get('/:id/seats/available', getAvailableSeats);

// Admin only routes
router.post('/', adminOnly, createBus);
router.put('/:id', adminOnly, updateBus);
router.delete('/:id', adminOnly, deleteBus);

module.exports = router;



