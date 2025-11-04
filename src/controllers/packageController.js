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

/**
 * @desc    Get package suggestions for a trip
 * @route   GET /api/packages/suggest/:tripId
 * @access  Private
 */
exports.suggestPackages = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; // Default 10 packages per page
    const skip = (page - 1) * limit;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 PACKAGE SUGGESTION REQUEST`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Trip ID: ${tripId}`);
    console.log(`User ID: ${req.user.id}`);
    console.log(`User Role: ${req.user.role}`);
    console.log(`Pagination: Page ${page}, Limit ${limit}`);

    // Get trip details
    const trip = await prisma.trip.findUnique({
      where: { id: tripId }
    });

    if (!trip) {
      console.log(`❌ ERROR: Trip not found with ID: ${tripId}`);
      return sendError(res, 'Trip not found', 404);
    }

    console.log(`✅ Trip found:`, {
      id: trip.id,
      source: trip.source,
      destination: trip.destination,
      budget: trip.budget,
      travelers: trip.travelers
    });

    // Check if user owns the trip
    if (trip.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'Access denied', 403);
    }

    // Calculate trip duration in nights
    const startDate = new Date(trip.startDate);
    const endDate = new Date(trip.endDate);
    const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    if (nights <= 0) {
      return sendError(res, 'Invalid trip dates', 400);
    }

    // Debug logging
    console.log('Fetching packages for trip:', {
      tripId,
      source: trip.source,
      destination: trip.destination,
      startDate,
      endDate,
      nights,
      budget: trip.budget,
      travelers: trip.travelers
    });

    // Get all buses and hotels matching destination
    const [buses, hotels] = await Promise.all([
      prisma.bus.findMany({
        include: {
          busBookings: {
            where: {
              bookingDate: {
                in: [startDate, endDate]
              }
            }
          }
        }
      }),
      prisma.hotel.findMany({
        where: {
          location: {
            contains: trip.destination
          }
        },
        include: {
          hotelBookings: {
            where: {
              OR: [
                {
                  AND: [
                    { checkIn: { lte: startDate } },
                    { checkOut: { gte: startDate } }
                  ]
                },
                {
                  AND: [
                    { checkIn: { lte: endDate } },
                    { checkOut: { gte: endDate } }
                  ]
                },
                {
                  AND: [
                    { checkIn: { gte: startDate } },
                    { checkOut: { lte: endDate } }
                  ]
                }
              ]
            }
          }
        }
      })
    ]);

    console.log(`\n📊 Database Query Results:`);
    console.log(`   Fetched ${buses.length} buses`);
    console.log(`   Fetched ${hotels.length} hotels`);

    // Calculate available seats/rooms for each bus/hotel
    const availableBuses = buses.map(bus => {
      const bookedSeatsOnStart = bus.busBookings
        .filter(b => new Date(b.bookingDate).getTime() === startDate.getTime())
        .reduce((sum, b) => sum + b.seatsBooked, 0);
      
      const bookedSeatsOnEnd = bus.busBookings
        .filter(b => new Date(b.bookingDate).getTime() === endDate.getTime())
        .reduce((sum, b) => sum + b.seatsBooked, 0);

      const maxBookedSeats = Math.max(bookedSeatsOnStart, bookedSeatsOnEnd);
      const availableSeats = bus.capacity - maxBookedSeats;

      return {
        ...bus,
        availableSeats
      };
    }).filter(bus => bus.availableSeats >= trip.travelers);

    const availableHotels = hotels.map(hotel => {
      const bookedRooms = hotel.hotelBookings.reduce((sum, b) => sum + b.roomsBooked, 0);
      const availableRooms = hotel.totalRooms - bookedRooms;

      return {
        ...hotel,
        availableRooms
      };
    }).filter(hotel => {
      const roomsNeeded = Math.ceil(trip.travelers / 2); // Assuming 2 people per room
      return hotel.availableRooms >= roomsNeeded;
    });

    // Generate package combinations
    const suggestions = [];

    console.log(`   Available buses (after filtering): ${availableBuses.length}`);
    console.log(`   Available hotels (after filtering): ${availableHotels.length}`);
    console.log(`\n🔄 Generating package combinations...`);

    for (const bus of availableBuses) {
      for (const hotel of availableHotels) {
        // Calculate total cost
        // Bus: round trip (to and from destination)
        const busRoundTripCost = bus.pricePerSeat * trip.travelers * 2;
        
        // Hotel: nights * rooms needed
        const roomsNeeded = Math.ceil(trip.travelers / 2);
        const hotelCost = hotel.pricePerRoom * nights * roomsNeeded;
        
        const totalCost = busRoundTripCost + hotelCost;

        // Only include if within budget
        if (totalCost <= trip.budget) {
          suggestions.push({
            bus: {
              id: bus.id,
              busNumber: bus.busNumber,
              busName: bus.busName,
              pricePerSeat: bus.pricePerSeat,
              capacity: bus.capacity,
              availableSeats: bus.availableSeats,
              amenities: bus.amenities
            },
            hotel: {
              id: hotel.id,
              name: hotel.name,
              location: hotel.location,
              pricePerRoom: hotel.pricePerRoom,
              rating: hotel.rating,
              availableRooms: hotel.availableRooms,
              amenities: hotel.amenities
            },
            pricing: {
              busRoundTripCost,
              hotelCost,
              totalCost,
              perPersonCost: Math.ceil(totalCost / trip.travelers),
              nights,
              roomsNeeded
            },
            withinBudget: true,
            budgetRemaining: trip.budget - totalCost
          });
        }
      }
    }

    // Sort by total cost (cheapest first)
    suggestions.sort((a, b) => a.pricing.totalCost - b.pricing.totalCost);

    // Calculate budget breakdown
    const activityBudgetPercent = trip.activityBudgetPercent || 30;
    const activityBudget = Math.round((trip.budget * activityBudgetPercent) / 100);
    const packageBudget = trip.budget - activityBudget;
    
    // Define acceptable range (±₹1000)
    const minBudget = packageBudget - 1000;
    const maxBudget = packageBudget + 1000;
    
    // Filter packages within range
    const filteredSuggestions = suggestions.filter(pkg => 
      pkg.pricing.totalCost >= minBudget && 
      pkg.pricing.totalCost <= maxBudget
    );

    console.log(`\n💰 BUDGET BREAKDOWN:`);
    console.log(`   Total Budget: ₹${trip.budget}`);
    console.log(`   Activity Budget (${activityBudgetPercent}%): ₹${activityBudget}`);
    console.log(`   Package Budget (${100 - activityBudgetPercent}%): ₹${packageBudget}`);
    console.log(`   Filter Range: ₹${minBudget} - ₹${maxBudget}`);

    const totalSuggestions = filteredSuggestions.length;
    const totalPages = Math.ceil(totalSuggestions / limit);
    
    // Apply pagination to filtered results
    const paginatedSuggestions = filteredSuggestions.slice(skip, skip + limit);

    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`   Total buses: ${buses.length}, Available: ${availableBuses.length}`);
    console.log(`   Total hotels: ${hotels.length}, Available: ${availableHotels.length}`);
    console.log(`   All combinations: ${suggestions.length}`);
    console.log(`   In budget range: ${totalSuggestions}`);
    console.log(`   Returning: ${paginatedSuggestions.length} (Page ${page}/${totalPages})`);
    
    if (filteredSuggestions.length === 0) {
      console.log(`\n⚠️ WARNING: No packages in budget range!`);
      if (availableBuses.length === 0) console.log(`   - No buses with ${trip.travelers}+ seats`);
      if (availableHotels.length === 0) console.log(`   - No hotels in ${trip.destination}`);
      if (suggestions.length > 0) {
        console.log(`   - ${suggestions.length} packages found but outside ₹${minBudget}-₹${maxBudget} range`);
      }
    }

    const responseData = {
      trip: {
        id: trip.id,
        source: trip.source,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        budget: trip.budget,
        activityBudgetPercent,
        travelers: trip.travelers,
        nights
      },
      budgetBreakdown: {
        total: trip.budget,
        packageBudget,
        activityBudget,
        activityBudgetPercent,
        packageBudgetPercent: 100 - activityBudgetPercent
      },
      filterRange: {
        min: minBudget,
        max: maxBudget
      },
      suggestions: paginatedSuggestions,
      pagination: {
        page,
        limit,
        total: totalSuggestions,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };

    console.log(`\n✅ Sending response with ${paginatedSuggestions.length} suggestions (page ${page}/${totalPages})`);
    console.log(`${'='.repeat(80)}\n`);

    sendSuccess(res, responseData, 'Package suggestions retrieved successfully');
  } catch (error) {
    console.error('\n❌ ERROR in suggestPackages:', error);
    console.error('Stack trace:', error.stack);
    console.log(`${'='.repeat(80)}\n`);
    next(error);
  }
};



