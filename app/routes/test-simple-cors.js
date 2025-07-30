// Simple CORS test script
import https from 'https';
import http from 'http';

function makeRequest(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
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

    req.end();
  });
}

async function testCorsHeaders() {
  console.log('🧪 Testing CORS headers on endpoints...\n');
  
  const endpoints = [
    '/api/test-cors',
    '/app/create-draft-order',
    '/api/create-draft-order'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`📡 Testing: ${endpoint}`);
      const response = await makeRequest(`https://2182918e4d68.ngrok-free.app${endpoint}`);
      
      console.log(`Status: ${response.status}`);
      console.log('CORS Headers:');
      console.log('  Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
      console.log('  Access-Control-Allow-Methods:', response.headers['access-control-allow-methods']);
      console.log('  Access-Control-Allow-Headers:', response.headers['access-control-allow-headers']);
      console.log('  Access-Control-Allow-Credentials:', response.headers['access-control-allow-credentials']);
      
      if (response.data) {
        console.log('Response Data:', JSON.stringify(response.data, null, 2));
      }
      
      console.log('---\n');
      
    } catch (error) {
      console.error(`❌ Error testing ${endpoint}:`, error.message);
      console.log('---\n');
    }
  }
}

// Test OPTIONS preflight requests
async function testPreflight() {
  console.log('🧪 Testing OPTIONS preflight requests...\n');
  
  const endpoints = [
    '/api/test-cors',
    '/app/create-draft-order'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`📡 Testing OPTIONS: ${endpoint}`);
      const response = await makeRequest(`https://2182918e4d68.ngrok-free.app${endpoint}`, 'OPTIONS');
      
      console.log(`Status: ${response.status}`);
      console.log('Preflight Headers:');
      console.log('  Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
      console.log('  Access-Control-Allow-Methods:', response.headers['access-control-allow-methods']);
      console.log('  Access-Control-Allow-Headers:', response.headers['access-control-allow-headers']);
      console.log('  Access-Control-Max-Age:', response.headers['access-control-max-age']);
      
      console.log('---\n');
      
    } catch (error) {
      console.error(`❌ Error testing OPTIONS ${endpoint}:`, error.message);
      console.log('---\n');
    }
  }
}

// Run tests
async function runTests() {
  await testCorsHeaders();
  await testPreflight();
}

runTests(); 