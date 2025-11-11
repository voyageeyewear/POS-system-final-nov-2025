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
  const { user, loading, refreshUser } = useAuth();
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [bgLoadingPercent, setBgLoadingPercent] = useState(0);
  const [totalProductCount, setTotalProductCount] = useState(0);
  const ITEMS_PER_PAGE = 50; // Show 50 products per page
  const LOADING_TIMEOUT_MS = 15000;

  // VERSION CHECK - v8.0 - PROGRESSIVE LOADING WITH PAGINATION!
  useEffect(() => {
    console.log('%c🚀 POS VERSION 8.0 - PROGRESSIVE LOADING!', 'background: #0066ff; color: #fff; font-size: 24px; padding: 10px; font-weight: bold;');
    console.log('⚡ First 50 products in 5 seconds!');
    console.log('📊 Remaining products load in background!');
    console.log('📄 Pagination: 50 products per page!');
    console.log('🎯 Zero wait time for cashier!');
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (user?.role === 'admin') {
      router.push('/admin');
    } else if (user && user.role === 'cashier') {
      // 🚀 SIMPLE: Just load products - EXACTLY like admin does!
      console.log('🚀 Loading products - SIMPLE approach!');
      loadProducts();
      checkSyncStatus();
    }
  }, [user, loading, router]);

  // Check sync status periodically
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(checkSyncStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [user]);

  // 🔥 AUTO-SYNC: Real-time inventory refresh (every 2 minutes for more real-time data)
  useEffect(() => {
    if (!user || user.role !== 'cashier') return;
    
    console.log('🔄 Setting up real-time auto-sync (every 2 minutes)...');
    
    // Initial sync on page load to get fresh data
    const initialSync = async () => {
      console.log('🔄 Initial sync on page load...');
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://pos-system-final-nov-2025-production.up.railway.app/api'}/data-management/refresh`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          console.log('✅ Initial sync complete! Loading fresh products...');
          frontendCache.clear();
          await loadProducts();
        }
      } catch (error) {
        console.error('Initial sync error:', error);
      }
    };
    
    initialSync(); // Run immediately on mount
    
    const autoSyncInterval = setInterval(async () => {
      console.log('🔄 Auto-sync: Fetching real-time inventory from Shopify...');
      
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://pos-system-final-nov-2025-production.up.railway.app/api'}/data-management/refresh`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          console.log('✅ Real-time sync complete! Refreshing products...');
          frontendCache.clear();
          await loadProducts();
          toast.success('📊 Inventory synced from Shopify!', { duration: 2000 });
        }
      } catch (error) {
        console.error('Auto-sync error:', error);
      }
    }, 2 * 60 * 1000); // Every 2 minutes for real-time data
    
    return () => clearInterval(autoSyncInterval);
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

  const loadProducts = async (page = 1) => {
    console.log('🚀 Loading products - SIMPLE approach (like admin)!');
    
    try {
      if (!user) {
        toast.error('User not found. Please login again.');
        setTimeout(() => router.push('/login'), 2000);
        return;
      }
      
      // 🚀 SUPER SIMPLE: Just load ALL products at once (like admin does)
      const response = await productAPI.getAll({ page, limit: 5000 }); // Load up to 5000 products
      const productsData = response.data.products || [];
      const pagination = response.data.pagination;
      
      console.log(`✅ Loaded ${productsData.length} products!`);
      console.log(`📊 Total: ${pagination?.total || productsData.length} products`);
      
      // 🚀 SIMPLE: Show TOTAL inventory across ALL stores (like admin)
      const transformedProducts = productsData.map(product => {
        // Sum up inventory from ALL stores
        // IMPORTANT: PostgreSQL returns numbers as strings, must parse!
        const totalQuantity = product.inventory?.reduce((sum, inv) => sum + (parseInt(inv.quantity) || 0), 0) || 0;
        
        return {
          ...product,
          quantity: totalQuantity
        };
      });
      
      setProducts(transformedProducts);
      setTotalProductCount(pagination?.total || transformedProducts.length);
      
      // Cache products
      frontendCache.set('products_all_stores', transformedProducts, 1800000);
      
      if (transformedProducts.length === 0) {
        toast.error('No products found. Click "FORCE SYNC" to sync from Shopify.', { duration: 5000 });
      } else {
        // 🔥 AUTO-SYNC: Check if products have inventory
        const productsWithStock = transformedProducts.filter(p => p.quantity > 0).length;
        
        if (productsWithStock === 0 && transformedProducts.length > 0) {
          // All products have 0 stock - auto-sync!
          console.log('⚠️ All products have 0 inventory. Auto-syncing from Shopify...');
          toast.loading('🔄 Auto-syncing inventory from Shopify...', { id: 'auto-sync-inventory' });
          
          // Trigger inventory sync
          setTimeout(async () => {
            try {
              const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://pos-system-final-nov-2025-production.up.railway.app/api'}/data-management/refresh`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('token')}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (response.ok) {
                toast.success('✅ Auto-sync complete! Reloading products...', { id: 'auto-sync-inventory' });
                
                // Reload products after 2 seconds
                setTimeout(() => {
                  frontendCache.clear();
                  loadProducts();
                }, 2000);
              } else {
                toast.error('❌ Auto-sync failed. Click "FORCE SYNC" button.', { id: 'auto-sync-inventory' });
              }
            } catch (error) {
              console.error('Auto-sync error:', error);
              toast.error('❌ Auto-sync failed. Click "FORCE SYNC" button.', { id: 'auto-sync-inventory' });
            }
          }, 1000);
        } else {
          toast.success(`✅ Loaded ${transformedProducts.length} products! (${productsWithStock} in stock)`, { duration: 2000 });
        }
      }
      
    } catch (error) {
      console.error('❌ Error loading products:', error);
      setProducts([]);
      toast.error('Failed to load products. Try refreshing the page.', { duration: 5000 });
    }
  };

  const toggleProductSelection = (product) => {
    // Check how many times this product has been selected
    const selectedCount = selectedProducts.filter((p) => p.productId === product.id).length;
    
    // Always add as new instance (up to stock limit)
    if (product.quantity > selectedCount) {
      // Store as a selection object with unique ID and reference to original product
      const selection = {
        selectionId: `${product.id}_${Date.now()}_${Math.random()}`, // Unique selection ID
        productId: product.id, // PostgreSQL ID
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
    const index = selectedProducts.findIndex((p) => p.productId === product.id);
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
      // 🔥 TAX-INCLUSIVE PRICING: Price already includes tax (MRP)
      const mrpPerItem = item.price; // MRP includes tax
      const itemMRP = mrpPerItem * item.quantity;
      
      // Calculate discount based on type (on MRP)
      let itemDiscount = 0;
      if (item.discountType === 'percentage') {
        itemDiscount = (mrpPerItem * item.discount / 100) * item.quantity;
      } else {
        itemDiscount = item.discount * item.quantity;
      }
      
      // Final amount after discount (still tax-inclusive)
      const discountedMRP = itemMRP - itemDiscount;
      
      // Extract tax from tax-inclusive price
      // Formula: Base = Price / (1 + TaxRate/100)
      // Tax = Price - Base
      const taxMultiplier = 1 + (item.taxRate / 100);
      const baseAmount = discountedMRP / taxMultiplier;
      const itemTax = discountedMRP - baseAmount;

      subtotal += itemMRP;
      totalDiscount += itemDiscount;
      totalTax += itemTax;
    });

    // Total is simply subtotal - discount (tax already included)
    const total = subtotal - totalDiscount;

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

  // Pagination logic - 50 products per page
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

  // NUCLEAR: Always show sync button if no products
  const showEmergencySync = products.length === 0;

  // Handle closing/cancelling the loading overlay
  const handleCancelLoading = () => {
    setLoadingProducts(false);
    setLoadingProgress(0);
    toast.error('Loading cancelled. You may not see all products.', { duration: 3000 });
  };

  // Loading Overlay Component - AGGRESSIVE: Auto-closes after timeout
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
            {loadingTimeout 
              ? '⚠️ Taking longer than expected...' 
              : loadingProgress < 100 
                ? 'Please wait while we load your products...' 
                : 'Almost ready!'}
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
        
        {/* AGGRESSIVE: Show skip button after timeout */}
        {loadingTimeout && (
          <div className="mt-6 p-4 bg-red-50 rounded-lg border-2 border-red-300 animate-pulse">
            <p className="text-sm text-red-700 font-semibold text-center mb-3">
              ⚠️ Loading is taking too long!
            </p>
            <button
              onClick={handleCancelLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition shadow-lg text-lg"
            >
              ⚡ SKIP & FORCE SYNC NOW
            </button>
            <p className="text-xs text-red-600 text-center mt-2">
              Click above to close loading and use emergency sync
            </p>
          </div>
        )}
        
        {/* Info Text */}
        {!loadingTimeout && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-600 text-center">
              💡 <strong>First time?</strong> This might take a moment. Next time will be instant!
            </p>
          </div>
        )}

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
      {/* 🚀 Progressive Loading Progress Bar */}
      {backgroundLoading && (
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 mb-4 rounded-lg shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <p className="text-sm font-bold">
                  📊 Loading remaining products...
                </p>
              </div>
              <span className="text-xl font-bold">
                {bgLoadingPercent}%
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-500 ease-out shadow-lg"
                style={{ width: `${bgLoadingPercent}%` }}
              >
                <div className="h-full w-full bg-gradient-to-r from-white to-blue-100 animate-pulse"></div>
              </div>
            </div>
            
            <p className="text-xs text-white/80 text-center">
              {products.length} of {totalProductCount} products loaded • You can start using the page now!
            </p>
          </div>
        </div>
      )}
      
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
                onClick={async () => {
                  const toastId = toast.loading('🔄 Syncing real-time inventory from Shopify...');
                  try {
                    // First sync from Shopify
                    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://pos-system-final-nov-2025-production.up.railway.app/api'}/data-management/refresh`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                      }
                    });
                    
                    if (response.ok) {
                      // Clear cache and reload with fresh data
                      frontendCache.clear();
                      await loadProducts();
                      toast.success('✅ Real-time inventory synced from Shopify!', { id: toastId });
                    } else {
                      toast.error('Failed to sync from Shopify', { id: toastId });
                    }
                  } catch (error) {
                    console.error('Sync error:', error);
                    toast.error('Failed to sync from Shopify', { id: toastId });
                  }
                }}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition flex items-center gap-2 font-medium shadow-md"
                title="Sync real-time inventory from Shopify"
              >
                <RefreshCw className="w-5 h-5" />
                <span className="hidden sm:inline">Sync Now</span>
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

          {/* AGGRESSIVE: Products Counter & Status Bar */}
          {products.length > 0 && (
            <div className="sticky top-0 z-30 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg shadow-md p-4 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                {/* Total Products Badge */}
                <div className="flex items-center gap-3">
                  <div className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-md">
                    <p className="text-xs font-bold">TOTAL PRODUCTS</p>
                    <p className="text-2xl font-black">{products.length}</p>
                  </div>
                  
                  <div className="bg-white px-4 py-2 rounded-lg shadow-sm border-2 border-blue-200">
                    <p className="text-xs text-gray-500 font-medium">Currently Showing</p>
                    <p className="text-lg font-bold text-gray-800">
                      {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)}
                    </p>
                  </div>
                  
                  {totalPages > 1 && (
                    <div className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-md">
                      <p className="text-xs font-bold">PAGE</p>
                      <p className="text-2xl font-black">{currentPage}/{totalPages}</p>
                    </div>
                  )}
                </div>
                
                {/* Quick Stats */}
                <div className="flex items-center gap-2">
                  <div className="bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-200">
                    <p className="text-xs text-gray-600">
                      <span className="font-bold text-green-600">{products.filter(p => p.quantity > 0).length}</span> in stock
                    </p>
                  </div>
                  <div className="bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-200">
                    <p className="text-xs text-gray-600">
                      <span className="font-bold text-red-600">{products.filter(p => p.quantity === 0).length}</span> out of stock
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Products Grid - Paginated view (50 per page) */}
          <div className="products-grid-mobile sm:grid sm:grid-cols-3 sm:gap-4">
            {paginatedProducts.map((product) => {
              const selectionCount = selectedProducts.filter((p) => p.productId === product.id).length;
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  isSelected={selectionCount > 0}
                  selectionCount={selectionCount}
                  onToggle={toggleProductSelection}
                  onRemove={removeProductSelection}
                />
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
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

          {/* PAGINATION - Clean and Compact */}
          {totalPages > 1 && (
            <div className="mt-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
                {/* Page Info */}
                <div className="text-sm text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{startIndex + 1}-{Math.min(endIndex, filteredProducts.length)}</span> of <span className="font-semibold text-gray-900">{filteredProducts.length}</span> products
                </div>
                
                {/* Pagination Controls */}
                <div className="flex items-center gap-2">
                  {/* Previous Button */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  
                  {/* Page Numbers */}
                  <div className="flex gap-1">
                    {[...Array(totalPages)].map((_, index) => {
                      const page = index + 1;
                      // Show first, last, current, and 1 page on each side
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => handlePageChange(page)}
                            className={`min-w-[36px] px-3 py-2 text-sm font-medium rounded-lg transition ${
                              currentPage === page
                                ? 'bg-primary-500 text-white'
                                : 'border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return <span key={page} className="px-2 text-gray-400">...</span>;
                      }
                      return null;
                    })}
                  </div>
                  
                  {/* Next Button */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
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

