/**
 * Update nextUpdateDate for all users to today at 11:00
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBlAhlya-NNp8gCxGPBIPxxCgDa6l9AXo8",
  authDomain: "your-card-collection-2026.firebaseapp.com",
  projectId: "your-card-collection-2026",
  storageBucket: "your-card-collection-2026.firebasestorage.app",
  messagingSenderId: "620171462959",
  appId: "1:620171462959:web:28ecb209a009d16db679da"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateSchedules() {
  try {
    // Get all users
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);

    console.log(`Found ${usersSnapshot.size} users`);

    // Set today at 11:00 AM
    const today = new Date();
    today.setHours(11, 0, 0, 0);

    console.log(`Setting nextUpdateDate to: ${today.toISOString()}`);

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      console.log(`\nUpdating user: ${userDoc.id}`);
      console.log(`  Email: ${userData.email}`);
      console.log(`  Current nextUpdateDate: ${userData.nextUpdateDate?.toDate?.()}`);

      await updateDoc(doc(db, 'users', userDoc.id), {
        nextUpdateDate: today,
        priceUpdatesEnabled: true
      });

      console.log(`  ✅ Updated to: ${today}`);
    }

    console.log('\n✅ All users updated!');
  } catch (error) {
    console.error('Error:', error);
  }
}

updateSchedules();
