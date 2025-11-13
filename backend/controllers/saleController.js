const { AppDataSource } = require('../data-source');
const invoiceGenerator = require('../utils/invoice');

// Get repositories
const getSaleRepository = () => AppDataSource.getRepository('Sale');
const getSaleItemRepository = () => AppDataSource.getRepository('SaleItem');
const getProductRepository = () => AppDataSource.getRepository('Product');
const getCustomerRepository = () => AppDataSource.getRepository('Customer');
const getStoreRepository = () => AppDataSource.getRepository('Store');
const getInventoryRepository = () => AppDataSource.getRepository('Inventory');

// Helper function to generate store-specific invoice number
async function generateInvoiceNumber(storeId) {
  const storeRepo = getStoreRepository();
  const saleRepo = getSaleRepository();
  
  const store = await storeRepo.findOne({ where: { id: storeId } });
  if (!store) {
    throw new Error('Store not found for invoice generation');
  }

  // Generate store prefix from store name
  let storePrefix = store.name.toUpperCase().substring(0, 4);
  storePrefix = `${storePrefix}VOYA`;

  // Count existing invoices for this store
  const storeInvoiceCount = await saleRepo.count({
    where: {
      storeId: storeId
    }
  });

  // Generate invoice number
  const sequenceNumber = (storeInvoiceCount + 1).toString().padStart(4, '0');
  const invoiceNumber = `${storePrefix}${sequenceNumber}`;
  
  console.log(`📄 Generated invoice number: ${invoiceNumber} for store: ${store.name}`);
  
  return invoiceNumber;
}

// Create new sale
exports.createSale = async (req, res) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const {
      storeId,
      items,
      customerInfo,
      paymentMethod,
      notes
    } = req.body;

    // Validate store
    const storeRepo = queryRunner.manager.getRepository('Store');
    const store = await storeRepo.findOne({ where: { id: parseInt(storeId) } });
    if (!store) {
      throw new Error('Store not found');
    }

    // Find or create customer
    const customerRepo = queryRunner.manager.getRepository('Customer');
    let customer = await customerRepo.findOne({ where: { phone: customerInfo.phone } });
    
    if (!customer) {
      customer = customerRepo.create(customerInfo);
      await customerRepo.save(customer);
    } else {
      // Update customer info if provided
      customer.name = customerInfo.name || customer.name;
      customer.email = customerInfo.email || customer.email;
      customer.address = customerInfo.address || customer.address;
      customer.gstNumber = customerInfo.gstNumber || customer.gstNumber;
      await customerRepo.save(customer);
    }

    // Process sale items and calculate totals
    const saleItems = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    const productRepo = queryRunner.manager.getRepository('Product');
    const inventoryRepo = queryRunner.manager.getRepository('Inventory');

    for (const item of items) {
      const product = await productRepo.findOne({ where: { id: parseInt(item.productId) } });
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      // Check inventory
      const inventory = await inventoryRepo.findOne({
        where: {
          productId: parseInt(item.productId),
          storeId: parseInt(storeId)
        }
      });

      if (!inventory || inventory.quantity < item.quantity) {
        throw new Error(`Insufficient inventory for ${product.name}`);
      }

      // Calculate item totals with TAX-INCLUSIVE PRICING
      const unitPrice = parseFloat(product.price); // MRP (includes tax)
      const discount = item.discount || 0;
      
      // MRP for all quantities
      const itemMRP = unitPrice * item.quantity;
      const itemDiscount = discount * item.quantity;
      
      // Discounted MRP (still tax-inclusive)
      const discountedMRP = itemMRP - itemDiscount;
      
      // Extract tax from tax-inclusive price
      // Formula: Base = Price / (1 + TaxRate/100), Tax = Price - Base
      const taxMultiplier = 1 + (product.taxRate / 100);
      const baseAmount = discountedMRP / taxMultiplier;
      const taxAmount = discountedMRP - baseAmount;
      
      // Discounted price per unit (tax-inclusive)
      const discountedPrice = unitPrice - discount;

      saleItems.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice, // MRP per unit
        discount,
        discountedPrice, // Discounted MRP per unit
        taxRate: product.taxRate,
        taxAmount, // Extracted tax
        totalAmount: discountedMRP // Final amount (tax-inclusive)
      });

      subtotal += itemMRP; // MRP total
      totalDiscount += itemDiscount;
      totalTax += taxAmount; // Extracted tax

      // Update inventory
      inventory.quantity -= item.quantity;
      await inventoryRepo.save(inventory);
    }

    // Total is subtotal - discount (tax already included in prices)
    const totalAmount = subtotal - totalDiscount;

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(parseInt(storeId));

    // Create sale
    const saleRepo = queryRunner.manager.getRepository('Sale');
    const sale = saleRepo.create({
      invoiceNumber,
      storeId: parseInt(storeId),
      cashierId: req.user.id,
      customerId: customer.id,
      subtotal,
      totalDiscount,
      totalTax,
      totalAmount,
      paymentMethod,
      notes: notes || ''
    });

    await saleRepo.save(sale);

    // Create sale items
    const saleItemRepo = queryRunner.manager.getRepository('SaleItem');
    for (const item of saleItems) {
      const saleItem = saleItemRepo.create({
        ...item,
        saleId: sale.id
      });
      await saleItemRepo.save(saleItem);
    }

    // Update customer stats
    customer.totalPurchases = parseFloat(customer.totalPurchases) + totalAmount;
    customer.lastPurchaseDate = new Date();
    await customerRepo.save(customer);

    // Commit transaction
    await queryRunner.commitTransaction();

    // Load full sale data for response
    const completeSale = await getSaleRepository().findOne({
      where: { id: sale.id },
      relations: ['store', 'cashier', 'customer', 'items']
    });

    res.status(201).json({
      message: 'Sale created successfully',
      sale: completeSale
    });
  } catch (error) {
    // Rollback transaction on error
    await queryRunner.rollbackTransaction();
    console.error('Sale creation error:', error);
    res.status(400).json({ error: error.message });
  } finally {
    await queryRunner.release();
  }
};

// Get all sales (with filters)
exports.getAllSales = async (req, res) => {
  try {
    const { storeId, startDate, endDate, cashierId } = req.query;
    const saleRepo = getSaleRepository();
    
    let queryBuilder = saleRepo.createQueryBuilder('sale')
      .leftJoinAndSelect('sale.store', 'store')
      .leftJoinAndSelect('sale.cashier', 'cashier')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('sale.items', 'items');

    // Role-based filtering
    if (req.user.role === 'cashier' && req.user.assignedStore) {
      queryBuilder.where('sale.storeId = :storeId', { storeId: req.user.assignedStore.id });
    } else if (storeId) {
      queryBuilder.where('sale.storeId = :storeId', { storeId: parseInt(storeId) });
    }

    if (cashierId) {
      queryBuilder.andWhere('sale.cashierId = :cashierId', { cashierId: parseInt(cashierId) });
    }

    if (startDate) {
      queryBuilder.andWhere('sale.saleDate >= :startDate', { startDate: new Date(startDate) });
    }

    if (endDate) {
      queryBuilder.andWhere('sale.saleDate <= :endDate', { endDate: new Date(endDate) });
    }

    const sales = await queryBuilder
      .orderBy('sale.saleDate', 'DESC')
      .take(100)
      .getMany();

    res.json({ sales });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get single sale
exports.getSale = async (req, res) => {
  try {
    const { saleId } = req.params;
    const saleRepo = getSaleRepository();
    
    const sale = await saleRepo.findOne({
      where: { id: parseInt(saleId) },
      relations: ['store', 'cashier', 'customer', 'items', 'items.product']
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Check access
    if (req.user.role === 'cashier' && 
        sale.storeId !== req.user.assignedStore.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ sale });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Generate invoice PDF
exports.generateInvoice = async (req, res) => {
  try {
    const { saleId } = req.params;
    const saleRepo = getSaleRepository();
    
    console.log(`📄 Generating invoice for sale ID: ${saleId}`);
    
    const sale = await saleRepo.findOne({
      where: { id: parseInt(saleId) },
      relations: ['store', 'customer', 'items', 'items.product']  // ✅ Load product info
    });

    if (!sale) {
      console.error(`❌ Sale not found: ${saleId}`);
      return res.status(404).json({ error: 'Sale not found' });
    }

    console.log(`✅ Sale found: ${sale.invoiceNumber} with ${sale.items?.length || 0} items`);

    // Check access
    if (req.user.role === 'cashier' && 
        req.user.assignedStore &&
        sale.storeId !== req.user.assignedStore.id) {
      console.error(`❌ Access denied for cashier: ${req.user.email}`);
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log(`🔄 Generating PDF invoice...`);
    const filePath = await invoiceGenerator.generateInvoice(
      sale,
      sale.store,
      sale.customer
    );

    console.log(`✅ Invoice generated: ${filePath}`);
    res.download(filePath, `${sale.invoiceNumber}.pdf`);
  } catch (error) {
    console.error('❌ Invoice generation error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      saleId: req.params.saleId
    });
    
    // Return detailed error message
    res.status(400).json({ 
      error: error.message || 'Failed to generate invoice',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get sales statistics
exports.getSalesStats = async (req, res) => {
  try {
    const { storeId, startDate, endDate } = req.query;
    const saleRepo = getSaleRepository();
    
    let queryBuilder = saleRepo.createQueryBuilder('sale');

    // Role-based filtering
    if (req.user.role === 'cashier' && req.user.assignedStore) {
      queryBuilder.where('sale.storeId = :storeId', { storeId: req.user.assignedStore.id });
    } else if (storeId) {
      queryBuilder.where('sale.storeId = :storeId', { storeId: parseInt(storeId) });
    }

    if (startDate) {
      queryBuilder.andWhere('sale.saleDate >= :startDate', { startDate: new Date(startDate) });
    }

    if (endDate) {
      queryBuilder.andWhere('sale.saleDate <= :endDate', { endDate: new Date(endDate) });
    }

    const result = await queryBuilder
      .select('COUNT(sale.id)', 'totalSales')
      .addSelect('SUM(sale.totalAmount)', 'totalRevenue')
      .addSelect('SUM(sale.totalDiscount)', 'totalDiscount')
      .addSelect('SUM(sale.totalTax)', 'totalTax')
      .addSelect('AVG(sale.totalAmount)', 'avgSaleAmount')
      .getRawOne();

    const stats = {
      totalSales: parseInt(result.totalSales) || 0,
      totalRevenue: parseFloat(result.totalRevenue) || 0,
      totalDiscount: parseFloat(result.totalDiscount) || 0,
      totalTax: parseFloat(result.totalTax) || 0,
      avgSaleAmount: parseFloat(result.avgSaleAmount) || 0
    };

    res.json({ stats });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update/Edit sale (Admin only)
exports.updateSale = async (req, res) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { saleId } = req.params;
    const { items } = req.body; // Array of { productId, quantity, discount }
    
    // Only admins can edit sales
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can edit sales' });
    }
    
    const saleRepo = queryRunner.manager.getRepository('Sale');
    const saleItemRepo = queryRunner.manager.getRepository('SaleItem');
    const productRepo = queryRunner.manager.getRepository('Product');
    const inventoryRepo = queryRunner.manager.getRepository('Inventory');
    
    // Find the sale with items
    const sale = await saleRepo.findOne({
      where: { id: parseInt(saleId) },
      relations: ['items', 'items.product']
    });

    if (!sale) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ error: 'Sale not found' });
    }

    console.log(`✏️  Editing sale: ${sale.invoiceNumber} (ID: ${sale.id})`);

    // Step 1: Restore inventory for old items
    const inventoryRepoTxn = queryRunner.manager.getRepository('Inventory');
    
    for (const oldItem of sale.items) {
      const inventory = await inventoryRepoTxn.findOne({
        where: {
          productId: oldItem.productId,
          storeId: sale.storeId
        }
      });

      if (inventory) {
        const oldQty = parseInt(inventory.quantity);
        const restoreQty = parseInt(oldItem.quantity);
        inventory.quantity = oldQty + restoreQty;
        await inventoryRepoTxn.save(inventory);
        console.log(`✅ Restored ${restoreQty} units of product ${oldItem.productId} (${oldQty} → ${inventory.quantity})`);
      }
    }

    // Step 2: Delete old sale items
    if (sale.items.length > 0) {
      await saleItemRepo.remove(sale.items);
      console.log(`✅ Deleted ${sale.items.length} old sale items`);
    }

    // Step 3: Create new sale items and deduct inventory
    const newSaleItems = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const item of items) {
      const product = await productRepo.findOne({ where: { id: parseInt(item.productId) } });
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      // Check inventory - use transaction repository to see restored quantities
      const inventory = await inventoryRepoTxn.findOne({
        where: {
          productId: parseInt(item.productId),
          storeId: sale.storeId
        }
      });

      if (!inventory) {
        throw new Error(`No inventory record found for ${product.name}`);
      }

      // Check available quantity after restoration
      const availableQuantity = parseInt(inventory.quantity);
      console.log(`📦 Checking inventory for ${product.name}: Available=${availableQuantity}, Needed=${item.quantity}`);
      
      if (availableQuantity < item.quantity) {
        throw new Error(`Insufficient inventory for ${product.name}. Available: ${availableQuantity}, Needed: ${item.quantity}`);
      }

      // Calculate item totals with TAX-INCLUSIVE PRICING
      const unitPrice = parseFloat(product.price);
      const discount = item.discount || 0;
      
      const itemMRP = unitPrice * item.quantity;
      const itemDiscount = discount * item.quantity;
      const discountedMRP = itemMRP - itemDiscount;
      
      const taxMultiplier = 1 + (product.taxRate / 100);
      const baseAmount = discountedMRP / taxMultiplier;
      const taxAmount = discountedMRP - baseAmount;
      const discountedPrice = unitPrice - discount;

      newSaleItems.push({
        saleId: sale.id,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice,
        discount,
        discountedPrice,
        taxRate: product.taxRate,
        taxAmount,
        totalAmount: discountedMRP
      });

      subtotal += itemMRP;
      totalDiscount += itemDiscount;
      totalTax += taxAmount;

      // Update inventory - deduct new quantity
      inventory.quantity = availableQuantity - item.quantity;
      await inventoryRepoTxn.save(inventory);
      console.log(`✅ Deducted ${item.quantity} units of ${product.name} (${availableQuantity} → ${inventory.quantity})`);
    }

    // Step 4: Update sale totals first
    const totalAmount = subtotal - totalDiscount;
    sale.subtotal = subtotal;
    sale.totalDiscount = totalDiscount;
    sale.totalTax = totalTax;
    sale.totalAmount = totalAmount;
    await saleRepo.save(sale);
    
    // Step 5: Save new sale items (after sale is updated)
    for (const itemData of newSaleItems) {
      const saleItem = saleItemRepo.create({
        ...itemData,
        saleId: sale.id // Explicitly ensure saleId is set
      });
      await saleItemRepo.save(saleItem);
    }

    console.log(`✅ Updated sale totals - Total: ${totalAmount}`);

    // Commit transaction
    await queryRunner.commitTransaction();

    // Load complete updated sale
    const updatedSale = await getSaleRepository().findOne({
      where: { id: sale.id },
      relations: ['store', 'cashier', 'customer', 'items', 'items.product']
    });

    res.json({ 
      message: 'Sale updated successfully',
      sale: updatedSale
    });
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Sale update error:', error);
    res.status(400).json({ error: error.message });
  } finally {
    await queryRunner.release();
  }
};

// Get cashier performance
exports.getCashierPerformance = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const cashierId = req.user.id; // Get from authenticated user

    const saleRepo = getSaleRepository();
    
    // Calculate date range based on period
    let startDate = new Date();
    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'all':
        startDate = new Date('2020-01-01'); // From beginning
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
    }

    // Get sales for this cashier
    const sales = await saleRepo.find({
      where: {
        cashierId: parseInt(cashierId)
      },
      relations: ['items'],
      order: { saleDate: 'DESC' }
    });

    // Filter by date
    const filteredSales = sales.filter(sale => new Date(sale.saleDate) >= startDate);

    // Calculate stats
    const totalSales = filteredSales.length;
    const totalRevenue = filteredSales.reduce((sum, sale) => 
      sum + parseFloat(sale.totalAmount || 0), 0
    );
    const totalItems = filteredSales.reduce((sum, sale) => 
      sum + (sale.items?.length || 0), 0
    );
    const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

    // Get recent 5 sales
    const recentSales = filteredSales.slice(0, 5).map(sale => ({
      invoiceNumber: sale.invoiceNumber,
      saleDate: sale.saleDate,
      totalAmount: sale.totalAmount,
      items: sale.items
    }));

    res.json({
      totalSales,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalItems,
      averageSale: Math.round(averageSale * 100) / 100,
      recentSales,
      period
    });

  } catch (error) {
    console.error('❌ Error fetching cashier performance:', error);
    res.status(400).json({ error: error.message });
  }
};

// Delete sale
exports.deleteSale = async (req, res) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { saleId } = req.params;
    const saleRepo = getSaleRepository();
    const saleItemRepo = getSaleItemRepository();
    const inventoryRepo = getInventoryRepository();

    console.log(`🗑️ Deleting sale ID: ${saleId}`);

    // Get sale with all details
    const sale = await saleRepo.findOne({
      where: { id: parseInt(saleId) },
      relations: ['items', 'items.product', 'store'],
    });

    if (!sale) {
      await queryRunner.rollbackTransaction();
      return res.status(404).json({ error: 'Sale not found' });
    }

    console.log(`📦 Found sale: ${sale.invoiceNumber} with ${sale.items.length} items`);

    // Restore inventory for each item
    for (const item of sale.items) {
      console.log(`↩️ Restoring ${item.quantity} units of product ${item.productId} to store ${sale.storeId}`);
      
      const inventory = await inventoryRepo.findOne({
        where: {
          productId: item.productId,
          storeId: sale.storeId,
        },
      });

      if (inventory) {
        const oldQuantity = parseInt(inventory.quantity || 0);
        const newQuantity = oldQuantity + parseInt(item.quantity);
        
        inventory.quantity = newQuantity;
        await queryRunner.manager.save(inventory);
        
        console.log(`✅ Inventory restored: ${oldQuantity} → ${newQuantity}`);
      } else {
        console.log(`⚠️ Warning: Inventory record not found for product ${item.productId} at store ${sale.storeId}`);
      }
    }

    // Delete sale items first (foreign key constraint)
    console.log(`🗑️ Deleting ${sale.items.length} sale items...`);
    for (const item of sale.items) {
      await queryRunner.manager.remove(item);
    }

    // Delete the sale
    console.log(`🗑️ Deleting sale record...`);
    await queryRunner.manager.remove(sale);

    await queryRunner.commitTransaction();
    
    console.log(`✅ Sale ${sale.invoiceNumber} deleted successfully and inventory restored`);
    res.json({ 
      message: 'Sale deleted successfully and inventory restored',
      deletedInvoice: sale.invoiceNumber 
    });

  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Error deleting sale:', error);
    res.status(400).json({ error: error.message });
  } finally {
    await queryRunner.release();
  }
};
