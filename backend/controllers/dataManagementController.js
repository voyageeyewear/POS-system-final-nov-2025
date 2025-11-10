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
    const allSales = await saleRepo.find();
    const allCustomers = await customerRepo.find();
    const allInventory = await inventoryRepo.find();
    const allProducts = await productRepo.find();
    
    if (allSales.length > 0) await saleRepo.remove(allSales);
    if (allCustomers.length > 0) await customerRepo.remove(allCustomers);
    if (allInventory.length > 0) await inventoryRepo.remove(allInventory);
    if (allProducts.length > 0) await productRepo.remove(allProducts);
    
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

// Refresh data from Shopify - Auto-sync stores, products, and inventory
exports.refreshData = async (req, res) => {
  try {
    const shopifyService = require('../utils/shopify');
    const storeRepo = getStoreRepository();
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();
    
    const syncResults = {
      stores: { synced: 0, names: [] },
      products: { created: 0, updated: 0 },
      inventory: { updated: 0 }
    };
    
    // STEP 1: Sync Stores
    console.log('🔄 Step 1/3: Syncing stores from Shopify...');
    
    // Delete ALL existing stores
    const allStores = await storeRepo.find();
    if (allStores.length > 0) {
      await storeRepo.remove(allStores);
      console.log(`✅ Deleted ${allStores.length} existing stores`);
    }
    
    // Fetch and create stores from Shopify
    const shopifyLocations = await shopifyService.getLocations();
    const createdStores = [];
    
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
      const savedStore = await storeRepo.save(store);
      createdStores.push(savedStore);
      syncResults.stores.names.push(location.name);
    }
    
    syncResults.stores.synced = shopifyLocations.length;
    console.log(`✅ Step 1/3 Complete: Synced ${syncResults.stores.synced} stores`);
    
    // STEP 2: Sync Products
    console.log('🔄 Step 2/3: Syncing products from Shopify...');
    const shopifyProducts = await shopifyService.getProducts();
    
    for (const shopifyProduct of shopifyProducts) {
      for (const variant of shopifyProduct.variants) {
        try {
          const productData = {
            name: variant.title === 'Default Title' 
              ? shopifyProduct.title 
              : `${shopifyProduct.title} - ${variant.title}`,
            sku: variant.sku || `SKU-${variant.id}`,
            category: shopifyProduct.product_type || 'Uncategorized',
            price: parseFloat(variant.price) || 0,
            description: shopifyProduct.body_html || '',
            image: shopifyProduct.image?.src || '',
            shopifyProductId: shopifyProduct.id.toString(),
            shopifyVariantId: variant.id.toString(),
            taxRate: shopifyProduct.product_type?.toLowerCase().includes('sunglass') ? 18 : 5,
            isActive: true
          };

          const existingProduct = await productRepo.findOne({
            where: { shopifyVariantId: variant.id.toString() }
          });

          if (existingProduct) {
            Object.assign(existingProduct, productData);
            await productRepo.save(existingProduct);
            syncResults.products.updated++;
          } else {
            const product = productRepo.create(productData);
            await productRepo.save(product);
            syncResults.products.created++;
          }
        } catch (error) {
          console.error(`Error syncing product variant ${variant.id}:`, error.message);
        }
      }
    }
    
    console.log(`✅ Step 2/3 Complete: ${syncResults.products.created} products created, ${syncResults.products.updated} updated`);
    
    // STEP 3: Sync Inventory
    console.log('🔄 Step 3/3: Syncing inventory from Shopify...');
    const products = await productRepo
      .createQueryBuilder('product')
      .where('product.shopifyVariantId IS NOT NULL')
      .getMany();
    
    // Get all inventory item IDs
    const inventoryItemIds = [];
    const productMap = new Map();

    for (const product of products) {
      if (product.shopifyVariantId && product.shopifyProductId) {
        try {
          const shopifyProduct = await shopifyService.getProduct(product.shopifyProductId);
          const variant = shopifyProduct.variants.find(v => v.id.toString() === product.shopifyVariantId);
          
          if (variant && variant.inventory_item_id) {
            inventoryItemIds.push(variant.inventory_item_id);
            productMap.set(variant.inventory_item_id, product);
          }
        } catch (error) {
          console.error(`Error fetching inventory for product ${product.name}:`, error.message);
        }
      }
    }

    // Get inventory levels from Shopify
    if (inventoryItemIds.length > 0) {
      const inventoryLevels = await shopifyService.getInventoryLevels(inventoryItemIds);

      // Create a map of location -> item -> quantity
      const inventoryMap = new Map();
      
      for (const level of inventoryLevels) {
        const locationId = level.location_id.toString();
        if (!inventoryMap.has(locationId)) {
          inventoryMap.set(locationId, new Map());
        }
        inventoryMap.get(locationId).set(level.inventory_item_id, level.available || 0);
      }

      // Update inventory for each store
      for (const store of createdStores) {
        const locationInventory = inventoryMap.get(store.shopifyLocationId);
        
        if (locationInventory) {
          for (const [inventoryItemId, quantity] of locationInventory.entries()) {
            const product = productMap.get(inventoryItemId);
            
            if (product) {
              try {
                let inventory = await inventoryRepo.findOne({
                  where: {
                    productId: product.id,
                    storeId: store.id
                  }
                });

                if (inventory) {
                  inventory.quantity = quantity;
                } else {
                  inventory = inventoryRepo.create({
                    productId: product.id,
                    storeId: store.id,
                    quantity
                  });
                }

                await inventoryRepo.save(inventory);
                syncResults.inventory.updated++;
              } catch (error) {
                console.error(`Error updating inventory for ${product.name} at ${store.name}:`, error.message);
              }
            }
          }
        }
      }
    }
    
    console.log(`✅ Step 3/3 Complete: ${syncResults.inventory.updated} inventory records updated`);
    console.log(`🎉 Full sync completed successfully!`);

    res.json({
      message: 'Full sync completed! Stores, products, and inventory refreshed from Shopify.',
      results: syncResults
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: error.message });
  }
};
