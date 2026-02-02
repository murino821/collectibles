/**
 * Firebase Cloud Functions for NHL Cards Collection
 * Automatic price updates using eBay Browse API
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();
const {searchEbayCard, calculateEstimatedPrice, enhanceQuery} = require("./ebayAPI");
const {globalLimiter} = require("./rateLimiter");

/**
 * Scheduled function - runs every hour
 * Checks which users have scheduled price updates for current hour
 */
exports.checkScheduledUpdates = functions.pubsub
    .schedule("0 * * * *") // Every hour at minute 0
    .timeZone("Europe/Bratislava")
    .onRun(async (context) => {
      console.log("🕐 Starting scheduled price updates check...");

      const now = new Date();
      const currentHourStart = new Date(now);
      currentHourStart.setMinutes(0, 0, 0);

      const nextHourStart = new Date(currentHourStart);
      nextHourStart.setHours(nextHourStart.getHours() + 1);

      try {
        // Find users with scheduled update for current hour
        // Only premium and admin users get automatic eBay price updates
        const usersSnapshot = await db.collection("users")
            .where("nextUpdateDate", ">=", currentHourStart)
            .where("nextUpdateDate", "<", nextHourStart)
            .where("priceUpdatesEnabled", "==", true)
            .where("role", "in", ["premium", "admin"])
            .get();

        if (usersSnapshot.empty) {
          console.log("ℹ️  No users scheduled for update today");
          return null;
        }

        console.log(`📋 Found ${usersSnapshot.size} users to update`);

        // Process each user sequentially (respect rate limits)
        for (const userDoc of usersSnapshot.docs) {
          const userId = userDoc.id;
          const userData = userDoc.data();

          console.log(`👤 Processing user: ${userId} (scheduled for ${userData.updateHourOfDay}:00)`);

          try {
            // Trigger update function for this user
            await updateUserCollection(userId);

            // Calculate next update date based on user's interval
            const intervalDays = userData.updateIntervalDays || 30; // Default 30 days for standard
            const nextUpdate = new Date();
            nextUpdate.setDate(nextUpdate.getDate() + intervalDays);
            nextUpdate.setHours(userData.updateHourOfDay || 11, 0, 0, 0);

            await db.collection("users").doc(userId).update({
              lastCollectionUpdate: admin.firestore.FieldValue.serverTimestamp(),
              nextUpdateDate: nextUpdate,
            });

            console.log(`✅ User ${userId} updated successfully. Next update: ${nextUpdate.toISOString()} (${intervalDays} days)`);
          } catch (error) {
            console.error(`❌ Error updating user ${userId}:`, error);

            // Log error but continue with other users
            await db.collection("updateLogs").add({
              userId,
              status: "failed",
              error: error.message,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // Pause between users (5 seconds)
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        console.log("🎉 Scheduled updates completed");
        return null;
      } catch (error) {
        console.error("💥 Fatal error in checkScheduledUpdates:", error);
        throw error;
      }
    });

/**
 * Update all cards for a specific user
 * @param {string} userId - Firebase user ID
 * @return {Object} Update results
 */
async function updateUserCollection(userId) {
  console.log(`🔄 Starting collection update for user: ${userId}`);

  // Get all user's cards
  const cardsSnapshot = await db.collection("cards")
      .where("userId", "==", userId)
      .where("status", "==", "zbierka") // Only cards in collection
      .limit(500) // Max limit
      .get();

  if (cardsSnapshot.empty) {
    console.log(`ℹ️  User ${userId} has no cards to update`);
    return {
      success: true,
      cardsProcessed: 0,
      message: "No cards to update",
    };
  }

  const cards = cardsSnapshot.docs;
  console.log(`📊 Found ${cards.length} cards to update`);

  // Update status document with total count
  const statusRef = db.collection("updateStatus").doc(userId);
  await statusRef.update({
    total: cards.length,
    cardsProcessed: cards.length,
  }).catch(() => {
    // Status doc might not exist if called from scheduled task
    console.log("Status document not found - skipping status updates");
  });

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  // Batch processing
  const BATCH_SIZE = 20;
  const BATCH_PAUSE_MS = 10000; // 10s between batches

  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, Math.min(i + BATCH_SIZE, cards.length));

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(cards.length / BATCH_SIZE);
    console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} cards)`);

    // Check remaining budget
    const remainingBudget = globalLimiter.getRemainingBudget();
    if (remainingBudget < 10) {
      console.warn(`⚠️  Low budget warning: ${remainingBudget} calls remaining`);

      if (remainingBudget === 0) {
        console.error("🚫 Daily budget exhausted, stopping updates");
        errors.push({cardId: "budget_exceeded", error: "Daily API budget exhausted"});
        break;
      }
    }

    for (const cardDoc of batch) {
      const card = cardDoc.data();
      const cardId = cardDoc.id;

      try {
        // Rate limiting
        await globalLimiter.throttle();

        // Enhance query
        const query = enhanceQuery(card.item);
        console.log(`🔍 Searching: ${query}`);

        // Search eBay
        const results = await searchEbayCard(query);

        if (results.length > 0) {
          const estimatedPrice = calculateEstimatedPrice(results);

          if (estimatedPrice) {
            // Create price history entry with actual Date (serverTimestamp cannot be used in arrays)
            const priceHistoryEntry = {
              date: new Date(),
              price: estimatedPrice,
              source: "ebay",
            };

            // Update card with price and append to history
            await cardDoc.ref.update({
              current: estimatedPrice,
              lastPriceUpdate: admin.firestore.FieldValue.serverTimestamp(),
              priceSource: "ebay",
              ebayPriceSource: true, // Flag for UI to show eBay badge
              priceHistory: admin.firestore.FieldValue.arrayUnion(priceHistoryEntry),
            });

            console.log(`  ✓ ${card.item}: $${estimatedPrice}`);
            successCount++;
          } else {
            console.log(`  ⚠ ${card.item}: Cannot calculate price`);
            failCount++;
            errors.push({cardId, cardName: card.item, error: "Cannot calculate price"});
          }
        } else {
          console.log(`  ✗ ${card.item}: No eBay results`);
          failCount++;
          errors.push({cardId, cardName: card.item, error: "No eBay results"});
        }

        // Update status after each card
        await statusRef.update({
          successCount,
          failCount,
          progress: successCount + failCount,
        }).catch(() => { /* Ignore if status doc doesn't exist */ });

      } catch (error) {
        console.error(`  ❌ Error updating card ${cardId}:`, error.message);
        failCount++;
        errors.push({cardId, cardName: card.item, error: error.message});

        // Update status after error
        await statusRef.update({
          successCount,
          failCount,
          progress: successCount + failCount,
        }).catch(() => { /* Ignore if status doc doesn't exist */ });

        // If rate limit error, add extra pause
        if (error.message.includes("Rate limit") || error.message.includes("429")) {
          console.log("  ⏸️  Rate limit detected, pausing 60s...");
          await new Promise((resolve) => setTimeout(resolve, 60000));
        }
      }
    }

    // Pause between batches
    if (i + BATCH_SIZE < cards.length) {
      console.log(`⏸️  Batch complete. Pausing ${BATCH_PAUSE_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }
  }

  // Create update log
  const logRef = await db.collection("updateLogs").add({
    userId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    totalCards: cards.length,
    successCount,
    failCount,
    errors: errors.slice(0, 10), // First 10 errors only
    apiCallsUsed: successCount + failCount,
    status: failCount === 0 ? "success" : (successCount > 0 ? "partial" : "failed"),
    triggerType: "scheduled",
  });

  // Create notification for user
  await createUserNotification(userId, {
    id: logRef.id,
    totalCards: cards.length,
    successCount,
    failCount,
  });

  console.log(`✅ Collection update complete for user ${userId}: ${successCount} success, ${failCount} failed`);

  return {
    success: true,
    cardsProcessed: cards.length,
    successCount,
    failCount,
  };
}

/**
 * Create in-app notification for user
 * @param {string} userId - User ID
 * @param {Object} logData - Update log data
 */
async function createUserNotification(userId, logData) {
  try {
    // Calculate total collection value
    const userCardsSnapshot = await db.collection("cards")
        .where("userId", "==", userId)
        .where("status", "==", "zbierka")
        .get();

    let totalValue = 0;
    userCardsSnapshot.forEach((doc) => {
      const card = doc.data();
      totalValue += card.current || 0;
    });

    // Calculate percentage of successful updates
    const successRate = logData.totalCards > 0 ?
      Math.round((logData.successCount / logData.totalCards) * 100) : 0;

    // Create notification
    const notification = {
      userId,
      type: "price_update_complete",
      title: "✅ Zbierka aktualizovaná",
      message: `Ceny ${logData.successCount} kariet boli aktualizované (${successRate}%). ` +
               `Celková hodnota: €${totalValue.toFixed(2)}`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      actionType: "view_log",
      actionData: {
        logId: logData.id,
        successCount: logData.successCount,
        failCount: logData.failCount,
        totalValue: totalValue,
      },
    };

    await db.collection("notifications").add(notification);
    console.log(`📬 Notification created for user ${userId}`);
  } catch (error) {
    console.error("Error creating notification:", error);
    // Don't throw - notification is not critical
  }
}

/**
 * Optional: Manual trigger for price update
 * User can trigger once per 24 hours
 */
exports.updateUserCollection = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User not logged in");
  }

  const callerId = context.auth.uid;
  const targetUserId = data.userId || callerId; // Admin can specify userId, otherwise use caller's ID

  // Check caller's role
  const callerDoc = await db.collection("users").doc(callerId).get();
  const callerData = callerDoc.data();
  const callerRole = callerData?.role || "standard";
  const isAdmin = callerRole === "admin";
  const isPremiumOrAdmin = callerRole === "premium" || callerRole === "admin";

  // Standard users cannot use eBay price updates at all
  if (!isPremiumOrAdmin) {
    throw new functions.https.HttpsError(
        "permission-denied",
        "eBay price updates are only available for Premium and Admin users. Standard users can manually edit prices in card details.",
    );
  }

  // If not admin and trying to update someone else's collection, deny
  if (!isAdmin && targetUserId !== callerId) {
    throw new functions.https.HttpsError("permission-denied", "Only admins can update other users' collections");
  }

  console.log(`🔧 Manual update triggered by ${callerId} for user: ${targetUserId}${isAdmin ? " (ADMIN)" : " (PREMIUM)"}`);

  // Rate limit: Max 1× per 24 hours (skip for admin)
  if (!isAdmin) {
    const userDoc = await db.collection("users").doc(targetUserId).get();
    const userData = userDoc.data();
    const lastManualUpdate = userData?.lastManualUpdate;

    if (lastManualUpdate) {
      const hoursSinceLastUpdate = (Date.now() - lastManualUpdate.toMillis()) / (1000 * 60 * 60);
      if (hoursSinceLastUpdate < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceLastUpdate);
        throw new functions.https.HttpsError(
            "resource-exhausted",
            `Manual update allowed only once per 24 hours. Try again in ${hoursRemaining} hours.`,
        );
      }
    }
  }

  try {
    // Create status document for tracking progress
    const statusRef = db.collection("updateStatus").doc(targetUserId);
    await statusRef.set({
      userId: targetUserId,
      status: "processing",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      progress: 0,
      total: 0,
      successCount: 0,
      failCount: 0,
    });

    // Track manual update timestamp
    await db.collection("users").doc(targetUserId).update({
      lastManualUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Start background processing (don't await)
    updateUserCollection(targetUserId)
        .then(async (result) => {
          // Update status on success
          await statusRef.update({
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            successCount: result.successCount || 0,
            failCount: result.failCount || 0,
            cardsProcessed: result.cardsProcessed || 0,
          });
          console.log(`✅ Background update completed for user ${targetUserId}`);
        })
        .catch(async (error) => {
          // Update status on error
          console.error("Background update error:", error);
          await statusRef.update({
            status: "error",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message || "Unknown error",
          });
        });

    // Return immediately
    return {
      success: true,
      message: "Update started in background. Check status for progress.",
      statusDocId: targetUserId,
    };
  } catch (error) {
    console.error("Manual update error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Admin function: Set schedule for all users
 * Sets nextUpdateDate to today at 11:00 AM for all users
 */
exports.setScheduleForAllUsers = functions.https.onCall(async (data, context) => {
  // Authentication check (must be logged in)
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User not logged in");
  }

  console.log(`🔧 setScheduleForAllUsers called by: ${context.auth.uid}`);

  try {
    // Get all users
    const usersSnapshot = await db.collection("users").get();

    if (usersSnapshot.empty) {
      return {
        success: true,
        message: "No users found",
        usersUpdated: 0,
      };
    }

    // Set today at 11:15 AM Bratislava time (or use passed time)
    const targetHour = data?.hour || 11;
    const targetMinute = data?.minute || 15;

    const today = new Date();
    today.setHours(targetHour, targetMinute, 0, 0);

    console.log(`Setting nextUpdateDate for ${usersSnapshot.size} users to: ${today.toISOString()}`);

    const updatePromises = [];
    const updatedUsers = [];

    usersSnapshot.forEach((userDoc) => {
      const userData = userDoc.data();
      updatedUsers.push({
        id: userDoc.id,
        email: userData.email || "N/A",
      });

      updatePromises.push(
          db.collection("users").doc(userDoc.id).update({
            nextUpdateDate: today,
            priceUpdatesEnabled: true,
            updateHourOfDay: 11,
          }),
      );
    });

    await Promise.all(updatePromises);

    console.log(`✅ Updated ${usersSnapshot.size} users`);

    return {
      success: true,
      message: `Schedule updated for ${usersSnapshot.size} users`,
      usersUpdated: usersSnapshot.size,
      nextUpdateDate: today.toISOString(),
      users: updatedUsers,
    };
  } catch (error) {
    console.error("Error setting schedule:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Admin function: Get all users with their stats
 * Only accessible by admin role
 */
exports.getAllUsers = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User not logged in");
  }

  const userId = context.auth.uid;

  // Check if user is admin
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || userDoc.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can access this function");
  }

  console.log(`🔧 getAllUsers called by admin: ${userId}`);

  try {
    const usersSnapshot = await db.collection("users").get();
    const users = [];

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();

      // Get card count for this user
      const cardsSnapshot = await db.collection("cards")
          .where("userId", "==", userDoc.id)
          .where("status", "==", "zbierka")
          .get();

      users.push({
        id: userDoc.id,
        email: userData.email,
        displayName: userData.displayName,
        role: userData.role || "standard",
        cardLimit: userData.cardLimit,
        currentCardCount: cardsSnapshot.size,
        priceUpdatesEnabled: userData.priceUpdatesEnabled,
        updateIntervalDays: userData.updateIntervalDays,
        nextUpdateDate: userData.nextUpdateDate?.toDate?.().toISOString?.() || null,
        createdAt: userData.createdAt?.toDate?.().toISOString?.() || null,
      });
    }

    return {
      success: true,
      users: users,
    };
  } catch (error) {
    console.error("Error getting users:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Admin function: Update user role and limits
 * Only accessible by admin role
 */
exports.updateUserRole = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User not logged in");
  }

  const adminId = context.auth.uid;

  // Check if caller is admin
  const adminDoc = await db.collection("users").doc(adminId).get();
  if (!adminDoc.exists || adminDoc.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can update user roles");
  }

  const {targetUserId, newRole} = data;

  if (!targetUserId || !newRole) {
    throw new functions.https.HttpsError("invalid-argument", "Missing targetUserId or newRole");
  }

  if (!["admin", "premium", "standard"].includes(newRole)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid role. Must be: admin, premium, or standard");
  }

  console.log(`🔧 updateUserRole: ${adminId} changing ${targetUserId} to ${newRole}`);

  try {
    // Role-based configuration
    const roleConfig = {
      standard: {
        cardLimit: 20,
        updateIntervalDays: 0, // No automatic eBay updates
        updatesPerMonth: 0, // No eBay updates - manual price entry only
        ebayUpdatesEnabled: false,
      },
      premium: {
        cardLimit: 999999,
        updateIntervalDays: 15,
        updatesPerMonth: 2,
        ebayUpdatesEnabled: true,
      },
      admin: {
        cardLimit: 999999,
        updateIntervalDays: 15,
        updatesPerMonth: 2,
        ebayUpdatesEnabled: true,
      },
    };

    const config = roleConfig[newRole];

    await db.collection("users").doc(targetUserId).update({
      role: newRole,
      cardLimit: config.cardLimit,
      updateIntervalDays: config.updateIntervalDays,
      updatesPerMonth: config.updatesPerMonth,
      roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      roleUpdatedBy: adminId,
    });

    console.log(`✅ User ${targetUserId} role updated to ${newRole}`);

    return {
      success: true,
      message: `User role updated to ${newRole}`,
      userId: targetUserId,
      newRole: newRole,
      newLimits: config,
    };
  } catch (error) {
    console.error("Error updating user role:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Callable function: Update user's next update date (ADMIN ONLY)
 * Allows admin to manually set when a user's collection should be updated
 */
exports.updateNextUpdateDate = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User not logged in");
  }

  const adminId = context.auth.uid;

  // Check if caller is admin
  const adminDoc = await db.collection("users").doc(adminId).get();
  if (!adminDoc.exists || adminDoc.data().role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can update next update dates");
  }

  const {targetUserId, nextUpdateDate} = data;

  if (!targetUserId || !nextUpdateDate) {
    throw new functions.https.HttpsError("invalid-argument", "targetUserId and nextUpdateDate are required");
  }

  console.log(`🔧 Admin ${adminId} updating next update date for user ${targetUserId} to ${nextUpdateDate}`);

  try {
    // Update user's next update date
    await db.collection("users").doc(targetUserId).update({
      nextUpdateDate: admin.firestore.Timestamp.fromDate(new Date(nextUpdateDate)),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ User ${targetUserId} next update date updated to ${nextUpdateDate}`);

    return {
      success: true,
      message: "Next update date updated successfully",
      userId: targetUserId,
      nextUpdateDate: nextUpdateDate,
    };
  } catch (error) {
    console.error("Error updating next update date:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Firestore trigger: Check card limit when new card is created
 * Prevent creation if user exceeds their limit
 */
exports.onCardCreate = functions.firestore
    .document("cards/{cardId}")
    .onCreate(async (snap, context) => {
      const cardData = snap.data();
      const userId = cardData.userId;

      if (!userId) {
        console.log("Card created without userId, skipping limit check");
        return null;
      }

      try {
        // Get user data
        const userDoc = await db.collection("users").doc(userId).get();

        if (!userDoc.exists) {
          console.log(`User ${userId} not found`);
          return null;
        }

        const userData = userDoc.data();
        const cardLimit = userData.cardLimit || 20;

        // Count user's cards in collection
        const cardsSnapshot = await db.collection("cards")
            .where("userId", "==", userId)
            .where("status", "==", "zbierka")
            .get();

        const currentCount = cardsSnapshot.size;

        console.log(`User ${userId} has ${currentCount}/${cardLimit} cards`);

        // Update currentCardCount in user document
        await db.collection("users").doc(userId).update({
          currentCardCount: currentCount,
        });

        // If over limit, delete the card and notify
        if (currentCount > cardLimit) {
          console.log(`⚠️  User ${userId} exceeded limit! Deleting card ${context.params.cardId}`);

          await snap.ref.delete();

          // Create notification
          await db.collection("notifications").add({
            userId: userId,
            type: "limit_exceeded",
            title: "⚠️ Limit prekročený",
            message: `Dosiahli ste limit ${cardLimit} položiek. Prejdite na Premium pre neobmedzené položky.`,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            actionType: "upgrade_premium",
          });
        }

        return null;
      } catch (error) {
        console.error("Error checking card limit:", error);
        return null;
      }
    });

/**
 * Trigger when new user is created
 * Assign random update schedule
 */
/**
 * Helper function to find a free time slot for updates
 * Checks if there are already updates scheduled at the same time
 */
async function findFreeTimeSlot() {
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const dayOfMonth = Math.floor(Math.random() * 28) + 1; // 1-28
    const hour = Math.floor(Math.random() * 24); // 0-23

    // Calculate proposed update time
    const proposedUpdate = new Date();
    proposedUpdate.setDate(dayOfMonth);
    proposedUpdate.setHours(hour, 0, 0, 0);

    // If date already passed this month, move to next month
    if (proposedUpdate < new Date()) {
      proposedUpdate.setMonth(proposedUpdate.getMonth() + 1);
    }

    // Check if any user already has update at this exact hour
    const hourStart = new Date(proposedUpdate);
    hourStart.setMinutes(0, 0, 0);
    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const existingUpdates = await db.collection("users")
        .where("nextUpdateDate", ">=", hourStart)
        .where("nextUpdateDate", "<", hourEnd)
        .limit(1)
        .get();

    // If no collision, use this slot
    if (existingUpdates.empty) {
      return {dayOfMonth, hour, nextUpdate: proposedUpdate};
    }

    console.log(`⏭️  Time slot collision at day ${dayOfMonth}, hour ${hour} - trying another...`);
  }

  // If all attempts failed, just use the last generated time (unlikely with 24*28 slots)
  const dayOfMonth = Math.floor(Math.random() * 28) + 1;
  const hour = Math.floor(Math.random() * 24);
  const nextUpdate = new Date();
  nextUpdate.setDate(dayOfMonth);
  nextUpdate.setHours(hour, 0, 0, 0);
  if (nextUpdate < new Date()) {
    nextUpdate.setMonth(nextUpdate.getMonth() + 1);
  }

  return {dayOfMonth, hour, nextUpdate};
}

exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  console.log(`👤 New user created: ${user.uid}`);

  try {
    // Find a free time slot with collision detection
    const {dayOfMonth, hour, nextUpdate} = await findFreeTimeSlot();

    // Determine user role (default: standard)
    // Admin users must be set manually after creation
    const userRole = "standard";

    // Role-based configuration
    // Standard users: NO eBay price updates (manual entry only)
    // Premium/Admin: Automatic eBay price updates
    const roleConfig = {
      standard: {
        cardLimit: 20,
        updateIntervalDays: 0, // No automatic eBay updates
        updatesPerMonth: 0, // No eBay updates - manual price entry only
        ebayUpdatesEnabled: false,
      },
      premium: {
        cardLimit: 999999, // unlimited
        updateIntervalDays: 15, // 2x per month
        updatesPerMonth: 2,
        ebayUpdatesEnabled: true,
      },
      admin: {
        cardLimit: 999999, // unlimited
        updateIntervalDays: 15, // 2x per month
        updatesPerMonth: 2,
        ebayUpdatesEnabled: true,
      },
    };

    const config = roleConfig[userRole];

    // Create user document
    await db.collection("users").doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,

      // User role and subscription
      role: userRole, // 'admin', 'premium', 'standard'
      subscriptionStatus: "active",
      subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),

      // Price update settings (eBay)
      // Standard users have this disabled - they can only manually enter prices
      priceUpdatesEnabled: config.ebayUpdatesEnabled,
      ebayUpdatesEnabled: config.ebayUpdatesEnabled,
      updateDayOfMonth: config.ebayUpdatesEnabled ? dayOfMonth : null,
      updateHourOfDay: config.ebayUpdatesEnabled ? hour : null,
      nextUpdateDate: config.ebayUpdatesEnabled ? nextUpdate : null,
      updateIntervalDays: config.updateIntervalDays,
      updatesPerMonth: config.updatesPerMonth,

      // Limits based on role
      cardLimit: config.cardLimit,
      currentCardCount: 0,

      // Notifications
      emailNotifications: false,
      inAppNotifications: true,

      // Timestamps
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ User ${user.uid} initialized with schedule: Day ${dayOfMonth}, Hour ${hour}`);
  } catch (error) {
    console.error("Error creating user document:", error);
    // Don't throw - user can still use the app
  }
});
