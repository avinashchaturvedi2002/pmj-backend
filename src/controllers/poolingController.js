const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();

exports.createPoolGroup = async (req, res, next) => {
  try {
    const { tripId, groupSize, description } = req.body;

    if (!tripId || !groupSize) {
      return sendError(res, 'Please provide trip ID and group size', 400);
    }

    if (groupSize < 2) {
      return sendError(res, 'Group size must be at least 2', 400);
    }

    const trip = await prisma.trip.findUnique({
      where: { id: tripId }
    });

    if (!trip) {
      return sendError(res, 'Trip not found', 404);
    }

    if (trip.createdById !== req.user.id) {
      return sendError(res, 'You can only create pool groups for your own trips', 403);
    }

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

exports.getAllPoolGroups = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { destination, status, minSize, maxSize } = req.query;

    const where = {};

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
          selectedPackage: {
            include: {
              bus: true,
              hotel: true
            }
          },
          members: {
            where: {
              OR: [
                { status: 'APPROVED' },
                { userId: req.user.id }
              ]
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

    const approvedMembersCount = poolGroup.members.filter(m => m.status === 'APPROVED').length;
    
    if (poolGroup.currentSize !== approvedMembersCount) {
      await prisma.poolGroup.update({
        where: { id },
        data: {
          currentSize: approvedMembersCount,
          status: approvedMembersCount >= poolGroup.groupSize ? 'CLOSED' : poolGroup.status
        }
      });
      
      poolGroup.currentSize = approvedMembersCount;
      poolGroup.status = approvedMembersCount >= poolGroup.groupSize ? 'CLOSED' : poolGroup.status;
    }

    sendSuccess(res, { poolGroup }, 'Pool group retrieved successfully');
  } catch (error) {
    next(error);
  }
};

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

    const existingMember = poolGroup.members.find(m => m.userId === req.user.id);
    if (existingMember) {
      return sendError(res, `You have already ${existingMember.status.toLowerCase()} this group`, 400);
    }

    const approvedCount = poolGroup.members.filter(m => m.status === 'APPROVED').length;
    if (approvedCount >= poolGroup.groupSize) {
      return sendError(res, 'This pool group is full', 400);
    }

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

exports.updateMemberStatus = async (req, res, next) => {
  try {
    const { groupId, memberId } = req.params;
    const { status } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return sendError(res, 'Invalid status. Must be APPROVED or REJECTED', 400);
    }

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        members: true
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    if (req.user.role !== 'ADMIN' && poolGroup.createdById !== req.user.id) {
      return sendError(res, 'Only admin or group creator can approve/reject requests', 403);
    }

    const member = poolGroup.members.find(m => m.id === memberId);
    if (!member) {
      return sendError(res, 'Member not found in this group', 404);
    }

    if (member.status !== 'PENDING') {
      return sendError(res, `Member request is already ${member.status.toLowerCase()}`, 400);
    }

    if (status === 'APPROVED') {
      const approvedCount = poolGroup.members.filter(m => m.status === 'APPROVED').length;
      if (approvedCount >= poolGroup.groupSize) {
        return sendError(res, 'Group is already full', 400);
      }
    }

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

exports.leavePoolGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    if (poolGroup.createdById === req.user.id) {
      return sendError(res, 'Group creator cannot leave. Please delete the group instead', 400);
    }

    const member = await prisma.groupMember.findFirst({
      where: {
        poolGroupId: groupId,
        userId: req.user.id
      }
    });

    if (!member) {
      return sendError(res, 'You are not a member of this group', 400);
    }

    await prisma.groupMember.update({
      where: { id: member.id },
      data: { status: 'CANCELLED' }
    });

    if (member.status === 'APPROVED') {
      await prisma.poolGroup.update({
        where: { id: groupId },
        data: {
          currentSize: { decrement: 1 },
          status: 'OPEN'
        }
      });
    }

    sendSuccess(res, {}, 'Left pool group successfully');
  } catch (error) {
    next(error);
  }
};

exports.deletePoolGroup = async (req, res, next) => {
  try {
    const { id } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

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

exports.getMyPoolGroups = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);

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
            },
            orderBy: { joinedAt: 'asc' }
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

exports.setGroupPackage = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { packageId, perPersonCost, paymentDeadline } = req.body;

    if (!packageId || !perPersonCost) {
      return sendError(res, 'Please provide package ID and per-person cost', 400);
    }

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        members: true
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    if (req.user.role !== 'ADMIN' && poolGroup.createdById !== req.user.id) {
      return sendError(res, 'Only admin or group creator can set package', 403);
    }

    const packageExists = await prisma.package.findUnique({
      where: { id: packageId }
    });

    if (!packageExists) {
      return sendError(res, 'Package not found', 404);
    }

    const approvedMembers = poolGroup.members.filter((member) =>
      ['APPROVED', 'PAYMENT_PENDING', 'PAID'].includes(member.status)
    );

    if (approvedMembers.length < poolGroup.groupSize) {
      return sendError(res, 'Group is not full yet. Approve members before offering a package', 400);
    }

    const normalizedDeadline = paymentDeadline
      ? new Date(paymentDeadline)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (Number.isNaN(normalizedDeadline.getTime())) {
      return sendError(res, 'Invalid payment deadline provided', 400);
    }

    if (normalizedDeadline <= new Date()) {
      return sendError(res, 'Payment deadline must be in the future', 400);
    }

    const updatedGroup = await prisma.$transaction(async (tx) => {
      await tx.poolGroup.update({
        where: { id: groupId },
        data: {
          selectedPackageId: packageId,
          perPersonCost: parseInt(perPersonCost, 10),
          paymentDeadline: normalizedDeadline,
          packageApprovedBy: '[]',
          status: 'CLOSED',
          currentSize: approvedMembers.length
        }
      });

      await tx.groupMember.updateMany({
        where: {
          poolGroupId: groupId,
          status: {
            in: ['APPROVED', 'PAYMENT_PENDING']
          },
          paymentStatus: { not: 'SUCCESS' }
        },
        data: {
          status: 'PAYMENT_PENDING',
          paymentStatus: 'PENDING',
          amountPaid: null,
          paidAt: null
        }
      });

      return tx.poolGroup.findUnique({
        where: { id: groupId },
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
    });

    sendSuccess(res, { poolGroup: updatedGroup }, 'Package set successfully. Members must complete payment before the deadline.');
  } catch (error) {
    next(error);
  }
};

exports.approvePackage = async (req, res, next) => {
  try {
    const { groupId } = req.params;

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

    const member = poolGroup.members.find(m => m.userId === req.user.id);
    if (!member) {
      return sendError(res, 'You are not a member of this group', 400);
    }

    if (!['APPROVED', 'PAYMENT_PENDING', 'PAID'].includes(member.status)) {
      return sendError(res, 'Only approved members can approve packages', 400);
    }

    let approvedBy = [];
    try {
      approvedBy = JSON.parse(poolGroup.packageApprovedBy || '[]');
    } catch (e) {
      approvedBy = [];
    }

    if (!approvedBy.includes(req.user.id)) {
      approvedBy.push(req.user.id);
    }

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
      totalMembers: poolGroup.members.filter(m =>
        ['APPROVED', 'PAYMENT_PENDING', 'PAID'].includes(m.status)
      ).length
    }, 'Package approved successfully');
  } catch (error) {
    next(error);
  }
};

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

    const activeMembers = poolGroup.members.filter((m) =>
      ['APPROVED', 'PAYMENT_PENDING', 'PAID'].includes(m.status)
    );
    const paidMembers = poolGroup.members.filter(m => m.status === 'PAID');
    const pendingMembers = poolGroup.members.filter(m => ['APPROVED', 'PAYMENT_PENDING'].includes(m.status));
    const failedMembers = poolGroup.members.filter(m => m.status === 'PAYMENT_FAILED');

    const allPaid = activeMembers.length > 0 && activeMembers.length === paidMembers.length;

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
        totalMembers: activeMembers.length,
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

exports.enforcePaymentDeadline = async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const poolGroup = await prisma.poolGroup.findUnique({
      where: { id: groupId },
      include: {
        members: true,
        selectedPackage: true
      }
    });

    if (!poolGroup) {
      return sendError(res, 'Pool group not found', 404);
    }

    if (!poolGroup.paymentDeadline) {
      return sendError(res, 'No payment deadline set for this group', 400);
    }

    if (req.user.role !== 'ADMIN' && poolGroup.createdById !== req.user.id) {
      return sendError(res, 'Only admin or group creator can enforce payment deadlines', 403);
    }

    const now = new Date();
    if (poolGroup.paymentDeadline > now) {
      return sendError(res, 'Payment deadline has not passed yet', 400);
    }

    const overdueMembers = poolGroup.members.filter((member) =>
      ['APPROVED', 'PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(member.status)
    );

    if (overdueMembers.length === 0) {
      return sendSuccess(res, { poolGroupId: poolGroup.id, removedMembers: [] }, 'No overdue members to remove');
    }

    await prisma.$transaction(async (tx) => {
      for (const member of overdueMembers) {
        await tx.groupMember.update({
          where: { id: member.id },
          data: {
            status: 'CANCELLED',
            paymentStatus: 'FAILED',
            amountPaid: null,
            paidAt: null
          }
        });
      }

      const activeCount = await tx.groupMember.count({
        where: {
          poolGroupId: groupId,
          status: { in: ['APPROVED', 'PAYMENT_PENDING', 'PAID'] }
        }
      });

      await tx.poolGroup.update({
        where: { id: groupId },
        data: {
          currentSize: activeCount,
          status: activeCount < poolGroup.groupSize ? 'OPEN' : poolGroup.status
        }
      });
    });

    const refreshedGroup = await prisma.poolGroup.findUnique({
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

    sendSuccess(res, {
      poolGroup: refreshedGroup,
      removedMembers: overdueMembers.map((member) => member.id)
    }, 'Removed members who missed the payment deadline');
  } catch (error) {
    next(error);
  }
};

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

    if (req.user.role !== 'ADMIN' && poolGroup.createdById !== req.user.id) {
      return sendError(res, 'Only admin or group creator can lock group', 403);
    }

    const approvedMembers = poolGroup.members.filter(m =>
      ['APPROVED', 'PAYMENT_PENDING', 'PAID'].includes(m.status)
    );
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

    await prisma.$transaction(async (tx) => {
      await tx.poolGroup.update({
        where: { id: groupId },
        data: { status: 'LOCKED' }
      });

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



