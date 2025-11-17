const { AppDataSource } = require('../data-source');
const shopifyService = require('../utils/shopify');

// Get repositories
const getStoreRepository = () => AppDataSource.getRepository('Store');
const getProductRepository = () => AppDataSource.getRepository('Product');
const getInventoryRepository = () => AppDataSource.getRepository('Inventory');

async function checkShopifyProductsForStore(storeName) {
  try {
    console.log(`\n🔍 Checking Shopify products for store: ${storeName}\n`);
    
    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ Database connected');
    }

    const storeRepo = getStoreRepository();
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();

    // Find the store (case-insensitive search)
    const allStores = await storeRepo.find();
    const store = allStores.find(s => 
      s.name.toLowerCase().includes(storeName.toLowerCase())
    );
    
    if (!store) {
      console.log('❌ Store not found. Available stores:');
      allStores.forEach(s => console.log(`   - ${s.name} (ID: ${s.id}, Location ID: ${s.shopifyLocationId || 'N/A'})`));
      return;
    }

    console.log(`✅ Found store: ${store.name}`);
    console.log(`   Store ID: ${store.id}`);
    console.log(`   Shopify Location ID: ${store.shopifyLocationId || 'NOT SET'}\n`);

    if (!store.shopifyLocationId) {
      console.log('❌ This store does not have a Shopify Location ID configured.');
      console.log('   Please sync stores from Shopify first.\n');
      return;
    }

    // Get all products with Shopify variant IDs
    const products = await productRepo
      .createQueryBuilder('product')
      .where('product.shopifyVariantId IS NOT NULL')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .getMany();

    console.log(`📦 Found ${products.length} products with Shopify integration\n`);

    if (products.length === 0) {
      console.log('❌ No products found with Shopify variant IDs.');
      console.log('   Please sync products from Shopify first.\n');
      return;
    }

    // Get inventory item IDs
    const inventoryItemIds = [];
    const productMap = new Map();

    console.log('🔍 Fetching inventory item IDs from Shopify...');
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
          console.error(`   ⚠️  Error fetching product ${product.name}: ${error.message}`);
        }
      }
    }

    console.log(`✅ Found ${inventoryItemIds.length} inventory item IDs\n`);

    if (inventoryItemIds.length === 0) {
      console.log('❌ No inventory item IDs found.');
      return;
    }

    // Get inventory levels from Shopify for this location
    console.log(`📊 Fetching inventory levels from Shopify for location ${store.shopifyLocationId}...`);
    const inventoryLevels = await shopifyService.getInventoryLevels(inventoryItemIds);

    // Filter for this location
    const locationInventory = inventoryLevels.filter(level => 
      level.location_id.toString() === store.shopifyLocationId.toString()
    );

    console.log(`\n📊 RESULTS FOR ${store.name.toUpperCase()}:`);
    console.log(`   Total products in system: ${products.length}`);
    console.log(`   Products with inventory at this location: ${locationInventory.length}`);
    
    // Count products with stock > 0
    const productsWithStock = locationInventory.filter(level => (level.available || 0) > 0);
    const productsOutOfStock = locationInventory.filter(level => (level.available || 0) === 0);
    
    console.log(`   Products with stock > 0: ${productsWithStock.length}`);
    console.log(`   Products with stock = 0: ${productsOutOfStock.length}`);
    
    // Calculate total inventory value
    let totalQuantity = 0;
    let totalValue = 0;
    
    locationInventory.forEach(level => {
      const quantity = level.available || 0;
      const product = productMap.get(level.inventory_item_id);
      if (product) {
        totalQuantity += quantity;
        totalValue += quantity * parseFloat(product.price || 0);
      }
    });
    
    console.log(`   Total quantity: ${totalQuantity} units`);
    console.log(`   Total inventory value: ₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
    
    // Check database inventory
    console.log(`\n📦 DATABASE INVENTORY FOR ${store.name}:`);
    const dbInventory = await inventoryRepo.find({
      where: { storeId: store.id },
      relations: ['product']
    });
    
    const dbProductsWithStock = dbInventory.filter(inv => (parseInt(inv.quantity) || 0) > 0);
    console.log(`   Total inventory records: ${dbInventory.length}`);
    console.log(`   Products with stock > 0: ${dbProductsWithStock.length}`);
    
    // Compare Shopify vs Database
    console.log(`\n🔍 COMPARISON:`);
    console.log(`   Shopify products with stock: ${productsWithStock.length}`);
    console.log(`   Database products with stock: ${dbProductsWithStock.length}`);
    
    if (productsWithStock.length !== dbProductsWithStock.length) {
      console.log(`   ⚠️  MISMATCH! Database may need syncing.`);
    } else {
      console.log(`   ✅ Counts match!`);
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Run the check
const storeName = process.argv[2] || 'Udaipur';
checkShopifyProductsForStore(storeName);

