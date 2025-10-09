const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();

/**
 * @desc    Get all buses (with filters)
 * @route   GET /api/buses
 * @access  Private
 */
exports.getAllBuses = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { minPrice, maxPrice, minCapacity } = req.query;

    const where = {};

    if (minPrice || maxPrice) {
      where.pricePerSeat = {};
      if (minPrice) where.pricePerSeat.gte = parseInt(minPrice);
      if (maxPrice) where.pricePerSeat.lte = parseInt(maxPrice);
    }

    if (minCapacity) {
      where.capacity = {
        gte: parseInt(minCapacity)
      };
    }

    const [buses, total] = await Promise.all([
      prisma.bus.findMany({
        where,
        include: {
          _count: {
            select: { seats: true }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { pricePerSeat: 'asc' }
      }),
      prisma.bus.count({ where })
    ]);

    sendPaginated(res, { buses }, { page, limit, total }, 'Buses retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get bus by ID with available seats
 * @route   GET /api/buses/:id
 * @access  Private
 */
exports.getBusById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const bus = await prisma.bus.findUnique({
      where: { id },
      include: {
        seats: {
          orderBy: { seatNumber: 'asc' }
        },
        _count: {
          select: { seats: true }
        }
      }
    });

    if (!bus) {
      return sendError(res, 'Bus not found', 404);
    }

    // Calculate available seats
    const availableSeats = bus.seats.filter(seat => !seat.isBooked).length;
    const busWithStats = {
      ...bus,
      availableSeats,
      bookedSeats: bus.seats.length - availableSeats
    };

    sendSuccess(res, { bus: busWithStats }, 'Bus retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get available seats for a bus
 * @route   GET /api/buses/:id/seats/available
 * @access  Private
 */
exports.getAvailableSeats = async (req, res, next) => {
  try {
    const { id } = req.params;

    const bus = await prisma.bus.findUnique({
      where: { id }
    });

    if (!bus) {
      return sendError(res, 'Bus not found', 404);
    }

    const availableSeats = await prisma.busSeat.findMany({
      where: {
        busId: id,
        isBooked: false
      },
      orderBy: { seatNumber: 'asc' }
    });

    sendSuccess(res, { 
      bus: {
        id: bus.id,
        busNumber: bus.busNumber,
        busName: bus.busName
      },
      availableSeats,
      count: availableSeats.length
    }, 'Available seats retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create bus (Admin only)
 * @route   POST /api/buses
 * @access  Private (Admin)
 */
exports.createBus = async (req, res, next) => {
  try {
    const { busNumber, busName, capacity, pricePerSeat, amenities } = req.body;

    if (!busNumber || !busName || !capacity || !pricePerSeat) {
      return sendError(res, 'Please provide all required fields', 400);
    }

    if (capacity <= 0 || pricePerSeat <= 0) {
      return sendError(res, 'Capacity and price must be positive numbers', 400);
    }

    // Create bus
    const bus = await prisma.bus.create({
      data: {
        busNumber,
        busName,
        capacity: parseInt(capacity),
        pricePerSeat: parseInt(pricePerSeat),
        amenities: amenities || null
      }
    });

    // Create seats for the bus
    const seats = [];
    for (let i = 1; i <= capacity; i++) {
      seats.push({
        busId: bus.id,
        seatNumber: `${i}`,
        isBooked: false
      });
    }

    await prisma.busSeat.createMany({
      data: seats
    });

    const busWithSeats = await prisma.bus.findUnique({
      where: { id: bus.id },
      include: {
        seats: {
          orderBy: { seatNumber: 'asc' }
        }
      }
    });

    sendSuccess(res, { bus: busWithSeats }, 'Bus created successfully', 201);
  } catch (error) {
    if (error.code === 'P2002') {
      return sendError(res, 'Bus number already exists', 400);
    }
    next(error);
  }
};

/**
 * @desc    Update bus (Admin only)
 * @route   PUT /api/buses/:id
 * @access  Private (Admin)
 */
exports.updateBus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { busNumber, busName, pricePerSeat, amenities } = req.body;

    const updateData = {};
    if (busNumber) updateData.busNumber = busNumber;
    if (busName) updateData.busName = busName;
    if (pricePerSeat) updateData.pricePerSeat = parseInt(pricePerSeat);
    if (amenities !== undefined) updateData.amenities = amenities;

    const bus = await prisma.bus.update({
      where: { id },
      data: updateData
    });

    sendSuccess(res, { bus }, 'Bus updated successfully');
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 'Bus not found', 404);
    }
    if (error.code === 'P2002') {
      return sendError(res, 'Bus number already exists', 400);
    }
    next(error);
  }
};

/**
 * @desc    Delete bus (Admin only)
 * @route   DELETE /api/buses/:id
 * @access  Private (Admin)
 */
exports.deleteBus = async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.bus.delete({
      where: { id }
    });

    sendSuccess(res, {}, 'Bus deleted successfully');
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 'Bus not found', 404);
    }
    next(error);
  }
};


