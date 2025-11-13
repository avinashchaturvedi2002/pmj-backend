const express = require('express');
const router = express.Router();
const {
  getAllBuses,
  getBusById,
  getAvailableSeats,
  getSeatMap,
  holdSeats,
  releaseSeats,
  confirmSeats,
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
router.get('/:id/seats', getSeatMap);
router.post('/:id/hold', holdSeats);
router.delete('/:id/hold/:holdToken', releaseSeats);
router.post('/:id/confirm', confirmSeats);

// Admin only routes
router.post('/', adminOnly, createBus);
router.put('/:id', adminOnly, updateBus);
router.delete('/:id', adminOnly, deleteBus);

module.exports = router;



