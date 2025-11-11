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
    console.log('✅ Unassigned users from stores');
    
    // 🔥 CRITICAL FIX: Delete in correct order to avoid FK constraint errors
    // Order: Inventory → Products → Stores
    
    // 1. Delete ALL inventory first (has FK to products AND stores)
    try {
      const existingInventory = await inventoryRepo.find();
      if (existingInventory.length > 0) {
        await inventoryRepo.remove(existingInventory);
        console.log(`✅ Deleted ${existingInventory.length} inventory records`);
      }
    } catch (deleteError) {
      console.warn('⚠️  Could not delete inventory:', deleteError.message);
    }
    
    // 2. Delete ALL products (has FK to stores via inventory)
    try {
      const existingProducts = await productRepo.find();
      if (existingProducts.length > 0) {
        await productRepo.remove(existingProducts);
        console.log(`✅ Deleted ${existingProducts.length} products`);
      }
    } catch (deleteError) {
      console.warn('⚠️  Could not delete products:', deleteError.message);
    }
    
    // 3. NOW delete stores (no more FK dependencies)
    try {
      const existingStores = await storeRepo.find();
      if (existingStores.length > 0) {
        await storeRepo.remove(existingStores);
        console.log(`✅ Deleted ${existingStores.length} stores`);
      }
    } catch (deleteError) {
      console.warn('⚠️  Could not delete stores:', deleteError.message);
    }
    
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
        image: `https://placehold.co/300x200/e0e0e0/666666?text=${encodeURIComponent(brand + ' ' + style)}`,
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
    
    // 🔥 NEW APPROACH: UPSERT stores (update if exists, create if not)
    // This preserves database IDs and user-store assignments!
    console.log('✅ Using UPSERT strategy - no data loss!');
    
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

      // 🔥 UPSERT: Find existing store or create new
      let store = await storeRepo.findOne({ 
        where: { shopifyLocationId: location.id.toString() } 
      });

      if (store) {
        // Update existing store (preserves ID and user assignments!)
        Object.assign(store, storeData);
        console.log(`📝 Updating store: ${store.name} (ID: ${store.id})`);
      } else {
        // Create new store
        store = storeRepo.create(storeData);
        console.log(`✨ Creating new store: ${storeData.name}`);
      }

      const savedStore = await storeRepo.save(store);
      createdStores.push(savedStore);
      syncResults.stores.names.push(location.name);
    }
    
    syncResults.stores.synced = shopifyLocations.length;
    console.log(`✅ Step 1/3 Complete: Synced ${syncResults.stores.synced} stores (user assignments preserved!)`);
    
    // ✅ No need to re-assign users - store IDs are preserved with UPSERT!
    
    // STEP 2: Sync Products
    console.log('🔄 Step 2/3: Syncing products from Shopify...');
    const shopifyProducts = await shopifyService.getProducts();
    console.log(`📦 Received ${shopifyProducts.length} products from Shopify`);
    
    // 🔥 DIAGNOSTIC: Check first product's variant structure
    if (shopifyProducts.length > 0 && shopifyProducts[0].variants.length > 0) {
      const sampleVariant = shopifyProducts[0].variants[0];
      console.log('📋 Sample variant from Shopify:', {
        id: sampleVariant.id,
        title: sampleVariant.title,
        sku: sampleVariant.sku,
        price: sampleVariant.price,
        inventory_item_id: sampleVariant.inventory_item_id,
        has_inventory_item_id: !!sampleVariant.inventory_item_id
      });
    }
    
    let withInventoryId = 0;
    let withoutInventoryId = 0;
    
    for (const shopifyProduct of shopifyProducts) {
      for (const variant of shopifyProduct.variants) {
        try {
          // 🔥 FIX: If inventory_item_id is missing, fetch it from variant endpoint
          let inventoryItemId = variant.inventory_item_id;
          
          if (!inventoryItemId) {
            console.log(`🔍 Fetching missing inventory_item_id for variant ${variant.id}...`);
            try {
              const fullVariant = await shopifyService.getVariant(variant.id);
              inventoryItemId = fullVariant.inventory_item_id;
              if (inventoryItemId) {
                console.log(`✅ Found inventory_item_id: ${inventoryItemId}`);
              } else {
                console.warn(`⚠️  Variant ${variant.id} has no inventory tracking enabled in Shopify!`);
              }
            } catch (variantError) {
              console.error(`❌ Failed to fetch variant ${variant.id}:`, variantError.message);
            }
          }
          
          // 🔥 DIAGNOSTIC: Track inventory IDs
          if (inventoryItemId) {
            withInventoryId++;
          } else {
            withoutInventoryId++;
            console.warn(`⚠️  Variant ${variant.id} (${shopifyProduct.title}) has NO inventory_item_id!`);
          }
          
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
            inventoryItemId: inventoryItemId ? inventoryItemId.toString() : null,
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
    console.log(`📊 Inventory ID Status: ${withInventoryId} WITH inventory_item_id, ${withoutInventoryId} WITHOUT inventory_item_id`);
    
    if (withoutInventoryId > 0) {
      console.error(`❌ CRITICAL: ${withoutInventoryId} variants missing inventory_item_id from Shopify!`);
      console.error('💡 This means Shopify is not returning inventory_item_id in the API response.');
      console.error('💡 This could be due to API version or product configuration.');
    }
    
    // STEP 3: Sync Inventory
    console.log('🔄 Step 3/3: Syncing inventory from Shopify...');
    const products = await productRepo
      .createQueryBuilder('product')
      .where('product.inventoryItemId IS NOT NULL')
      .getMany();
    
    console.log(`📦 Found ${products.length} products with inventory item IDs`);
    
    // 🔥 DIAGNOSTIC: Show sample of products with inventory IDs
    if (products.length > 0) {
      const sample = products.slice(0, 3);
      console.log('📋 Sample products with inventory IDs:', sample.map(p => ({
        id: p.id,
        name: p.name,
        inventoryItemId: p.inventoryItemId
      })));
    } else {
      console.error('❌ CRITICAL: No products have inventoryItemId! Sync will fail.');
    }
    
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
    console.log(`📋 First 5 inventory item IDs: ${inventoryItemIds.slice(0, 5).join(', ')}`);

    // Get inventory levels from Shopify
    if (inventoryItemIds.length > 0) {
      console.log(`🔄 Fetching inventory levels for ${inventoryItemIds.length} items from Shopify...`);
      const inventoryLevels = await shopifyService.getInventoryLevels(inventoryItemIds);
      console.log(`✅ Received ${inventoryLevels.length} inventory level records from Shopify`);

      // 🔥 DIAGNOSTIC: Show sample inventory levels from Shopify
      if (inventoryLevels.length > 0) {
        const sample = inventoryLevels.slice(0, 5);
        console.log('📋 Sample inventory levels from Shopify:', sample.map(l => ({
          location_id: l.location_id,
          inventory_item_id: l.inventory_item_id,
          available: l.available
        })));
      } else {
        console.error('❌ CRITICAL: Shopify returned 0 inventory levels!');
      }

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
      
      // 🔥 DIAGNOSTIC: Show what locations we have in the map
      console.log('📋 Location IDs in inventory map:', Array.from(inventoryMap.keys()));

      // Update inventory for each store
      console.log(`📦 Processing inventory for ${createdStores.length} stores...`);
      console.log('📋 Store IDs we have:', createdStores.map(s => ({ name: s.name, shopifyLocationId: s.shopifyLocationId })));
      
      for (const store of createdStores) {
        console.log(`🔍 Looking for inventory for store: ${store.name} (Shopify Location ID: ${store.shopifyLocationId})`);
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
    
    // 🔥 FIX: Create inventory records with 0 quantity for products without inventory_item_id
    console.log('🔄 Creating inventory records for products without inventory tracking...');
    const productsWithoutInventoryId = await productRepo
      .createQueryBuilder('product')
      .where('product.inventoryItemId IS NULL')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .getMany();
    
    if (productsWithoutInventoryId.length > 0) {
      console.log(`📦 Found ${productsWithoutInventoryId.length} products without inventory tracking`);
      let createdZeroInventory = 0;
      
      for (const product of productsWithoutInventoryId) {
        for (const store of createdStores) {
          try {
            // Check if inventory record already exists
            let inventory = await inventoryRepo.findOne({
              where: {
                productId: product.id,
                storeId: store.id
              }
            });
            
            if (!inventory) {
              // Create with 0 quantity
              inventory = inventoryRepo.create({
                productId: product.id,
                storeId: store.id,
                quantity: 0
              });
              await inventoryRepo.save(inventory);
              createdZeroInventory++;
            }
          } catch (error) {
            console.error(`❌ Error creating zero inventory for ${product.name}:`, error.message);
          }
        }
      }
      
      console.log(`✅ Created ${createdZeroInventory} zero-quantity inventory records`);
    }
    
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

// 🔥 NUCLEAR FIX: Complete setup for cashier - Creates data + Assigns store in ONE call!
exports.completeSetup = async (req, res) => {
  try {
    console.log('🔥🔥🔥 NUCLEAR FIX: Complete setup starting...');
    console.log('👤 Current user:', req.user);
    
    const storeRepo = getStoreRepository();
    const userRepo = getUserRepository();
    const productRepo = getProductRepository();
    
    // Step 1: Check if we have stores and products
    const storeCount = await storeRepo.count();
    const productCount = await productRepo.count();
    
    console.log('📊 Current state:', { storeCount, productCount });
    
    // Step 2: Sync from Shopify if needed
    if (storeCount === 0 || productCount === 0) {
      console.log('📦 No data found, syncing from Shopify...');
      
      // Check if Shopify credentials are configured
      const hasShopifyCredentials = process.env.SHOPIFY_SHOP_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN;
      
      if (hasShopifyCredentials) {
        console.log('✅ Shopify credentials found, syncing real data...');
        
        // Call refreshData to sync from Shopify (internal call)
        const tempRes = {
          json: (data) => {
            console.log('✅ Shopify sync completed:', data);
            return data;
          },
          status: (code) => ({
            json: (data) => {
              console.error('❌ Shopify sync error:', data);
              throw new Error(data.error || 'Shopify sync failed');
            }
          })
        };
        
        // Use the module's exports to call refreshData
        await exports.refreshData(req, tempRes);
        
        console.log('✅ Shopify data sync completed');
      } else {
        console.log('⚠️  No Shopify credentials, using demo data...');
        
        // Fallback to demo data
        const tempRes = {
          json: (data) => {
            console.log('✅ Demo data created:', data);
            return data;
          },
          status: (code) => ({
            json: (data) => {
              console.error('❌ Demo data error:', data);
              throw new Error(data.error || 'Demo data creation failed');
            }
          })
        };
        
        await createDemoData(req, tempRes);
        
        console.log('✅ Demo data creation completed');
      }
    } else {
      console.log('✅ Data already exists');
    }
    
    // Step 3: Get the current user with latest data
    const currentUser = await userRepo.findOne({
      where: { id: req.user.id },
      relations: ['assignedStore']
    });
    
    console.log('👤 Current user loaded:', {
      email: currentUser.email,
      role: currentUser.role,
      currentStore: currentUser.assignedStore?.name
    });
    
    // Step 4: Auto-assign to first store if cashier has no store
    if (currentUser.role === 'cashier' && !currentUser.assignedStoreId) {
      console.log('🔥 Cashier has no store, auto-assigning...');
      
      const firstStore = await storeRepo.findOne({ where: { isActive: true } });
      
      if (firstStore) {
        currentUser.assignedStoreId = firstStore.id;
        await userRepo.save(currentUser);
        console.log(`✅ Auto-assigned ${currentUser.email} to ${firstStore.name}`);
      } else {
        throw new Error('No stores available for assignment');
      }
    }
    
    // Step 5: Reload user with store relation
    const updatedUser = await userRepo.findOne({
      where: { id: currentUser.id },
      relations: ['assignedStore']
    });
    
    console.log('✅ NUCLEAR FIX COMPLETE:', {
      user: updatedUser.email,
      assignedStore: updatedUser.assignedStore?.name,
      storeId: updatedUser.assignedStoreId
    });
    
    // Step 6: Return success
    res.json({
      message: '🔥 COMPLETE SETUP SUCCESS!',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        assignedStore: updatedUser.assignedStore
      },
      stores: await storeRepo.count(),
      products: await productRepo.count(),
      instructions: 'Logout and login again to load products!'
    });
    
  } catch (error) {
    console.error('❌ NUCLEAR FIX ERROR:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
