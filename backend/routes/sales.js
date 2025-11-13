const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { authenticate, isAdmin } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Create sale (cashiers can create for their store)
router.post('/', saleController.createSale);

// Get sales (filtered by role and permissions)
router.get('/', saleController.getAllSales);
router.get('/stats', saleController.getSalesStats);
router.get('/cashier/performance', saleController.getCashierPerformance);
router.get('/:saleId', saleController.getSale);

// Generate invoice
router.get('/:saleId/invoice', saleController.generateInvoice);

// Update/Edit sale (Admin only)
router.put('/:saleId', isAdmin, saleController.updateSale);

// Delete sale (Admin only)
router.delete('/:saleId', isAdmin, saleController.deleteSale);

module.exports = router;

