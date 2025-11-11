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

      // Calculate item totals
      const unitPrice = parseFloat(product.price);
      const discount = item.discount || 0;
      const discountedPrice = unitPrice - discount;
      const itemSubtotal = discountedPrice * item.quantity;
      const taxAmount = (itemSubtotal * product.taxRate) / 100;
      const itemTotal = itemSubtotal + taxAmount;

      saleItems.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice,
        discount,
        discountedPrice,
        taxRate: product.taxRate,
        taxAmount,
        totalAmount: itemTotal
      });

      subtotal += unitPrice * item.quantity;
      totalDiscount += discount * item.quantity;
      totalTax += taxAmount;

      // Update inventory
      inventory.quantity -= item.quantity;
      await inventoryRepo.save(inventory);
    }

    const totalAmount = subtotal - totalDiscount + totalTax;

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
      .leftJoinAndSelect('sale.customer', 'customer');

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
