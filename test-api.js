const testData = {
  customerData: JSON.stringify({
    id: 8064802095182,
    email: "haidelimdi@gmail.com",
    name: "Haider Limdiwala",
    tags: ["Vip"]
  })
};

async function testAPI() {
  try {
    console.log('🧪 Testing API with data:', testData);
    
    const response = await fetch('https://discount-editor-axnraz4f2-pixelpetals-devs-projects.vercel.app/api/segment-offer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    const data = await response.json();
    console.log('📊 API Response:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testAPI(); 