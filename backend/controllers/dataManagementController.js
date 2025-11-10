const { AppDataSource } = require('../data-source');
const fs = require('fs');
const path = require('path');

// Get repositories
const getStoreRepository = () => AppDataSource.getRepository('Store');
const getUserRepository = () => AppDataSource.getRepository('User');
const getProductRepository = () => AppDataSource.getRepository('Product');
const getSaleRepository = () => AppDataSource.getRepository('Sale');
const getCustomerRepository = () => AppDataSource.getRepository('Customer');
const getInventoryRepository = () => AppDataSource.getRepository('Inventory');

// Create full backup
exports.createBackup = async (req, res) => {
  try {
    const { backupName, backupType, format, description } = req.body;

    // Fetch all data from database
    const stores = await getStoreRepository().find();
    const users = await getUserRepository().find({ select: ['id', 'name', 'email', 'role', 'assignedStoreId', 'isActive', 'createdAt', 'updatedAt'] }); // Exclude passwords
    const products = await getProductRepository().find({ relations: ['inventory'] });
    const sales = await getSaleRepository().find({ relations: ['store', 'cashier', 'customer', 'items'] });
    const customers = await getCustomerRepository().find();

    const backupData = {
      metadata: {
        backupName: backupName || `Backup_${new Date().toISOString().split('T')[0]}`,
        backupType: backupType || 'Full Backup',
        format: format || 'JSON',
        description: description || '',
        createdAt: new Date().toISOString(),
        createdBy: req.user.email,
        version: '2.0-PostgreSQL'
      },
      data: {
        stores,
        users,
        products,
        sales,
        customers
      },
      statistics: {
        totalStores: stores.length,
        totalUsers: users.length,
        totalProducts: products.length,
        totalSales: sales.length,
        totalCustomers: customers.length
      }
    };

    // Create backups directory if it doesn't exist
    const backupsDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const fileName = `${backupData.metadata.backupName}.json`;
    const filePath = path.join(backupsDir, fileName);

    // Write backup to file
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));

    res.json({
      message: 'Backup created successfully',
      backup: {
        name: backupData.metadata.backupName,
        fileName: fileName,
        size: fs.statSync(filePath).size,
        statistics: backupData.statistics
      }
    });
  } catch (error) {
    console.error('Backup creation error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Download backup
exports.downloadBackup = async (req, res) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(__dirname, '../backups', fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    res.download(filePath, fileName);
  } catch (error) {
    console.error('Backup download error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all backups
exports.getAllBackups = async (req, res) => {
  try {
    const backupsDir = path.join(__dirname, '../backups');
    
    if (!fs.existsSync(backupsDir)) {
      return res.json({ backups: [] });
    }

    const files = fs.readdirSync(backupsDir);
    const backups = files.map(file => {
      const filePath = path.join(backupsDir, file);
      const stats = fs.statSync(filePath);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      return {
        fileName: file,
        name: content.metadata.backupName,
        size: stats.size,
        createdAt: content.metadata.createdAt,
        createdBy: content.metadata.createdBy,
        statistics: content.statistics
      };
    });

    res.json({ backups });
  } catch (error) {
    console.error('Get backups error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Clean up all data
exports.cleanupData = async (req, res) => {
  try {
    const saleRepo = getSaleRepository();
    const customerRepo = getCustomerRepository();
    const productRepo = getProductRepository();
    const userRepo = getUserRepository();
    const inventoryRepo = getInventoryRepository();

    // Delete all data (except admin users)
    await saleRepo.delete({}); // This will cascade to SaleItems
    await customerRepo.delete({});
    await inventoryRepo.delete({});
    await productRepo.delete({});
    
    // Delete non-admin users
    const nonAdminUsers = await userRepo.find({ where: { role: 'cashier' } });
    if (nonAdminUsers.length > 0) {
      await userRepo.remove(nonAdminUsers);
    }
    
    // Note: We keep stores as they're linked to Shopify locations

    res.json({
      message: 'Data cleanup completed successfully',
      deleted: {
        sales: 'All',
        customers: 'All',
        products: 'All',
        inventory: 'All',
        users: 'All non-admin users'
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Refresh data from Shopify
exports.refreshData = async (req, res) => {
  try {
    const shopifyService = require('../utils/shopify');
    const storeRepo = getStoreRepository();
    
    console.log('🔄 Force syncing stores from Shopify...');
    
    // Delete ALL existing stores
    await storeRepo.delete({});
    console.log('✅ Deleted all existing stores');
    
    // Fetch and create stores from Shopify
    const shopifyLocations = await shopifyService.getLocations();
    
    for (const location of shopifyLocations) {
      const address = {
        street: location.address1 || '',
        city: location.city || '',
        state: location.province || '',
        zipCode: location.zip || '',
        country: location.country || ''
      };

      const storeData = {
        name: location.name,
        location: `${location.city || 'Store'}, ${location.country || ''}`,
        address,
        phone: location.phone || '',
        email: `${location.name.toLowerCase().replace(/\s+/g, '-')}@store.com`,
        shopifyLocationId: location.id.toString(),
        isActive: location.active
      };

      const store = storeRepo.create(storeData);
      await storeRepo.save(store);
    }
    
    console.log(`✅ Force synced ${shopifyLocations.length} stores from Shopify`);

    res.json({
      message: 'Stores refreshed successfully from Shopify',
      refreshed: {
        stores: shopifyLocations.length,
        locations: shopifyLocations.map(l => l.name)
      }
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: error.message });
  }
};
