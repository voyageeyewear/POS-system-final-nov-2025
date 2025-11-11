// 🔍 DIAGNOSTIC SCRIPT - Check why inventory is 0
// Paste this in browser console (F12 → Console) while logged in as admin

console.log('🔍 Starting inventory diagnostic...');

async function checkInventoryStatus() {
  const token = localStorage.getItem('token');
  const baseURL = 'https://pos-system-final-nov-2025-production.up.railway.app/api';
  
  try {
    // 1. Check products with inventory IDs
    console.log('\n📦 Step 1: Checking products...');
    const productsRes = await fetch(`${baseURL}/products?limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const productsData = await productsRes.json();
    const products = productsData.products || [];
    
    console.log(`Total products: ${productsData.pagination?.total || 0}`);
    console.log('Sample products:', products.slice(0, 3).map(p => ({
      name: p.name,
      sku: p.sku,
      inventoryItemId: p.inventoryItemId,
      hasInventoryId: !!p.inventoryItemId
    })));
    
    const withInventoryId = products.filter(p => p.inventoryItemId).length;
    const withoutInventoryId = products.filter(p => !p.inventoryItemId).length;
    console.log(`✅ With inventory ID: ${withInventoryId}`);
    console.log(`❌ Without inventory ID: ${withoutInventoryId}`);
    
    // 2. Check stores
    console.log('\n🏪 Step 2: Checking stores...');
    const storesRes = await fetch(`${baseURL}/stores`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const stores = await storesRes.json();
    
    console.log(`Total stores: ${stores.length}`);
    console.log('Stores:', stores.map(s => ({
      id: s.id,
      name: s.name,
      shopifyLocationId: s.shopifyLocationId
    })));
    
    // 3. Check inventory records
    console.log('\n📊 Step 3: Checking inventory records...');
    const inventoryRes = await fetch(`${baseURL}/inventory/summary`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const inventoryData = await inventoryRes.json();
    
    console.log('Inventory summary:', inventoryData);
    
    // 4. Final diagnosis
    console.log('\n🔍 DIAGNOSIS:');
    if (withoutInventoryId > 0) {
      console.error(`❌ PROBLEM: ${withoutInventoryId} products missing inventoryItemId!`);
      console.log('💡 SOLUTION: Run "Fix IDs" button in admin panel');
    }
    
    if (stores.length === 0) {
      console.error('❌ PROBLEM: No stores in database!');
      console.log('💡 SOLUTION: Run sync to create stores');
    }
    
    console.log('\n✅ Diagnostic complete! Check Railway logs for sync details.');
    
  } catch (error) {
    console.error('❌ Diagnostic error:', error);
  }
}

checkInventoryStatus();

