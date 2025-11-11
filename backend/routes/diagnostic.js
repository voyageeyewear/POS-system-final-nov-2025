const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const shopifyService = require('../utils/shopify');
const { AppDataSource } = require('../data-source');

// Get repositories
const getProductRepository = () => AppDataSource.getRepository('Product');
const getStoreRepository = () => AppDataSource.getRepository('Store');
const getInventoryRepository = () => AppDataSource.getRepository('Inventory');

// TEST SHOPIFY CONNECTION
router.get('/test-shopify', authenticate, async (req, res) => {
  try {
    console.log('🔍 DIAGNOSTIC: Testing Shopify connection...');
    
    // Test 1: Get locations
    console.log('📍 Test 1: Fetching locations...');
    const locations = await shopifyService.getLocations();
    console.log(`✅ Found ${locations.length} locations:`, locations.map(l => ({ id: l.id, name: l.name })));
    
    // Test 2: Get products (just first 5)
    console.log('📦 Test 2: Fetching first 5 products...');
    const products = await shopifyService.getProducts();
    const first5 = products.slice(0, 5);
    console.log(`✅ Found ${products.length} total products. First 5:`);
    first5.forEach(p => {
      console.log(`  - ${p.title}`);
      p.variants.forEach(v => {
        console.log(`    Variant: ${v.title}, inventory_item_id: ${v.inventory_item_id}`);
      });
    });
    
    // Test 3: Get inventory for first product
    if (first5.length > 0 && first5[0].variants.length > 0) {
      const testVariant = first5[0].variants[0];
      if (testVariant.inventory_item_id) {
        console.log(`📊 Test 3: Fetching inventory for item ${testVariant.inventory_item_id}...`);
        const inventory = await shopifyService.getInventoryLevels([testVariant.inventory_item_id]);
        console.log(`✅ Inventory levels:`, inventory);
      }
    }
    
    res.json({
      success: true,
      locations: locations.map(l => ({ id: l.id, name: l.name })),
      totalProducts: products.length,
      sampleProducts: first5.map(p => ({
        id: p.id,
        title: p.title,
        variants: p.variants.map(v => ({
          id: v.id,
          title: v.title,
          inventory_item_id: v.inventory_item_id,
          sku: v.sku
        }))
      }))
    });
  } catch (error) {
    console.error('❌ DIAGNOSTIC ERROR:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});

// CHECK DATABASE STATE
router.get('/database-state', authenticate, async (req, res) => {
  try {
    const productRepo = getProductRepository();
    const storeRepo = getStoreRepository();
    const inventoryRepo = getInventoryRepository();
    
    // Get sample products
    const products = await productRepo.find({ take: 10 });
    const stores = await storeRepo.find();
    const inventory = await inventoryRepo.find({ 
      take: 20,
      relations: ['product', 'store']
    });
    
    // Check if inventoryItemId is populated
    const productsWithInventoryItemId = products.filter(p => p.inventoryItemId);
    const productsWithoutInventoryItemId = products.filter(p => !p.inventoryItemId);
    
    res.json({
      totalProducts: await productRepo.count(),
      totalStores: await storeRepo.count(),
      totalInventory: await inventoryRepo.count(),
      productsWithInventoryItemId: productsWithInventoryItemId.length,
      productsWithoutInventoryItemId: productsWithoutInventoryItemId.length,
      sampleProducts: products.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        shopifyProductId: p.shopifyProductId,
        shopifyVariantId: p.shopifyVariantId,
        inventoryItemId: p.inventoryItemId || '❌ MISSING',
        isActive: p.isActive
      })),
      stores: stores.map(s => ({
        id: s.id,
        name: s.name,
        shopifyLocationId: s.shopifyLocationId
      })),
      sampleInventory: inventory.map(i => ({
        productName: i.product?.name,
        storeName: i.store?.name,
        quantity: i.quantity
      }))
    });
  } catch (error) {
    console.error('❌ DATABASE ERROR:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Check if database columns exist' 
    });
  }
});

// FORCE REPOPULATE INVENTORY ITEM IDs
router.post('/fix-inventory-item-ids', authenticate, async (req, res) => {
  try {
    console.log('🔧 AGGRESSIVE FIX: Repopulating inventoryItemId for all products...');
    
    const productRepo = getProductRepository();
    const products = await productRepo
      .createQueryBuilder('product')
      .where('product.shopifyProductId IS NOT NULL')
      .getMany();
    
    let updated = 0;
    let errors = 0;
    
    for (const product of products) {
      try {
        if (product.shopifyProductId) {
          const shopifyProduct = await shopifyService.getProduct(product.shopifyProductId);
          const variant = shopifyProduct.variants.find(v => v.id.toString() === product.shopifyVariantId);
          
          if (variant && variant.inventory_item_id) {
            product.inventoryItemId = variant.inventory_item_id.toString();
            await productRepo.save(product);
            updated++;
            console.log(`✅ Updated ${product.name}: ${variant.inventory_item_id}`);
          }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        errors++;
        console.error(`❌ Error updating ${product.name}:`, error.message);
      }
    }
    
    console.log(`✅ FIX COMPLETE: ${updated} updated, ${errors} errors`);
    
    res.json({
      success: true,
      updated,
      errors,
      message: `Fixed ${updated} products. Now trigger full sync!`
    });
  } catch (error) {
    console.error('❌ FIX ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

// COMPARE INVENTORY: Shopify vs Database for specific SKU
router.get('/compare-inventory/:sku', authenticate, async (req, res) => {
  try {
    const { sku } = req.params;
    console.log(`🔍 Comparing inventory for SKU: ${sku}`);
    
    const productRepo = getProductRepository();
    const storeRepo = getStoreRepository();
    const inventoryRepo = getInventoryRepository();
    
    // Find product in database
    const dbProduct = await productRepo.findOne({ 
      where: { sku },
      relations: ['inventory', 'inventory.store']
    });
    
    if (!dbProduct) {
      return res.status(404).json({ error: `Product with SKU ${sku} not found in database` });
    }
    
    // Get product from Shopify
    const shopifyProducts = await shopifyService.getProducts();
    const shopifyProduct = shopifyProducts.find(p => 
      p.variants.some(v => v.sku === sku)
    );
    
    if (!shopifyProduct) {
      return res.status(404).json({ error: `Product with SKU ${sku} not found in Shopify` });
    }
    
    const variant = shopifyProduct.variants.find(v => v.sku === sku);
    
    // Get inventory from Shopify for this product
    let shopifyInventory = [];
    let shopifyTotal = 0;
    
    if (variant.inventory_item_id) {
      const inventoryLevels = await shopifyService.getInventoryLevels([variant.inventory_item_id]);
      shopifyInventory = inventoryLevels.map(level => ({
        locationId: level.location_id,
        locationName: level.location_name || 'Unknown',
        quantity: level.available || 0
      }));
      shopifyTotal = inventoryLevels.reduce((sum, level) => sum + (level.available || 0), 0);
    }
    
    // Get all Shopify locations
    const shopifyLocations = await shopifyService.getLocations();
    
    // Get all database stores
    const dbStores = await storeRepo.find();
    
    // Calculate database total
    const dbTotal = dbProduct.inventory?.reduce((sum, inv) => sum + parseInt(inv.quantity || 0), 0) || 0;
    
    // Find missing locations
    const shopifyLocationIds = shopifyLocations.map(l => l.id.toString());
    const dbLocationIds = dbStores.map(s => s.shopifyLocationId);
    const missingInDb = shopifyLocationIds.filter(id => !dbLocationIds.includes(id));
    
    res.json({
      product: {
        name: dbProduct.name,
        sku: dbProduct.sku,
        inventoryItemId: dbProduct.inventoryItemId
      },
      shopify: {
        totalInventory: shopifyTotal,
        locations: shopifyInventory,
        allLocations: shopifyLocations.map(l => ({
          id: l.id,
          name: l.name,
          active: l.active
        }))
      },
      database: {
        totalInventory: dbTotal,
        locations: dbProduct.inventory?.map(inv => ({
          storeId: inv.storeId,
          storeName: inv.store?.name || 'Unknown',
          shopifyLocationId: inv.store?.shopifyLocationId,
          quantity: parseInt(inv.quantity || 0)
        })) || [],
        allStores: dbStores.map(s => ({
          id: s.id,
          name: s.name,
          shopifyLocationId: s.shopifyLocationId
        }))
      },
      discrepancy: {
        difference: shopifyTotal - dbTotal,
        missingLocationsInDb: missingInDb.length > 0 ? shopifyLocations.filter(l => missingInDb.includes(l.id.toString())).map(l => l.name) : [],
        message: shopifyTotal !== dbTotal ? `⚠️ Mismatch! Shopify: ${shopifyTotal}, Database: ${dbTotal}` : '✅ Match!'
      }
    });
    
  } catch (error) {
    console.error('❌ COMPARE ERROR:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

module.exports = router;

