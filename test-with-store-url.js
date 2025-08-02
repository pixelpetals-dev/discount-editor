import fetch from 'node-fetch';

// Test the API with store URL
async function testWithStoreUrl() {
  try {
    console.log('🧪 Testing API with store URL...');
    
    const testData = {
      customerData: JSON.stringify({
        id: 8064802095182,
        email: "haidelimdi@gmail.com",
        name: "Haider Limdiwala",
        tags: ["Vip"]
      }),
      storeUrl: "https://carbiforce.shop" // Send the store URL
    };
    
    const response = await fetch('https://discount-editor-ejtdzsq3i-pixelpetals-devs-projects.vercel.app/api/segment-offer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    const data = await response.json();
    console.log('📊 API Response with store URL:', JSON.stringify(data, null, 2));
    
    if (data.offer?.collections) {
      console.log('\n🔍 Collection Details:');
      data.offer.collections.forEach((collection, index) => {
        console.log(`${index + 1}. ID: ${collection.id}`);
        console.log(`   Title: ${collection.title || collection.name}`);
        console.log(`   Handle: ${collection.handle || 'N/A'}`);
        console.log(`   URL: ${collection.handle ? `https://carbiforce.shop/collections/${collection.handle}` : 'N/A'}`);
        console.log(`   Discount: ${collection.percentOff}% off\n`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testWithStoreUrl(); 