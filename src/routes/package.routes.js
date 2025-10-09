const express = require('express');
const router = express.Router();
const {
  getAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage
} = require('../controllers/packageController');
const { protect, adminOnly } = require('../middleware/auth');

// Protected routes
router.use(protect);

router.get('/', getAllPackages);
router.get('/:id', getPackageById);

// Admin only routes
router.post('/', adminOnly, createPackage);
router.put('/:id', adminOnly, updatePackage);
router.delete('/:id', adminOnly, deletePackage);

module.exports = router;


