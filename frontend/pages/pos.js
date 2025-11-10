import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import CartItem from '../components/CartItem';
import CustomerModal from '../components/CustomerModal';
import { storeAPI, saleAPI, authAPI } from '../utils/api';
import { Search, ShoppingCart, CreditCard, Receipt, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

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
      
      // If sync just completed, reload products
      if (!response.data.isSyncing && syncStatus?.isSyncing) {
        console.log('✅ Sync completed, reloading products...');
        loadProducts();
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }
  };

  const loadProducts = async () => {
    try {
      setLoadingProducts(true);
      
      console.log('🔍 User object:', user);
      console.log('🔍 User assignedStore:', user.assignedStore);
      console.log('🔍 Store ID to use:', user.assignedStore?.id || user.assignedStore?._id);
      
      const storeId = user.assignedStore?.id || user.assignedStore?._id;
      
      if (!storeId) {
        toast.error('No store assigned to your account');
        console.error('❌ No store ID found for user:', user);
        return;
      }
      
      console.log('📡 Fetching inventory for store ID:', storeId);
      const response = await storeAPI.getInventory(storeId);
      console.log('✅ Inventory response:', response.data);
      setProducts(response.data.inventory);
    } catch (error) {
      toast.error('Failed to load products');
      console.error('❌ Error loading products:', error);
      console.error('❌ Error response:', error.response?.data);
    } finally {
      setLoadingProducts(false);
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

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <Layout title="Point of Sale">
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
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
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
              <p className="text-gray-500">No products found</p>
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

