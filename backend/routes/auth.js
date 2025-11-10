const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, isAdmin } = require('../middleware/auth');

// Public routes
router.post('/login', authController.login);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.get('/sync-status', authenticate, authController.getSyncStatus);

// Admin only routes
router.post('/register', authenticate, isAdmin, authController.register);
router.get('/users', authenticate, isAdmin, authController.getAllUsers);
router.put('/users/:userId', authenticate, isAdmin, authController.updateUser);
router.delete('/users/:userId', authenticate, isAdmin, authController.deleteUser);

module.exports = router;

