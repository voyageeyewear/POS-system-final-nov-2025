import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';
import { Download, Filter, TrendingUp, DollarSign, Edit, Plus, Trash, X, Search } from 'lucide-react';
import { saleAPI, storeAPI, productAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function SalesReports() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const [sales, setSales] = useState([]);
  const [stores, setStores] = useState([]);
  const [stats, setStats] = useState(null);
  const [loadingSales, setLoadingSales] = useState(true);
  const [filters, setFilters] = useState({
    storeId: '',
    startDate: '',
    endDate: '',
  });
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [processing, setProcessing] = useState(false);
  
  // Product selection modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (!isAdmin) {
        router.push('/pos');
      } else {
        loadData();
      }
    }
  }, [user, loading, isAdmin, router]);

  const loadData = async () => {
    try {
      setLoadingSales(true);
      
      // Load data sequentially for better error tracking
      console.log('📊 Loading sales data with filters:', filters);
      
      const salesRes = await saleAPI.getAll(filters);
      console.log('✅ Sales loaded:', salesRes.data.sales?.length, 'sales');
      setSales(salesRes.data.sales);
      
      const storesRes = await storeAPI.getAll();
      console.log('✅ Stores loaded:', storesRes.data.stores?.length, 'stores');
      setStores(storesRes.data.stores);
      
      const statsRes = await saleAPI.getStats(filters);
      console.log('✅ Stats loaded:', statsRes.data.stats);
      setStats(statsRes.data.stats);
      
    } catch (error) {
      console.error('❌ Sales data loading error:', error);
      console.error('Error response:', error.response?.data);
      
      const errorMsg = error.response?.data?.error || error.message || 'Failed to load sales data';
      toast.error(errorMsg, { duration: 5000 });
    } finally {
      setLoadingSales(false);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value,
    });
  };

  const applyFilters = () => {
    loadData();
  };

  const resetFilters = () => {
    setFilters({
      storeId: '',
      startDate: '',
      endDate: '',
    });
    setTimeout(loadData, 100);
  };

  const downloadInvoice = async (saleId, invoiceNumber) => {
    try {
      console.log(`📥 Downloading invoice for sale ID: ${saleId}`);
      const response = await saleAPI.downloadInvoice(saleId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Invoice downloaded');
    } catch (error) {
      console.error('❌ Invoice download error:', error);
      console.error('Error response type:', typeof error.response?.data);
      console.error('Error response:', error.response?.data);
      
      // Handle blob error responses
      let errorMsg = 'Failed to download invoice';
      
      if (error.response?.data instanceof Blob) {
        console.log('📋 Reading blob error response...');
        try {
          const text = await error.response.data.text();
          console.log('Blob content:', text);
          const errorData = JSON.parse(text);
          errorMsg = errorData.error || errorMsg;
          console.error('Parsed error:', errorData);
        } catch (blobError) {
          console.error('Failed to parse blob:', blobError);
          errorMsg = 'Server error (check Railway logs)';
        }
      } else if (error.response?.data?.error) {
        errorMsg = error.response.data.error;
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      toast.error(errorMsg, { duration: 5000 });
    }
  };

  const handleEditSale = async (sale) => {
    try {
      console.log('✏️ Opening edit modal for sale:', sale.invoiceNumber);
      
      // Load full sale details
      const saleResponse = await saleAPI.getOne(sale.id);
      const fullSale = saleResponse.data.sale;
      
      setEditingSale(fullSale);
      
      // Convert sale items to edit format
      const items = fullSale.items.map(item => ({
        id: item.productId,
        productId: item.productId,
        name: item.name,
        price: parseFloat(item.unitPrice),
        quantity: parseInt(item.quantity),
        discount: parseFloat(item.discount || 0),
        taxRate: parseFloat(item.taxRate),
      }));
      
      setEditItems(items);
      
      // Load available products for the store
      const productsResponse = await productAPI.getAll({ limit: 5000 });
      setAvailableProducts(productsResponse.data.products || []);
      
      setShowEditModal(true);
    } catch (error) {
      console.error('❌ Error loading sale for edit:', error);
      toast.error('Failed to load sale details');
    }
  };

  const handleAddProduct = () => {
    if (availableProducts.length === 0) {
      toast.error('No products available');
      return;
    }
    
    setProductSearchTerm('');
    setShowProductModal(true);
  };

  const handleSelectProduct = (product) => {
    // Check if product already exists in cart
    const existingItem = editItems.find(item => item.productId === product.id);
    
    if (existingItem) {
      toast.error('Product already added. Please edit the existing item.');
      return;
    }
    
    setEditItems([...editItems, {
      id: Date.now(),
      productId: product.id,
      name: product.name,
      price: parseFloat(product.price),
      quantity: 1,
      discount: 0,
      taxRate: parseFloat(product.taxRate),
    }]);
    
    setShowProductModal(false);
    setProductSearchTerm('');
    toast.success(`${product.name} added`);
  };

  const filteredAvailableProducts = availableProducts.filter(product =>
    product.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(productSearchTerm.toLowerCase())
  );

  const handleRemoveProduct = (itemId) => {
    setEditItems(editItems.filter(item => item.id !== itemId));
  };

  const handleItemChange = (itemId, field, value) => {
    setEditItems(editItems.map(item => {
      if (item.id === itemId) {
        if (field === 'productId') {
          const product = availableProducts.find(p => p.id === parseInt(value));
          if (product) {
            return {
              ...item,
              productId: product.id,
              name: product.name,
              price: parseFloat(product.price),
              taxRate: parseFloat(product.taxRate),
            };
          }
        }
        return { ...item, [field]: field === 'quantity' ? parseInt(value) : parseFloat(value) };
      }
      return item;
    }));
  };

  const calculateEditTotal = () => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    editItems.forEach(item => {
      const itemMRP = item.price * item.quantity;
      const itemDiscount = item.discount * item.quantity;
      const discountedMRP = itemMRP - itemDiscount;
      
      const taxMultiplier = 1 + (item.taxRate / 100);
      const baseAmount = discountedMRP / taxMultiplier;
      const itemTax = discountedMRP - baseAmount;

      subtotal += itemMRP;
      totalDiscount += itemDiscount;
      totalTax += itemTax;
    });

    const total = subtotal - totalDiscount;
    
    return { subtotal, totalDiscount, totalTax, total };
  };

  const handleSaveEdit = async () => {
    if (editItems.length === 0) {
      toast.error('Please add at least one product');
      return;
    }

    setProcessing(true);
    try {
      const updateData = {
        items: editItems.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          discount: item.discount,
        }))
      };

      console.log('💾 Updating sale:', editingSale.invoiceNumber, updateData);
      
      await saleAPI.update(editingSale.id, updateData);
      toast.success('Invoice updated successfully!');
      
      setShowEditModal(false);
      setEditingSale(null);
      setEditItems([]);
      
      // Reload data
      loadData();
    } catch (error) {
      console.error('❌ Update sale error:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to update sale';
      toast.error(errorMsg, { duration: 5000 });
    } finally {
      setProcessing(false);
    }
  };

  if (loading || !user || loadingSales) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <AdminLayout title="Sales Reports">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <p className="text-sm text-gray-600">Total Sales</p>
            </div>
            <p className="text-2xl font-bold text-gray-800">{stats.totalSales}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              <p className="text-sm text-gray-600">Total Revenue</p>
            </div>
            <p className="text-2xl font-bold text-gray-800">
              ₹{parseFloat(stats.totalRevenue || 0).toFixed(0)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-purple-500" />
              <p className="text-sm text-gray-600">Avg Sale</p>
            </div>
            <p className="text-2xl font-bold text-gray-800">
              ₹{parseFloat(stats.avgSaleAmount || 0).toFixed(0)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-yellow-500" />
              <p className="text-sm text-gray-600">Total Tax</p>
            </div>
            <p className="text-2xl font-bold text-gray-800">
              ₹{parseFloat(stats.totalTax || 0).toFixed(0)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-800">Filters</h3>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <select
            name="storeId"
            value={filters.storeId}
            onChange={handleFilterChange}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">All Stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleFilterChange}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="Start Date"
          />
          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleFilterChange}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="End Date"
          />
          <div className="flex gap-2">
            <button
              onClick={applyFilters}
              className="flex-1 bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition"
            >
              Apply
            </button>
            <button
              onClick={resetFilters}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Store
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Items
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Payment
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">
                    {sale.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {sale.store?.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div>
                      <p className="font-medium">{sale.customer?.name}</p>
                      <p className="text-xs text-gray-500">{sale.customer?.phone}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {sale.items?.length || 0} items
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">
                    ₹{parseFloat(sale.totalAmount || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs uppercase">
                      {sale.paymentMethod}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(sale.saleDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => downloadInvoice(sale.id, sale.invoiceNumber)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Download Invoice"
                      >
                        <Download className="w-4 h-4 text-primary-600" />
                      </button>
                      <button
                        onClick={() => handleEditSale(sale)}
                        className="p-1 hover:bg-blue-50 rounded"
                        title="Edit Invoice"
                      >
                        <Edit className="w-4 h-4 text-blue-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sales.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg mt-4">
          <TrendingUp className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p className="text-gray-500">No sales found</p>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {showEditModal && editingSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Edit Invoice</h2>
                <p className="text-sm text-gray-600 mt-1">Invoice: {editingSale.invoiceNumber}</p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                disabled={processing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Customer Info */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">Customer Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Name:</span>
                    <span className="ml-2 font-medium">{editingSale.customer?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Phone:</span>
                    <span className="ml-2 font-medium">{editingSale.customer?.phone}</span>
                  </div>
                </div>
              </div>

              {/* Products List */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Products</h3>
                  <button
                    onClick={handleAddProduct}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
                    disabled={processing}
                  >
                    <Plus className="w-4 h-4" />
                    Add Product
                  </button>
                </div>

                <div className="space-y-3">
                  {editItems.map((item, index) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                          {/* Product Selection */}
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Product
                            </label>
                            <select
                              value={item.productId}
                              onChange={(e) => handleItemChange(item.id, 'productId', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                              disabled={processing}
                            >
                              {availableProducts.map(product => (
                                <option key={product.id} value={product.id}>
                                  {product.name} - ₹{parseFloat(product.price).toFixed(2)}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Quantity
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                              disabled={processing}
                            />
                          </div>

                          {/* Discount */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Discount (₹ per item)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => handleItemChange(item.id, 'discount', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                              disabled={processing}
                            />
                          </div>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => handleRemoveProduct(item.id)}
                          className="p-2 hover:bg-red-50 rounded-lg text-red-600 mt-6"
                          disabled={processing || editItems.length === 1}
                          title="Remove product"
                        >
                          <Trash className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Item Total */}
                      <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm">
                        <span className="text-gray-600">
                          Item Total: ₹{item.price.toFixed(2)} × {item.quantity} - ₹{(item.discount * item.quantity).toFixed(2)}
                        </span>
                        <span className="font-semibold">
                          ₹{((item.price - item.discount) * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">₹{calculateEditTotal().subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Discount:</span>
                    <span className="font-medium text-green-600">-₹{calculateEditTotal().totalDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tax (included):</span>
                    <span className="font-medium">₹{calculateEditTotal().totalTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300">
                    <span className="font-bold text-gray-900">Total:</span>
                    <span className="font-bold text-gray-900 text-lg">₹{calculateEditTotal().total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-semibold"
                  disabled={processing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 px-4 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition font-semibold disabled:opacity-50"
                  disabled={processing || editItems.length === 0}
                >
                  {processing ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Selection Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Select Product</h3>
              <button
                onClick={() => setShowProductModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products by name or SKU..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Products List */}
            <div className="flex-1 overflow-y-auto p-4">
              {filteredAvailableProducts.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No products found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAvailableProducts.map((product) => {
                    const isAlreadyAdded = editItems.some(item => item.productId === product.id);
                    
                    return (
                      <button
                        key={product.id}
                        onClick={() => handleSelectProduct(product)}
                        disabled={isAlreadyAdded}
                        className={`w-full text-left p-4 rounded-lg border transition ${
                          isAlreadyAdded
                            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                            : 'border-gray-200 hover:border-primary-500 hover:bg-primary-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{product.name}</h4>
                            <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-sm">
                                <span className="text-gray-600">Price:</span>
                                <span className="ml-1 font-medium text-gray-900">₹{parseFloat(product.price).toFixed(2)}</span>
                              </span>
                              <span className="text-sm">
                                <span className="text-gray-600">Tax:</span>
                                <span className="ml-1 font-medium text-gray-900">{product.taxRate}%</span>
                              </span>
                            </div>
                          </div>
                          {isAlreadyAdded && (
                            <span className="text-xs text-gray-500 ml-4">Already added</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => setShowProductModal(false)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

