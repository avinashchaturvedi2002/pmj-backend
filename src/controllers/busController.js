const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();
const HOLD_DURATION_SECONDS = parseInt(process.env.SEAT_HOLD_DURATION_SECONDS || '300', 10);

const expireStaleSeatHolds = async (tx, busId, journeyDate) => {
  const now = new Date();
  await tx.busSeatReservation.updateMany({
    where: {
      busId,
      journeyDate,
      status: 'HELD',
      holdExpiresAt: {
        lt: now
      }
    },
    data: {
      status: 'EXPIRED',
      holdToken: null,
      holdExpiresAt: null,
      paymentId: null
    }
  });
};

const normalizeDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('INVALID_DATE');
  }
  // Ensure date portion only (UTC midnight)
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
 * @desc    Detailed seat map with reservations
 * @route   GET /api/buses/:id/seats
 * @access  Private
 */
exports.getSeatMap = async (req, res, next) => {
  try {
    const { id: busId } = req.params;
    const { tripId, journeyDate, holdToken } = req.query;

    if (!tripId) {
      return sendError(res, 'Trip ID is required', 400);
    }
    if (!journeyDate) {
      return sendError(res, 'Journey date is required', 400);
    }

    const trip = await ensureTripAccess(tripId, req.user);
    const journeyDateValue = normalizeDate(journeyDate);

    const bus = await prisma.bus.findUnique({
      where: { id: busId }
    });
    if (!bus) {
      return sendError(res, 'Bus not found', 404);
    }

    const [seats, reservations, bookings] = await prisma.$transaction(async (tx) => {
      await expireStaleSeatHolds(tx, busId, journeyDateValue);

      const seatList = await tx.busSeat.findMany({
        where: { busId },
        orderBy: { seatNumber: 'asc' }
      });

      const reservationList = await tx.busSeatReservation.findMany({
        where: {
          busId,
          journeyDate: journeyDateValue,
          status: { in: ['HELD', 'BOOKED'] }
        }
      });

      const bookingList = await tx.busBooking.findMany({
        where: {
          busId,
          bookingDate: journeyDateValue
        },
        include: {
          booking: {
            select: {
              status: true
            }
          }
        }
      });

      return [seatList, reservationList, bookingList];
    });

    const now = new Date();
    const reservationMap = new Map();
    reservations.forEach((reservation) => {
      reservationMap.set(reservation.seatNumber, reservation);
    });

    const bookedSeatNumbers = new Set();
    bookings.forEach((booking) => {
      if (
        booking.booking &&
        ['CONFIRMED', 'COMPLETED'].includes(booking.booking.status || '')
      ) {
        const seatNumbers = Array.isArray(booking.seatNumbers)
          ? booking.seatNumbers
          : booking.seatNumbers
          ? JSON.parse(booking.seatNumbers)
          : [];
        seatNumbers.forEach((seatNumber) => bookedSeatNumbers.add(String(seatNumber)));
      }
    });

    const normalizedSeats = seats.map((seat, index) => {
      const reservation = reservationMap.get(seat.seatNumber);
      let status = 'AVAILABLE';
      let reservationToken = null;
      let reservationUserId = null;

      if (bookedSeatNumbers.has(seat.seatNumber)) {
        status = 'BOOKED';
      } else if (reservation) {
        if (reservation.status === 'BOOKED') {
          status = 'BOOKED';
          reservationToken = reservation.holdToken;
          reservationUserId = reservation.userId;
        } else if (reservation.status === 'HELD') {
          status = reservation.holdExpiresAt && reservation.holdExpiresAt > now ? 'HELD' : 'AVAILABLE';
          if (status === 'HELD') {
            reservationToken = reservation.holdToken;
            reservationUserId = reservation.userId;
          }
        }
      }

      return {
        id: seat.id,
        seatNumber: seat.seatNumber,
        deck: seat.deck,
        rowIndex: seat.rowIndex ?? Math.floor(index / 4),
        columnIndex: seat.columnIndex ?? index % 4,
        seatType: seat.seatType,
        status,
        holdToken: reservationToken,
        userId: reservationUserId
      };
    });

    const ownReservation = reservations.find((reservation) => {
      if (reservation.userId !== req.user.id) return false;
      if (!reservation.holdToken) return false;
      if (reservation.status !== 'HELD') return false;
      if (reservation.holdExpiresAt && reservation.holdExpiresAt <= now) return false;
      if (holdToken) return reservation.holdToken === holdToken;
      return true;
    });

    sendSuccess(res, {
      bus: {
        id: bus.id,
        busNumber: bus.busNumber,
        busName: bus.busName
      },
      trip: {
        id: trip.id,
        travelers: trip.travelers
      },
      seats: normalizedSeats,
      holdToken: ownReservation?.holdToken || holdToken || null,
      expiresAt: ownReservation?.holdExpiresAt?.toISOString() || null
    }, 'Seat map retrieved successfully');
  } catch (error) {
    if (error.message === 'INVALID_DATE') {
      return sendError(res, 'Invalid journey date provided', 400);
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
 * @desc    Hold seats for a user (temporary lock)
 * @route   POST /api/buses/:id/hold
 * @access  Private
 */
exports.holdSeats = async (req, res, next) => {
  try {
    const { id: busId } = req.params;
    const { tripId, journeyDate, seatNumbers, holdToken } = req.body;

    if (!tripId) {
      return sendError(res, 'Trip ID is required', 400);
    }
    if (!journeyDate) {
      return sendError(res, 'Journey date is required', 400);
    }
    if (!Array.isArray(seatNumbers) || seatNumbers.length === 0) {
      return sendError(res, 'Provide at least one seat number to hold', 400);
    }

    await ensureTripAccess(tripId, req.user);
    const journeyDateValue = normalizeDate(journeyDate);

    const seats = await prisma.busSeat.findMany({
      where: {
        busId,
        seatNumber: { in: seatNumbers.map(String) }
      }
    });

    if (seats.length === 0) {
      return sendError(res, 'Invalid seat numbers provided', 400);
    }

    const seatsMap = new Map();
    seats.forEach((seat) => seatsMap.set(seat.seatNumber, seat));

    const sanitizedSeatNumbers = [...new Set(seatNumbers.map(String))].filter((seat) => seatsMap.has(seat));
    if (sanitizedSeatNumbers.length === 0) {
      return sendError(res, 'No valid seats to hold', 400);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_DURATION_SECONDS * 1000);
    const token = holdToken || `seat_${crypto.randomUUID()}`;
    const heldSeats = [];
    const rejectedSeats = [];

    await prisma.$transaction(async (tx) => {
      await expireStaleSeatHolds(tx, busId, journeyDateValue);

      for (const seatNumber of sanitizedSeatNumbers) {
        const existingReservation = await tx.busSeatReservation.findUnique({
          where: {
            busId_journeyDate_seatNumber: {
              busId,
              journeyDate: journeyDateValue,
              seatNumber
            }
          }
        });

        if (!existingReservation) {
          await tx.busSeatReservation.create({
            data: {
              busId,
              busSeatId: seatsMap.get(seatNumber).id,
              tripId,
              journeyDate: journeyDateValue,
              seatNumber,
              status: 'HELD',
              holdToken: token,
              holdExpiresAt: expiresAt,
              userId: req.user.id
            }
          });
          heldSeats.push(seatNumber);
          continue;
        }

        if (existingReservation.status === 'BOOKED') {
          rejectedSeats.push({ seatNumber, reason: 'Seat already booked' });
          continue;
        }

        if (existingReservation.status === 'HELD') {
          const isExpired = existingReservation.holdExpiresAt && existingReservation.holdExpiresAt <= now;
          const sameUserHold = existingReservation.userId === req.user.id && existingReservation.holdToken === token;

          if (sameUserHold || isExpired || existingReservation.userId === req.user.id) {
            await tx.busSeatReservation.update({
              where: {
                busId_journeyDate_seatNumber: {
                  busId,
                  journeyDate: journeyDateValue,
                  seatNumber
                }
              },
              data: {
                tripId,
                status: 'HELD',
                holdToken: token,
                holdExpiresAt: expiresAt,
                userId: req.user.id,
                paymentId: null,
                bookingId: null
              }
            });
            heldSeats.push(seatNumber);
          } else {
            rejectedSeats.push({ seatNumber, reason: 'Seat currently held by another traveler' });
          }
          continue;
        }

        // For RELEASED / EXPIRED states re-assign the hold
        await tx.busSeatReservation.update({
          where: {
            busId_journeyDate_seatNumber: {
              busId,
              journeyDate: journeyDateValue,
              seatNumber
            }
          },
          data: {
            tripId,
            status: 'HELD',
            holdToken: token,
            holdExpiresAt: expiresAt,
            userId: req.user.id,
            paymentId: null,
            bookingId: null
          }
        });
        heldSeats.push(seatNumber);
      }
    });

    if (heldSeats.length === 0) {
      return sendError(res, 'Unable to hold requested seats', 409, {
        rejectedSeats
      });
    }

    sendSuccess(res, {
      holdToken: token,
      expiresAt: expiresAt.toISOString(),
      heldSeats,
      rejectedSeats
    }, 'Seats held successfully');
  } catch (error) {
    if (error.message === 'INVALID_DATE') {
      return sendError(res, 'Invalid journey date provided', 400);
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
 * @desc    Release held seats
 * @route   DELETE /api/buses/:id/hold/:holdToken
 * @access  Private
 */
exports.releaseSeats = async (req, res, next) => {
  try {
    const { id: busId, holdToken } = req.params;
    const { tripId, journeyDate, seatNumbers } = req.body || {};

    if (!holdToken) {
      return sendError(res, 'Hold token is required', 400);
    }

    const journeyDateValue = journeyDate ? normalizeDate(journeyDate) : null;
    if (journeyDate && !journeyDateValue) {
      return sendError(res, 'Invalid journey date provided', 400);
    }

    if (tripId) {
      await ensureTripAccess(tripId, req.user);
    }

    const filters = {
      busId,
      holdToken,
      status: 'HELD'
    };

    if (journeyDateValue) {
      filters.journeyDate = journeyDateValue;
    }
    if (Array.isArray(seatNumbers) && seatNumbers.length > 0) {
      filters.seatNumber = { in: seatNumbers.map(String) };
    }

    if (req.user.role !== 'ADMIN') {
      filters.userId = req.user.id;
    }

    const result = await prisma.busSeatReservation.updateMany({
      where: filters,
      data: {
        status: 'RELEASED',
        holdToken: null,
        holdExpiresAt: null,
        paymentId: null,
        bookingId: null
      }
    });

    sendSuccess(res, {
      releasedCount: result.count
    }, 'Seat hold released');
  } catch (error) {
    if (error.message === 'INVALID_DATE') {
      return sendError(res, 'Invalid journey date provided', 400);
    }
    if (error.statusCode === 403) {
      return sendError(res, 'Access denied', 403);
    }
    next(error);
  }
};

/**
 * @desc    Confirm held seats (mark as booked)
 * @route   POST /api/buses/:id/confirm
 * @access  Private
 */
exports.confirmSeats = async (req, res, next) => {
  try {
    const { id: busId } = req.params;
    const { holdToken, tripId, bookingId, paymentId, legs = [] } = req.body;

    if (!holdToken) {
      return sendError(res, 'Hold token is required to confirm seats', 400);
    }
    if (!tripId) {
      return sendError(res, 'Trip ID is required', 400);
    }
    if (!Array.isArray(legs) || legs.length === 0) {
      return sendError(res, 'Seat confirmation requires journey legs payload', 400);
    }

    await ensureTripAccess(tripId, req.user);

    const now = new Date();
    const confirmedSeats = [];
    const conflicts = [];

    await prisma.$transaction(async (tx) => {
      for (const leg of legs) {
        const journeyDateValue = normalizeDate(leg.journeyDate);
        const seatNumbers = Array.isArray(leg.seatNumbers) ? leg.seatNumbers.map(String) : [];
        if (seatNumbers.length === 0) {
          continue;
        }

        await expireStaleSeatHolds(tx, busId, journeyDateValue);

        for (const seatNumber of seatNumbers) {
          const reservation = await tx.busSeatReservation.findUnique({
            where: {
              busId_journeyDate_seatNumber: {
                busId,
                journeyDate: journeyDateValue,
                seatNumber
              }
            }
          });

          if (!reservation) {
            conflicts.push({ seatNumber, journeyDate: journeyDateValue.toISOString(), reason: 'Seat not held' });
            continue;
          }

          if (reservation.status === 'BOOKED') {
            conflicts.push({ seatNumber, journeyDate: journeyDateValue.toISOString(), reason: 'Seat already booked' });
            continue;
          }

          if (reservation.holdToken !== holdToken || reservation.userId !== req.user.id) {
            conflicts.push({ seatNumber, journeyDate: journeyDateValue.toISOString(), reason: 'Hold token mismatch' });
            continue;
          }

          if (reservation.holdExpiresAt && reservation.holdExpiresAt <= now) {
            conflicts.push({ seatNumber, journeyDate: journeyDateValue.toISOString(), reason: 'Hold expired' });
            continue;
          }

          await tx.busSeatReservation.update({
            where: {
              busId_journeyDate_seatNumber: {
                busId,
                journeyDate: journeyDateValue,
                seatNumber
              }
            },
            data: {
              status: 'BOOKED',
              holdToken: null,
              holdExpiresAt: null,
              bookingId: bookingId || null,
              paymentId: paymentId || null
            }
          });
          confirmedSeats.push({ seatNumber, journeyDate: journeyDateValue.toISOString() });
        }
      }
    });

    if (conflicts.length > 0) {
      return sendError(res, 'Some seats could not be confirmed', 409, {
        confirmedSeats,
        conflicts
      });
    }

    sendSuccess(res, {
      confirmedSeats
    }, 'Seats confirmed successfully');
  } catch (error) {
    if (error.message === 'INVALID_DATE') {
      return sendError(res, 'Invalid journey date provided', 400);
    }
    if (error.statusCode === 403) {
      return sendError(res, 'Access denied', 403);
    }
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



