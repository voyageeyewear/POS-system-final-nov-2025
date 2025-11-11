import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import CartItem from '../components/CartItem';
import CustomerModal from '../components/CustomerModal';
import { storeAPI, saleAPI, authAPI, productAPI } from '../utils/api';
import { Search, ShoppingCart, CreditCard, Receipt, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import frontendCache from '../utils/cache';

export default function POS() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [processing, setProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const ITEMS_PER_PAGE = 20;

  // VERSION CHECK - v3.0 - FINAL FIX
  useEffect(() => {
    console.log('%c✅ POS VERSION 3.0 LOADED - OBJECTID FIX ACTIVE', 'background: #00ff00; color: #000; font-size: 20px; padding: 10px;');
    alert('✅ NEW CODE LOADED v3.0 - Check console!');
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (user?.role === 'admin') {
      router.push('/admin');
    } else if (user?.assignedStore) {
      loadProducts();
      checkSyncStatus(); // Check initial sync status
    }
  }, [user, loading, router]);

  // Check sync status periodically
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(checkSyncStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [user]);

  const checkSyncStatus = async () => {
    try {
      const response = await authAPI.getSyncStatus();
      setSyncStatus(response.data);
      
      // If sync just completed, clear cache and reload products
      if (!response.data.isSyncing && syncStatus?.isSyncing) {
        console.log('✅ Sync completed, clearing cache and reloading products...');
        frontendCache.clear();
        loadProducts(true); // Force refresh
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }
  };

  const loadProducts = async (forceRefresh = false) => {
    try {
      setLoadingProducts(true);
      setLoadingProgress(0);
      setLoadingMessage('Checking cache...');
      
      console.log('🔍 User object:', user);
      console.log('🔍 User assignedStore:', user.assignedStore);
      console.log('🔍 Store ID to use:', user.assignedStore?.id || user.assignedStore?._id);
      
      const storeId = user.assignedStore?.id || user.assignedStore?._id;
      
      if (!storeId) {
        toast.error('No store assigned to your account');
        console.error('❌ No store ID found for user:', user);
        return;
      }

      const cacheKey = `products_all_stores`;
      
      // Check frontend cache first (unless force refresh)
      if (!forceRefresh) {
        const cachedProducts = frontendCache.get(cacheKey);
        if (cachedProducts) {
          console.log('✅ Using cached products from localStorage');
          setLoadingMessage('Loading from cache...');
          setLoadingProgress(100);
          
          // Small delay to show the "Loading from cache" message
          await new Promise(resolve => setTimeout(resolve, 300));
          
          setProducts(cachedProducts);
          setLoadingProducts(false);
          toast.success(`✅ Loaded ${cachedProducts.length} products from cache`, { duration: 2000 });
          
          // Fetch in background to update cache
          setTimeout(() => {
            productAPI.getAll({ page: 1, limit: 5000 })
              .then(response => {
                const productsData = response.data.products || [];
                // Transform to include inventory as quantity field
                const transformedProducts = productsData.map(product => {
                  const storeInventory = product.inventory?.find(inv => inv.storeId === storeId);
                  return {
                    ...product,
                    quantity: storeInventory?.quantity || 0
                  };
                });
                
                if (JSON.stringify(transformedProducts) !== JSON.stringify(cachedProducts)) {
                  console.log('📦 Products updated in background');
                  setProducts(transformedProducts);
                  frontendCache.set(cacheKey, transformedProducts, 1800000); // 30 min
                  toast('🔄 Inventory updated in background', { duration: 2000 });
                }
              })
              .catch(err => console.error('Background update error:', err));
          }, 1000);
          
          return;
        }
      }
      
      // FIRST TIME LOAD - Show progressive loading
      setLoadingMessage('Connecting to server...');
      setLoadingProgress(10);
      
      // Simulate progress during API call
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev < 80) {
            return prev + 5;
          }
          return prev;
        });
      }, 200);
      
      setLoadingMessage('Fetching all products...');
      console.log('📡 Fetching ALL products with inventory for store ID:', storeId);
      console.log('📡 User store name:', user.assignedStore?.name);
      
      const response = await productAPI.getAll({ page: 1, limit: 5000 });
      
      clearInterval(progressInterval);
      setLoadingProgress(90);
      setLoadingMessage('Processing products...');
      
      console.log('✅ Products response:', response.data);
      
      const productsData = response.data.products || [];
      
      // Transform products to include quantity from cashier's store inventory
      const inventory = productsData.map(product => {
        const storeInventory = product.inventory?.find(inv => inv.storeId === storeId);
        return {
          ...product,
          quantity: storeInventory?.quantity || 0
        };
      });
      
      console.log(`📦 Transformed ${inventory.length} products with quantities`);
      
      // Check if NO products exist at all
      if (!inventory || inventory.length === 0) {
        console.warn(`⚠️  No products found in the system!`);
        console.warn(`💡 This means the Shopify product sync hasn't been run yet`);
        
        clearInterval(progressInterval);
        setLoadingProgress(0);
        setLoadingProducts(false);
        
        toast.error(
          `No products in system. Please contact admin to sync products from Shopify.`,
          { duration: 5000 }
        );
        return;
      }
      
      // Log how many products have stock in this store
      const productsWithStock = inventory.filter(p => p.quantity > 0).length;
      console.log(`📊 Store "${user.assignedStore?.name}": ${productsWithStock} products with stock, ${inventory.length - productsWithStock} out of stock`);
      
      // Small delay to show processing message
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setLoadingProgress(100);
      setLoadingMessage('Ready!');
      
      setProducts(inventory);
      
      // Cache the products for 30 minutes
      frontendCache.set(cacheKey, inventory, 1800000);
      console.log(`💾 Cached ${inventory.length} products for 30 minutes`);
      
      toast.success(`✅ Loaded ${inventory.length} products`, { duration: 2000 });
      
    } catch (error) {
      toast.error('Failed to load products');
      console.error('❌ Error loading products:', error);
      console.error('❌ Error response:', error.response?.data);
    } finally {
      setLoadingProducts(false);
      setLoadingProgress(0);
    }
  };

  const toggleProductSelection = (product) => {
    // Check how many times this product has been selected
    const selectedCount = selectedProducts.filter((p) => p.productId === product._id).length;
    
    // Always add as new instance (up to stock limit)
    if (product.quantity > selectedCount) {
      // Store as a selection object with unique ID and reference to original product
      const selection = {
        selectionId: `${product._id}_${Date.now()}_${Math.random()}`, // Unique selection ID
        productId: product._id, // Keep original MongoDB ID separate
        productData: product // Store full product data
      };
      setSelectedProducts([...selectedProducts, selection]);
      if (selectedCount > 0) {
        toast.success(`Added again! Total: ${selectedCount + 1}`, { duration: 1000 });
      }
    } else {
      toast.error('Not enough stock');
    }
  };

  const removeProductSelection = (product) => {
    // Remove one instance of the product
    const index = selectedProducts.findIndex((p) => p.productId === product._id);
    if (index > -1) {
      const newSelected = [...selectedProducts];
      newSelected.splice(index, 1);
      setSelectedProducts(newSelected);
    }
  };

  const moveToCart = () => {
    if (selectedProducts.length === 0) {
      toast.error('Please select products first');
      return;
    }

    console.log('📦 Selected Products:', selectedProducts);

    const cartItems = selectedProducts.map((selection) => {
      console.log('🔍 Selection:', {
        selectionId: selection.selectionId,
        productId: selection.productId,
        hasProductData: !!selection.productData
      });
      
      return {
        id: selection.selectionId, // Unique ID for cart item
        productId: selection.productId, // MongoDB ObjectId
        name: selection.productData.name,
        sku: selection.productData.sku,
        price: selection.productData.price,
        taxRate: selection.productData.taxRate,
        discount: 0,
        discountType: 'amount',
        quantity: 1,
        maxQuantity: selection.productData.quantity,
      };
    });

    console.log('🛒 Cart Items Created:', cartItems);

    setCart(cartItems);
    setShowCart(true);
    setSelectedProducts([]);
  };

  const updateQuantity = (id, quantity) => {
    setCart(cart.map((item) => (item.id === id ? { ...item, quantity } : item)));
  };

  const updateDiscount = (id, discount, discountType) => {
    setCart(cart.map((item) => 
      item.id === id 
        ? { ...item, discount, discountType: discountType || item.discountType } 
        : item
    ));
  };

  const removeFromCart = (id) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    cart.forEach((item) => {
      const itemSubtotal = item.price * item.quantity;
      
      // Calculate discount based on type
      let itemDiscount = 0;
      if (item.discountType === 'percentage') {
        itemDiscount = (item.price * item.discount / 100) * item.quantity;
      } else {
        itemDiscount = item.discount * item.quantity;
      }
      
      const discountedAmount = itemSubtotal - itemDiscount;
      const itemTax = (discountedAmount * item.taxRate) / 100;

      subtotal += itemSubtotal;
      totalDiscount += itemDiscount;
      totalTax += itemTax;
    });

    const total = subtotal - totalDiscount + totalTax;

    return { subtotal, totalDiscount, totalTax, total };
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    setShowCustomerModal(true);
  };

  const handleCustomerSubmit = async (customerInfo) => {
    setProcessing(true);
    try {
      const saleData = {
        storeId: user.assignedStore.id || user.assignedStore._id,
        items: cart.map((item) => ({
          productId: item.productId, // Use product ID, not cart item id
          quantity: item.quantity,
          discount: item.discount,
        })),
        customerInfo,
        paymentMethod,
      };

      console.log('%c🚀 SALE DATA BEING SENT:', 'background: #ff0; color: #000; font-size: 16px; padding: 5px;');
      console.log(JSON.stringify(saleData, null, 2));
      console.log('%c🔍 FIRST ITEM PRODUCTID:', 'background: #0ff; color: #000; font-size: 16px; padding: 5px;', saleData.items[0]?.productId);
      console.log('%c📏 ProductId Length:', 'background: #f0f; color: #fff; font-size: 16px; padding: 5px;', saleData.items[0]?.productId?.length);

      const response = await saleAPI.create(saleData);
      
      toast.success('Sale completed successfully!');
      setCart([]);
      setShowCustomerModal(false);
      loadProducts(); // Refresh inventory
      
      // Show option to download invoice
      const downloadInvoice = window.confirm('Sale completed! Download invoice?');
      if (downloadInvoice) {
        const invoiceResponse = await saleAPI.downloadInvoice(response.data.sale.id || response.data.sale._id);
        const url = window.URL.createObjectURL(new Blob([invoiceResponse.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${response.data.sale.invoiceNumber}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to complete sale');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter]);

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totals = calculateTotals();

  // Force sync function for emergency
  const forceFullSync = async () => {
    try {
      toast.loading('🔥 FORCE SYNCING ALL DATA FROM SHOPIFY...', { duration: 10000 });
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/data-management/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        toast.dismiss();
        toast.success('✅ SYNC COMPLETE! Reloading...', { duration: 3000 });
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast.dismiss();
        toast.error('❌ Sync failed. Contact admin.');
      }
    } catch (error) {
      toast.dismiss();
      toast.error('❌ Error: ' + error.message);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  // AGGRESSIVE: Show sync button if no products and not loading
  const showEmergencySync = !loadingProducts && products.length === 0;

  // Handle closing/cancelling the loading overlay
  const handleCancelLoading = () => {
    setLoadingProducts(false);
    setLoadingProgress(0);
    toast.error('Loading cancelled. You may not see all products.', { duration: 3000 });
  };

  // Loading Overlay Component
  const LoadingOverlay = () => (
    <div className="fixed inset-0 bg-white bg-opacity-95 z-50 flex items-center justify-center">
      {/* Close Button */}
      <button
        onClick={handleCancelLoading}
        className="absolute top-4 right-4 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition shadow-lg hover:shadow-xl"
        title="Cancel loading"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="max-w-md w-full px-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-full mb-4 animate-pulse">
            <ShoppingCart className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {loadingMessage}
          </h2>
          <p className="text-gray-600 text-sm">
            {loadingProgress < 100 ? 'Please wait while we load your products...' : 'Almost ready!'}
          </p>
        </div>
        
        {/* Progress Bar */}
        <div className="relative">
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            >
              <div className="h-full w-full bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-shimmer"></div>
            </div>
          </div>
          
          {/* Percentage */}
          <div className="mt-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-blue-600">
              {loadingProgress}%
            </span>
            <span className="text-xs text-gray-500">
              {loadingProgress < 30 && '⏳ Starting...'}
              {loadingProgress >= 30 && loadingProgress < 70 && '📦 Loading products...'}
              {loadingProgress >= 70 && loadingProgress < 90 && '🔄 Processing...'}
              {loadingProgress >= 90 && loadingProgress < 100 && '✨ Finalizing...'}
              {loadingProgress === 100 && '✅ Complete!'}
            </span>
          </div>
        </div>
        
        {/* Info Text */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-600 text-center">
            💡 <strong>First time?</strong> This might take a moment. Next time will be instant!
          </p>
        </div>

        {/* Cancel Button (alternative to X button) */}
        <div className="mt-4 text-center">
          <button
            onClick={handleCancelLoading}
            className="text-sm text-gray-500 hover:text-red-600 underline transition"
          >
            Cancel loading
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <Layout title="Point of Sale">
      {/* Loading Overlay with Progress */}
      {loadingProducts && <LoadingOverlay />}
      
      {/* Sync Status Banner */}
      {syncStatus?.isSyncing && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded-r-lg">
          <div className="flex items-center">
            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin mr-3" />
            <div>
              <p className="text-sm font-medium text-blue-800">
                Syncing data from Shopify...
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Products will be updated automatically when sync completes
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 pb-20">
        {/* Products Section */}
        <div className="w-full lg:col-span-2">
          {/* Search and Filters */}
          <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
              </div>
              <button
                onClick={() => {
                  toast.loading('Refreshing products...');
                  loadProducts(true).then(() => {
                    toast.dismiss();
                    toast.success('Products refreshed!');
                  });
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition flex items-center gap-2"
                title="Refresh products"
              >
                <RefreshCw className="w-5 h-5" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
              {['all', 'frame', 'eyeglass', 'sunglass', 'accessory'].map((category) => (
                <button
                  key={category}
                  onClick={() => setCategoryFilter(category)}
                  className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                    categoryFilter === category
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category === 'all' 
                    ? 'All' 
                    : category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          {loadingProducts ? (
            <div className="flex justify-center py-12">
              <div className="spinner"></div>
            </div>
          ) : (
            <div className="products-grid-mobile sm:grid sm:grid-cols-3 sm:gap-4">
              {paginatedProducts.map((product) => {
                const selectionCount = selectedProducts.filter((p) => p.productId === product._id).length;
                return (
                  <ProductCard
                    key={product._id}
                    product={product}
                    isSelected={selectionCount > 0}
                    selectionCount={selectionCount}
                    onToggle={toggleProductSelection}
                    onRemove={removeProductSelection}
                  />
                );
              })}
            </div>
          )}

          {!loadingProducts && filteredProducts.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg">
              <p className="text-gray-500 mb-6">No products found</p>
              
              {/* EMERGENCY SYNC BUTTON */}
              {products.length === 0 && (
                <div className="max-w-md mx-auto">
                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 mb-4">
                    <h3 className="text-lg font-bold text-red-800 mb-2">⚠️ No Inventory Available</h3>
                    <p className="text-sm text-red-600 mb-4">
                      Your store has no products. This could mean:<br/>
                      • Inventory hasn't been synced yet<br/>
                      • Your store assignment is incorrect<br/>
                      • Shopify sync hasn't completed
                    </p>
                    <button
                      onClick={forceFullSync}
                      className="w-full px-6 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition text-lg shadow-lg"
                    >
                      🔥 FORCE SYNC FROM SHOPIFY NOW
                    </button>
                    <p className="text-xs text-red-500 mt-3">
                      This will sync all stores, products, and inventory from Shopify.<br/>
                      Takes 10-15 minutes. You'll be reloaded when complete.
                    </p>
                  </div>
                  
                  <button
                    onClick={() => {
                      window.location.href = '/admin';
                    }}
                    className="text-sm text-gray-600 hover:text-gray-800 underline"
                  >
                    Or go to Admin Panel to check settings
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pagination */}
          {!loadingProducts && totalPages > 1 && (
            <div className="mt-6 bg-white p-4 rounded-lg shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="text-sm text-gray-600">
                  Showing {startIndex + 1} - {Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length} products
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  
                  <div className="flex gap-1">
                    {[...Array(totalPages)].map((_, index) => {
                      const page = index + 1;
                      // Show first, last, current, and pages around current
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => handlePageChange(page)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition ${
                              currentPage === page
                                ? 'bg-primary-500 text-white font-semibold'
                                : 'border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return <span key={page} className="px-2">...</span>;
                      }
                      return null;
                    })}
                  </div>
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Floating Cart Button */}
        {selectedProducts.length > 0 && (
          <div className="fixed bottom-6 right-6 z-40">
            <button
              onClick={moveToCart}
              className="bg-primary-500 text-white px-6 py-4 rounded-full shadow-lg hover:bg-primary-600 transition flex items-center gap-3"
            >
              <ShoppingCart className="w-6 h-6" />
              <span className="font-bold">Cart ({selectedProducts.length})</span>
            </button>
          </div>
        )}

        {/* Cart Section */}
        {showCart && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 lg:hidden" onClick={() => setShowCart(false)}>
            <div 
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 sticky top-0 bg-white border-b z-10">
                <button
                  onClick={() => setShowCart(false)}
                  className="text-gray-600 hover:text-gray-800 mb-2 text-sm"
                >
                  ← Back to Products
                </button>
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-gray-700" />
                  <h2 className="text-lg font-bold text-gray-800">Cart ({cart.length})</h2>
                </div>
              </div>
              <div className="p-4">

            {/* Cart Items */}
            <div className="max-h-[400px] overflow-y-auto mb-4">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>Cart is empty</p>
                </div>
              ) : (
                cart.map((item) => (
                  <CartItem
                    key={item.id}
                    item={item}
                    onUpdateQuantity={updateQuantity}
                    onUpdateDiscount={updateDiscount}
                    onRemove={removeFromCart}
                  />
                ))
              )}
            </div>

            {cart.length > 0 && (
              <>
                {/* Totals */}
                <div className="border-t border-gray-200 pt-4 mb-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">₹{totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Discount:</span>
                    <span className="font-medium text-green-600">-₹{totals.totalDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax:</span>
                    <span className="font-medium">₹{totals.totalTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
                    <span>Total:</span>
                    <span className="text-primary-600">₹{totals.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Checkout Button */}
                <button
                  onClick={handleCheckout}
                  disabled={processing}
                  className="w-full bg-primary-500 text-white py-3 rounded-lg font-semibold hover:bg-primary-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Receipt className="w-5 h-5" />
                  {processing ? 'Processing...' : 'Checkout'}
                </button>
              </>
            )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Customer Modal */}
      <CustomerModal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSubmit={handleCustomerSubmit}
      />
    </Layout>
  );
}

