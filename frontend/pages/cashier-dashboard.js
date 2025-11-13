import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { saleAPI } from '../utils/api';
import { TrendingUp, DollarSign, ShoppingBag, Package, ArrowLeft, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CashierDashboard() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('today');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (user?.role === 'admin') {
      router.push('/admin');
    } else if (user && user.role === 'cashier') {
      loadPerformanceData();
    }
  }, [user, loading, selectedPeriod]);

  const loadPerformanceData = async () => {
    try {
      setLoadingStats(true);
      const response = await saleAPI.getCashierPerformance(selectedPeriod);
      setStats(response.data);
    } catch (error) {
      console.error('Error loading performance:', error);
      toast.error('Failed to load performance data');
    } finally {
      setLoadingStats(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pb-20">
      {/* Header */}
      <div className="bg-white shadow-md sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/pos')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-6 h-6 mr-2" />
              <span className="font-medium">Back to POS</span>
            </button>
            <div className="text-sm text-gray-500">
              {new Date().toLocaleDateString('en-IN', { 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric' 
              })}
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">My Performance</h1>
          <p className="text-sm text-gray-600 mt-1">Hi, {user?.name || 'Cashier'}</p>
        </div>

        {/* Period Selector */}
        <div className="px-4 pb-4">
          <div className="flex gap-2 overflow-x-auto">
            {[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
              { value: 'all', label: 'All Time' }
            ].map((period) => (
              <button
                key={period.value}
                onClick={() => setSelectedPeriod(period.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedPeriod === period.value
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-600 border border-gray-200'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-4 py-6 space-y-4">
        {loadingStats ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Total Sales */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <DollarSign className="w-8 h-8" />
                </div>
                <div className="text-right">
                  <p className="text-blue-100 text-sm">Total Revenue</p>
                  <h2 className="text-3xl font-bold">
                    ₹{(stats?.totalRevenue || 0).toLocaleString('en-IN')}
                  </h2>
                </div>
              </div>
              <div className="flex items-center text-blue-100 text-sm">
                <TrendingUp className="w-4 h-4 mr-1" />
                <span>{stats?.totalSales || 0} transactions</span>
              </div>
            </div>

            {/* Sales Count */}
            <div className="bg-white rounded-2xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm mb-1">Total Sales</p>
                  <h3 className="text-3xl font-bold text-gray-900">{stats?.totalSales || 0}</h3>
                  <p className="text-green-600 text-sm mt-2 flex items-center">
                    <ShoppingBag className="w-4 h-4 mr-1" />
                    Transactions completed
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-xl">
                  <ShoppingBag className="w-10 h-10 text-green-600" />
                </div>
              </div>
            </div>

            {/* Items Sold */}
            <div className="bg-white rounded-2xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm mb-1">Items Sold</p>
                  <h3 className="text-3xl font-bold text-gray-900">{stats?.totalItems || 0}</h3>
                  <p className="text-purple-600 text-sm mt-2 flex items-center">
                    <Package className="w-4 h-4 mr-1" />
                    Products delivered
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-xl">
                  <Package className="w-10 h-10 text-purple-600" />
                </div>
              </div>
            </div>

            {/* Average Sale */}
            <div className="bg-white rounded-2xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm mb-1">Average Sale</p>
                  <h3 className="text-3xl font-bold text-gray-900">
                    ₹{(stats?.averageSale || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </h3>
                  <p className="text-orange-600 text-sm mt-2 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1" />
                    Per transaction
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-xl">
                  <TrendingUp className="w-10 h-10 text-orange-600" />
                </div>
              </div>
            </div>

            {/* Recent Sales */}
            {stats?.recentSales && stats.recentSales.length > 0 && (
              <div className="bg-white rounded-2xl shadow-md p-6 mt-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Sales</h3>
                <div className="space-y-3">
                  {stats.recentSales.map((sale, index) => (
                    <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="font-medium text-gray-900">{sale.invoiceNumber}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(sale.saleDate).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">₹{parseFloat(sale.totalAmount).toLocaleString('en-IN')}</p>
                        <p className="text-sm text-gray-500">{sale.items?.length || 0} items</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="flex justify-around items-center h-16">
          <button
            onClick={() => router.push('/pos')}
            className="flex flex-col items-center justify-center flex-1 h-full hover:bg-gray-50"
          >
            <ShoppingBag className="w-6 h-6 text-gray-400" />
            <span className="text-xs text-gray-600 mt-1">POS</span>
          </button>
          <button
            onClick={() => router.push('/cashier-dashboard')}
            className="flex flex-col items-center justify-center flex-1 h-full bg-blue-50"
          >
            <TrendingUp className="w-6 h-6 text-blue-600" />
            <span className="text-xs text-blue-600 mt-1 font-medium">Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
}

