const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();

/**
 * @desc    Create new pool group
 * @route   POST /api/pooling
 * @access  Private
 */
exports.createPoolGroup = async (req, res, next) => {
  try {
    const { tripId, groupSize, description } = req.body;

    if (!tripId || !groupSize) {
      return sendError(res, 'Please provide trip ID and group size', 400);
    }

    if (groupSize < 2) {
      return sendError(res, 'Group size must be at least 2', 400);
    }

    // Check if trip exists and user owns it
    const trip = await prisma.trip.findUnique({
      where: { id: tripId }
    });

    if (!trip) {
      return sendError(res, 'Trip not found', 404);
    }

    if (trip.createdById !== req.user.id) {
      return sendError(res, 'You can only create pool groups for your own trips', 403);
    }

    // Create pool group
    const poolGroup = await prisma.poolGroup.create({
      data: {
        tripId,
        groupSize: parseInt(groupSize),
        currentSize: 1,
        description,
        status: 'OPEN',
        createdById: req.user.id
      },
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
    });

    // Auto-add creator as first member with APPROVED status
    await prisma.groupMember.create({
      data: {
        poolGroupId: poolGroup.id,
        userId: req.user.id,
        status: 'APPROVED'
      }
    });

    sendSuccess(res, { poolGroup }, 'Pool group created successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all pool groups (with filters)
 * @route   GET /api/pooling
 * @access  Private
 */
exports.getAllPoolGroups = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { destination, status, minSize, maxSize } = req.query;

    const where = {};

    // Filter by destination (through trip)
    if (destination) {
      where.trip = {
        destination: {
          contains: destination,
          mode: 'insensitive'
        }
      };
    }

    if (status) {
      where.status = status;
    } else {
      // By default, show only OPEN groups
      where.status = 'OPEN';
    }

    if (minSize || maxSize) {
      where.groupSize = {};
      if (minSize) where.groupSize.gte = parseInt(minSize);
      if (maxSize) where.groupSize.lte = parseInt(maxSize);
    }

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
            where: { status: 'APPROVED' },
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

    sendPaginated(res, { poolGroups }, { page, limit, total }, 'Pool groups retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single pool group by ID
 * @route   GET /api/pooling/:id
 * @access  Private
 */
exports.getPoolGroupById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id },
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
          },
          orderBy: { joinedAt: 'asc' }
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

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    sendSuccess(res, { poolGroup }, 'Pool group retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Join pool group (send request)
 * @route   POST /api/pooling/:id/join
 * @access  Private
 */
exports.joinPoolGroup = async (req, res, next) => {
  try {
    const { id } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id },
      include: {
        members: true
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    if (poolGroup.status !== 'OPEN') {
      return sendError(res, 'This pool group is not accepting new members', 400);
    }

    // Check if user is already a member
    const existingMember = poolGroup.members.find(m => m.userId === req.user.id);
    if (existingMember) {
      return sendError(res, `You have already ${existingMember.status.toLowerCase()} this group`, 400);
    }

    // Check if group is full (counting only APPROVED members)
    const approvedCount = poolGroup.members.filter(m => m.status === 'APPROVED').length;
    if (approvedCount >= poolGroup.groupSize) {
      return sendError(res, 'This pool group is full', 400);
    }

    // Create join request
    const member = await prisma.groupMember.create({
      data: {
        poolGroupId: id,
        userId: req.user.id,
        status: 'PENDING'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    sendSuccess(res, { member }, 'Join request sent successfully. Waiting for admin approval', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve/Reject join request (Admin/Creator only)
 * @route   PATCH /api/pooling/:groupId/members/:memberId
 * @access  Private (Admin or Group Creator)
 */
exports.updateMemberStatus = async (req, res, next) => {
  try {
    const { groupId, memberId } = req.params;
    const { status } = req.body; // APPROVED or REJECTED

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return sendError(res, 'Invalid status. Must be APPROVED or REJECTED', 400);
    }

    // Get pool group
    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        members: true
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    // Check if user is admin or group creator
    if (req.user.role !== 'ADMIN' && poolGroup.createdById !== req.user.id) {
      return sendError(res, 'Only admin or group creator can approve/reject requests', 403);
    }

    // Get member
    const member = poolGroup.members.find(m => m.id === memberId);
    if (!member) {
      return sendError(res, 'Member not found in this group', 404);
    }

    if (member.status !== 'PENDING') {
      return sendError(res, `Member request is already ${member.status.toLowerCase()}`, 400);
    }

    // If approving, check if group is full
    if (status === 'APPROVED') {
      const approvedCount = poolGroup.members.filter(m => m.status === 'APPROVED').length;
      if (approvedCount >= poolGroup.groupSize) {
        return sendError(res, 'Group is already full', 400);
      }
    }

    // Update member status
    const updatedMember = await prisma.groupMember.update({
      where: { id: memberId },
      data: { status },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Update group current size and status if approved
    if (status === 'APPROVED') {
      const newApprovedCount = poolGroup.members.filter(m => 
        m.status === 'APPROVED' || m.id === memberId
      ).length;

      await prisma.poolGroup.update({
        where: { id: groupId },
        data: {
          currentSize: newApprovedCount,
          status: newApprovedCount >= poolGroup.groupSize ? 'CLOSED' : 'OPEN'
        }
      });
    }

    sendSuccess(res, { member: updatedMember }, `Member request ${status.toLowerCase()} successfully`);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Leave pool group
 * @route   DELETE /api/pooling/:groupId/leave
 * @access  Private
 */
exports.leavePoolGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    // Group creator cannot leave
    if (poolGroup.createdById === req.user.id) {
      return sendError(res, 'Group creator cannot leave. Please delete the group instead', 400);
    }

    // Find member record
    const member = await prisma.groupMember.findFirst({
      where: {
        poolGroupId: groupId,
        userId: req.user.id
      }
    });

    if (!member) {
      return sendError(res, 'You are not a member of this group', 400);
    }

    // Update member status to CANCELLED
    await prisma.groupMember.update({
      where: { id: member.id },
      data: { status: 'CANCELLED' }
    });

    // Update group size if member was approved
    if (member.status === 'APPROVED') {
      await prisma.poolGroup.update({
        where: { id: groupId },
        data: {
          currentSize: { decrement: 1 },
          status: 'OPEN' // Reopen group when someone leaves
        }
      });
    }

    sendSuccess(res, {}, 'Left pool group successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete pool group (Creator or Admin only)
 * @route   DELETE /api/pooling/:id
 * @access  Private (Creator or Admin)
 */
exports.deletePoolGroup = async (req, res, next) => {
  try {
    const { id } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    // Check ownership
    if (poolGroup.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'Access denied', 403);
    }

    await prisma.poolGroup.delete({
      where: { id }
    });

    sendSuccess(res, {}, 'Pool group deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get my pool groups (created by me or joined)
 * @route   GET /api/pooling/my/groups
 * @access  Private
 */
exports.getMyPoolGroups = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);

    // Get groups created by user or where user is a member
    const [poolGroups, total] = await Promise.all([
      prisma.poolGroup.findMany({
        where: {
          OR: [
            { createdById: req.user.id },
            {
              members: {
                some: {
                  userId: req.user.id
                }
              }
            }
          ]
        },
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
            where: { userId: req.user.id }
          },
          _count: {
            select: { members: true }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.poolGroup.count({
        where: {
          OR: [
            { createdById: req.user.id },
            {
              members: {
                some: {
                  userId: req.user.id
                }
              }
            }
          ]
        }
      })
    ]);

    sendPaginated(res, { poolGroups }, { page, limit, total }, 'My pool groups retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Set package and per-person cost for group (Admin/Creator only)
 * @route   POST /api/pooling/:groupId/set-package
 * @access  Private (Admin or Group Creator)
 */
exports.setGroupPackage = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { packageId, perPersonCost, paymentDeadline } = req.body;

    if (!packageId || !perPersonCost) {
      return sendError(res, 'Please provide package ID and per-person cost', 400);
    }

    // Get pool group
    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        members: true
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    // Check if user is admin or group creator
    if (req.user.role !== 'ADMIN' && poolGroup.createdById !== req.user.id) {
      return sendError(res, 'Only admin or group creator can set package', 403);
    }

    // Validate package exists
    const packageExists = await prisma.package.findUnique({
      where: { id: packageId }
    });

    if (!packageExists) {
      return sendError(res, 'Package not found', 404);
    }

    // Update pool group
    const updatedGroup = await prisma.poolGroup.update({
      where: { id: groupId },
      data: {
        selectedPackageId: packageId,
        perPersonCost: parseInt(perPersonCost),
        paymentDeadline: paymentDeadline ? new Date(paymentDeadline) : null,
        packageApprovedBy: '[]' // Reset approvals when new package is set
      },
      include: {
        selectedPackage: {
          include: {
            bus: true,
            hotel: true
          }
        },
        trip: true,
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
        }
      }
    });

    sendSuccess(res, { poolGroup: updatedGroup }, 'Package set successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Member approves selected package
 * @route   POST /api/pooling/:groupId/approve-package
 * @access  Private
 */
exports.approvePackage = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    // Get pool group
    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        members: true
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    if (!poolGroup.selectedPackageId) {
      return sendError(res, 'No package selected for this group', 400);
    }

    // Check if user is a member
    const member = poolGroup.members.find(m => m.userId === req.user.id);
    if (!member) {
      return sendError(res, 'You are not a member of this group', 400);
    }

    if (member.status !== 'APPROVED') {
      return sendError(res, 'Only approved members can approve packages', 400);
    }

    // Parse existing approvals
    let approvedBy = [];
    try {
      approvedBy = JSON.parse(poolGroup.packageApprovedBy || '[]');
    } catch (e) {
      approvedBy = [];
    }

    // Add user if not already approved
    if (!approvedBy.includes(req.user.id)) {
      approvedBy.push(req.user.id);
    }

    // Update pool group
    const updatedGroup = await prisma.poolGroup.update({
      where: { id: groupId },
      data: {
        packageApprovedBy: JSON.stringify(approvedBy)
      },
      include: {
        selectedPackage: {
          include: {
            bus: true,
            hotel: true
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
        }
      }
    });

    sendSuccess(res, {
      poolGroup: updatedGroup,
      approvedCount: approvedBy.length,
      totalApproved: approvedBy.length,
      totalMembers: poolGroup.members.filter(m => m.status === 'APPROVED').length
    }, 'Package approved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check group payment status
 * @route   GET /api/pooling/:groupId/payment-status
 * @access  Private
 */
exports.checkGroupPaymentStatus = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
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
        }
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    const approvedMembers = poolGroup.members.filter(m => m.status === 'APPROVED' || m.status === 'PAID');
    const paidMembers = poolGroup.members.filter(m => m.status === 'PAID');
    const pendingMembers = poolGroup.members.filter(m => m.status === 'APPROVED');
    const failedMembers = poolGroup.members.filter(m => m.status === 'PAYMENT_FAILED');

    const allPaid = approvedMembers.length > 0 && approvedMembers.length === paidMembers.length;

    sendSuccess(res, {
      groupId: poolGroup.id,
      status: poolGroup.status,
      perPersonCost: poolGroup.perPersonCost,
      paymentDeadline: poolGroup.paymentDeadline,
      members: poolGroup.members.map(m => ({
        id: m.id,
        user: m.user,
        status: m.status,
        paymentStatus: m.paymentStatus,
        amountPaid: m.amountPaid,
        paidAt: m.paidAt
      })),
      summary: {
        totalMembers: approvedMembers.length,
        paidMembers: paidMembers.length,
        pendingMembers: pendingMembers.length,
        failedMembers: failedMembers.length,
        allPaid,
        totalCollected: paidMembers.reduce((sum, m) => sum + (m.amountPaid || 0), 0)
      }
    }, 'Payment status retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Lock group after all payments (Admin/Creator only)
 * @route   POST /api/pooling/:groupId/lock
 * @access  Private (Admin or Group Creator)
 */
exports.lockGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        members: true,
        selectedPackage: {
          include: {
            bus: true,
            hotel: true
          }
        },
        trip: true
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    // Check if user is admin or group creator
    if (req.user.role !== 'ADMIN' && poolGroup.createdById !== req.user.id) {
      return sendError(res, 'Only admin or group creator can lock group', 403);
    }

    // Verify all approved members have paid
    const approvedMembers = poolGroup.members.filter(m => m.status === 'APPROVED' || m.status === 'PAID');
    const paidMembers = poolGroup.members.filter(m => m.status === 'PAID');

    if (approvedMembers.length === 0) {
      return sendError(res, 'No approved members in group', 400);
    }

    if (approvedMembers.length !== paidMembers.length) {
      return sendError(res, 'Not all members have paid', 400);
    }

    if (!poolGroup.selectedPackageId) {
      return sendError(res, 'No package selected for this group', 400);
    }

    // Lock group and create bookings atomically
    await prisma.$transaction(async (tx) => {
      // Update group status to LOCKED
      await tx.poolGroup.update({
        where: { id: groupId },
        data: { status: 'LOCKED' }
      });

      // Create bookings for all paid members
      // Note: This is a simplified version - in production, you'd need to handle
      // actual seat/room allocation based on the package
      for (const member of paidMembers) {
        await tx.booking.create({
          data: {
            userId: member.userId,
            tripId: poolGroup.tripId,
            totalPrice: member.amountPaid || poolGroup.perPersonCost || 0,
            status: 'CONFIRMED'
          }
        });
      }
    });

    const updatedGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
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
        selectedPackage: {
          include: {
            bus: true,
            hotel: true
          }
        }
      }
    });

    sendSuccess(res, { poolGroup: updatedGroup }, 'Group locked and bookings created successfully');
  } catch (error) {
    next(error);
  }
};



