/**
 * Manual trigger script for updating user's collection prices
 * Uses Firebase Admin SDK with Application Default Credentials
 */

const admin = require('firebase-admin');

// Initialize with application default credentials
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'your-card-collection-2026'
});

const db = admin.firestore();

// Mock functions.config() for ebayAPI.js
global.functions = {
  config: () => ({
    ebay: {
      client_id: process.env.EBAY_CLIENT_ID,
      client_secret: process.env.EBAY_CLIENT_SECRET,
      dev_id: process.env.EBAY_DEV_ID,
      env: process.env.EBAY_ENV || "production"
    }
  })
};

// Mock require('firebase-functions') for ebayAPI.js
const functionsModule = require('firebase-functions');
Object.assign(functionsModule, {
  config: global.functions.config
});

const {searchEbayCard, calculateEstimatedPrice, enhanceQuery} = require('./ebayAPI');
const {globalLimiter} = require('./rateLimiter');

async function manualUpdate(userId) {
  console.log(`🔄 Starting manual collection update for user: ${userId}`);

  try {
    // Get all user's cards in collection
    const cardsSnapshot = await db.collection('cards')
      .where('userId', '==', userId)
      .where('status', '==', 'zbierka')
      .limit(500)
      .get();

    if (cardsSnapshot.empty) {
      console.log(`ℹ️  User ${userId} has no cards to update`);
      return;
    }

    const cards = cardsSnapshot.docs;
    console.log(`📊 Found ${cards.length} cards to update`);

    let successCount = 0;
    let failCount = 0;

    // Process cards with rate limiting
    for (let i = 0; i < cards.length; i++) {
      const cardDoc = cards[i];
      const card = cardDoc.data();
      const cardId = cardDoc.id;

      console.log(`\n[${i + 1}/${cards.length}] Processing: ${card.item}`);

      try {
        // Rate limiting
        await globalLimiter.throttle();

        // Enhance query
        const query = enhanceQuery(card.item);
        console.log(`  🔍 Searching eBay: "${query}"`);

        // Search eBay
        const results = await searchEbayCard(query);

        if (results.length > 0) {
          const estimatedPrice = calculateEstimatedPrice(results);

          if (estimatedPrice) {
            // Create price history entry
            const priceHistoryEntry = {
              date: admin.firestore.FieldValue.serverTimestamp(),
              price: estimatedPrice,
              source: 'ebay'
            };

            // Update card
            await cardDoc.ref.update({
              current: estimatedPrice,
              lastPriceUpdate: admin.firestore.FieldValue.serverTimestamp(),
              priceSource: 'ebay',
              ebayResults: results.slice(0, 3),
              priceHistory: admin.firestore.FieldValue.arrayUnion(priceHistoryEntry)
            });

            console.log(`  ✅ Updated: €${estimatedPrice} (from ${results.length} sold listings)`);
            successCount++;
          } else {
            console.log(`  ⚠️  Cannot calculate price from results`);
            failCount++;
          }
        } else {
          console.log(`  ❌ No eBay results found`);
          failCount++;
        }
      } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        failCount++;

        // If rate limit, add extra pause
        if (error.message.includes('Rate limit') || error.message.includes('429')) {
          console.log('  ⏸️  Rate limit detected, pausing 60s...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }

      // Pause between items (2 seconds)
      if (i < cards.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Create update log
    await db.collection('updateLogs').add({
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      totalCards: cards.length,
      successCount,
      failCount,
      apiCallsUsed: successCount + failCount,
      status: failCount === 0 ? 'success' : (successCount > 0 ? 'partial' : 'failed'),
      triggerType: 'manual'
    });

    console.log(`\n✅ Manual update complete!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log(`   Total: ${cards.length}`);

    // Update user's lastManualUpdate
    await db.collection('users').doc(userId).update({
      lastManualUpdate: admin.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.error('💥 Fatal error:', error);
    throw error;
  }
}

// Get user ID from command line or find first user
async function main() {
  try {
    let userId = process.argv[2];

    if (!userId) {
      // Find first user with cards
      console.log('No user ID provided, finding users...');
      const usersSnapshot = await db.collection('users').limit(5).get();

      if (usersSnapshot.empty) {
        console.error('No users found in database');
        process.exit(1);
      }

      userId = usersSnapshot.docs[0].id;
      const userData = usersSnapshot.docs[0].data();
      console.log(`Using user: ${userId} (${userData.email || 'no email'})`);
    }

    await manualUpdate(userId);
    process.exit(0);
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();
