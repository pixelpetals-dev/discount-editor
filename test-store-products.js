import fetch from 'node-fetch';

// Fetch products from the store
async function fetchStoreProducts() {
  try {
    console.log('🛍️ Fetching products from store...');
    
    const response = await fetch('https://carbiforce.shop/products.json');
    const data = await response.json();
    
    console.log(`📦 Found ${data.products?.length || 0} products:`);
    
    if (data.products && data.products.length > 0) {
      data.products.forEach((product, index) => {
        console.log(`${index + 1}. ${product.title}`);
        console.log(`   ID: ${product.id}`);
        console.log(`   Handle: ${product.handle}`);
        console.log(`   Variants: ${product.variants?.length || 0}`);
        if (product.variants && product.variants.length > 0) {
          console.log(`   First variant ID: ${product.variants[0].id}`);
        }
        console.log('');
      });
    }
    
    return data.products;
    
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    return [];
  }
}

fetchStoreProducts(); 