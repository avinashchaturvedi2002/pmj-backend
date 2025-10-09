const { PrismaClient } = require('@prisma/client');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHandler');
const { validatePagination } = require('../utils/validation');

const prisma = new PrismaClient();

/**
 * @desc    Get all packages (with filters)
 * @route   GET /api/packages
 * @access  Private
 */
exports.getAllPackages = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { tripId, poolGroupId, minPrice, maxPrice, isActive } = req.query;

    const where = {};

    if (tripId) where.tripId = tripId;
    if (poolGroupId) where.poolGroupId = poolGroupId;
    
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseInt(minPrice);
      if (maxPrice) where.price.lte = parseInt(maxPrice);
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [packages, total] = await Promise.all([
      prisma.package.findMany({
        where,
        include: {
          trip: true,
          poolGroup: {
            include: {
              trip: true
            }
          },
          bus: true,
          hotel: true
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.package.count({ where })
    ]);

    sendPaginated(res, { packages }, { page, limit, total }, 'Packages retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get package by ID
 * @route   GET /api/packages/:id
 * @access  Private
 */
exports.getPackageById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const package = await prisma.package.findUnique({
      where: { id },
      include: {
        trip: true,
        poolGroup: {
          include: {
            trip: true,
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
            }
          }
        },
        bus: {
          include: {
            seats: {
              where: { isBooked: false }
            }
          }
        },
        hotel: {
          include: {
            rooms: {
              where: { isBooked: false }
            }
          }
        }
      }
    });

    if (!package) {
      return sendError(res, 'Package not found', 404);
    }

    sendSuccess(res, { package }, 'Package retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create package (Admin only)
 * @route   POST /api/packages
 * @access  Private (Admin)
 */
exports.createPackage = async (req, res, next) => {
  try {
    const { name, description, tripId, poolGroupId, busId, hotelId, price, discount } = req.body;

    if (!name || !busId || !hotelId || !price) {
      return sendError(res, 'Please provide all required fields', 400);
    }

    if (!tripId && !poolGroupId) {
      return sendError(res, 'Please provide either trip ID or pool group ID', 400);
    }

    // Validate bus exists
    const bus = await prisma.bus.findUnique({ where: { id: busId } });
    if (!bus) {
      return sendError(res, 'Bus not found', 404);
    }

    // Validate hotel exists
    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) {
      return sendError(res, 'Hotel not found', 404);
    }

    // Validate trip or pool group exists
    if (tripId) {
      const trip = await prisma.trip.findUnique({ where: { id: tripId } });
      if (!trip) {
        return sendError(res, 'Trip not found', 404);
      }
    }

    if (poolGroupId) {
      const poolGroup = await prisma.poolGroup.findUnique({ where: { id: poolGroupId } });
      if (!poolGroup) {
        return sendError(res, 'Pool group not found', 404);
      }
    }

    const package = await prisma.package.create({
      data: {
        name,
        description,
        tripId: tripId || null,
        poolGroupId: poolGroupId || null,
        busId,
        hotelId,
        price: parseInt(price),
        discount: discount ? parseInt(discount) : 0,
        isActive: true
      },
      include: {
        trip: true,
        poolGroup: true,
        bus: true,
        hotel: true
      }
    });

    sendSuccess(res, { package }, 'Package created successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update package (Admin only)
 * @route   PUT /api/packages/:id
 * @access  Private (Admin)
 */
exports.updatePackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, price, discount, isActive } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price) updateData.price = parseInt(price);
    if (discount !== undefined) updateData.discount = parseInt(discount);
    if (isActive !== undefined) updateData.isActive = isActive;

    const package = await prisma.package.update({
      where: { id },
      data: updateData,
      include: {
        trip: true,
        poolGroup: true,
        bus: true,
        hotel: true
      }
    });

    sendSuccess(res, { package }, 'Package updated successfully');
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 'Package not found', 404);
    }
    next(error);
  }
};

/**
 * @desc    Delete package (Admin only)
 * @route   DELETE /api/packages/:id
 * @access  Private (Admin)
 */
exports.deletePackage = async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.package.delete({
      where: { id }
    });

    sendSuccess(res, {}, 'Package deleted successfully');
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 'Package not found', 404);
    }
    next(error);
  }
};


