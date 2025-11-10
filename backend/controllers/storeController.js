const { AppDataSource } = require('../data-source');
const shopifyService = require('../utils/shopify');
const cache = require('../utils/cache');

// Get repositories
const getStoreRepository = () => AppDataSource.getRepository('Store');
const getProductRepository = () => AppDataSource.getRepository('Product');
const getInventoryRepository = () => AppDataSource.getRepository('Inventory');

// Create new store
exports.createStore = async (req, res) => {
  try {
    const storeRepo = getStoreRepository();
    const store = storeRepo.create(req.body);
    await storeRepo.save(store);
    
    res.status(201).json({
      message: 'Store created successfully',
      store
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all stores
exports.getAllStores = async (req, res) => {
  try {
    const storeRepo = getStoreRepository();
    const stores = await storeRepo.find({
      order: { createdAt: 'DESC' }
    });
    res.json({ stores });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get single store
exports.getStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const storeRepo = getStoreRepository();
    const store = await storeRepo.findOne({
      where: { id: parseInt(storeId) }
    });
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json({ store });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update store
exports.updateStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const storeRepo = getStoreRepository();
    
    const store = await storeRepo.findOne({
      where: { id: parseInt(storeId) }
    });

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    Object.assign(store, req.body);
    await storeRepo.save(store);

    res.json({ message: 'Store updated successfully', store });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete store
exports.deleteStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const storeRepo = getStoreRepository();
    
    const store = await storeRepo.findOne({
      where: { id: parseInt(storeId) }
    });
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    await storeRepo.remove(store);

    res.json({ message: 'Store deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get store inventory (with caching)
exports.getStoreInventory = async (req, res) => {
  try {
    const { storeId } = req.params;
    
    console.log('🔍 getStoreInventory called with storeId:', storeId);
    console.log('🔍 User:', req.user?.email, 'Role:', req.user?.role);
    
    if (!storeId || storeId === 'undefined') {
      return res.status(400).json({ error: 'Invalid store ID provided' });
    }
    
    const storeIdInt = parseInt(storeId);
    const cacheKey = `inventory:store:${storeIdInt}`;
    
    // Check cache first
    const cachedInventory = cache.get(cacheKey);
    if (cachedInventory) {
      console.log(`✅ Returning cached inventory for store ${storeIdInt} (${cachedInventory.length} products)`);
      return res.json({ inventory: cachedInventory, cached: true });
    }
    
    console.log('🔍 Cache miss - Fetching inventory from database for storeId:', storeIdInt);
    
    const inventoryRepo = getInventoryRepository();
    
    // Get inventory items for this store with product details
    const inventoryItems = await inventoryRepo.find({
      where: { 
        storeId: storeIdInt
      },
      relations: ['product']
    });

    console.log(`📦 Found ${inventoryItems.length} inventory items for store ${storeIdInt}`);

    // Filter for products with quantity > 0 and isActive
    const inventoryData = inventoryItems
      .filter(inv => inv.quantity > 0 && inv.product && inv.product.isActive)
      .map(inv => ({
        _id: inv.product.id, // Keep using _id for frontend compatibility
        id: inv.product.id,
        name: inv.product.name,
        sku: inv.product.sku,
        category: inv.product.category,
        price: parseFloat(inv.product.price),
        taxRate: inv.product.taxRate,
        description: inv.product.description,
        image: inv.product.image,
        quantity: inv.quantity
      }));

    // DIAGNOSTIC: Log if inventory is empty
    if (inventoryData.length === 0) {
      console.warn(`⚠️  Store ${storeId} has NO products with available stock!`);
      console.warn(`   Total inventory records: ${inventoryItems.length}`);
      console.warn(`   Products with quantity > 0: 0`);
      console.warn(`   💡 ACTION NEEDED: Run full Shopify sync to populate inventory!`);
    }

    // Cache the inventory for 30 minutes (1800000 ms)
    cache.set(cacheKey, inventoryData, 1800000);

    console.log(`✅ Store ${storeId}: Returning ${inventoryData.length} products with available stock (cached for 30 min)`);

    res.json({ inventory: inventoryData, cached: false });
  } catch (error) {
    console.error('❌ Error in getStoreInventory:', error);
    console.error('❌ Stack:', error.stack);
    res.status(400).json({ error: error.message });
  }
};

// Sync stores from Shopify locations
exports.syncFromShopify = async (req, res) => {
  try {
    const shopifyLocations = await shopifyService.getLocations();
    const syncResults = { created: 0, updated: 0, errors: [] };
    const storeRepo = getStoreRepository();

    for (const location of shopifyLocations) {
      try {
        // Parse address
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
          shopifyLocationId: location.id.toString(),
          isActive: location.active
        };

        // Check if store exists
        const existingStore = await storeRepo.findOne({
          where: { shopifyLocationId: location.id.toString() }
        });

        if (existingStore) {
          Object.assign(existingStore, storeData);
          await storeRepo.save(existingStore);
          syncResults.updated++;
        } else {
          const newStore = storeRepo.create(storeData);
          await storeRepo.save(newStore);
          syncResults.created++;
        }
      } catch (error) {
        syncResults.errors.push({
          location: location.name,
          error: error.message
        });
      }
    }

    res.json({
      message: 'Shopify locations sync completed',
      results: syncResults
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
