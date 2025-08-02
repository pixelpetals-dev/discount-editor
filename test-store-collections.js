import fetch from 'node-fetch';

// Test to see what collections are available from the store
async function testStoreCollections() {
  try {
    console.log('🧪 Testing store collections API...');
    
    const response = await fetch('https://carbiforce.shop/collections.json');
    const data = await response.json();
    
    console.log('📊 Store Collections:');
    data.collections.forEach((collection, index) => {
      console.log(`${index + 1}. ID: ${collection.id}`);
      console.log(`   Title: ${collection.title}`);
      console.log(`   Handle: ${collection.handle}`);
      console.log(`   Products: ${collection.products_count}`);
      console.log(`   URL: https://carbiforce.shop/collections/${collection.handle}\n`);
    });
    
    // Check if our target collection exists
    const targetCollection = data.collections.find(c => c.id.toString() === '295479672910');
    if (targetCollection) {
      console.log('✅ Found target collection:');
      console.log(`   ID: ${targetCollection.id}`);
      console.log(`   Title: ${targetCollection.title}`);
      console.log(`   Handle: ${targetCollection.handle}`);
    } else {
      console.log('❌ Target collection 295479672910 not found');
      console.log('Available collection IDs:', data.collections.map(c => c.id));
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testStoreCollections(); 