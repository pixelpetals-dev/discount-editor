import fetch from 'node-fetch';

// Check collections and their products
async function checkCollections() {
  try {
    console.log('📚 Fetching collections from store...');
    
    const response = await fetch('https://carbiforce.shop/collections.json');
    const data = await response.json();
    
    console.log(`📦 Found ${data.collections?.length || 0} collections:`);
    
    if (data.collections && data.collections.length > 0) {
      for (const collection of data.collections) {
        console.log(`\n🏷️ Collection: ${collection.title}`);
        console.log(`   ID: ${collection.id}`);
        console.log(`   Handle: ${collection.handle}`);
        console.log(`   Products Count: ${collection.products_count}`);
        
        // Fetch products in this collection
        try {
          const productsResponse = await fetch(`https://carbiforce.shop/collections/${collection.handle}/products.json`);
          const productsData = await productsResponse.json();
          
          if (productsData.products && productsData.products.length > 0) {
            console.log(`   Products in collection:`);
            productsData.products.forEach((product, index) => {
              console.log(`     ${index + 1}. ${product.title} (ID: ${product.id})`);
            });
          } else {
            console.log(`   No products in this collection`);
          }
        } catch (error) {
          console.log(`   Error fetching products: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error fetching collections:', error);
  }
}

checkCollections(); 