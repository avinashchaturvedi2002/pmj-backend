const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();
const ROOM_HOLD_DURATION_SECONDS = parseInt(process.env.ROOM_HOLD_DURATION_SECONDS || process.env.SEAT_HOLD_DURATION_SECONDS || '300', 10);

const normalizeDateOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('INVALID_DATE');
  }
  return new Date(date.toISOString().split('T')[0]);
};

const ensureTripAccess = async (tripId, user) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) {
    const error = new Error('TRIP_NOT_FOUND');
    error.statusCode = 404;
    throw error;
  }
  if (trip.createdById !== user.id && user.role !== 'ADMIN') {
    const error = new Error('FORBIDDEN');
    error.statusCode = 403;
    throw error;
  }
  return trip;
};

const expireStaleRoomHolds = async (tx, hotelId, checkIn, checkOut) => {
  const now = new Date();
  await tx.hotelRoomAllocation.updateMany({
    where: {
      hotelId,
      status: 'HELD',
      holdExpiresAt: {
        lt: now
      },
      AND: [
        { checkIn: { lt: checkOut } },
        { checkOut: { gt: checkIn } }
      ]
    },
    data: {
      status: 'EXPIRED',
      holdToken: null,
      holdExpiresAt: null,
      paymentId: null
    }
  });
};

const findConsecutiveRooms = (rooms, count) => {
  if (!rooms || rooms.length < count) return null;
  const sorted = [...rooms].sort((a, b) => {
    const aNum = parseInt(a.roomNumber, 10);
    const bNum = parseInt(b.roomNumber, 10);
    if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
      return a.roomNumber.localeCompare(b.roomNumber);
    }
    return aNum - bNum;
  });

  for (let i = 0; i <= sorted.length - count; i++) {
    const slice = sorted.slice(i, i + count);
    let isConsecutive = true;
    for (let j = 1; j < slice.length; j++) {
      const prev = parseInt(slice[j - 1].roomNumber, 10);
      const curr = parseInt(slice[j].roomNumber, 10);
      if (Number.isNaN(prev) || Number.isNaN(curr) || curr !== prev + 1) {
        isConsecutive = false;
        break;
      }
    }
    if (isConsecutive) {
      return slice;
    }
  }

  return sorted.slice(0, count);
};

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
        contains: location
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
 * @desc    Hold rooms for a user
 * @route   POST /api/hotels/:id/hold
 * @access  Private
 */
exports.holdRooms = async (req, res, next) => {
  try {
    const { id: hotelId } = req.params;
    const { tripId, checkIn, checkOut, roomNumbers = [], roomsNeeded, holdToken } = req.body;

    if (!tripId) {
      return sendError(res, 'Trip ID is required', 400);
    }
    if (!checkIn || !checkOut) {
      return sendError(res, 'Check-in and Check-out dates are required', 400);
    }

    const trip = await ensureTripAccess(tripId, req.user);
    const checkInDate = normalizeDateOnly(checkIn);
    const checkOutDate = normalizeDateOnly(checkOut);

    if (checkOutDate <= checkInDate) {
      return sendError(res, 'Check-out date must be after check-in date', 400);
    }

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId }
    });

    if (!hotel) {
      return sendError(res, 'Hotel not found', 404);
    }

    const token = holdToken || `room_${crypto.randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ROOM_HOLD_DURATION_SECONDS * 1000);

    const sanitizedRoomNumbers = Array.isArray(roomNumbers)
      ? [...new Set(roomNumbers.map((num) => String(num)))]
      : [];

    const desiredRoomsCount = sanitizedRoomNumbers.length || parseInt(roomsNeeded || 0, 10);
    if (!desiredRoomsCount || Number.isNaN(desiredRoomsCount)) {
      return sendError(res, 'Provide room numbers or roomsNeeded to hold', 400);
    }

    const heldRooms = [];
    const rejectedRooms = [];
    let finalRoomNumbers = sanitizedRoomNumbers;

    await prisma.$transaction(async (tx) => {
      await expireStaleRoomHolds(tx, hotelId, checkInDate, checkOutDate);

      if (finalRoomNumbers.length === 0) {
        const unavailableAllocations = await tx.hotelRoomAllocation.findMany({
          where: {
            hotelId,
            status: { in: ['HELD', 'BOOKED'] },
            AND: [
              { checkIn: { lt: checkOutDate } },
              { checkOut: { gt: checkInDate } }
            ]
          },
          select: { roomNumber: true }
        });

        const unavailableSet = new Set(unavailableAllocations.map((allocation) => allocation.roomNumber));
        const availableRooms = await tx.hotelRoom.findMany({
          where: {
            hotelId,
            roomNumber: {
              notIn: Array.from(unavailableSet)
            }
          }
        });

        const suggestion = findConsecutiveRooms(availableRooms, desiredRoomsCount);
        if (!suggestion || suggestion.length < desiredRoomsCount) {
          const error = new Error('Not enough consecutive rooms available for the requested dates.');
          error.statusCode = 409;
          throw error;
        }
        finalRoomNumbers = suggestion.map((room) => String(room.roomNumber));
      }

      const rooms = await tx.hotelRoom.findMany({
        where: {
          hotelId,
          roomNumber: { in: finalRoomNumbers }
        }
      });

      if (rooms.length !== finalRoomNumbers.length) {
        const missing = finalRoomNumbers.filter(
          (roomNumber) => !rooms.find((room) => room.roomNumber === roomNumber)
        );
        const error = new Error(`Invalid room numbers: ${missing.join(', ')}`);
        error.statusCode = 400;
        throw error;
      }

      for (const roomNumber of finalRoomNumbers) {
        const existingAllocation = await tx.hotelRoomAllocation.findFirst({
          where: {
            hotelId,
            roomNumber,
            AND: [
              { checkIn: { lt: checkOutDate } },
              { checkOut: { gt: checkInDate } }
            ]
          }
        });

        if (!existingAllocation) {
          await tx.hotelRoomAllocation.create({
            data: {
              hotelId,
              hotelRoomId: rooms.find((room) => room.roomNumber === roomNumber).id,
              tripId,
              roomNumber,
              checkIn: checkInDate,
              checkOut: checkOutDate,
              status: 'HELD',
              holdToken: token,
              holdExpiresAt: expiresAt,
              userId: req.user.id
            }
          });
          heldRooms.push(roomNumber);
          continue;
        }

        if (existingAllocation.status === 'BOOKED') {
          rejectedRooms.push({ roomNumber, reason: 'Room already booked' });
          continue;
        }

        const holdExpired =
          existingAllocation.status === 'HELD' &&
          existingAllocation.holdExpiresAt &&
          existingAllocation.holdExpiresAt <= now;
        const sameUserHold =
          existingAllocation.userId === req.user.id && existingAllocation.holdToken === token;

        if (holdExpired || sameUserHold || existingAllocation.userId === req.user.id) {
          await tx.hotelRoomAllocation.update({
            where: { id: existingAllocation.id },
            data: {
              status: 'HELD',
              holdToken: token,
              holdExpiresAt: expiresAt,
              userId: req.user.id,
              tripId,
              paymentId: null,
              bookingId: null
            }
          });
          heldRooms.push(roomNumber);
        } else {
          rejectedRooms.push({ roomNumber, reason: 'Room currently held by another traveler' });
        }
      }
    });

    if (heldRooms.length === 0) {
      return sendError(res, 'Unable to hold requested rooms', 409, { rejectedRooms });
    }

    sendSuccess(
      res,
      {
        holdToken: token,
        checkIn: checkInDate.toISOString(),
        checkOut: checkOutDate.toISOString(),
        expiresAt: expiresAt.toISOString(),
        heldRooms,
        rejectedRooms
      },
      'Rooms held successfully'
    );
  } catch (error) {
    if (error.message === 'INVALID_DATE') {
      return sendError(res, 'Invalid date provided', 400);
    }
    if (error.statusCode === 403) {
      return sendError(res, 'Access denied', 403);
    }
    if (error.statusCode === 404) {
      return sendError(res, 'Hotel or trip not found', 404);
    }
    if (error.statusCode === 409) {
      return sendError(res, error.message, 409);
    }
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
 * @desc    Release held rooms
 * @route   DELETE /api/hotels/:id/hold/:holdToken
 * @access  Private
 */
exports.releaseRooms = async (req, res, next) => {
  try {
    const { id: hotelId, holdToken } = req.params;
    const { tripId, checkIn, checkOut, roomNumbers } = req.body || {};

    if (!holdToken) {
      return sendError(res, 'Hold token is required', 400);
    }

    let checkInDate = null;
    let checkOutDate = null;

    if (checkIn) checkInDate = normalizeDateOnly(checkIn);
    if (checkOut) checkOutDate = normalizeDateOnly(checkOut);
    if ((checkIn && !checkOut) || (!checkIn && checkOut)) {
      return sendError(res, 'Both check-in and check-out dates are required when releasing with dates', 400);
    }
    if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
      return sendError(res, 'Check-out date must be after check-in date', 400);
    }

    if (tripId) {
      await ensureTripAccess(tripId, req.user);
    }

    const filters = {
      hotelId,
      holdToken,
      status: 'HELD'
    };

    if (checkInDate && checkOutDate) {
      filters.AND = [
        { checkIn: { gte: checkInDate } },
        { checkOut: { lte: checkOutDate } }
      ];
    }

    if (Array.isArray(roomNumbers) && roomNumbers.length > 0) {
      filters.roomNumber = { in: roomNumbers.map((num) => String(num)) };
    }

    if (req.user.role !== 'ADMIN') {
      filters.userId = req.user.id;
    }

    const result = await prisma.hotelRoomAllocation.updateMany({
      where: filters,
      data: {
        status: 'RELEASED',
        holdToken: null,
        holdExpiresAt: null,
        paymentId: null,
        bookingId: null
      }
    });

    sendSuccess(res, { releasedCount: result.count }, 'Room hold released');
  } catch (error) {
    if (error.message === 'INVALID_DATE') {
      return sendError(res, 'Invalid date provided', 400);
    }
    if (error.statusCode === 403) {
      return sendError(res, 'Access denied', 403);
    }
    next(error);
  }
};

/**
 * @desc    Confirm held rooms (mark as booked)
 * @route   POST /api/hotels/:id/confirm
 * @access  Private
 */
exports.confirmRooms = async (req, res, next) => {
  try {
    const { id: hotelId } = req.params;
    const { holdToken, tripId, bookingId, paymentId, roomNumbers, checkIn, checkOut } = req.body;

    if (!holdToken) {
      return sendError(res, 'Hold token is required to confirm rooms', 400);
    }
    if (!tripId) {
      return sendError(res, 'Trip ID is required', 400);
    }

    await ensureTripAccess(tripId, req.user);

    let checkInDate = null;
    let checkOutDate = null;

    if (checkIn && checkOut) {
      checkInDate = normalizeDateOnly(checkIn);
      checkOutDate = normalizeDateOnly(checkOut);
      if (checkOutDate <= checkInDate) {
        return sendError(res, 'Check-out date must be after check-in date', 400);
      }
    }

    const now = new Date();
    const confirmedRooms = [];
    const conflicts = [];

    await prisma.$transaction(async (tx) => {
      const allocations = await tx.hotelRoomAllocation.findMany({
        where: {
          hotelId,
          holdToken,
          userId: req.user.id,
          status: 'HELD',
          ...(checkInDate && checkOutDate
            ? {
                checkIn: { gte: checkInDate },
                checkOut: { lte: checkOutDate }
              }
            : {}),
          ...(Array.isArray(roomNumbers) && roomNumbers.length > 0
            ? { roomNumber: { in: roomNumbers.map((num) => String(num)) } }
            : {})
        }
      });

      if (allocations.length === 0) {
        const error = new Error('No rooms found for the provided hold token');
        error.statusCode = 404;
        throw error;
      }

      for (const allocation of allocations) {
        if (allocation.holdExpiresAt && allocation.holdExpiresAt <= now) {
          conflicts.push({
            roomNumber: allocation.roomNumber,
            reason: 'Hold expired'
          });
          continue;
        }

        await tx.hotelRoomAllocation.update({
          where: { id: allocation.id },
          data: {
            status: 'BOOKED',
            holdToken: null,
            holdExpiresAt: null,
            bookingId: bookingId || null,
            paymentId: paymentId || null
          }
        });
        confirmedRooms.push({
          roomNumber: allocation.roomNumber,
          checkIn: allocation.checkIn.toISOString(),
          checkOut: allocation.checkOut.toISOString()
        });
      }
    });

    if (confirmedRooms.length === 0) {
      return sendError(res, 'Unable to confirm requested rooms', 409, { conflicts });
    }

    sendSuccess(res, { confirmedRooms, conflicts }, 'Rooms confirmed successfully');
  } catch (error) {
    if (error.message === 'INVALID_DATE') {
      return sendError(res, 'Invalid date provided', 400);
    }
    if (error.statusCode === 403) {
      return sendError(res, 'Access denied', 403);
    }
    if (error.statusCode === 404) {
      return sendError(res, error.message || 'Hold token not found', 404);
    }
    next(error);
  }
};
/**
 * @desc    Get hotel room availability with holds
 * @route   GET /api/hotels/:id/rooms
 * @access  Private
 */
exports.getRoomAvailability = async (req, res, next) => {
  try {
    const { id: hotelId } = req.params;
    const { tripId, checkIn, checkOut, holdToken, roomsNeeded } = req.query;

    if (!tripId) {
      return sendError(res, 'Trip ID is required', 400);
    }
    if (!checkIn || !checkOut) {
      return sendError(res, 'Check-in and Check-out dates are required', 400);
    }

    const trip = await ensureTripAccess(tripId, req.user);
    const checkInDate = normalizeDateOnly(checkIn);
    const checkOutDate = normalizeDateOnly(checkOut);

    if (checkOutDate <= checkInDate) {
      return sendError(res, 'Check-out date must be after check-in date', 400);
    }

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId }
    });

    if (!hotel) {
      return sendError(res, 'Hotel not found', 404);
    }

    const [rooms, allocations, bookings] = await prisma.$transaction(async (tx) => {
      await expireStaleRoomHolds(tx, hotelId, checkInDate, checkOutDate);

      const roomList = await tx.hotelRoom.findMany({
        where: { hotelId },
        orderBy: { roomNumber: 'asc' }
      });

      const allocationList = await tx.hotelRoomAllocation.findMany({
        where: {
          hotelId,
          status: { in: ['HELD', 'BOOKED'] },
          AND: [
            { checkIn: { lt: checkOutDate } },
            { checkOut: { gt: checkInDate } }
          ]
        }
      });

      const bookingList = await tx.hotelBooking.findMany({
        where: {
          hotelId,
          AND: [
            { checkIn: { lt: checkOutDate } },
            { checkOut: { gt: checkInDate } }
          ]
        },
        include: {
          booking: {
            select: {
              status: true
            }
          }
        }
      });

      return [roomList, allocationList, bookingList];
    });

    const now = new Date();
    const allocationsByRoom = allocations.reduce((acc, allocation) => {
      if (!acc[allocation.roomNumber]) {
        acc[allocation.roomNumber] = [];
      }
      acc[allocation.roomNumber].push(allocation);
      return acc;
    }, {});

    const bookedRoomsSet = new Set();
    bookings.forEach((booking) => {
      if (
        booking.booking &&
        ['CONFIRMED', 'COMPLETED'].includes(booking.booking.status || '')
      ) {
        const roomNumbers = Array.isArray(booking.roomNumbers)
          ? booking.roomNumbers
          : booking.roomNumbers
          ? JSON.parse(booking.roomNumbers)
          : [];
        roomNumbers.forEach((roomNumber) => bookedRoomsSet.add(String(roomNumber)));
      }
    });

    const normalizedRooms = rooms.map((room) => {
      const roomAllocations = allocationsByRoom[room.roomNumber] || [];
      let status = 'AVAILABLE';
      let activeAllocation = null;

      if (bookedRoomsSet.has(room.roomNumber)) {
        status = 'BOOKED';
      }

      for (const allocation of roomAllocations) {
        if (allocation.status === 'BOOKED') {
          status = 'BOOKED';
          activeAllocation = allocation;
          break;
        }
        if (allocation.status === 'HELD' && allocation.holdExpiresAt && allocation.holdExpiresAt > now) {
          status = 'HELD';
          activeAllocation = allocation;
          if (allocation.userId === req.user.id) {
            break;
          }
        }
      }

      const isHeldByUser =
        activeAllocation &&
        activeAllocation.status === 'HELD' &&
        activeAllocation.userId === req.user.id &&
        (!activeAllocation.holdExpiresAt || activeAllocation.holdExpiresAt > now);

      return {
        id: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        roomType: room.roomType,
        capacity: room.capacity,
        status,
        holdToken: activeAllocation?.holdToken || null,
        holdExpiresAt: activeAllocation?.holdExpiresAt || null,
        userId: activeAllocation?.userId || null,
        isHeldByUser
      };
    });

    let suggestedRooms = [];
    if (roomsNeeded) {
      const availableRooms = normalizedRooms.filter((room) => room.status === 'AVAILABLE');
      const suggestion = findConsecutiveRooms(availableRooms, parseInt(roomsNeeded, 10));
      if (suggestion) {
        suggestedRooms = suggestion.map((room) => room.roomNumber);
      }
    }

    const ownAllocation = allocations.find(
      (allocation) =>
        allocation.userId === req.user.id &&
        allocation.status === 'HELD' &&
        (!allocation.holdExpiresAt || allocation.holdExpiresAt > now) &&
        allocation.holdToken &&
        (!holdToken || allocation.holdToken === holdToken)
    );

    sendSuccess(
      res,
      {
        hotel: {
          id: hotel.id,
          name: hotel.name,
          location: hotel.location
        },
        trip: {
          id: trip.id,
          travelers: trip.travelers
        },
        rooms: normalizedRooms,
        suggestedRooms,
        holdToken: ownAllocation?.holdToken || holdToken || null,
        expiresAt: ownAllocation?.holdExpiresAt?.toISOString() || null
      },
      'Hotel room availability retrieved successfully'
    );
  } catch (error) {
    if (error.message === 'INVALID_DATE') {
      return sendError(res, 'Invalid date provided', 400);
    }
    if (error.statusCode === 403) {
      return sendError(res, 'Access denied', 403);
    }
    if (error.statusCode === 404) {
      return sendError(res, 'Trip not found', 404);
    }
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



