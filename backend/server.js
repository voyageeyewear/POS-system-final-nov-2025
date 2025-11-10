require('reflect-metadata');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

// Initialize TypeORM
AppDataSource.initialize()
  .then(() => {
    console.log('✅ PostgreSQL connected via TypeORM');
  })
  .catch((error) => {
    console.error('❌ TypeORM initialization error:', error);
    process.exit(1);
  });

// Middleware
// Configure CORS to allow frontend origin
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://web-production-94748.up.railway.app',
    /^https:\/\/.*\.up\.railway\.app$/, // Allow all Railway apps
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
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
  res.json({ status: 'OK', message: 'POS Backend is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;

