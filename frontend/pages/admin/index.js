import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';
import { Store, Users, ShoppingBag, DollarSign, TrendingUp, Package } from 'lucide-react';
import { storeAPI, authAPI, saleAPI } from '../../utils/api';
import Link from 'next/link';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();
  const [stats, setStats] = useState({
    stores: 0,
    users: 0,
    totalSales: 0,
    totalRevenue: 0,
  });
  const [recentSales, setRecentSales] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (!isAdmin) {
        router.push('/pos');
      } else {
        loadDashboardData();
      }
    }
  }, [user, loading, isAdmin, router]);

  const loadDashboardData = async () => {
    try {
      setLoadingStats(true);
      
      const [storesRes, usersRes, salesRes, statsRes] = await Promise.all([
        storeAPI.getAll(),
        authAPI.getAllUsers(),
        saleAPI.getAll({ limit: 5 }),
        saleAPI.getStats(),
      ]);

      setStats({
        stores: storesRes.data.stores.length,
        users: usersRes.data.users.length,
        totalSales: statsRes.data.stats.totalSales || 0,
        totalRevenue: statsRes.data.stats.totalRevenue || 0,
      });

      setRecentSales(salesRes.data.sales || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  if (loading || !user || loadingStats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <AdminLayout title="Dashboard">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Store className="w-8 h-8 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.stores}</p>
          <p className="text-sm text-gray-600">Total Stores</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.users}</p>
          <p className="text-sm text-gray-600">Total Users</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <ShoppingBag className="w-8 h-8 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalSales}</p>
          <p className="text-sm text-gray-600">Total Sales</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 text-yellow-500" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            ₹{parseFloat(stats.totalRevenue || 0).toFixed(0)}
          </p>
          <p className="text-sm text-gray-600">Total Revenue</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Link href="/admin/users" className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer">
          <Users className="w-10 h-10 text-primary-500 mb-3" />
          <h3 className="font-semibold text-gray-800 mb-1">Manage Users</h3>
          <p className="text-sm text-gray-600">Add, edit, and assign users</p>
        </Link>

        <Link href="/admin/sales" className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer">
          <TrendingUp className="w-10 h-10 text-primary-500 mb-3" />
          <h3 className="font-semibold text-gray-800 mb-1">Sales Reports</h3>
          <p className="text-sm text-gray-600">View all sales and analytics</p>
        </Link>
      </div>

      {/* Recent Sales */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Recent Sales</h2>
        </div>
        
        {recentSales.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <ShoppingBag className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No sales yet</p>
          </div>
        ) : (
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
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      {sale.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {sale.store?.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {sale.customer?.name}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      ₹{parseFloat(sale.totalAmount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(sale.saleDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t border-gray-200 text-center">
          <Link href="/admin/sales" className="text-primary-500 hover:text-primary-600 font-medium text-sm cursor-pointer">
            View All Sales →
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}

