const { AppDataSource } = require('../data-source');
const shopifyService = require('../utils/shopify');

// Get repositories
const getProductRepository = () => AppDataSource.getRepository('Product');
const getStoreRepository = () => AppDataSource.getRepository('Store');
const getInventoryRepository = () => AppDataSource.getRepository('Inventory');

// Sync inventory from Shopify
exports.syncInventoryFromShopify = async (req, res) => {
  try {
    const storeRepo = getStoreRepository();
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();

    // Get stores with Shopify location IDs
    const stores = await storeRepo
      .createQueryBuilder('store')
      .where('store.shopifyLocationId IS NOT NULL')
      .getMany();

    // Get products with Shopify variant IDs
    const products = await productRepo
      .createQueryBuilder('product')
      .where('product.shopifyVariantId IS NOT NULL')
      .getMany();

    if (stores.length === 0) {
      return res.status(400).json({ 
        error: 'No Shopify stores found. Please sync stores first.' 
      });
    }

    if (products.length === 0) {
      return res.status(400).json({ 
        error: 'No Shopify products found. Please sync products first.' 
      });
    }

    const syncResults = {
      totalProducts: products.length,
      totalStores: stores.length,
      updated: 0,
      errors: []
    };

    // Get all inventory item IDs
    const inventoryItemIds = [];
    const productMap = new Map();

    for (const product of products) {
      if (product.shopifyVariantId) {
        try {
          const shopifyProduct = await shopifyService.getProduct(product.shopifyProductId);
          const variant = shopifyProduct.variants.find(v => v.id.toString() === product.shopifyVariantId);
          
          if (variant && variant.inventory_item_id) {
            inventoryItemIds.push(variant.inventory_item_id);
            productMap.set(variant.inventory_item_id, product);
          }
        } catch (error) {
          console.error(`Error fetching product ${product.name}:`, error.message);
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
      for (const store of stores) {
        const locationInventory = inventoryMap.get(store.shopifyLocationId);
        
        if (locationInventory) {
          for (const [inventoryItemId, quantity] of locationInventory.entries()) {
            const product = productMap.get(inventoryItemId);
            
            if (product) {
              try {
                // Find or create inventory entry
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
                syncResults.updated++;
              } catch (error) {
                syncResults.errors.push({
                  product: product.name,
                  store: store.name,
                  error: error.message
                });
              }
            }
          }
        }
      }
    }

    res.json({
      message: 'Inventory sync completed',
      results: syncResults
    });
  } catch (error) {
    console.error('Inventory sync error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get inventory summary (ENHANCED: Detailed kiosk-wise breakdown)
exports.getInventorySummary = async (req, res) => {
  try {
    const storeRepo = getStoreRepository();
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();
    
    console.log('📊 Generating inventory summary...');
    
    // Get all stores
    const stores = await storeRepo.find({ where: { isActive: true } });
    
    // Get all active products
    const totalProducts = await productRepo.count({ where: { isActive: true } });
    
    // Get all inventory records
    const allInventory = await inventoryRepo.find({
      relations: ['product', 'store'],
      where: { product: { isActive: true } }
    });
    
    const summary = {
      totalProducts,
      totalStores: stores.length,
      totalInventoryValue: 0,
      grandTotalQuantity: 0,
      byStore: [],
      lowStock: [],
      outOfStock: []
    };

    // Initialize store stats
    const storeMap = new Map();
    for (const store of stores) {
      storeMap.set(store.id, {
        storeId: store.id,
        storeName: store.name,
        location: store.location,
        totalProducts: 0,
        productsWithStock: 0,
        totalQuantity: 0,
        totalValue: 0,
        lowStockItems: 0,
        outOfStockItems: 0
      });
    }
    
    // Process all inventory records
    for (const inv of allInventory) {
      const storeId = inv.storeId;
      const quantity = inv.quantity || 0;
      const price = inv.product?.price || 0;
      
      if (storeMap.has(storeId)) {
        const storeStats = storeMap.get(storeId);
        storeStats.totalProducts++;
        storeStats.totalQuantity += quantity;
        storeStats.totalValue += quantity * parseFloat(price);
        summary.grandTotalQuantity += quantity;
        summary.totalInventoryValue += quantity * parseFloat(price);
        
        if (quantity > 0) {
          storeStats.productsWithStock++;
        } else {
          storeStats.outOfStockItems++;
        }
        
        if (quantity > 0 && quantity < 5) {
          storeStats.lowStockItems++;
        }
      }
    }
    
    summary.byStore = Array.from(storeMap.values()).sort((a, b) => 
      b.totalQuantity - a.totalQuantity
    );

    console.log(`✅ Summary generated: ${summary.totalStores} stores, ${summary.grandTotalQuantity} total items`);
    res.json(summary);
  } catch (error) {
    console.error('Error in getInventorySummary:', error);
    res.status(400).json({ error: error.message });
  }
};
