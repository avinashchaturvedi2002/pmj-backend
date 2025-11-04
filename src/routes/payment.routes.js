const express = require('express');
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  handleWebhook,
  initiateRefund,
  getPaymentById,
  getAllPayments
} = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/auth');

// Webhook route (no auth required - Razorpay will call this)
router.post('/webhook', handleWebhook);

// Protected routes
router.use(protect);

router.post('/create-order', createOrder);
router.post('/verify', verifyPayment);
router.get('/', getAllPayments);
router.get('/:id', getPaymentById);

// Admin only routes
router.post('/:id/refund', adminOnly, initiateRefund);

module.exports = router;

