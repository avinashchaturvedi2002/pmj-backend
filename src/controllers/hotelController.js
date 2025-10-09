const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();

/**
 * @desc    Get all hotels (with filters)
 * @route   GET /api/hotels
 * @access  Private
 */
exports.getAllHotels = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { location, minPrice, maxPrice, minRating } = req.query;

    const where = {};

    if (location) {
      where.location = {
        contains: location,
        mode: 'insensitive'
      };
    }

    if (minPrice || maxPrice) {
      where.pricePerRoom = {};
      if (minPrice) where.pricePerRoom.gte = parseInt(minPrice);
      if (maxPrice) where.pricePerRoom.lte = parseInt(maxPrice);
    }

    if (minRating) {
      where.rating = {
        gte: parseFloat(minRating)
      };
    }

    const [hotels, total] = await Promise.all([
      prisma.hotel.findMany({
        where,
        include: {
          _count: {
            select: { rooms: true }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { rating: 'desc' }
      }),
      prisma.hotel.count({ where })
    ]);

    sendPaginated(res, { hotels }, { page, limit, total }, 'Hotels retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get hotel by ID with available rooms
 * @route   GET /api/hotels/:id
 * @access  Private
 */
exports.getHotelById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const hotel = await prisma.hotel.findUnique({
      where: { id },
      include: {
        rooms: {
          orderBy: { roomNumber: 'asc' }
        },
        _count: {
          select: { rooms: true }
        }
      }
    });

    if (!hotel) {
      return sendError(res, 'Hotel not found', 404);
    }

    // Calculate available rooms
    const availableRooms = hotel.rooms.filter(room => !room.isBooked).length;
    const hotelWithStats = {
      ...hotel,
      availableRooms,
      bookedRooms: hotel.rooms.length - availableRooms
    };

    sendSuccess(res, { hotel: hotelWithStats }, 'Hotel retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get available rooms for a hotel
 * @route   GET /api/hotels/:id/rooms/available
 * @access  Private
 */
exports.getAvailableRooms = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { roomType } = req.query;

    const hotel = await prisma.hotel.findUnique({
      where: { id }
    });

    if (!hotel) {
      return sendError(res, 'Hotel not found', 404);
    }

    const where = {
      hotelId: id,
      isBooked: false
    };

    if (roomType) {
      where.roomType = roomType;
    }

    const availableRooms = await prisma.hotelRoom.findMany({
      where,
      orderBy: { roomNumber: 'asc' }
    });

    sendSuccess(res, { 
      hotel: {
        id: hotel.id,
        name: hotel.name,
        location: hotel.location
      },
      availableRooms,
      count: availableRooms.length
    }, 'Available rooms retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create hotel (Admin only)
 * @route   POST /api/hotels
 * @access  Private (Admin)
 */
exports.createHotel = async (req, res, next) => {
  try {
    const { name, location, address, totalRooms, pricePerRoom, rating, amenities } = req.body;

    if (!name || !location || !totalRooms || !pricePerRoom) {
      return sendError(res, 'Please provide all required fields', 400);
    }

    if (totalRooms <= 0 || pricePerRoom <= 0) {
      return sendError(res, 'Total rooms and price must be positive numbers', 400);
    }

    // Create hotel
    const hotel = await prisma.hotel.create({
      data: {
        name,
        location,
        address,
        totalRooms: parseInt(totalRooms),
        pricePerRoom: parseInt(pricePerRoom),
        rating: rating ? parseFloat(rating) : 0,
        amenities: amenities || null
      }
    });

    // Create rooms for the hotel
    const rooms = [];
    for (let i = 1; i <= totalRooms; i++) {
      rooms.push({
        hotelId: hotel.id,
        roomNumber: `${i}`,
        roomType: i <= totalRooms * 0.3 ? 'Deluxe' : (i <= totalRooms * 0.6 ? 'Standard' : 'Suite'),
        isBooked: false
      });
    }

    await prisma.hotelRoom.createMany({
      data: rooms
    });

    const hotelWithRooms = await prisma.hotel.findUnique({
      where: { id: hotel.id },
      include: {
        rooms: {
          orderBy: { roomNumber: 'asc' }
        }
      }
    });

    sendSuccess(res, { hotel: hotelWithRooms }, 'Hotel created successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update hotel (Admin only)
 * @route   PUT /api/hotels/:id
 * @access  Private (Admin)
 */
exports.updateHotel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, location, address, pricePerRoom, rating, amenities } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (location) updateData.location = location;
    if (address !== undefined) updateData.address = address;
    if (pricePerRoom) updateData.pricePerRoom = parseInt(pricePerRoom);
    if (rating !== undefined) updateData.rating = parseFloat(rating);
    if (amenities !== undefined) updateData.amenities = amenities;

    const hotel = await prisma.hotel.update({
      where: { id },
      data: updateData
    });

    sendSuccess(res, { hotel }, 'Hotel updated successfully');
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 'Hotel not found', 404);
    }
    next(error);
  }
};

/**
 * @desc    Delete hotel (Admin only)
 * @route   DELETE /api/hotels/:id
 * @access  Private (Admin)
 */
exports.deleteHotel = async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.hotel.delete({
      where: { id }
    });

    sendSuccess(res, {}, 'Hotel deleted successfully');
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 'Hotel not found', 404);
    }
    next(error);
  }
};


