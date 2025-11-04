const express = require('express');
const router = express.Router();
const {
  getAvailableBusSeats,
  getAvailableHotelRooms,
  getTripsCountBetweenDates,
  getActivePoolGroups,
  getPackagesForTrip,
  getDestinationWiseGroups,
  getUsersWithPendingBookings,
  getRegistrationCount,
  getUpcomingTripsSummary
} = require('../controllers/analyticsController');
const { protect, adminOnly } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Public analytics (available to all authenticated users)
router.get('/buses/:busId/available-seats', getAvailableBusSeats);
router.get('/hotels/:hotelId/available-rooms', getAvailableHotelRooms);
router.get('/trips/count', getTripsCountBetweenDates);
router.get('/pool-groups/active', getActivePoolGroups);
router.get('/trips/:tripId/packages', getPackagesForTrip);
router.get('/destinations/groups', getDestinationWiseGroups);
router.get('/trips/upcoming-summary', getUpcomingTripsSummary);

// Admin only analytics
router.get('/pool-groups/:groupId/pending-bookings', adminOnly, getUsersWithPendingBookings);
router.get('/users/registrations', adminOnly, getRegistrationCount);

module.exports = router;



