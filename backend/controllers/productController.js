const { AppDataSource } = require('../data-source');
const { Like } = require('typeorm');
const shopifyService = require('../utils/shopify');

// Get repositories
const getProductRepository = () => AppDataSource.getRepository('Product');
const getInventoryRepository = () => AppDataSource.getRepository('Inventory');

// Create product
exports.createProduct = async (req, res) => {
  try {
    const productRepo = getProductRepository();
    const product = productRepo.create(req.body);
    await productRepo.save(product);
    
    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get all products
exports.getAllProducts = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    const productRepo = getProductRepository();
    
    // AGGRESSIVE FIX: Get user info from request
    const user = req.user;
    const isCashier = user && user.role === 'cashier';
    const userStoreId = user?.assignedStoreId;
    
    console.log('📦 Getting products for user:', {
      role: user?.role,
      assignedStoreId: userStoreId,
      isCashier
    });
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let queryBuilder = productRepo.createQueryBuilder('product')
      .where('product.isActive = :isActive', { isActive: true });

    // CHANGED: Show ALL products to cashiers (not filtered by store)
    // They will see inventory quantities from their assigned store only
    console.log(`📦 Showing all products${isCashier ? ` with inventory for store ID: ${userStoreId}` : ''}`);

    if (category) {
      queryBuilder.andWhere('product.category = :category', { category });
    }

    if (search) {
      queryBuilder.andWhere(
        '(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.sku) LIKE LOWER(:search))',
        { search: `%${search}%` }
      );
    }

    // Get total count
    const total = await queryBuilder.getCount();
    console.log(`📊 Found ${total} products for this user`);

    // Get paginated products with inventory
    const products = await queryBuilder
      .leftJoinAndSelect('product.inventory', 'inventory')
      .leftJoinAndSelect('inventory.store', 'store')
      .skip(skip)
      .take(limitNum)
      .orderBy('product.createdAt', 'DESC')
      .getMany();

    // Transform products to match frontend expectations
    const transformedProducts = products.map(product => {
      let inventoryToShow = product.inventory || [];
      
      // If cashier, only show their store's inventory
      if (isCashier && userStoreId) {
        inventoryToShow = inventoryToShow.filter(inv => inv.storeId === userStoreId);
      }
      
      return {
        _id: product.id,
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: parseFloat(product.price),
        taxRate: product.taxRate,
        description: product.description,
        image: product.image,
        shopifyProductId: product.shopifyProductId,
        shopifyVariantId: product.shopifyVariantId,
        isActive: product.isActive,
        inventory: inventoryToShow,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      };
    });

    console.log(`✅ Returning ${transformedProducts.length} products to ${user?.role || 'user'}`);
    console.log(`📊 Sample product inventory:`, transformedProducts[0]?.inventory?.length || 0, 'store(s)');

    res.json({ 
      products: transformedProducts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error in getAllProducts:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get single product
exports.getProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const productRepo = getProductRepository();
    
    const product = await productRepo.findOne({
      where: { id: parseInt(productId) },
      relations: ['inventory', 'inventory.store']
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const productRepo = getProductRepository();
    
    const product = await productRepo.findOne({
      where: { id: parseInt(productId) },
      relations: ['inventory', 'inventory.store']
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    Object.assign(product, req.body);
    await productRepo.save(product);

    res.json({ message: 'Product updated successfully', product });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete product (soft delete)
exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const productRepo = getProductRepository();
    
    const product = await productRepo.findOne({
      where: { id: parseInt(productId) }
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.isActive = false;
    await productRepo.save(product);

    res.json({ message: 'Product deactivated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update product inventory for a store
exports.updateInventory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { storeId, quantity } = req.body;
    
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();

    const product = await productRepo.findOne({
      where: { id: parseInt(productId) }
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Find or create inventory entry
    let inventory = await inventoryRepo.findOne({
      where: { 
        productId: parseInt(productId),
        storeId: parseInt(storeId)
      }
    });

    if (inventory) {
      inventory.quantity = quantity;
    } else {
      inventory = inventoryRepo.create({
        productId: parseInt(productId),
        storeId: parseInt(storeId),
        quantity
      });
    }

    await inventoryRepo.save(inventory);

    res.json({ message: 'Inventory updated successfully', inventory });
  } catch (error) {
    console.error('Error in updateInventory:', error);
    res.status(400).json({ error: error.message });
  }
};

// Sync products from Shopify
exports.syncFromShopify = async (req, res) => {
  try {
    console.log('🔄 Starting Shopify product sync...');
    const shopifyProducts = await shopifyService.getProducts();
    const syncResults = { created: 0, updated: 0, errors: [] };
    const productRepo = getProductRepository();

    console.log(`📦 Processing ${shopifyProducts.length} products from Shopify...`);

    for (const shopifyProduct of shopifyProducts) {
      try {
        const variant = shopifyProduct.variants[0];
        
        // Determine category based on product type or tags
        let category = 'accessory';
        let taxRate = 18; // Default for accessories and sunglasses
        
        const productType = shopifyProduct.product_type?.toLowerCase() || '';
        const tags = shopifyProduct.tags?.toLowerCase() || '';
        const title = shopifyProduct.title?.toLowerCase() || '';
        
        if (productType.includes('frame') || tags.includes('frame') || title.includes('frame')) {
          category = 'frame';
          taxRate = 5;
        } else if (productType.includes('eyeglass') || tags.includes('eyeglass') || title.includes('eyeglass')) {
          category = 'eyeglass';
          taxRate = 5;
        } else if (productType.includes('sunglass') || tags.includes('sunglass') || title.includes('sunglass')) {
          category = 'sunglass';
          taxRate = 18;
        }

        const productData = {
          name: shopifyProduct.title,
          sku: variant.sku || `SHOPIFY-${variant.id}`,
          category,
          price: parseFloat(variant.price),
          taxRate,
          description: shopifyProduct.body_html || '',
          image: shopifyProduct.image?.src || '',
          shopifyProductId: shopifyProduct.id.toString(),
          shopifyVariantId: variant.id.toString()
        };

        // Check if product exists
        const existingProduct = await productRepo.findOne({
          where: { shopifyProductId: shopifyProduct.id.toString() }
        });

        if (existingProduct) {
          Object.assign(existingProduct, productData);
          await productRepo.save(existingProduct);
          syncResults.updated++;
          console.log(`✏️ Updated: ${productData.name}`);
        } else {
          const newProduct = productRepo.create(productData);
          await productRepo.save(newProduct);
          syncResults.created++;
          console.log(`✨ Created: ${productData.name}`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${shopifyProduct.title}:`, error.message);
        syncResults.errors.push({
          product: shopifyProduct.title,
          error: error.message
        });
      }
    }

    console.log('✅ Sync completed:', syncResults);

    res.json({
      message: 'Shopify sync completed',
      results: syncResults
    });
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    res.status(400).json({ error: error.message });
  }
};
