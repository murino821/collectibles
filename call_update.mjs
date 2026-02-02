/**
 * Call updateUserCollection Cloud Function
 * Uses Firebase REST API with your auth
 */

import https from 'https';

const PROJECT_ID = 'your-card-collection-2026';
const REGION = 'us-central1';
const FUNCTION_NAME = 'updateUserCollection';

// Firebase ID token - we'll need to get this from your browser or use custom token
// For now, let's try the direct REST API approach

const options = {
  hostname: `${REGION}-${PROJECT_ID}.cloudfunctions.net`,
  path: `/${FUNCTION_NAME}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

console.log(`\n🔄 Calling Cloud Function: ${FUNCTION_NAME}\n`);
console.log(`URL: https://${options.hostname}${options.path}\n`);

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`Status: ${res.statusCode}\n`);

    if (res.statusCode === 200) {
      console.log('✅ Response:', JSON.parse(data));
    } else {
      console.error('❌ Error response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('💥 Request error:', error);
});

// Send empty data (function will use context.auth.uid)
req.write(JSON.stringify({ data: {} }));
req.end();
