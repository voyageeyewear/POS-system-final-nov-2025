import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';
import { Package, Store, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { inventoryAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function InventorySummary() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (!isAdmin) {
        router.push('/pos');
      } else {
        loadSummary();
      }
    }
  }, [user, loading, isAdmin, router]);

  const loadSummary = async () => {
    try {
      setLoadingSummary(true);
      const response = await inventoryAPI.getSummary();
      setSummary(response.data);
    } catch (error) {
      console.error('Error loading summary:', error);
      toast.error('Failed to load inventory summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  if (loading || !user || loadingSummary) {
    return (
      <AdminLayout title="Inventory Summary">
        <div className="flex justify-center items-center h-64">
          <div className="spinner"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Inventory Summary">
      <div className="mb-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Inventory Summary</h2>
            <p className="text-gray-600 text-sm mt-1">Overview of inventory across all kiosks</p>
          </div>
          <button
            onClick={loadSummary}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Overall Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Products</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">{summary?.totalProducts || 0}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Kiosks</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">{summary?.totalStores || 0}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <Store className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Units</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">
                  {parseInt(summary?.grandTotalQuantity || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Value</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">
                  ₹{parseFloat(summary?.totalInventoryValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Kiosk-wise Breakdown */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">Kiosk-wise Inventory</h3>
            <p className="text-sm text-gray-600 mt-1">Detailed breakdown by location</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kiosk Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Products
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    With Stock
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Units
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Low Stock
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Out of Stock
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Value
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {summary?.byStore?.map((store, index) => (
                  <tr key={store.storeId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Store className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{store.storeName}</div>
                          <div className="text-xs text-gray-500">ID: {store.storeId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{store.location}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-medium text-gray-900">{store.totalProducts}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {store.productsWithStock}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-bold text-blue-600">{parseInt(store.totalQuantity || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {store.lowStockItems > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          {store.lowStockItems}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {store.outOfStockItems > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {store.outOfStockItems}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm font-medium text-gray-900">
                        ₹{parseFloat(store.totalValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100">
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                    GRAND TOTAL:
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm font-bold text-blue-600">
                      {parseInt(summary?.grandTotalQuantity || 0).toLocaleString()}
                    </span>
                  </td>
                  <td colSpan="2"></td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-bold text-gray-900">
                      ₹{parseFloat(summary?.totalInventoryValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Empty State */}
        {(!summary?.byStore || summary.byStore.length === 0) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center mt-6">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Inventory Data</h3>
            <p className="text-gray-500 mb-4">Inventory hasn't been synced yet from Shopify.</p>
            <button
              onClick={() => router.push('/admin/products')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Go to Products & Sync
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

