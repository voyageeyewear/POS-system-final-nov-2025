import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';
import { Package, Plus, Edit, Trash2, Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { productAPI, storeAPI, inventoryAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function ProductsManagement() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [syncingInventory, setSyncingInventory] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0
  });

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

  const loadData = async (page = 1, overrideFilters = {}) => {
    try {
      setLoadingProducts(true);
      
      // Use override filters if provided, otherwise use state
      const currentStoreFilter = overrideFilters.storeFilter !== undefined ? overrideFilters.storeFilter : storeFilter;
      const currentCategoryFilter = overrideFilters.categoryFilter !== undefined ? overrideFilters.categoryFilter : categoryFilter;
      const currentSearchTerm = overrideFilters.searchTerm !== undefined ? overrideFilters.searchTerm : searchTerm;
      
      const params = {
        page,
        limit: 50,
        ...(currentCategoryFilter !== 'all' && { category: currentCategoryFilter }),
        ...(currentStoreFilter !== 'all' && { storeId: currentStoreFilter }),
        ...(currentSearchTerm && { search: currentSearchTerm })
      };
      
      console.log('🔍 Loading products with params:', params);
      
      const [productsRes, storesRes] = await Promise.all([
        productAPI.getAll(params),
        storeAPI.getAll(),
      ]);
      setProducts(productsRes.data.products);
      setPagination(productsRes.data.pagination);
      setStores(storesRes.data.stores);
    } catch (error) {
      toast.error('Failed to load products');
      console.error(error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handlePageChange = (newPage) => {
    setPagination({ ...pagination, page: newPage });
    loadData(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = () => {
    setPagination({ ...pagination, page: 1 });
    loadData(1);
  };

  const handleSyncInventory = async () => {
    setSyncingInventory(true);
    const toastId = toast.loading(`Syncing inventory from Shopify... This may take a few minutes for ${pagination.total || products.length} products.`);
    
    try {
      const response = await inventoryAPI.syncFromShopify();
      const results = response.data.results;
      
      toast.success(
        `Inventory sync complete! Updated ${results.updated} product inventories across ${results.totalStores} stores`,
        { id: toastId, duration: 5000 }
      );
      
      // Reload products to show updated inventory
      loadData(pagination.page);
    } catch (error) {
      toast.error(
        error.response?.data?.error || 'Failed to sync inventory from Shopify',
        { id: toastId }
      );
    } finally {
      setSyncingInventory(false);
    }
  };


  if (loading || !user || loadingProducts) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  // Diagnostic functions
  const testShopify = async () => {
    try {
      toast.loading('Testing Shopify connection...', { duration: 30000 });
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/diagnostic/test-shopify`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      toast.dismiss();
      
      if (response.ok) {
        console.log('✅ Shopify Test Results:', data);
        toast.success(`✅ Shopify Connected! ${data.totalProducts} products, ${data.locations.length} locations`);
      } else {
        console.error('❌ Shopify Test Failed:', data);
        toast.error(`❌ Shopify Error: ${data.error}`);
      }
    } catch (error) {
      toast.dismiss();
      toast.error('❌ Connection failed: ' + error.message);
    }
  };
  
  const checkDatabase = async () => {
    try {
      toast.loading('Checking database...', { duration: 30000 });
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/diagnostic/database-state`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      toast.dismiss();
      
      if (response.ok) {
        console.log('📊 Database State:', data);
        const missing = data.productsWithoutInventoryItemId;
        if (missing > 0) {
          toast.error(`⚠️ ${missing} products missing inventoryItemId! Click "Fix Inventory IDs"`);
        } else {
          toast.success(`✅ Database OK! ${data.totalProducts} products ready`);
        }
      } else {
        console.error('❌ Database Check Failed:', data);
        toast.error(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      toast.dismiss();
      toast.error('❌ Failed: ' + error.message);
    }
  };
  
  const fixInventoryIds = async () => {
    if (!confirm('This will fetch inventory item IDs for all products from Shopify. This may take 5-10 minutes. Continue?')) {
      return;
    }
    
    try {
      toast.loading('🔧 Fixing inventory item IDs... This may take 5-10 minutes', { duration: 600000 });
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/diagnostic/fix-inventory-item-ids`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      toast.dismiss();
      
      if (response.ok) {
        console.log('✅ Fix Results:', data);
        toast.success(`✅ Fixed ${data.updated} products! Now click "Sync Inventory"`);
      } else {
        console.error('❌ Fix Failed:', data);
        toast.error(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      toast.dismiss();
      toast.error('❌ Failed: ' + error.message);
    }
  };

  return (
    <AdminLayout title="Products">
      <div className="mb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h2 className="text-xl font-bold text-gray-800">Product Inventory</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSyncInventory}
              disabled={syncingInventory}
              className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${syncingInventory ? 'animate-spin' : ''}`} />
              {syncingInventory ? 'Syncing Inventory...' : 'Sync Inventory from Shopify'}
            </button>
            
            {/* DIAGNOSTIC BUTTONS */}
            <button
              onClick={testShopify}
              className="bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition text-sm"
              title="Test Shopify API connection"
            >
              🔍 Test Shopify
            </button>
            <button
              onClick={checkDatabase}
              className="bg-purple-500 text-white px-3 py-2 rounded-lg hover:bg-purple-600 transition text-sm"
              title="Check database state"
            >
              📊 Check DB
            </button>
            <button
              onClick={fixInventoryIds}
              className="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 transition text-sm"
              title="Fix missing inventory item IDs"
            >
              🔧 Fix IDs
            </button>
          </div>
        </div>
        
        {/* Search and Filters */}
        <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
          <div className="flex flex-col md:flex-row gap-3 mb-3">
            {/* Store Filter Dropdown - Shopify Style */}
            <div className="relative w-full md:w-64">
              <select
                value={storeFilter}
                onChange={(e) => {
                  const newStoreFilter = e.target.value;
                  console.log('🏪 Store filter changed to:', newStoreFilter);
                  setStoreFilter(newStoreFilter);
                  setPagination({ ...pagination, page: 1 });
                  loadData(1, { storeFilter: newStoreFilter });
                }}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none appearance-none bg-white font-medium text-gray-700 cursor-pointer"
              >
                <option value="all">All Locations</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search products by name or SKU..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition font-medium"
            >
              Search
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {['all', 'frame', 'eyeglass', 'sunglass', 'accessory'].map((category) => (
              <button
                key={category}
                onClick={() => {
                  console.log('📦 Category filter changed to:', category);
                  setCategoryFilter(category);
                  setPagination({ ...pagination, page: 1 });
                  loadData(1, { categoryFilter: category });
                }}
                className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                  categoryFilter === category
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  SKU
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Price
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Tax
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Total Inventory
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map((product) => {
                // Calculate inventory - backend already filtered by store if selected
                // IMPORTANT: PostgreSQL returns numbers as strings, must parse!
                const displayInventory = product.inventory?.reduce(
                  (sum, inv) => sum + (parseInt(inv.quantity) || 0),
                  0
                ) || 0;

                return (
                  <tr key={product._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {product.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {product.description?.substring(0, 40)}...
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {product.sku}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs capitalize">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      ₹{product.price}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {product.taxRate}%
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <span
                        className={`${
                          displayInventory > 20
                            ? 'text-green-600'
                            : displayInventory > 0
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        {displayInventory} units
                      </span>
                      {storeFilter === 'all' && product.inventory && product.inventory.length > 1 && (
                        <span className="text-xs text-gray-400 ml-2">
                          ({product.inventory.length} locations)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          product.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {products.length === 0 && !loadingProducts && (
        <div className="text-center py-12 bg-white rounded-lg mt-4">
          <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p className="text-gray-500">No products found</p>
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-between bg-white p-4 rounded-lg shadow-sm">
          <div className="text-sm text-gray-600">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} products
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex gap-1">
              {[...Array(pagination.pages)].map((_, index) => {
                const page = index + 1;
                // Show first page, last page, current page, and pages around current
                if (
                  page === 1 ||
                  page === pagination.pages ||
                  (page >= pagination.page - 1 && page <= pagination.page + 1)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`px-3 py-2 rounded-lg font-medium transition ${
                        pagination.page === page
                          ? 'bg-primary-500 text-white'
                          : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  );
                } else if (
                  page === pagination.page - 2 ||
                  page === pagination.page + 2
                ) {
                  return (
                    <span key={page} className="px-2 py-2">
                      ...
                    </span>
                  );
                }
                return null;
              })}
            </div>

            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.pages}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

