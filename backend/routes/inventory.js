const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authenticate, isAdmin } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Sync inventory from Shopify (Admin only)
router.post('/sync/shopify', isAdmin, inventoryController.syncInventoryFromShopify);

// Get inventory summary
router.get('/summary', inventoryController.getInventorySummary);

// Check Shopify products for a specific store
router.get('/check-shopify', inventoryController.checkShopifyProductsForStore);

module.exports = router;

