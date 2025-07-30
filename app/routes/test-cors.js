// Test script for CORS endpoint
import https from 'https';
import http from 'http';

function makeRequest(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'ngrok-skip-browser-warning': 'true'
      }
    };

    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            rawData: responseData,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function testCors() {
  console.log('🧪 Testing CORS endpoint...\n');
  
  const testData = {
    customerId: "gid://shopify/Customer/123456789",
    cart: {
      items: [
        {
          variant_id: "gid://shopify/ProductVariant/987654321",
          quantity: 1,
          price: "29.99"
        }
      ],
      original_total_price: 2999,
      total_discount: 0
    }
  };

  try {
    console.log('📡 Making request to:', 'https://8cdcaed6dd39.ngrok-free.app/app/create-draft-order');
    console.log('📦 Request data:', JSON.stringify(testData, null, 2));
    
    const response = await makeRequest(
      'https://2182918e4d68.ngrok-free.app/app/create-draft-order',
      testData
    );
    
    console.log('\n✅ Response received:');
    console.log('Status:', response.status);
    console.log('CORS Headers:');
    console.log('  Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
    console.log('  Access-Control-Allow-Methods:', response.headers['access-control-allow-methods']);
    console.log('  Access-Control-Allow-Headers:', response.headers['access-control-allow-headers']);
    
    console.log('\n📄 Response Data:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Also test the CORS test endpoint
async function testCorsTestEndpoint() {
  console.log('\n🧪 Testing CORS test endpoint...\n');
  
  try {
    const response = await makeRequest(
      'https://2182918e4d68.ngrok-free.app/api/test-cors',
      { test: "Hello from Node.js", timestamp: new Date().toISOString() }
    );
    
    console.log('✅ CORS Test Response:');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ CORS Test Error:', error.message);
  }
}

// Run tests
async function runTests() {
  await testCorsTestEndpoint();
  await testCors();
}

runTests(); 