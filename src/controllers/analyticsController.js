const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError } = require('../utils/responseHandler');

const prisma = new PrismaClient();

/**
 * @desc    Get available seats in bus for a given date
 * @route   GET /api/analytics/buses/:busId/available-seats
 * @access  Private
 */
exports.getAvailableBusSeats = async (req, res, next) => {
  try {
    const { busId } = req.params;
    const { date } = req.query;

    if (!date) {
      return sendError(res, 'Please provide date', 400);
    }

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: {
        seats: {
          where: { isBooked: false }
        }
      }
    });

    if (!bus) {
      return sendError(res, 'Bus not found', 404);
    }

    const availableSeats = bus.seats.length;
    const totalSeats = bus.capacity;

    sendSuccess(res, {
      busId,
      busNumber: bus.busNumber,
      date,
      availableSeats,
      totalSeats,
      bookedSeats: totalSeats - availableSeats,
      occupancyRate: ((totalSeats - availableSeats) / totalSeats * 100).toFixed(2) + '%'
    }, 'Available bus seats retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get available hotel rooms for a given date
 * @route   GET /api/analytics/hotels/:hotelId/available-rooms
 * @access  Private
 */
exports.getAvailableHotelRooms = async (req, res, next) => {
  try {
    const { hotelId } = req.params;
    const { date } = req.query;

    if (!date) {
      return sendError(res, 'Please provide date', 400);
    }

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        rooms: {
          where: { isBooked: false }
        }
      }
    });

    if (!hotel) {
      return sendError(res, 'Hotel not found', 404);
    }

    const availableRooms = hotel.rooms.length;
    const totalRooms = hotel.totalRooms;

    sendSuccess(res, {
      hotelId,
      hotelName: hotel.name,
      date,
      availableRooms,
      totalRooms,
      bookedRooms: totalRooms - availableRooms,
      occupancyRate: ((totalRooms - availableRooms) / totalRooms * 100).toFixed(2) + '%'
    }, 'Available hotel rooms retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get number of trips between dates
 * @route   GET /api/analytics/trips/count
 * @access  Private
 */
exports.getTripsCountBetweenDates = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return sendError(res, 'Please provide start date and end date', 400);
    }

    const where = {
      startDate: {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    };

    const [totalTrips, byStatus, byDestination] = await Promise.all([
      prisma.trip.count({ where }),
      prisma.trip.groupBy({
        by: ['status'],
        where,
        _count: true
      }),
      prisma.trip.groupBy({
        by: ['destination'],
        where,
        _count: true,
        orderBy: {
          _count: {
            destination: 'desc'
          }
        },
        take: 10
      })
    ]);

    sendSuccess(res, {
      dateRange: { startDate, endDate },
      totalTrips,
      byStatus,
      topDestinations: byDestination
    }, 'Trips count retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get number of active pool groups
 * @route   GET /api/analytics/pool-groups/active
 * @access  Private
 */
exports.getActivePoolGroups = async (req, res, next) => {
  try {
    const [openGroups, closedGroups, totalGroups] = await Promise.all([
      prisma.poolGroup.count({ where: { status: 'OPEN' } }),
      prisma.poolGroup.count({ where: { status: 'CLOSED' } }),
      prisma.poolGroup.count()
    ]);

    const groupsByDestination = await prisma.poolGroup.findMany({
      where: { status: 'OPEN' },
      include: {
        trip: {
          select: {
            destination: true
          }
        },
        _count: {
          select: { members: true }
        }
      }
    });

    // Group by destination
    const destinationStats = {};
    groupsByDestination.forEach(group => {
      const dest = group.trip.destination;
      if (!destinationStats[dest]) {
        destinationStats[dest] = {
          destination: dest,
          groupCount: 0,
          totalMembers: 0
        };
      }
      destinationStats[dest].groupCount++;
      destinationStats[dest].totalMembers += group._count.members;
    });

    sendSuccess(res, {
      openGroups,
      closedGroups,
      totalGroups,
      byDestination: Object.values(destinationStats)
    }, 'Active pool groups retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get packages available for a trip
 * @route   GET /api/analytics/trips/:tripId/packages
 * @access  Private
 */
exports.getPackagesForTrip = async (req, res, next) => {
  try {
    const { tripId } = req.params;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId }
    });

    if (!trip) {
      return sendError(res, 'Trip not found', 404);
    }

    const packages = await prisma.package.findMany({
      where: {
        OR: [
          { tripId },
          {
            poolGroup: {
              tripId
            }
          }
        ],
        isActive: true
      },
      include: {
        bus: true,
        hotel: true,
        poolGroup: true
      }
    });

    sendSuccess(res, {
      tripId,
      trip: {
        source: trip.source,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate
      },
      packagesCount: packages.length,
      packages
    }, 'Packages for trip retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get destination-wise active groups
 * @route   GET /api/analytics/destinations/groups
 * @access  Private
 */
exports.getDestinationWiseGroups = async (req, res, next) => {
  try {
    const poolGroups = await prisma.poolGroup.findMany({
      where: { status: { in: ['OPEN', 'CLOSED'] } },
      include: {
        trip: {
          select: {
            destination: true,
            startDate: true
          }
        },
        _count: {
          select: { members: true }
        }
      }
    });

    // Group by destination
    const destinationMap = {};
    poolGroups.forEach(group => {
      const dest = group.trip.destination;
      if (!destinationMap[dest]) {
        destinationMap[dest] = {
          destination: dest,
          activeGroups: 0,
          totalMembers: 0,
          openGroups: 0,
          closedGroups: 0
        };
      }
      
      destinationMap[dest].activeGroups++;
      destinationMap[dest].totalMembers += group._count.members;
      
      if (group.status === 'OPEN') {
        destinationMap[dest].openGroups++;
      } else {
        destinationMap[dest].closedGroups++;
      }
    });

    const destinationStats = Object.values(destinationMap).sort((a, b) => b.activeGroups - a.activeGroups);

    sendSuccess(res, {
      totalDestinations: destinationStats.length,
      destinations: destinationStats
    }, 'Destination-wise groups retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get users who joined group but not booked yet
 * @route   GET /api/analytics/pool-groups/:groupId/pending-bookings
 * @access  Private (Admin)
 */
exports.getUsersWithPendingBookings = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        trip: true,
        members: {
          where: {
            status: { in: ['APPROVED', 'PENDING'] }
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                _count: {
                  select: { bookings: true }
                }
              }
            }
          }
        }
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    // Filter users who haven't booked for this trip
    const usersWithoutBooking = [];
    for (const member of poolGroup.members) {
      const hasBooking = await prisma.booking.findFirst({
        where: {
          userId: member.userId,
          tripId: poolGroup.tripId,
          status: { not: 'CANCELLED' }
        }
      });

      if (!hasBooking) {
        usersWithoutBooking.push({
          memberId: member.id,
          memberStatus: member.status,
          user: member.user,
          joinedAt: member.joinedAt
        });
      }
    }

    sendSuccess(res, {
      poolGroupId: groupId,
      tripDestination: poolGroup.trip.destination,
      totalMembers: poolGroup.members.length,
      usersWithoutBooking: usersWithoutBooking.length,
      users: usersWithoutBooking
    }, 'Users with pending bookings retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get registration count in last 30 days
 * @route   GET /api/analytics/users/registrations
 * @access  Private (Admin)
 */
exports.getRegistrationCount = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const daysAgo = parseInt(days);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const [totalUsers, recentUsers, usersByRole] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          createdAt: {
            gte: startDate
          }
        }
      }),
      prisma.user.groupBy({
        by: ['role'],
        _count: true
      })
    ]);

    // Get day-wise registrations for the period
    const dayWise = await prisma.$queryRaw`
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as count
      FROM users
      WHERE createdAt >= ${startDate}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    `;

    sendSuccess(res, {
      period: `Last ${daysAgo} days`,
      totalUsers,
      recentRegistrations: recentUsers,
      averagePerDay: (recentUsers / daysAgo).toFixed(2),
      byRole: usersByRole,
      dayWiseRegistrations: dayWise
    }, 'Registration count retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get destination-wise upcoming trips summary
 * @route   GET /api/analytics/trips/upcoming-summary
 * @access  Private
 */
exports.getUpcomingTripsSummary = async (req, res, next) => {
  try {
    const now = new Date();

    const upcomingTrips = await prisma.trip.findMany({
      where: {
        startDate: {
          gte: now
        },
        status: { not: 'CANCELLED' }
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: {
            bookings: true,
            poolGroups: true
          }
        }
      },
      orderBy: {
        startDate: 'asc'
      }
    });

    // Group by destination
    const destinationSummary = {};
    upcomingTrips.forEach(trip => {
      const dest = trip.destination;
      if (!destinationSummary[dest]) {
        destinationSummary[dest] = {
          destination: dest,
          tripCount: 0,
          totalTravelers: 0,
          totalBudget: 0,
          poolGroupsCount: 0,
          bookingsCount: 0,
          trips: []
        };
      }

      destinationSummary[dest].tripCount++;
      destinationSummary[dest].totalTravelers += trip.travelers;
      destinationSummary[dest].totalBudget += trip.budget;
      destinationSummary[dest].poolGroupsCount += trip._count.poolGroups;
      destinationSummary[dest].bookingsCount += trip._count.bookings;
      destinationSummary[dest].trips.push({
        id: trip.id,
        source: trip.source,
        startDate: trip.startDate,
        endDate: trip.endDate,
        status: trip.status,
        travelers: trip.travelers
      });
    });

    const summary = Object.values(destinationSummary).sort((a, b) => b.tripCount - a.tripCount);

    sendSuccess(res, {
      totalUpcomingTrips: upcomingTrips.length,
      uniqueDestinations: summary.length,
      destinations: summary
    }, 'Upcoming trips summary retrieved successfully');
  } catch (error) {
    next(error);
  }
};


