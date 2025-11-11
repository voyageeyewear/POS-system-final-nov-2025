const { AppDataSource } = require('../data-source');
const fs = require('fs');
const path = require('path');
const cache = require('../utils/cache');

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

// 🔥 DEMO MODE: Create demo data if Shopify not configured
async function createDemoData(req, res) {
  try {
    const storeRepo = getStoreRepository();
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();
    const userRepo = getUserRepository();
    
    console.log('🎭 DEMO MODE: Creating realistic demo stores, products, and inventory...');
    
    // Save user-store assignments (FIXED: Load with try-catch)
    let allUsers = [];
    let userStoreMap = new Map();
    
    try {
      allUsers = await userRepo.find({ relations: ['assignedStore'] });
      for (const user of allUsers) {
        if (user.assignedStore) {
          userStoreMap.set(user.email, user.assignedStore.name);
        }
      }
    } catch (relationError) {
      console.warn('⚠️  Could not load user relations, loading without relations:', relationError.message);
      allUsers = await userRepo.find(); // Load without relations as fallback
    }
    
    // Unassign users
    for (const user of allUsers) {
      if (user.assignedStoreId) {
        user.assignedStoreId = null;
        await userRepo.save(user);
      }
    }
    
    // Delete existing data (FIXED: Use clear() or remove() instead of delete())
    try {
      const existingStores = await storeRepo.find();
      if (existingStores.length > 0) {
        await storeRepo.remove(existingStores);
      }
    } catch (deleteError) {
      console.warn('⚠️  Could not delete stores:', deleteError.message);
    }
    console.log('✅ Cleared existing stores');
    
    // Create demo stores
    const demoStores = [
      { name: 'Delhi Store', location: 'Delhi, India', city: 'Delhi' },
      { name: 'Mumbai Store', location: 'Mumbai, India', city: 'Mumbai' },
      { name: 'Bangalore Store', location: 'Bangalore, India', city: 'Bangalore' },
      { name: 'Kolkata Store', location: 'Kolkata, India', city: 'Kolkata' },
      { name: 'Chennai Store', location: 'Chennai, India', city: 'Chennai' }
    ];
    
    const createdStores = [];
    for (const store of demoStores) {
      const storeData = {
        name: store.name,
        location: store.location,
        address: {
          street: `Shop No. ${Math.floor(Math.random() * 100) + 1}`,
          city: store.city,
          state: 'India',
          zipCode: `${Math.floor(Math.random() * 900000) + 100000}`,
          country: 'India'
        },
        phone: `+91-${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        email: `${store.city.toLowerCase()}@eyewear.com`,
        shopifyLocationId: `demo-${Date.now()}-${Math.random()}`,
        isActive: true
      };
      
      const savedStore = await storeRepo.save(storeRepo.create(storeData));
      createdStores.push(savedStore);
      console.log(`✅ Created: ${store.name}`);
    }
    
    // Create demo products
    const categories = ['frame', 'eyeglass', 'sunglass'];
    const brands = ['RayBan', 'Oakley', 'Prada', 'Gucci', 'Versace', 'Tom Ford', 'Carrera'];
    const styles = ['Classic', 'Modern', 'Retro', 'Aviator', 'Wayfarer', 'Round', 'Square'];
    
    const createdProducts = [];
    for (let i = 0; i < 100; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const brand = brands[Math.floor(Math.random() * brands.length)];
      const style = styles[Math.floor(Math.random() * styles.length)];
      
      const productData = {
        name: `${brand} ${style} ${category.charAt(0).toUpperCase() + category.slice(1)}`,
        sku: `SKU-${Date.now()}-${i}`,
        category,
        price: Math.floor(Math.random() * 10000) + 1000,
        taxRate: category === 'sunglass' ? 18 : 5,
        description: `Premium ${style} ${category} by ${brand}`,
        image: `https://via.placeholder.com/300x200?text=${brand}+${style}`,
        shopifyProductId: `demo-product-${i}`,
        shopifyVariantId: `demo-variant-${i}`,
        inventoryItemId: `demo-inv-${i}`,
        isActive: true
      };
      
      const savedProduct = await productRepo.save(productRepo.create(productData));
      createdProducts.push(savedProduct);
    }
    
    console.log(`✅ Created ${createdProducts.length} demo products`);
    
    // Create inventory for each product in each store
    let inventoryCount = 0;
    for (const product of createdProducts) {
      for (const store of createdStores) {
        const quantity = Math.floor(Math.random() * 50); // Random 0-50
        
        const inventoryData = {
          productId: product.id,
          storeId: store.id,
          quantity
        };
        
        await inventoryRepo.save(inventoryRepo.create(inventoryData));
        inventoryCount++;
      }
    }
    
    console.log(`✅ Created ${inventoryCount} inventory records`);
    
    // Re-assign users to stores
    let assignedCount = 0;
    if (userStoreMap.size > 0) {
      for (const [userEmail, storeName] of userStoreMap.entries()) {
        const user = allUsers.find(u => u.email === userEmail);
        const store = createdStores.find(s => s.name === storeName) || createdStores[0];
        
        if (user && store) {
          user.assignedStoreId = store.id;
          await userRepo.save(user);
          assignedCount++;
          console.log(`✅ Re-assigned: ${userEmail} -> ${store.name}`);
        }
      }
    }
    
    // 🔥 AGGRESSIVE: Auto-assign ANY cashier without a store to the first store!
    const unassignedCashiers = allUsers.filter(u => u.role === 'cashier' && !u.assignedStoreId);
    if (unassignedCashiers.length > 0 && createdStores.length > 0) {
      console.log(`🔥 AUTO-ASSIGNING ${unassignedCashiers.length} unassigned cashiers to ${createdStores[0].name}...`);
      for (const cashier of unassignedCashiers) {
        cashier.assignedStoreId = createdStores[0].id;
        await userRepo.save(cashier);
        assignedCount++;
        console.log(`✅ Auto-assigned: ${cashier.email} -> ${createdStores[0].name}`);
      }
    }
    
    console.log(`✅ Total users assigned to stores: ${assignedCount}`);
    
    // Clear cache
    cache.clear();
    
    res.json({
      message: '🎭 DEMO MODE: Created demo stores, products, and inventory!',
      demoMode: true,
      results: {
        stores: { synced: createdStores.length, names: createdStores.map(s => s.name) },
        products: { created: createdProducts.length, updated: 0 },
        inventory: { updated: inventoryCount }
      },
      note: 'This is DEMO data. Add SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN to use real Shopify data.'
    });
  } catch (error) {
    console.error('❌ Demo data creation error:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      details: 'Failed to create demo data. Check server logs for details.'
    });
  }
}

// Refresh data from Shopify - Auto-sync stores, products, and inventory
exports.refreshData = async (req, res) => {
  try {
    const shopifyService = require('../utils/shopify');
    const storeRepo = getStoreRepository();
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();
    
    // 🔥 AGGRESSIVE FIX: Check if Shopify credentials are configured
    const hasShopifyCredentials = process.env.SHOPIFY_SHOP_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (!hasShopifyCredentials) {
      console.log('⚠️  DEMO MODE: Shopify credentials not found. Creating demo data...');
      return await createDemoData(req, res);
    }
    
    const syncResults = {
      stores: { synced: 0, names: [] },
      products: { created: 0, updated: 0 },
      inventory: { updated: 0 }
    };
    
    // STEP 1: Sync Stores
    console.log('🔄 Step 1/3: Syncing stores from Shopify...');
    
    // First, save user-store assignments before unassigning
    const userRepo = getUserRepository();
    const allUsers = await userRepo.find({ relations: ['assignedStore'] });
    const userStoreMap = new Map(); // email -> store name mapping
    
    for (const user of allUsers) {
      if (user.assignedStore) {
        userStoreMap.set(user.email, user.assignedStore.name);
        console.log(`💾 Saved: ${user.email} -> ${user.assignedStore.name}`);
      }
    }
    
    // Unassign all users from stores to avoid foreign key constraint errors
    let unassignedCount = 0;
    for (const user of allUsers) {
      if (user.assignedStoreId) {
        user.assignedStoreId = null;
        await userRepo.save(user);
        unassignedCount++;
      }
    }
    if (unassignedCount > 0) {
      console.log(`✅ Unassigned ${unassignedCount} users from stores`);
    }
    
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
    
    // Re-assign users to their stores based on saved mapping
    if (userStoreMap.size > 0) {
      console.log('🔄 Re-assigning users to stores...');
      let reassignedCount = 0;
      
      for (const [userEmail, storeName] of userStoreMap.entries()) {
        const user = allUsers.find(u => u.email === userEmail);
        const store = createdStores.find(s => s.name === storeName);
        
        if (user && store) {
          user.assignedStoreId = store.id;
          await userRepo.save(user);
          reassignedCount++;
          console.log(`✅ Re-assigned: ${userEmail} -> ${storeName} (ID: ${store.id})`);
        } else {
          console.log(`⚠️  Could not re-assign ${userEmail} to ${storeName}`);
        }
      }
      
      console.log(`✅ Re-assigned ${reassignedCount} users to stores`);
    }
    
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
            inventoryItemId: variant.inventory_item_id ? variant.inventory_item_id.toString() : null,
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
      .where('product.inventoryItemId IS NOT NULL')
      .getMany();
    
    console.log(`📦 Found ${products.length} products with inventory item IDs`);
    
    // Get all inventory item IDs - USE STORED VALUES (AGGRESSIVE FIX!)
    const inventoryItemIds = [];
    const productMap = new Map();

    for (const product of products) {
      if (product.inventoryItemId) {
        inventoryItemIds.push(product.inventoryItemId);
        productMap.set(product.inventoryItemId, product);
      }
    }
    
    console.log(`📦 Collected ${inventoryItemIds.length} inventory item IDs for sync`);

    // Get inventory levels from Shopify
    if (inventoryItemIds.length > 0) {
      console.log(`🔄 Fetching inventory levels for ${inventoryItemIds.length} items from Shopify...`);
      const inventoryLevels = await shopifyService.getInventoryLevels(inventoryItemIds);
      console.log(`✅ Received ${inventoryLevels.length} inventory level records from Shopify`);

      // Create a map of location -> item -> quantity
      const inventoryMap = new Map();
      
      for (const level of inventoryLevels) {
        const locationId = level.location_id.toString();
        const itemId = level.inventory_item_id.toString(); // Convert to string for consistency
        
        if (!inventoryMap.has(locationId)) {
          inventoryMap.set(locationId, new Map());
        }
        inventoryMap.get(locationId).set(itemId, level.available || 0);
      }
      
      console.log(`📊 Organized inventory for ${inventoryMap.size} locations`);

      // Update inventory for each store
      for (const store of createdStores) {
        const locationInventory = inventoryMap.get(store.shopifyLocationId);
        
        if (locationInventory) {
          console.log(`📦 Updating ${locationInventory.size} inventory items for ${store.name}...`);
          let storeUpdated = 0;
          
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
                storeUpdated++;
              } catch (error) {
                console.error(`❌ Error updating inventory for ${product.name} at ${store.name}:`, error.message);
              }
            } else {
              console.warn(`⚠️  No product found for inventory item ID: ${inventoryItemId}`);
            }
          }
          
          console.log(`✅ Updated ${storeUpdated} items for ${store.name}`);
        } else {
          console.warn(`⚠️  No inventory data found for ${store.name} (Location ID: ${store.shopifyLocationId})`);
        }
      }
    } else {
      console.warn('⚠️  No inventory item IDs to sync');
    }
    
    console.log(`✅ Step 3/3 Complete: ${syncResults.inventory.updated} inventory records updated`);
    console.log(`🎉 Full sync completed successfully!`);

    // Clear all inventory cache since data has been refreshed
    cache.clear();
    console.log('🗑️  Cleared all inventory cache');

    res.json({
      message: 'Full sync completed! Stores, products, and inventory refreshed from Shopify.',
      results: syncResults
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: error.message });
  }
};

// DIAGNOSTIC: Check database state
exports.getDatabaseStatus = async (req, res) => {
  try {
    const storeRepo = getStoreRepository();
    const userRepo = getUserRepository();
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();

    // Get counts
    const storeCount = await storeRepo.count();
    const userCount = await userRepo.count();
    const productCount = await productRepo.count();
    const inventoryCount = await inventoryRepo.count();

    // Get stores with details
    const stores = await storeRepo.find();
    
    // Get users with store assignments
    const users = await userRepo.find({ relations: ['assignedStore'] });
    
    // Get inventory grouped by store
    const inventoryByStore = {};
    for (const store of stores) {
      const inventory = await inventoryRepo.find({
        where: { storeId: store.id },
        relations: ['product']
      });
      inventoryByStore[store.name] = {
        storeId: store.id,
        totalItems: inventory.length,
        activeItems: inventory.filter(i => i.quantity > 0 && i.product?.isActive).length,
        totalQuantity: inventory.reduce((sum, i) => sum + i.quantity, 0)
      };
    }

    // Get user assignments
    const userAssignments = users.map(u => ({
      email: u.email,
      name: u.name,
      role: u.role,
      assignedStoreId: u.assignedStoreId,
      assignedStoreName: u.assignedStore?.name || 'None'
    }));

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      counts: {
        stores: storeCount,
        users: userCount,
        products: productCount,
        inventory: inventoryCount
      },
      stores: stores.map(s => ({
        id: s.id,
        name: s.name,
        location: s.location,
        shopifyLocationId: s.shopifyLocationId
      })),
      inventoryByStore,
      userAssignments,
      issues: [
        storeCount === 0 && '❌ No stores in database',
        productCount === 0 && '❌ No products in database',
        inventoryCount === 0 && '❌ No inventory records in database',
        users.some(u => u.role === 'cashier' && !u.assignedStoreId) && '⚠️ Some cashiers have no store assigned'
      ].filter(Boolean)
    });
  } catch (error) {
    console.error('Database status error:', error);
    res.status(500).json({ error: error.message });
  }
};
