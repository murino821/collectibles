/**
 * Simple manual update script
 * Sets environment variables before requiring modules
 */

// Set credentials before loading any modules
process.env.EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID || "";
process.env.EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || "";
process.env.EBAY_DEV_ID = process.env.EBAY_DEV_ID || "";
process.env.EBAY_ENV = process.env.EBAY_ENV || "production";

const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'your-card-collection-2026'
});

const db = admin.firestore();

// Now we need to create a version of ebayAPI that uses env vars
const fetch = require('node-fetch');

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_ENV = process.env.EBAY_ENV || 'production';

const OAUTH_BASE = EBAY_ENV === 'sandbox' ?
  'https://api.sandbox.ebay.com' :
  'https://api.ebay.com';

const BROWSE_BASE = EBAY_ENV === 'sandbox' ?
  'https://api.sandbox.ebay.com' :
  'https://api.ebay.com';

const HOCKEY_CARDS_CATEGORY = '261328';
const EBAY_MARKETPLACE = 'EBAY_DE';

let cachedToken = null;
let tokenExpiry = null;

// Rate limiter
const globalLimiter = {
  lastCall: 0,
  minInterval: 200, // 200ms = 5 req/s
  async throttle() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    if (timeSinceLastCall < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
    }
    this.lastCall = Date.now();
  }
};

async function getEbayToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    console.log('Using cached eBay token');
    return cachedToken;
  }

  console.log('Fetching new eBay token...');

  const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${OAUTH_BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay OAuth failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  console.log(`✅ eBay token acquired`);
  return cachedToken;
}

async function searchEbayCard(query) {
  const token = await getEbayToken();

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateFilter = ninetyDaysAgo.toISOString();

  const params = new URLSearchParams({
    q: query,
    category_ids: HOCKEY_CARDS_CATEGORY,
    limit: '20',
    filter: `buyingOptions:{AUCTION|FIXED_PRICE},itemEndDate:[${dateFilter}..],priceCurrency:EUR`,
    sort: 'price'
  });

  const response = await fetch(
    `${BROWSE_BASE}/buy/browse/v1/item_summary/search?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      cachedToken = null;
      tokenExpiry = null;
      throw new Error('Token expired');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }
    throw new Error(`eBay API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.itemSummaries || data.itemSummaries.length === 0) {
    return [];
  }

  return data.itemSummaries
    .filter(item => item.price && item.price.value > 0)
    .map(item => ({
      title: item.title,
      price: parseFloat(item.price.value),
      currency: item.price.currency,
      condition: item.condition,
      itemWebUrl: item.itemWebUrl,
      imageUrl: item.image?.imageUrl,
      seller: item.seller?.username,
      soldDate: item.itemEndDate
    }));
}

function calculateEstimatedPrice(results) {
  if (!results || results.length === 0) return null;

  const prices = results.map(r => r.price).sort((a, b) => a - b);
  const tenPercent = Math.floor(prices.length * 0.1);
  const trimmedPrices = prices.slice(tenPercent, prices.length - tenPercent);

  if (trimmedPrices.length === 0) {
    const median = prices[Math.floor(prices.length / 2)];
    console.log(`  📊 ${results.length} sold, median: €${median.toFixed(2)}`);
    return parseFloat(median.toFixed(2));
  }

  const average = trimmedPrices.reduce((sum, p) => sum + p, 0) / trimmedPrices.length;
  console.log(`  📊 ${results.length} sold, avg: €${average.toFixed(2)}, range: €${prices[0].toFixed(2)}-€${prices[prices.length - 1].toFixed(2)}`);
  return parseFloat(average.toFixed(2));
}

function enhanceQuery(cardName) {
  let enhanced = cardName.toLowerCase().trim();
  enhanced = enhanced.replace(/^nhl\s+/i, '');
  if (!enhanced.includes('card') && !enhanced.includes('pokemon') && !enhanced.includes('coin')) {
    enhanced += ' card';
  }
  return enhanced;
}

async function manualUpdate(userId) {
  console.log(`\n🔄 Starting manual update for user: ${userId}\n`);

  const cardsSnapshot = await db.collection('cards')
    .where('userId', '==', userId)
    .where('status', '==', 'zbierka')
    .limit(500)
    .get();

  if (cardsSnapshot.empty) {
    console.log('ℹ️  No cards to update');
    return;
  }

  const cards = cardsSnapshot.docs;
  console.log(`📊 Found ${cards.length} cards\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < cards.length; i++) {
    const cardDoc = cards[i];
    const card = cardDoc.data();

    console.log(`[${i + 1}/${cards.length}] ${card.item}`);

    try {
      await globalLimiter.throttle();

      const query = enhanceQuery(card.item);
      console.log(`  🔍 "${query}"`);

      const results = await searchEbayCard(query);

      if (results.length > 0) {
        const estimatedPrice = calculateEstimatedPrice(results);

        if (estimatedPrice) {
          await cardDoc.ref.update({
            current: estimatedPrice,
            lastPriceUpdate: admin.firestore.FieldValue.serverTimestamp(),
            priceSource: 'ebay',
            ebayResults: results.slice(0, 3),
            priceHistory: admin.firestore.FieldValue.arrayUnion({
              date: admin.firestore.FieldValue.serverTimestamp(),
              price: estimatedPrice,
              source: 'ebay'
            })
          });

          console.log(`  ✅ Updated to €${estimatedPrice}\n`);
          successCount++;
        } else {
          console.log(`  ⚠️  Cannot calculate price\n`);
          failCount++;
        }
      } else {
        console.log(`  ❌ No results\n`);
        failCount++;
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}\n`);
      failCount++;

      if (error.message.includes('Rate limit') || error.message.includes('429')) {
        console.log('  ⏸️  Pausing 60s...\n');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }

    if (i < cards.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await db.collection('updateLogs').add({
    userId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    totalCards: cards.length,
    successCount,
    failCount,
    triggerType: 'manual'
  });

  await db.collection('users').doc(userId).update({
    lastManualUpdate: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`\n✅ Complete! Success: ${successCount}, Failed: ${failCount}`);
}

async function main() {
  try {
    let userId = process.argv[2];

    if (!userId) {
      console.log('Finding users...');
      const usersSnapshot = await db.collection('users').limit(5).get();

      if (usersSnapshot.empty) {
        console.error('No users found');
        process.exit(1);
      }

      userId = usersSnapshot.docs[0].id;
      const userData = usersSnapshot.docs[0].data();
      console.log(`Using: ${userId} (${userData.email || 'no email'})`);
    }

    await manualUpdate(userId);
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Error:', error);
    process.exit(1);
  }
}

main();
