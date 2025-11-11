const axios = require('axios');

class ShopifyService {
  constructor() {
    this.shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
    this.baseURL = `https://${this.shopDomain}/admin/api/${this.apiVersion}`;
  }

  // Create axios instance with auth headers
  getClient() {
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get all products from Shopify with pagination
  async getProducts() {
    try {
      // Check if credentials are configured
      if (!this.shopDomain || !this.accessToken) {
        throw new Error('Shopify credentials not configured. Please check SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN in .env file');
      }

      const client = this.getClient();
      let allProducts = [];
      let sinceId = 0;
      let pageCount = 0;
      const limit = 250; // Maximum allowed by Shopify

      console.log('🔍 Starting to fetch ALL products from Shopify...');

      while (true) {
        pageCount++;
        console.log(`📦 Fetching page ${pageCount} (since_id: ${sinceId})...`);

        const params = { 
          limit,
          since_id: sinceId,
          // Explicitly request all variant fields including inventory_item_id
          fields: 'id,title,body_html,product_type,tags,image,variants'
        };

        const response = await client.get('/products.json', { params });
        const products = response.data.products;
        
        if (products.length === 0) {
          console.log('✅ No more products to fetch');
          break;
        }

        allProducts = allProducts.concat(products);
        console.log(`✅ Page ${pageCount}: Fetched ${products.length} products (Total so far: ${allProducts.length})`);

        // If we got less than the limit, we're done
        if (products.length < limit) {
          console.log('✅ Reached last page');
          break;
        }

        // Update since_id to the last product's ID for next page
        sinceId = products[products.length - 1].id;

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      console.log(`🎉 Successfully fetched ALL ${allProducts.length} products from Shopify in ${pageCount} pages!`);
      return allProducts;
    } catch (error) {
      console.error('❌ Shopify API Error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url
      });
      
      if (error.response?.status === 401) {
        throw new Error('Invalid Shopify credentials. Please check your SHOPIFY_ACCESS_TOKEN');
      } else if (error.response?.status === 404) {
        throw new Error('Shopify store not found. Please check your SHOPIFY_SHOP_DOMAIN');
      } else if (error.response?.status === 429) {
        throw new Error('Shopify API rate limit exceeded. Please try again in a few minutes.');
      } else if (error.message.includes('credentials not configured')) {
        throw error;
      } else {
        throw new Error(`Shopify API Error: ${error.response?.data?.errors || error.message}`);
      }
    }
  }

  // Get single product by ID
  async getProduct(productId) {
    try {
      const client = this.getClient();
      const response = await client.get(`/products/${productId}.json`);
      return response.data.product;
    } catch (error) {
      console.error('Shopify API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch product from Shopify');
    }
  }

  // Get variant details (with inventory_item_id)
  async getVariant(variantId) {
    try {
      const client = this.getClient();
      const response = await client.get(`/variants/${variantId}.json`);
      return response.data.variant;
    } catch (error) {
      console.error('Shopify Variant API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch variant from Shopify');
    }
  }

  // Update inventory quantity
  async updateInventory(inventoryItemId, locationId, quantity) {
    try {
      const client = this.getClient();
      const response = await client.post('/inventory_levels/set.json', {
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        available: quantity
      });
      return response.data;
    } catch (error) {
      console.error('Shopify Inventory Update Error:', error.response?.data || error.message);
      throw new Error('Failed to update inventory in Shopify');
    }
  }

  // Get inventory levels (with batching for large requests)
  async getInventoryLevels(inventoryItemIds) {
    try {
      const client = this.getClient();
      const BATCH_SIZE = 50; // Shopify recommends max 50 inventory items per request
      let allLevels = [];
      
      // Split into batches if necessary
      for (let i = 0; i < inventoryItemIds.length; i += BATCH_SIZE) {
        const batch = inventoryItemIds.slice(i, i + BATCH_SIZE);
        console.log(`📦 Fetching inventory batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(inventoryItemIds.length / BATCH_SIZE)} (${batch.length} items)...`);
        
        const response = await client.get('/inventory_levels.json', {
          params: {
            inventory_item_ids: batch.join(','),
            limit: 250 // Max results per page
          }
        });
        
        allLevels = allLevels.concat(response.data.inventory_levels);
        
        // Small delay to avoid rate limiting
        if (i + BATCH_SIZE < inventoryItemIds.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      console.log(`✅ Fetched ${allLevels.length} total inventory level records`);
      return allLevels;
    } catch (error) {
      console.error('Shopify API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch inventory levels from Shopify');
    }
  }

  // Create order in Shopify (for record keeping)
  async createOrder(orderData) {
    try {
      const client = this.getClient();
      const response = await client.post('/orders.json', {
        order: orderData
      });
      return response.data.order;
    } catch (error) {
      console.error('Shopify Order Creation Error:', error.response?.data || error.message);
      throw new Error('Failed to create order in Shopify');
    }
  }

  // Get locations
  async getLocations() {
    try {
      const client = this.getClient();
      const response = await client.get('/locations.json');
      return response.data.locations;
    } catch (error) {
      console.error('Shopify API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch locations from Shopify');
    }
  }
}

module.exports = new ShopifyService();

