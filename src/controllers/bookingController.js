const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();

/**
 * @desc    Create booking
 * @route   POST /api/bookings
 * @access  Private
 */
exports.createBooking = async (req, res, next) => {
  try {
    const { tripId, busSeatId, hotelRoomId } = req.body;

    if (!tripId || (!busSeatId && !hotelRoomId)) {
      return sendError(res, 'Please provide trip ID and at least one of bus seat or hotel room', 400);
    }

    // Check if trip exists
    const trip = await prisma.trip.findUnique({
      where: { id: tripId }
    });

    if (!trip) {
      return sendError(res, 'Trip not found', 404);
    }

    let totalPrice = 0;
    const bookingData = {
      userId: req.user.id,
      tripId,
      totalPrice: 0,
      status: 'PENDING'
    };

    // Handle bus seat booking
    if (busSeatId) {
      const busSeat = await prisma.busSeat.findUnique({
        where: { id: busSeatId },
        include: { bus: true }
      });

      if (!busSeat) {
        return sendError(res, 'Bus seat not found', 404);
      }

      if (busSeat.isBooked) {
        return sendError(res, 'Bus seat is already booked', 400);
      }

      totalPrice += busSeat.bus.pricePerSeat;
    }

    // Handle hotel room booking
    if (hotelRoomId) {
      const hotelRoom = await prisma.hotelRoom.findUnique({
        where: { id: hotelRoomId },
        include: { hotel: true }
      });

      if (!hotelRoom) {
        return sendError(res, 'Hotel room not found', 404);
      }

      if (hotelRoom.isBooked) {
        return sendError(res, 'Hotel room is already booked', 400);
      }

      // Calculate price based on trip duration
      const days = Math.ceil((trip.endDate - trip.startDate) / (1000 * 60 * 60 * 24));
      totalPrice += hotelRoom.hotel.pricePerRoom * days;
    }

    bookingData.totalPrice = totalPrice;

    // Create booking and update seats/rooms in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create booking
      const booking = await tx.booking.create({
        data: bookingData,
        include: {
          trip: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      // Update bus seat if provided
      if (busSeatId) {
        await tx.busSeat.update({
          where: { id: busSeatId },
          data: {
            isBooked: true,
            bookingId: booking.id
          }
        });
      }

      // Update hotel room if provided
      if (hotelRoomId) {
        await tx.hotelRoom.update({
          where: { id: hotelRoomId },
          data: {
            isBooked: true,
            bookingId: booking.id
          }
        });
      }

      // Update trip status to BOOKED
      await tx.trip.update({
        where: { id: tripId },
        data: { status: 'BOOKED' }
      });

      // Update group member status if user is part of a pool group for this trip
      const groupMember = await tx.groupMember.findFirst({
        where: {
          userId: req.user.id,
          poolGroup: {
            tripId: tripId
          },
          status: 'APPROVED'
        }
      });

      if (groupMember) {
        await tx.groupMember.update({
          where: { id: groupMember.id },
          data: { status: 'BOOKED' }
        });
      }

      return booking;
    });

    // Fetch complete booking with all details
    const completeBooking = await prisma.booking.findUnique({
      where: { id: result.id },
      include: {
        trip: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
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
    });

    sendSuccess(res, { booking: completeBooking }, 'Booking created successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all bookings for user
 * @route   GET /api/bookings
 * @access  Private
 */
exports.getAllBookings = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { status } = req.query;

    const where = { userId: req.user.id };

    if (status) {
      where.status = status;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          trip: true,
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
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.booking.count({ where })
    ]);

    sendPaginated(res, { bookings }, { page, limit, total }, 'Bookings retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single booking by ID
 * @route   GET /api/bookings/:id
 * @access  Private
 */
exports.getBookingById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        trip: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
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
    });

    if (!booking) {
      return sendError(res, 'Booking not found', 404);
    }

    // Check if user has access
    if (booking.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'Access denied', 403);
    }

    sendSuccess(res, { booking }, 'Booking retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel booking
 * @route   PATCH /api/bookings/:id/cancel
 * @access  Private
 */
exports.cancelBooking = async (req, res, next) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        busSeat: true,
        hotelRoom: true
      }
    });

    if (!booking) {
      return sendError(res, 'Booking not found', 404);
    }

    // Check ownership
    if (booking.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'Access denied', 403);
    }

    if (booking.status === 'CANCELLED') {
      return sendError(res, 'Booking is already cancelled', 400);
    }

    // Cancel booking and release seats/rooms in transaction
    await prisma.$transaction(async (tx) => {
      // Update booking status
      await tx.booking.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });

      // Release bus seat if exists
      if (booking.busSeat) {
        await tx.busSeat.update({
          where: { id: booking.busSeat.id },
          data: {
            isBooked: false,
            bookingId: null
          }
        });
      }

      // Release hotel room if exists
      if (booking.hotelRoom) {
        await tx.hotelRoom.update({
          where: { id: booking.hotelRoom.id },
          data: {
            isBooked: false,
            bookingId: null
          }
        });
      }

      // Update group member status back to APPROVED if exists
      const groupMember = await tx.groupMember.findFirst({
        where: {
          userId: booking.userId,
          poolGroup: {
            tripId: booking.tripId
          },
          status: 'BOOKED'
        }
      });

      if (groupMember) {
        await tx.groupMember.update({
          where: { id: groupMember.id },
          data: { status: 'APPROVED' }
        });
      }
    });

    sendSuccess(res, {}, 'Booking cancelled successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Confirm booking (Admin only)
 * @route   PATCH /api/bookings/:id/confirm
 * @access  Private (Admin)
 */
exports.confirmBooking = async (req, res, next) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMED' },
      include: {
        trip: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
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
    });

    sendSuccess(res, { booking }, 'Booking confirmed successfully');
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 'Booking not found', 404);
    }
    next(error);
  }
};


