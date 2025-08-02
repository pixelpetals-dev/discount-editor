import fetch from 'node-fetch';

// Test the check-segment-discount API
async function testCheckSegmentDiscount() {
  try {
    console.log('🧪 Testing check-segment-discount API...');
    
    const testData = {
      shop: "qvk2k1-kq.myshopify.com",
      customerId: "gid://shopify/Customer/8064802095182",
      cartItems: [
        {
          productId: "gid://shopify/Product/7608316756046", // demo152 product from demo collection
          price: 29.99,
          quantity: 1,
          variantId: "gid://shopify/ProductVariant/7608316756046", // demo152 variant
          title: "demo152",
          originalPrice: 29.99,
          finalPrice: 29.99
        }
      ]
    };
    
    const response = await fetch('https://discount-editor-q174l2s84-pixelpetals-devs-projects.vercel.app/api/check-segment-discount', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    const data = await response.json();
    console.log('📊 API Response:', JSON.stringify(data, null, 2));
    
    if (data.discountApplicable) {
      console.log('✅ Discount is applicable!');
      if (data.draftOrderUrl) {
        console.log('🎯 Draft order URL:', data.draftOrderUrl);
      }
    } else {
      console.log('❌ No discount applicable');
      if (data.debug) {
        console.log('🔍 Debug info:', data.debug);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testCheckSegmentDiscount(); 