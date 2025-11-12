import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';
import { Download, Filter, TrendingUp, DollarSign, Trash2 } from 'lucide-react';
import { saleAPI, storeAPI } from '../../utils/api';
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

  const handleDeleteSale = async (saleId, invoiceNumber) => {
    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete invoice ${invoiceNumber}?\n\nThis will:\n- Delete the sale record\n- Delete all sale items\n- Restore inventory quantities\n\nThis action cannot be undone.`
    );
    
    if (!confirmed) return;

    try {
      console.log(`🗑️  Deleting sale: ${invoiceNumber} (ID: ${saleId})`);
      await saleAPI.delete(saleId);
      toast.success(`Invoice ${invoiceNumber} deleted successfully`);
      
      // Reload data to refresh the table
      loadData();
    } catch (error) {
      console.error('❌ Delete sale error:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to delete sale';
      toast.error(errorMsg, { duration: 5000 });
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
                        onClick={() => handleDeleteSale(sale.id, sale.invoiceNumber)}
                        className="p-1 hover:bg-red-50 rounded"
                        title="Delete Sale"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
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
    </AdminLayout>
  );
}

