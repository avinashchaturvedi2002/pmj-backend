const express = require('express');
const router = express.Router();
const {
  getAllHotels,
  getHotelById,
  getAvailableRooms,
  createHotel,
  updateHotel,
  deleteHotel
} = require('../controllers/hotelController');
const { protect, adminOnly } = require('../middleware/auth');

// Protected routes
router.use(protect);

router.get('/', getAllHotels);
router.get('/:id', getHotelById);
router.get('/:id/rooms/available', getAvailableRooms);

// Admin only routes
router.post('/', adminOnly, createHotel);
router.put('/:id', adminOnly, updateHotel);
router.delete('/:id', adminOnly, deleteHotel);

module.exports = router;

