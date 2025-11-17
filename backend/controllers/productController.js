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
    const { category, search, page = 1, limit = 50, storeId } = req.query;
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();
    
    // AGGRESSIVE FIX: Get user info from request
    const user = req.user;
    const isCashier = user && user.role === 'cashier';
    const userStoreId = user?.assignedStoreId;
    
    // Determine which store to filter by
    const filterStoreId = storeId ? parseInt(storeId) : (isCashier ? userStoreId : null);
    
    console.log('📦 Getting products for user:', {
      role: user?.role,
      assignedStoreId: userStoreId,
      isCashier,
      requestStoreId: storeId,
      filterStoreId
    });
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let queryBuilder = productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.inventory', 'inventory')
      .leftJoinAndSelect('inventory.store', 'store')
      .where('product.isActive = :isActive', { isActive: true });

    // 🔥 FIX: Don't filter products by store inventory in WHERE clause
    // This allows ALL products to show, even if they don't have inventory at that store
    // We'll filter the inventory array in the transformation instead

    if (category) {
      queryBuilder.andWhere('product.category = :category', { category });
    }

    if (search) {
      queryBuilder.andWhere(
        '(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.sku) LIKE LOWER(:search))',
        { search: `%${search}%` }
      );
    }

    // Get total count - don't filter by store inventory
    const totalQuery = productRepo.createQueryBuilder('product')
      .where('product.isActive = :isActive', { isActive: true });
    
    if (category) {
      totalQuery.andWhere('product.category = :category', { category });
    }
    if (search) {
      totalQuery.andWhere(
        '(LOWER(product.name) LIKE LOWER(:search) OR LOWER(product.sku) LIKE LOWER(:search))',
        { search: `%${search}%` }
      );
    }
    
    const total = await totalQuery.getCount();
    console.log(`📊 Found ${total} products matching filters`);

    // Get ALL products first (without store filtering)
    const allProducts = await queryBuilder
      .orderBy('product.createdAt', 'DESC')
      .getMany();

    // Transform products and filter inventory by store
    const transformedProducts = allProducts.map(product => {
      let inventoryToShow = product.inventory || [];
      
      // Filter inventory based on store (if specified)
      if (filterStoreId) {
        inventoryToShow = inventoryToShow.filter(inv => inv.storeId === filterStoreId);
      }
      
      // Transform inventory to ensure quantities are numbers, not strings
      inventoryToShow = inventoryToShow.map(inv => ({
        ...inv,
        quantity: parseInt(inv.quantity) || 0,
        storeId: parseInt(inv.storeId),
        productId: parseInt(inv.productId)
      }));
      
      // Get store-specific quantity for sorting
      const storeQuantity = filterStoreId 
        ? (inventoryToShow.find(inv => inv.storeId === filterStoreId)?.quantity || 0)
        : inventoryToShow.reduce((sum, inv) => sum + inv.quantity, 0);
      
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
        quantity: storeQuantity, // Store-specific quantity for sorting/display
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      };
    });

    // Sort by store-specific quantity (in stock first), then by creation date
    transformedProducts.sort((a, b) => {
      if (b.quantity !== a.quantity) {
        return b.quantity - a.quantity; // Higher quantity first
      }
      return new Date(b.createdAt) - new Date(a.createdAt); // Newer first
    });

    // Apply pagination after sorting
    const paginatedProducts = transformedProducts.slice(skip, skip + limitNum);

    console.log(`✅ Returning ${paginatedProducts.length} products to ${user?.role || 'user'} (${total} total, sorted by store stock)`);
    if (filterStoreId) {
      const productsWithStock = paginatedProducts.filter(p => p.quantity > 0).length;
      console.log(`🏪 Store ID ${filterStoreId}: ${productsWithStock} products with stock, ${paginatedProducts.length - productsWithStock} products without stock`);
    }

    res.json({ 
      products: paginatedProducts,
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
