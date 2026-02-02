const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Mock functions config for eBay API
process.env.EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID || "";
process.env.EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || "";
process.env.EBAY_DEV_ID = process.env.EBAY_DEV_ID || "";
process.env.EBAY_ENV = process.env.EBAY_ENV || "production";

// Mock firebase-functions for ebayAPI to work
const functions = {
  config: () => ({
    ebay: {
      client_id: process.env.EBAY_CLIENT_ID,
      client_secret: process.env.EBAY_CLIENT_SECRET,
      dev_id: process.env.EBAY_DEV_ID,
      env: process.env.EBAY_ENV
    }
  })
};

// Inject mock into require cache
require.cache['firebase-functions'] = {
  exports: functions
};

const {searchEbayCard, calculateEstimatedPrice, enhanceQuery} = require(path.join(__dirname, 'functions', 'ebayAPI'));

async function testUpdate() {
  try {
    // Get first user
    const usersSnapshot = await db.collection('users').limit(1).get();
    
    if (usersSnapshot.empty) {
      console.log('❌ No users found');
      return;
    }
    
    const userId = usersSnapshot.docs[0].id;
    const userData = usersSnapshot.docs[0].data();
    
    console.log('👤 User:', userData.displayName || userId);
    console.log('📅 Next scheduled update:', userData.nextUpdateDate?.toDate());
    
    // Get user's cards
    const cardsSnapshot = await db.collection('cards')
      .where('userId', '==', userId)
      .where('status', '==', 'zbierka')
      .get();
    
    console.log(`\n📦 Cards to update: ${cardsSnapshot.size}\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const cardDoc of cardsSnapshot.docs) {
      const card = cardDoc.data();
      console.log(`🔄 Updating: ${card.item}`);
      
      try {
        const query = enhanceQuery(card.item);
        console.log(`   Query: "${query}"`);
        
        const results = await searchEbayCard(query);
        
        if (results.length > 0) {
          const price = calculateEstimatedPrice(results);
          
          // Update card
          await cardDoc.ref.update({
            current: price,
            lastPriceUpdate: admin.firestore.FieldValue.serverTimestamp(),
            priceSource: 'ebay',
            ebayResults: results.slice(0, 3),
            priceHistory: admin.firestore.FieldValue.arrayUnion({
              date: admin.firestore.FieldValue.serverTimestamp(),
              price: price,
              source: 'ebay'
            })
          });
          
          successCount++;
        } else {
          console.log(`   ❌ No eBay results`);
          failCount++;
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        failCount++;
      }
      
      // Pause between requests (rate limiting)
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log(`\n✅ Update complete!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

testUpdate();
