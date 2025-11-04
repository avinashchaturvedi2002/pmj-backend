const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { isValidDate, isFutureDate, validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();

/**
 * @desc    Create new trip
 * @route   POST /api/trips
 * @access  Private
 */
exports.createTrip = async (req, res, next) => {
  try {
    const { source, destination, startDate, endDate, budget, travelers, activityBudgetPercent } = req.body;

    // Validation
    if (!source || !destination || !startDate || !endDate || !budget) {
      return sendError(res, 'Please provide all required fields', 400);
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return sendError(res, 'Invalid date format', 400);
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return sendError(res, 'End date must be after start date', 400);
    }

    if (!isFutureDate(startDate)) {
      return sendError(res, 'Start date must be in the future', 400);
    }

    if (budget <= 0 || (travelers && travelers <= 0)) {
      return sendError(res, 'Budget and travelers must be positive numbers', 400);
    }

    // Validate activityBudgetPercent (0-75%)
    const activityPercent = activityBudgetPercent !== undefined ? parseInt(activityBudgetPercent) : 30;
    if (activityPercent < 0 || activityPercent > 75) {
      return sendError(res, 'Activity budget percentage must be between 0 and 75', 400);
    }

    const trip = await prisma.trip.create({
      data: {
        source,
        destination,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        budget: parseInt(budget),
        activityBudgetPercent: activityPercent,
        travelers: travelers ? parseInt(travelers) : 1,
        createdById: req.user.id,
        status: 'PLANNED'
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    sendSuccess(res, { trip }, 'Trip created successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all trips (with filters)
 * @route   GET /api/trips
 * @access  Private
 */
exports.getAllTrips = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { destination, status, startDate, endDate } = req.query;

    const where = { createdById: req.user.id };

    if (destination) {
      where.destination = {
        contains: destination,
        mode: 'insensitive'
      };
    }

    if (status) {
      where.status = status;
    }

    if (startDate) {
      where.startDate = {
        gte: new Date(startDate)
      };
    }

    if (endDate) {
      where.endDate = {
        lte: new Date(endDate)
      };
    }

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
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
              poolGroups: true,
              bookings: true
            }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.trip.count({ where })
    ]);

    sendPaginated(res, { trips }, { page, limit, total }, 'Trips retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single trip by ID
 * @route   GET /api/trips/:id
 * @access  Private
 */
exports.getTripById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        poolGroups: {
          include: {
            _count: {
              select: { members: true }
            }
          }
        },
        bookings: {
          where: { userId: req.user.id },
          include: {
            busSeat: {
              include: {
                bus: true
              }
            },
            hotelRoom: {
              include: {
                hotel: true
              }
            }
          }
        },
        packages: {
          where: { isActive: true },
          include: {
            bus: true,
            hotel: true
          }
        }
      }
    });

    if (!trip) {
      return sendError(res, 'Trip not found', 404);
    }

    // Check if user has access
    if (trip.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'Access denied', 403);
    }

    sendSuccess(res, { trip }, 'Trip retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update trip
 * @route   PUT /api/trips/:id
 * @access  Private (Owner or Admin)
 */
exports.updateTrip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { source, destination, startDate, endDate, budget, travelers, status } = req.body;

    // Check if trip exists
    const existingTrip = await prisma.trip.findUnique({
      where: { id }
    });

    if (!existingTrip) {
      return sendError(res, 'Trip not found', 404);
    }

    // Check ownership
    if (existingTrip.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'Access denied', 403);
    }

    const updateData = {};

    if (source) updateData.source = source;
    if (destination) updateData.destination = destination;
    if (budget) updateData.budget = parseInt(budget);
    if (travelers) updateData.travelers = parseInt(travelers);
    if (status) updateData.status = status;

    if (startDate) {
      if (!isValidDate(startDate)) {
        return sendError(res, 'Invalid start date format', 400);
      }
      updateData.startDate = new Date(startDate);
    }

    if (endDate) {
      if (!isValidDate(endDate)) {
        return sendError(res, 'Invalid end date format', 400);
      }
      updateData.endDate = new Date(endDate);
    }

    const trip = await prisma.trip.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    sendSuccess(res, { trip }, 'Trip updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete trip
 * @route   DELETE /api/trips/:id
 * @access  Private (Owner or Admin)
 */
exports.deleteTrip = async (req, res, next) => {
  try {
    const { id } = req.params;

    const trip = await prisma.trip.findUnique({
      where: { id }
    });

    if (!trip) {
      return sendError(res, 'Trip not found', 404);
    }

    // Check ownership
    if (trip.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'Access denied', 403);
    }

    await prisma.trip.delete({
      where: { id }
    });

    sendSuccess(res, {}, 'Trip deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get trip statistics
 * @route   GET /api/trips/stats/overview
 * @access  Private
 */
exports.getTripStats = async (req, res, next) => {
  try {
    const [totalTrips, plannedTrips, bookedTrips, completedTrips] = await Promise.all([
      prisma.trip.count({ where: { createdById: req.user.id } }),
      prisma.trip.count({ where: { createdById: req.user.id, status: 'PLANNED' } }),
      prisma.trip.count({ where: { createdById: req.user.id, status: 'BOOKED' } }),
      prisma.trip.count({ where: { createdById: req.user.id, status: 'COMPLETED' } })
    ]);

    const stats = {
      totalTrips,
      plannedTrips,
      bookedTrips,
      completedTrips
    };

    sendSuccess(res, { stats }, 'Trip statistics retrieved successfully');
  } catch (error) {
    next(error);
  }
};



