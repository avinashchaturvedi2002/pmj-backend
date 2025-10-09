const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();

/**
 * @desc    Get all users (Admin only)
 * @route   GET /api/admin/users
 * @access  Private (Admin)
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { role, search } = req.query;

    const where = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              trips: true,
              bookings: true,
              poolGroups: true
            }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    sendPaginated(res, { users }, { page, limit, total }, 'Users retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all bookings (Admin only)
 * @route   GET /api/admin/bookings
 * @access  Private (Admin)
 */
exports.getAllBookingsAdmin = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { status, userId, tripId } = req.query;

    const where = {};

    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (tripId) where.tripId = tripId;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
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

    sendPaginated(res, { bookings }, { page, limit, total }, 'All bookings retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all pool groups (Admin only)
 * @route   GET /api/admin/pool-groups
 * @access  Private (Admin)
 */
exports.getAllPoolGroupsAdmin = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { status } = req.query;

    const where = {};
    if (status) where.status = status;

    const [poolGroups, total] = await Promise.all([
      prisma.poolGroup.findMany({
        where,
        include: {
          trip: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },
          _count: {
            select: { members: true }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.poolGroup.count({ where })
    ]);

    sendPaginated(res, { poolGroups }, { page, limit, total }, 'All pool groups retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get pending group member requests (Admin only)
 * @route   GET /api/admin/group-requests/pending
 * @access  Private (Admin)
 */
exports.getPendingGroupRequests = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);

    const [requests, total] = await Promise.all([
      prisma.groupMember.findMany({
        where: { status: 'PENDING' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          poolGroup: {
            include: {
              trip: true,
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { joinedAt: 'asc' }
      }),
      prisma.groupMember.count({ where: { status: 'PENDING' } })
    ]);

    sendPaginated(res, { requests }, { page, limit, total }, 'Pending group requests retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve group member request (Admin)
 * @route   PATCH /api/admin/group-requests/:requestId/approve
 * @access  Private (Admin)
 */
exports.approveGroupRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    const member = await prisma.groupMember.findUnique({
      where: { id: requestId },
      include: {
        poolGroup: true
      }
    });

    if (!member) {
      return sendError(res, 'Group request not found', 404);
    }

    if (member.status !== 'PENDING') {
      return sendError(res, `Request is already ${member.status.toLowerCase()}`, 400);
    }

    // Check if group is full
    const approvedCount = await prisma.groupMember.count({
      where: {
        poolGroupId: member.poolGroupId,
        status: 'APPROVED'
      }
    });

    if (approvedCount >= member.poolGroup.groupSize) {
      return sendError(res, 'Group is already full', 400);
    }

    // Approve request and update group
    await prisma.$transaction(async (tx) => {
      await tx.groupMember.update({
        where: { id: requestId },
        data: { status: 'APPROVED' }
      });

      await tx.poolGroup.update({
        where: { id: member.poolGroupId },
        data: {
          currentSize: { increment: 1 },
          status: approvedCount + 1 >= member.poolGroup.groupSize ? 'CLOSED' : 'OPEN'
        }
      });
    });

    sendSuccess(res, {}, 'Group request approved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reject group member request (Admin)
 * @route   PATCH /api/admin/group-requests/:requestId/reject
 * @access  Private (Admin)
 */
exports.rejectGroupRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    const member = await prisma.groupMember.update({
      where: { id: requestId },
      data: { status: 'REJECTED' }
    });

    sendSuccess(res, { member }, 'Group request rejected successfully');
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 'Group request not found', 404);
    }
    next(error);
  }
};

/**
 * @desc    Get dashboard statistics (Admin)
 * @route   GET /api/admin/dashboard/stats
 * @access  Private (Admin)
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalTrips,
      totalBookings,
      totalPoolGroups,
      totalBuses,
      totalHotels,
      totalPackages,
      pendingRequests,
      recentBookings
    ] = await Promise.all([
      prisma.user.count(),
      prisma.trip.count(),
      prisma.booking.count(),
      prisma.poolGroup.count(),
      prisma.bus.count(),
      prisma.hotel.count(),
      prisma.package.count(),
      prisma.groupMember.count({ where: { status: 'PENDING' } }),
      prisma.booking.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          trip: {
            select: {
              destination: true
            }
          }
        }
      })
    ]);

    // Get revenue statistics
    const revenueStats = await prisma.booking.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { totalPrice: true },
      _avg: { totalPrice: true }
    });

    sendSuccess(res, {
      overview: {
        totalUsers,
        totalTrips,
        totalBookings,
        totalPoolGroups,
        totalBuses,
        totalHotels,
        totalPackages,
        pendingRequests
      },
      revenue: {
        total: revenueStats._sum.totalPrice || 0,
        average: revenueStats._avg.totalPrice || 0
      },
      recentBookings
    }, 'Dashboard statistics retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user role (Admin only)
 * @route   PATCH /api/admin/users/:userId/role
 * @access  Private (Admin)
 */
exports.updateUserRole = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['USER', 'ADMIN'].includes(role)) {
      return sendError(res, 'Invalid role. Must be USER or ADMIN', 400);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    sendSuccess(res, { user }, 'User role updated successfully');
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 'User not found', 404);
    }
    next(error);
  }
};


