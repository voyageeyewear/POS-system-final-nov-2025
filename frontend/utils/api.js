import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Debug: Log the API URL being used
console.log('🔍 API_URL:', API_URL);
console.log('🔍 NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  getProfile: () => api.get('/auth/profile'),
  getSyncStatus: () => api.get('/auth/sync-status'),
  register: (userData) => api.post('/auth/register', userData),
  getAllUsers: () => api.get('/auth/users'),
  updateUser: (userId, data) => api.put(`/auth/users/${userId}`, data),
  deleteUser: (userId) => api.delete(`/auth/users/${userId}`),
};

// Store APIs
export const storeAPI = {
  getAll: () => api.get('/stores'),
  getOne: (storeId) => api.get(`/stores/${storeId}`),
  create: (data) => api.post('/stores', data),
  update: (storeId, data) => api.put(`/stores/${storeId}`, data),
  delete: (storeId) => api.delete(`/stores/${storeId}`),
  getInventory: (storeId) => api.get(`/stores/${storeId}/inventory`),
  syncFromShopify: () => api.post('/stores/sync/shopify'),
};

// Product APIs
export const productAPI = {
  getAll: (params) => api.get('/products', { params }),
  getOne: (productId) => api.get(`/products/${productId}`),
  create: (data) => api.post('/products', data),
  update: (productId, data) => api.put(`/products/${productId}`, data),
  delete: (productId) => api.delete(`/products/${productId}`),
  updateInventory: (productId, data) => api.put(`/products/${productId}/inventory`, data),
  syncFromShopify: () => api.post('/products/sync/shopify'),
};

// Sale APIs
export const saleAPI = {
  create: (data) => api.post('/sales', data),
  getAll: (params) => api.get('/sales', { params }),
  getOne: (saleId) => api.get(`/sales/${saleId}`),
  getStats: (params) => api.get('/sales/stats', { params }),
  getCashierPerformance: (period) => api.get('/sales/cashier/performance', { params: { period } }),
  downloadInvoice: (saleId) => {
    return api.get(`/sales/${saleId}/invoice`, {
      responseType: 'blob',
    });
  },
  update: (saleId, data) => api.put(`/sales/${saleId}`, data),
  delete: (saleId) => api.delete(`/sales/${saleId}`),
};

// Inventory APIs
export const inventoryAPI = {
  syncFromShopify: () => api.post('/inventory/sync/shopify'),
  getSummary: () => api.get('/inventory/summary'),
};

// Data Management APIs
export const dataManagementAPI = {
  createBackup: (data) => api.post('/data-management/backup/create', data),
  downloadBackup: (fileName) => {
    return api.get(`/data-management/backup/download/${fileName}`, {
      responseType: 'blob',
    });
  },
  getAllBackups: () => api.get('/data-management/backups'),
  cleanupData: () => api.post('/data-management/cleanup'),
  refreshData: () => api.post('/data-management/refresh'),
};

export default api;

