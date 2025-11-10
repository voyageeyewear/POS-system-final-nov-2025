require('reflect-metadata');
require('dotenv').config();
const express = require('express');
const { AppDataSource } = require('./data-source');

// Import routes
const authRoutes = require('./routes/auth');
const storeRoutes = require('./routes/stores');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const inventoryRoutes = require('./routes/inventory');
const dataManagementRoutes = require('./routes/dataManagement');

const app = express();
const PORT = process.env.PORT || 5000;

// ========================================
// AGGRESSIVE CORS CONFIGURATION - FIRST THING!
// ========================================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log('🌐 Incoming request:', {
    method: req.method,
    path: req.path,
    origin: origin,
    headers: req.headers
  });

  // Set CORS headers for ALL requests
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request immediately
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling OPTIONS preflight request for:', req.path);
    return res.status(200).end();
  }

  next();
});

// Initialize TypeORM
AppDataSource.initialize()
  .then(() => {
    console.log('✅ PostgreSQL connected via TypeORM');
  })
  .catch((error) => {
    console.error('❌ TypeORM initialization error:', error);
    process.exit(1);
  });

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - Origin: ${req.get('origin')}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/data-management', dataManagementRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'POS Backend is running', cors: 'enabled' });
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({ 
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Test OPTIONS for auth login
app.options('/api/auth/login', (req, res) => {
  console.log('🔥 EXPLICIT OPTIONS handler for /api/auth/login');
  res.status(200).end();
});

// 404 handler
app.use((req, res) => {
  console.log('❌ 404 - Route not found:', req.method, req.path);
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!', 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;

