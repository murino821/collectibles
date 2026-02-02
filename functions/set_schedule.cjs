#!/usr/bin/env node
/**
 * Direct Firestore update - set schedule to 11:15 today
 * Run with: node set_schedule.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');

// Read Firebase config to get project ID
const firebaserc = JSON.parse(fs.readFileSync('../.firebaserc', 'utf-8'));
const projectId = firebaserc.projects.default;

console.log(`📦 Using project: ${projectId}\n`);

// Initialize with application default credentials
admin.initializeApp({
  projectId: projectId
});

const db = admin.firestore();

async function setSchedule() {
  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();

    if (usersSnapshot.empty) {
      console.log('❌ No users found');
      process.exit(1);
    }

    console.log(`Found ${usersSnapshot.size} users\n`);

    // Set today at 11:15 AM
    const today = new Date();
    today.setHours(11, 15, 0, 0);

    console.log(`Setting nextUpdateDate to: ${today.toLocaleString('sk-SK')}\n`);

    const batch = db.batch();

    usersSnapshot.forEach((userDoc) => {
      const userData = userDoc.data();
      console.log(`  📝 ${userData.email || userDoc.id}`);

      batch.update(userDoc.ref, {
        nextUpdateDate: admin.firestore.Timestamp.fromDate(today),
        priceUpdatesEnabled: true,
        updateHourOfDay: 11
      });
    });

    await batch.commit();

    console.log(`\n✅ Successfully updated ${usersSnapshot.size} users!`);
    console.log(`\nNext update scheduled for: ${today.toLocaleString('sk-SK')}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'auth/invalid-credential') {
      console.log('\n💡 Tip: Skús sa prihlásiť cez: firebase login');
    }
    process.exit(1);
  }
}

setSchedule();
