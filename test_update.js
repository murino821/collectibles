const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testUpdate() {
  try {
    // Get first user (should be you)
    const usersSnapshot = await db.collection('users').limit(1).get();
    
    if (usersSnapshot.empty) {
      console.log('No users found');
      return;
    }
    
    const userId = usersSnapshot.docs[0].id;
    const userData = usersSnapshot.docs[0].data();
    
    console.log('User found:', userId);
    console.log('Display name:', userData.displayName);
    console.log('Next scheduled update:', userData.nextUpdateDate?.toDate());
    
    // Get user's cards
    const cardsSnapshot = await db.collection('cards')
      .where('userId', '==', userId)
      .where('status', '==', 'zbierka')
      .get();
    
    console.log('\nCards to update:', cardsSnapshot.size);
    
    // Manually trigger update function
    console.log('\nTriggering manual update...');
    
    const {searchEbayCard, calculateEstimatedPrice, enhanceQuery} = require('./functions/ebayAPI');
    
    for (const cardDoc of cardsSnapshot.docs) {
      const card = cardDoc.data();
      console.log(`\nUpdating: ${card.item}`);
      
      const query = enhanceQuery(card.item);
      console.log(`  Query: ${query}`);
      
      const results = await searchEbayCard(query);
      console.log(`  Found ${results.length} sold listings`);
      
      if (results.length > 0) {
        const price = calculateEstimatedPrice(results);
        console.log(`  Price: €${price}`);
        
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
        
        console.log(`  ✅ Updated successfully`);
      } else {
        console.log(`  ❌ No results found`);
      }
      
      // Pause between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n✅ Update complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testUpdate();
