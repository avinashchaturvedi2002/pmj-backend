const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const { sendSuccess, sendError } = require('../utils/responseHandler');

const prisma = new PrismaClient();

/**
 * @desc    Create Razorpay order for booking
 * @route   POST /api/payments/create-order
 * @access  Private
 */
exports.createOrder = async (req, res, next) => {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('💰 CREATE PAYMENT ORDER REQUEST');
    console.log('='.repeat(80));
    console.log('User ID:', req.user.id);
    console.log('Request Body:', req.body);

    const { amount, bookingId, poolGroupId, groupMemberId, tripId, packageId, busId, hotelId } = req.body;

    if (!amount || amount <= 0) {
      console.error('❌ Invalid amount:', amount);
      return sendError(res, 'Invalid amount', 400);
    }

    console.log(`✅ Amount validated: ₹${amount}`);

    // Note: For direct package purchase, bookingId and groupMemberId can be null
    // Booking will be created after successful payment
    if (!bookingId && !groupMemberId) {
      console.log('ℹ️  Direct package purchase (no pre-existing booking or group member)');
      console.log('   Trip ID:', tripId);
      console.log('   Package ID:', packageId || 'null (dynamic package)');
      console.log('   Bus ID:', busId);
      console.log('   Hotel ID:', hotelId);
      
      // Validate required fields for direct purchase (packageId is optional for dynamic packages)
      if (!tripId || !busId || !hotelId) {
        console.error('❌ Missing required fields for direct package purchase');
        return sendError(res, 'Trip ID, Bus ID, and Hotel ID are required for direct package purchase', 400);
      }
    }

    // If bookingId provided, validate booking exists and belongs to user
    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId }
      });

      if (!booking) {
        return sendError(res, 'Booking not found', 404);
      }

      if (booking.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return sendError(res, 'Access denied', 403);
      }
    }

    // If groupMemberId provided, validate member exists and belongs to user
    if (groupMemberId) {
      const member = await prisma.groupMember.findUnique({
        where: { id: groupMemberId }
      });

      if (!member) {
        return sendError(res, 'Group member not found', 404);
      }

      if (member.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return sendError(res, 'Access denied', 403);
      }
    }

    // Create Razorpay order
    const options = {
      amount: amount * 100, // amount in paise
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        userId: req.user.id,
        bookingId: bookingId || '',
        poolGroupId: poolGroupId || '',
        groupMemberId: groupMemberId || ''
      }
    };

    console.log('📝 Creating Razorpay order with options:', {
      amount: options.amount,
      currency: options.currency,
      receipt: options.receipt
    });

    const razorpayOrder = await razorpay.orders.create(options);
    console.log('✅ Razorpay order created:', razorpayOrder.id);

    // Create payment record in database
    console.log('💾 Creating payment record in database...');
    const payment = await prisma.payment.create({
      data: {
        userId: req.user.id,
        bookingId: bookingId || null,
        poolGroupId: poolGroupId || null,
        groupMemberId: groupMemberId || null,
        tripId: tripId || null,
        packageId: packageId || null,
        busId: busId || null,
        hotelId: hotelId || null,
        amount: amount * 100, // Store in paise
        currency: 'INR',
        razorpayOrderId: razorpayOrder.id,
        status: 'INITIATED'
      }
    });
    console.log('✅ Payment record created:', payment.id);
    console.log('   Stored package info:', { tripId: payment.tripId, packageId: payment.packageId, busId: payment.busId, hotelId: payment.hotelId });

    const responseData = {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      paymentId: payment.id,
      key: process.env.RAZORPAY_KEY_ID
    };

    console.log('✅ Sending success response');
    console.log('Response data:', {
      ...responseData,
      key: responseData.key ? '***' + responseData.key.slice(-4) : 'MISSING'
    });
    console.log('='.repeat(80) + '\n');

    sendSuccess(res, responseData, 'Order created successfully', 201);
  } catch (error) {
    console.error('❌ CREATE ORDER ERROR:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.log('='.repeat(80) + '\n');
    next(error);
  }
};

/**
 * @desc    Verify Razorpay payment signature
 * @route   POST /api/payments/verify
 * @access  Private
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 PAYMENT VERIFICATION REQUEST');
    console.log('='.repeat(80));
    console.log('Request Body:', req.body);

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId
    } = req.body;

    console.log('\n📋 VERIFICATION DETAILS:');
    console.log('   Order ID:', razorpay_order_id);
    console.log('   Payment ID:', razorpay_payment_id);
    console.log('   Received Signature:', razorpay_signature);
    console.log('   Payment Record ID:', paymentId);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !paymentId) {
      console.error('❌ Missing required payment details');
      console.log('='.repeat(80) + '\n');
      return sendError(res, 'Missing required payment details', 400);
    }

    // Get payment record
    console.log('\n💾 Fetching payment record from database...');
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        booking: true,
        groupMember: {
          include: {
            poolGroup: {
              include: {
                members: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      console.error('❌ Payment record not found in database');
      console.log('='.repeat(80) + '\n');
      return sendError(res, 'Payment record not found', 404);
    }

    console.log('✅ Payment record found:', payment.id);
    console.log('   Status:', payment.status);
    console.log('   Amount:', payment.amount);
    console.log('   Order ID in DB:', payment.razorpayOrderId);

    // Verify signature
    console.log('\n🔐 SIGNATURE VERIFICATION:');
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    console.log('   Body String:', body);
    console.log('   Key Secret (first 10 chars):', process.env.RAZORPAY_KEY_SECRET?.substring(0, 10) + '...');
    console.log('   Key Secret length:', process.env.RAZORPAY_KEY_SECRET?.length);
    console.log('   Key Secret exists:', !!process.env.RAZORPAY_KEY_SECRET);

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    console.log('   Expected Signature:', expectedSignature);
    console.log('   Received Signature:', razorpay_signature);
    console.log('   Signatures Match:', expectedSignature === razorpay_signature);

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      console.error('\n❌ SIGNATURE VERIFICATION FAILED!');
      console.error('   Expected:', expectedSignature);
      console.error('   Received:', razorpay_signature);
      console.error('   Length - Expected:', expectedSignature.length, '| Received:', razorpay_signature.length);
      
      // Character-by-character comparison
      console.error('\n🔍 Character Comparison:');
      for (let i = 0; i < Math.max(expectedSignature.length, razorpay_signature.length); i++) {
        if (expectedSignature[i] !== razorpay_signature[i]) {
          console.error(`   Position ${i}: Expected '${expectedSignature[i]}' but got '${razorpay_signature[i]}'`);
        }
      }

      // Update payment as failed
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'FAILED',
          failureReason: 'Invalid signature'
        }
      });

      console.log('💾 Updated payment status to FAILED');
      console.log('='.repeat(80) + '\n');
      return sendError(res, 'Payment verification failed', 400);
    }

    console.log('\n✅ SIGNATURE VERIFIED SUCCESSFULLY!');
    console.log('💾 Starting transaction to update payment records...');

    // Payment verified successfully - update in transaction
    let createdBookingId = null;
    await prisma.$transaction(async (tx) => {
      // Update payment record
      console.log('   • Updating payment record to SUCCESS...');
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          status: 'SUCCESS'
        }
      });
      console.log('   ✓ Payment record updated');

      // If direct package purchase (no pre-existing booking), create booking now
      if (!payment.bookingId && payment.tripId && payment.busId && payment.hotelId) {
        console.log('   • Creating booking for direct package purchase...');
        console.log(`     Trip: ${payment.tripId}, Package: ${payment.packageId || 'dynamic'}`);
        console.log(`     Bus: ${payment.busId}, Hotel: ${payment.hotelId}`);
        
        // Fetch trip details for dates
        const trip = await tx.trip.findUnique({
          where: { id: payment.tripId }
        });

        if (!trip) {
          throw new Error('Trip not found');
        }

        // Fetch bus and hotel details for pricing
        console.log('   • Fetching bus and hotel details for pricing...');
        const bus = await tx.bus.findUnique({ where: { id: payment.busId } });
        const hotel = await tx.hotel.findUnique({ where: { id: payment.hotelId } });

        if (!bus || !hotel) {
          throw new Error('Bus or Hotel not found');
        }

        // Calculate nights
        const nights = Math.ceil((trip.endDate - trip.startDate) / (1000 * 60 * 60 * 24));
        console.log(`   • Journey details: ${trip.travelers} travelers, ${nights} nights`);

        // Create booking
        const newBooking = await tx.booking.create({
          data: {
            userId: payment.userId,
            tripId: payment.tripId,
            packageId: payment.packageId,
            totalPrice: Math.floor(payment.amount / 100), // Convert from paise to INR
            status: 'CONFIRMED'
          }
        });
        createdBookingId = newBooking.id;
        console.log('   ✓ Booking created:', newBooking.id);

        // Create OUTBOUND bus booking
        const outboundPrice = bus.pricePerSeat * trip.travelers;
        const busBookingOutbound = await tx.busBooking.create({
          data: {
            bookingId: newBooking.id,
            busId: payment.busId,
            bookingDate: trip.startDate,
            seatsBooked: trip.travelers || 1,
            seatNumbers: null, // Can be assigned later via seat selection UI
            pricePerSeat: bus.pricePerSeat,
            totalPrice: outboundPrice
          }
        });
        console.log('   ✓ Outbound bus booking created:', busBookingOutbound.id, `(₹${outboundPrice})`);

        // Create RETURN bus booking
        const returnPrice = bus.pricePerSeat * trip.travelers;
        const busBookingReturn = await tx.busBooking.create({
          data: {
            bookingId: newBooking.id,
            busId: payment.busId,
            bookingDate: trip.endDate,
            seatsBooked: trip.travelers || 1,
            seatNumbers: null, // Can be assigned later via seat selection UI
            pricePerSeat: bus.pricePerSeat,
            totalPrice: returnPrice
          }
        });
        console.log('   ✓ Return bus booking created:', busBookingReturn.id, `(₹${returnPrice})`);

        // Create hotel booking
        const roomsNeeded = Math.ceil((trip.travelers || 1) / 2); // 2 people per room
        const hotelTotalPrice = hotel.pricePerRoom * nights * roomsNeeded;
        const hotelBooking = await tx.hotelBooking.create({
          data: {
            bookingId: newBooking.id,
            hotelId: payment.hotelId,
            checkIn: trip.startDate,
            checkOut: trip.endDate,
            roomsBooked: roomsNeeded,
            roomNumbers: null, // Can be assigned later via room selection UI
            pricePerRoom: hotel.pricePerRoom,
            totalPrice: hotelTotalPrice
          }
        });
        console.log('   ✓ Hotel booking created:', hotelBooking.id, `(₹${hotelTotalPrice} for ${roomsNeeded} room(s) x ${nights} nights)`);

        // Link payment to the new booking
        await tx.payment.update({
          where: { id: paymentId },
          data: { bookingId: newBooking.id }
        });
        console.log('   ✓ Payment linked to booking');
      }

      // If booking payment, update booking status
      if (payment.bookingId) {
        console.log('   • Updating booking status to CONFIRMED...');
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: 'CONFIRMED' }
        });
        console.log('   ✓ Booking status updated');
      }

      // If group member payment, update member status
      if (payment.groupMemberId) {
        console.log('   • Updating group member payment status...');
        await tx.groupMember.update({
          where: { id: payment.groupMemberId },
          data: {
            status: 'PAID',
            paymentStatus: 'SUCCESS',
            amountPaid: payment.amount,
            paidAt: new Date()
          }
        });
        console.log('   ✓ Group member status updated');

        // Check if all members have paid
        const allMembers = payment.groupMember.poolGroup.members;
        const approvedMembers = allMembers.filter(m => m.status === 'APPROVED' || m.status === 'PAID');
        const paidMembers = allMembers.filter(m => m.status === 'PAID');

        console.log(`   • Checking group payment status: ${paidMembers.length}/${approvedMembers.length} members paid`);

        // If all approved members have paid, lock the group
        if (approvedMembers.length === paidMembers.length && paidMembers.length > 0) {
          console.log('   • All members paid! Locking group...');
          await tx.poolGroup.update({
            where: { id: payment.poolGroupId },
            data: { status: 'LOCKED' }
          });
          console.log('   ✓ Group locked');
        }
      }
    });

    console.log('✅ Transaction completed successfully');
    if (createdBookingId) {
      console.log('📝 New booking created:', createdBookingId);
    }
    console.log('='.repeat(80) + '\n');

    sendSuccess(res, {
      verified: true,
      paymentId: razorpay_payment_id,
      bookingId: createdBookingId || payment.bookingId
    }, 'Payment verified successfully');
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ PAYMENT VERIFICATION ERROR');
    console.error('='.repeat(80));
    console.error('Error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('='.repeat(80) + '\n');
    next(error);
  }
};

/**
 * @desc    Handle Razorpay webhook
 * @route   POST /api/payments/webhook
 * @access  Public (Razorpay webhook)
 */
exports.handleWebhook = async (req, res, next) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== expectedSignature) {
      return sendError(res, 'Invalid webhook signature', 400);
    }

    const event = req.body.event;
    const payloadData = req.body.payload.payment.entity;

    // Find payment by razorpay order id
    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId: payloadData.order_id },
      include: {
        booking: true,
        groupMember: true
      }
    });

    if (!payment) {
      console.log('Payment not found for webhook:', payloadData.order_id);
      return res.status(200).json({ received: true });
    }

    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              razorpayPaymentId: payloadData.id,
              status: 'SUCCESS',
              paymentMethod: payloadData.method
            }
          });

          if (payment.bookingId) {
            await tx.booking.update({
              where: { id: payment.bookingId },
              data: { status: 'CONFIRMED' }
            });
          }

          if (payment.groupMemberId) {
            await tx.groupMember.update({
              where: { id: payment.groupMemberId },
              data: {
                status: 'PAID',
                paymentStatus: 'SUCCESS',
                amountPaid: payment.amount,
                paidAt: new Date()
              }
            });
          }
        });
        break;

      case 'payment.failed':
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              failureReason: payloadData.error_description || 'Payment failed'
            }
          });

          if (payment.bookingId) {
            await tx.booking.update({
              where: { id: payment.bookingId },
              data: { status: 'PAYMENT_FAILED' }
            });
          }

          if (payment.groupMemberId) {
            await tx.groupMember.update({
              where: { id: payment.groupMemberId },
              data: {
                status: 'PAYMENT_FAILED',
                paymentStatus: 'FAILED'
              }
            });
          }
        });
        break;

      default:
        console.log('Unhandled webhook event:', event);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * @desc    Initiate refund
 * @route   POST /api/payments/:id/refund
 * @access  Private (Admin only)
 */
exports.initiateRefund = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        booking: true
      }
    });

    if (!payment) {
      return sendError(res, 'Payment not found', 404);
    }

    if (payment.status !== 'SUCCESS') {
      return sendError(res, 'Can only refund successful payments', 400);
    }

    if (!payment.razorpayPaymentId) {
      return sendError(res, 'No Razorpay payment ID found', 400);
    }

    // Create refund in Razorpay
    const refundAmount = amount ? amount * 100 : payment.amount;
    const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
      amount: refundAmount,
      notes: {
        reason: reason || 'Booking cancelled'
      }
    });

    // Update payment and booking status
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id },
        data: {
          status: 'REFUNDED',
          failureReason: reason || 'Refund initiated'
        }
      });

      if (payment.bookingId) {
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: 'REFUNDED' }
        });
      }
    });

    sendSuccess(res, {
      refund,
      refundId: refund.id,
      amount: refund.amount / 100
    }, 'Refund initiated successfully');
  } catch (error) {
    console.error('Refund error:', error);
    next(error);
  }
};

/**
 * @desc    Get payment details
 * @route   GET /api/payments/:id
 * @access  Private
 */
exports.getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        booking: {
          include: {
            trip: true,
            busSeat: {
              include: { bus: true }
            },
            hotelRoom: {
              include: { hotel: true }
            }
          }
        },
        groupMember: {
          include: {
            poolGroup: {
              include: {
                trip: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      return sendError(res, 'Payment not found', 404);
    }

    // Check access
    if (payment.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'Access denied', 403);
    }

    sendSuccess(res, { payment }, 'Payment retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all payments for user
 * @route   GET /api/payments
 * @access  Private
 */
exports.getAllPayments = async (req, res, next) => {
  try {
    const { status } = req.query;

    const where = { userId: req.user.id };
    if (status) {
      where.status = status;
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        booking: {
          include: {
            trip: true
          }
        },
        groupMember: {
          include: {
            poolGroup: {
              include: {
                trip: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    sendSuccess(res, { payments }, 'Payments retrieved successfully');
  } catch (error) {
    next(error);
  }
};

