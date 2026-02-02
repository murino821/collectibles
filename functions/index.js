/**
 * Firebase Cloud Functions for NHL Cards Collection
 * Automatic price updates using eBay Browse API
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onUserCreated} = require("firebase-functions/v2/auth");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();
const {searchEbayCard, calculateEstimatedPrice, enhanceQuery} = require("./ebayAPI");
const {globalLimiter} = require("./rateLimiter");

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

// =========================================================
// V2 FUNCTIONS (parallel to v1, for Node 22 migration)
// =========================================================

exports.checkScheduledUpdatesV2 = onSchedule(
    {schedule: "0 * * * *", timeZone: "Europe/Bratislava"},
    async () => {
      console.log("🕐 Starting scheduled price updates check (v2)...");

      const now = new Date();
      const currentHourStart = new Date(now);
      currentHourStart.setMinutes(0, 0, 0);

      const nextHourStart = new Date(currentHourStart);
      nextHourStart.setHours(nextHourStart.getHours() + 1);

      try {
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

        for (const userDoc of usersSnapshot.docs) {
          const userId = userDoc.id;
          const userData = userDoc.data();

          console.log(`👤 Processing user: ${userId} (scheduled for ${userData.updateHourOfDay}:00)`);

          try {
            await updateUserCollection(userId);

            const intervalDays = userData.updateIntervalDays || 30;
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

            await db.collection("updateLogs").add({
              userId,
              status: "failed",
              error: error.message,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        console.log("🎉 Scheduled updates completed (v2)");
        return null;
      } catch (error) {
        console.error("💥 Fatal error in checkScheduledUpdates (v2):", error);
        throw error;
      }
    },
);

exports.updateUserCollectionV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const callerId = request.auth.uid;
  const targetUserId = request.data?.userId || callerId;

  const callerDoc = await db.collection("users").doc(callerId).get();
  const callerData = callerDoc.data();
  const callerRole = callerData?.role || "standard";
  const isAdmin = callerRole === "admin";
  const isPremiumOrAdmin = callerRole === "premium" || callerRole === "admin";

  if (!isPremiumOrAdmin) {
    throw new HttpsError(
        "permission-denied",
        "eBay price updates are only available for Premium and Admin users. Standard users can manually edit prices in card details.",
    );
  }

  if (!isAdmin && targetUserId !== callerId) {
    throw new HttpsError("permission-denied", "Only admins can update other users' collections");
  }

  console.log(`🔧 Manual update triggered by ${callerId} for user: ${targetUserId}${isAdmin ? " (ADMIN)" : " (PREMIUM)"}`);

  if (!isAdmin) {
    const userDoc = await db.collection("users").doc(targetUserId).get();
    const userData = userDoc.data();
    const lastManualUpdate = userData?.lastManualUpdate;

    if (lastManualUpdate) {
      const hoursSinceLastUpdate = (Date.now() - lastManualUpdate.toMillis()) / (1000 * 60 * 60);
      if (hoursSinceLastUpdate < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceLastUpdate);
        throw new HttpsError(
            "resource-exhausted",
            `Manual update allowed only once per 24 hours. Try again in ${hoursRemaining} hours.`,
        );
      }
    }
  }

  try {
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

    await db.collection("users").doc(targetUserId).update({
      lastManualUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });

    updateUserCollection(targetUserId)
        .then(async (result) => {
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
          console.error("Background update error:", error);
          await statusRef.update({
            status: "error",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message || "Unknown error",
          });
        });

    return {
      success: true,
      message: "Update started in background. Check status for progress.",
      statusDocId: targetUserId,
    };
  } catch (error) {
    console.error("Manual update error:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.setScheduleForAllUsersV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  console.log(`🔧 setScheduleForAllUsers called by: ${request.auth.uid}`);

  try {
    const usersSnapshot = await db.collection("users").get();

    if (usersSnapshot.empty) {
      return {
        success: true,
        message: "No users found",
        usersUpdated: 0,
      };
    }

    const targetHour = request.data?.hour || 11;
    const targetMinute = request.data?.minute || 15;

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
    throw new HttpsError("internal", error.message);
  }
});

exports.getAllUsersV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const userId = request.auth.uid;

  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || userDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can access this function");
  }

  console.log(`🔧 getAllUsers called by admin: ${userId}`);

  try {
    const usersSnapshot = await db.collection("users").get();
    const users = [];

    for (const docSnap of usersSnapshot.docs) {
      const userData = docSnap.data();

      const cardsSnapshot = await db.collection("cards")
          .where("userId", "==", docSnap.id)
          .where("status", "==", "zbierka")
          .get();

      users.push({
        id: docSnap.id,
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

    return {success: true, users};
  } catch (error) {
    console.error("Error getting users:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.updateUserRoleV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const adminId = request.auth.uid;

  const adminDoc = await db.collection("users").doc(adminId).get();
  if (!adminDoc.exists || adminDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can update user roles");
  }

  const {targetUserId, newRole} = request.data || {};

  if (!targetUserId || !newRole) {
    throw new HttpsError("invalid-argument", "Missing targetUserId or newRole");
  }

  if (!["admin", "premium", "standard"].includes(newRole)) {
    throw new HttpsError("invalid-argument", "Invalid role. Must be: admin, premium, or standard");
  }

  console.log(`🔧 updateUserRole: ${adminId} changing ${targetUserId} to ${newRole}`);

  try {
    const roleConfig = {
      standard: {cardLimit: 20, updateIntervalDays: 0, updatesPerMonth: 0, ebayUpdatesEnabled: false},
      premium: {cardLimit: 999999, updateIntervalDays: 15, updatesPerMonth: 2, ebayUpdatesEnabled: true},
      admin: {cardLimit: 999999, updateIntervalDays: 15, updatesPerMonth: 2, ebayUpdatesEnabled: true},
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
    throw new HttpsError("internal", error.message);
  }
});

exports.updateNextUpdateDateV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const adminId = request.auth.uid;

  const adminDoc = await db.collection("users").doc(adminId).get();
  if (!adminDoc.exists || adminDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can update next update dates");
  }

  const {targetUserId, nextUpdateDate} = request.data || {};

  if (!targetUserId || !nextUpdateDate) {
    throw new HttpsError("invalid-argument", "targetUserId and nextUpdateDate are required");
  }

  console.log(`🔧 Admin ${adminId} updating next update date for user ${targetUserId} to ${nextUpdateDate}`);

  try {
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
    throw new HttpsError("internal", error.message);
  }
});

exports.onCardCreateV2 = onDocumentCreated("cards/{cardId}", async (event) => {
  const snap = event.data;
  if (!snap) return null;
  const cardData = snap.data();
  const userId = cardData.userId;

  if (!userId) {
    console.log("Card created without userId, skipping limit check");
    return null;
  }

  try {
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      console.log(`User ${userId} not found`);
      return null;
    }

    const userData = userDoc.data();
    const cardLimit = userData.cardLimit || 20;

    const cardsSnapshot = await db.collection("cards")
        .where("userId", "==", userId)
        .where("status", "==", "zbierka")
        .get();

    const currentCount = cardsSnapshot.size;

    console.log(`User ${userId} has ${currentCount}/${cardLimit} cards`);

    await db.collection("users").doc(userId).update({
      currentCardCount: currentCount,
    });

    if (currentCount > cardLimit) {
      console.log(`⚠️  User ${userId} exceeded limit! Deleting card ${event.params.cardId}`);

      await snap.ref.delete();

      await db.collection("notifications").add({
        userId: userId,
        type: "limit_exceeded",
        title: "⚠️ Limit prekročený",
        message: `Dosiahli ste limit ${cardLimit} položiek. Prejdite na Premium pre neobmedzené položky.`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        actionType: "upgrade_premium",
      });
    }

    return null;
  } catch (error) {
    console.error("Error checking card limit:", error);
    return null;
  }
});

exports.onUserCreateV2 = onUserCreated(async (event) => {
  const user = event.data;
  if (!user) return;
  console.log(`👤 New user created: ${user.uid} (v2)`);

  try {
    const {dayOfMonth, hour, nextUpdate} = await findFreeTimeSlot();

    const userRole = "standard";

    const roleConfig = {
      standard: {
        cardLimit: 20,
        updateIntervalDays: 0,
        updatesPerMonth: 0,
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

    const config = roleConfig[userRole];

    await db.collection("users").doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: userRole,
      subscriptionStatus: "active",
      subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),
      priceUpdatesEnabled: config.ebayUpdatesEnabled,
      ebayUpdatesEnabled: config.ebayUpdatesEnabled,
      updateDayOfMonth: config.ebayUpdatesEnabled ? dayOfMonth : null,
      updateHourOfDay: config.ebayUpdatesEnabled ? hour : null,
      nextUpdateDate: config.ebayUpdatesEnabled ? nextUpdate : null,
      updateIntervalDays: config.updateIntervalDays,
      updatesPerMonth: config.updatesPerMonth,
      cardLimit: config.cardLimit,
      currentCardCount: 0,
      emailNotifications: false,
      inAppNotifications: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ User ${user.uid} initialized with schedule: Day ${dayOfMonth}, Hour ${hour} (v2)`);
  } catch (error) {
    console.error("Error creating user document (v2):", error);
  }
});
