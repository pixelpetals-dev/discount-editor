import fetch from 'node-fetch';

// Simulate a storefront call (this would work from the actual store)
async function testStorefrontAPI() {
  try {
    console.log('🧪 Testing API from storefront perspective...');
    
    const testData = {
      customerData: JSON.stringify({
        id: 8064802095182,
        email: "haidelimdi@gmail.com",
        name: "Haider Limdiwala",
        tags: ["Vip"]
      })
    };
    
    // This would be called from the actual storefront with proper authentication
    const response = await fetch('https://discount-editor-axnraz4f2-pixelpetals-devs-projects.vercel.app/api/segment-offer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // In real storefront, Shopify would add authentication headers
        'X-Shopify-Shop-Domain': 'carbiforce.shop',
        'X-Shopify-Access-Token': 'simulated-token'
      },
      body: JSON.stringify(testData)
    });
    
    const data = await response.json();
    console.log('📊 Storefront API Response:', JSON.stringify(data, null, 2));
    
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

testStorefrontAPI(); 