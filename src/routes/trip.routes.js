const express = require('express');
const router = express.Router();
const {
  createTrip,
  getAllTrips,
  getTripById,
  updateTrip,
  deleteTrip,
  getTripStats
} = require('../controllers/tripController');
const { protect } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Trip statistics
router.get('/stats/overview', getTripStats);

// CRUD routes
router.route('/')
  .post(createTrip)
  .get(getAllTrips);

router.route('/:id')
  .get(getTripById)
  .put(updateTrip)
  .delete(deleteTrip);

module.exports = router;



