/**
 * Firebase Cloud Functions for NHL Cards Collection
 * Automatic price updates using eBay Browse API
 */
// Deploy bump: 2026-02-02

const functions = require("firebase-functions/v1");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");
admin.initializeApp();

const db = admin.firestore();
const {
  searchEbayCardWithDebug,
  searchEbayCardByImageWithDebug,
  calculateEstimatedPriceDetailed,
} = require("./ebayAPI");
const {globalLimiter, DAILY_BUDGET} = require("./rateLimiter");

const ECB_BASE_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D.{CURRENCY}.EUR.SP00.A?format=jsondata";

const ADMIN_ALLOWLIST = ["miroslav.svajda@gmail.com"];
const isTestProject = () => {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
  return projectId.endsWith("-test") || projectId.includes("your-card-collection-2026-test");
};
const isAllowlistedAdmin = (request) => {
  if (!request?.auth) return false;
  const email = request.auth.token?.email || "";
  return isTestProject() && ADMIN_ALLOWLIST.includes(email);
};

async function getLatestExchangeRates() {
  try {
    const snap = await db.collection("exchangeRates").doc("latest").get();
    if (!snap.exists) return null;
    return snap.data()?.rates || null;
  } catch (error) {
    console.error("Error loading exchange rates:", error);
    return null;
  }
}

function parseEcbSeries(json) {
  const series = json?.dataSets?.[0]?.series;
  if (!series) return null;
  const seriesKey = Object.keys(series)[0];
  if (!seriesKey) return null;
  const observations = series[seriesKey]?.observations;
  if (!observations) return null;
  const keys = Object.keys(observations);
  if (!keys.length) return null;
  const lastKey = keys.sort((a, b) => Number(a) - Number(b)).pop();
  const value = observations[lastKey]?.[0];
  const dates = json?.structure?.dimensions?.observation?.[0]?.values || [];
  const asOf = dates[Number(lastKey)]?.id || null;
  if (typeof value !== "number") return null;
  return {value, asOf};
}

async function fetchEcbRate(currency) {
  const url = ECB_BASE_URL.replace("{CURRENCY}", currency);
  const response = await fetch(url, {headers: {Accept: "application/json"}});
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ECB fetch failed for ${currency}: ${response.status} ${text}`);
  }
  const json = await response.json();
  return parseEcbSeries(json);
}

/**
 * Update all cards for a specific user
 * @param {string} userId - Firebase user ID
 * @return {Object} Update results
 */
async function updateUserCollection(userId, options = {}) {
  const updateStartTime = Date.now();
  console.log(`🔄 Starting collection update for user: ${userId}`);

  const fxRates = await getLatestExchangeRates();
  const userSnap = await db.collection("users").doc(userId).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const pricingMode = userData?.pricingMode || "text";
  const usingImageMode = pricingMode === "image";
  const usingTextMode = pricingMode === "text";
  const usingHybridMode = pricingMode === "hybrid";
  const triggerType = options.triggerType || "scheduled";
  console.log(`🧭 Pricing mode for user ${userId}: ${pricingMode}`);

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

  // Capture portfolio value BEFORE updating prices
  let oldTotalValue = 0;
  cards.forEach((doc) => {
    const card = doc.data();
    const qty = card.quantity || 1;
    oldTotalValue += (card.current || 0) * qty;
  });

  // Update status document with total count
  const statusRef = db.collection("updateStatus").doc(userId);
  await statusRef.update({
    total: cards.length,
    cardsProcessed: cards.length,
  }).catch(() => {
    console.log("Status document not found - skipping status updates");
  });

  let successCount = 0;
  let failCount = 0;
  let apiCallsUsed = 0;
  let cacheHits = 0;
  const errors = [];
  const debugSamples = [];
  const DEBUG_SAMPLE_LIMIT = 20;
  const duplicateQueryWarnings = [];

  // Query-level cache: reuse results for identical text queries within this run
  const textQueryCache = new Map();
  const textQueryCardCount = new Map();

  // Batch processing — parallel within batches
  const BATCH_SIZE = 5;
  const BATCH_PAUSE_MS = 2000; // 2s between batches

  /**
   * Process a single card — extracted to enable parallel execution
   */
  async function processCard(cardDoc) {
    const cardStartTime = Date.now();
    const card = cardDoc.data();
    const cardId = cardDoc.id;

    const debugEntry = {
      cardId,
      cardName: card.item,
      mode: pricingMode,
      input: {},
      search: null,
      pricing: null,
      topResults: [],
      outcome: null,
      error: null,
      warnings: [],
      durationMs: 0,
    };

    try {
      // Skip cards with manual pricing (autoUpdate disabled)
      if (card.autoUpdate === false) {
        debugEntry.outcome = "manual-override";
        debugEntry.durationMs = Date.now() - cardStartTime;
        return {debugEntry, success: true, error: null};
      }

      let results = [];
      let textResponse = null;
      let imageResponse = null;
      const imageUrl = typeof card.imageUrl === "string" ? card.imageUrl.trim() : "";
      const categoryId = card.ebayCategory || null;

      if (usingTextMode || usingHybridMode) {
        try {
          debugEntry.input.name = card.item;
          const cacheKey = (card.item || "").toLowerCase().trim() + (categoryId ? `|cat:${categoryId}` : "");

          if (textQueryCache.has(cacheKey)) {
            console.log(`🔍 Text search (cached): ${card.item}`);
            textResponse = textQueryCache.get(cacheKey);
            textQueryCardCount.set(cacheKey, (textQueryCardCount.get(cacheKey) || 1) + 1);
            debugEntry.warnings.push("Text results reused from cache — consider adding year/edition to card name for unique pricing");
            cacheHits++;
          } else {
            console.log(`🔍 Text search: ${card.item}`);
            textResponse = await searchEbayCardWithDebug(card.item, fxRates, {categoryId});
            apiCallsUsed += textResponse?.debug?.apiCalls || 0;
            textQueryCache.set(cacheKey, textResponse);
            textQueryCardCount.set(cacheKey, 1);
          }
        } catch (error) {
          if (usingTextMode && !usingHybridMode) {
            throw error;
          }
          debugEntry.warnings.push(`Text search failed: ${error.message}`);
        }
      }

      if (usingImageMode || usingHybridMode) {
        debugEntry.input.imageUrl = imageUrl || null;
        if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
          if (usingImageMode && !usingHybridMode) {
            console.log(`  ⚠ ${card.item}: Missing image for image-based pricing`);
            debugEntry.outcome = "missing-image";
            debugEntry.durationMs = Date.now() - cardStartTime;
            return {debugEntry, success: false, error: "Missing image for image-based pricing"};
          }
          debugEntry.warnings.push("Missing image for image-based pricing");
        } else {
          try {
            console.log(`🖼️  Image search: ${card.item}`);
            imageResponse = await searchEbayCardByImageWithDebug(imageUrl, card.item, fxRates, {categoryId});
            apiCallsUsed += imageResponse?.debug?.apiCalls || 0;
          } catch (error) {
            if (usingImageMode && !usingHybridMode) {
              throw error;
            }
            debugEntry.warnings.push(`Image search failed: ${error.message}`);
          }
        }
      }

      if (usingHybridMode) {
        const textResults = textResponse?.results || [];
        const imageResults = imageResponse?.results || [];
        const merged = new Map();
        const addResult = (item, source) => {
          const key = item.id || `${item.title}-${item.price}`;
          const existing = merged.get(key);
          if (!existing) {
            merged.set(key, {...item, sources: [source]});
            return;
          }
          existing.sources = Array.from(new Set([...(existing.sources || []), source]));
          const score = typeof item.matchScore === "number" ? item.matchScore : null;
          if (score != null) {
            const prev = typeof existing.matchScore === "number" ? existing.matchScore : null;
            if (prev == null || score > prev) {
              existing.matchScore = score;
            }
          }
        };

        textResults.forEach((item) => addResult(item, "text"));
        imageResults.forEach((item) => addResult(item, "image"));
        results = Array.from(merged.values());

        // Image-priority: image search identifies the exact card visually,
        // so when image and text results diverge in price, trust image more.
        if (imageResults.length > 0) {
          const imagePrices = imageResults.map((r) => r.price).sort((a, b) => a - b);
          const textPrices = textResults.map((r) => r.price).sort((a, b) => a - b);
          const imageMedianPrice = imagePrices[Math.floor(imagePrices.length / 2)] || null;
          const textMedianPrice = textPrices.length
            ? textPrices[Math.floor(textPrices.length / 2)]
            : null;

          const priceDivergence = imageMedianPrice && textMedianPrice
            ? Math.max(imageMedianPrice, textMedianPrice) / Math.min(imageMedianPrice, textMedianPrice)
            : 1;

          if (priceDivergence > 10) {
            // Extreme divergence (e.g., image=€42 vs text=€0.93 for Valábik The Cup)
            // Text results are matching wrong card variant — use image only
            results = results.filter((item) => item.sources?.includes("image"));
            debugEntry.warnings.push(`Image-priority: text excluded (divergence ${priceDivergence.toFixed(1)}x)`);
          } else if (priceDivergence > 3) {
            // High divergence — heavily penalize text-only, boost image
            results.forEach((item) => {
              const hasImage = item.sources?.includes("image");
              const hasText = item.sources?.includes("text");
              if (hasImage) {
                item.matchScore = Math.min((item.matchScore || 0.5) * 1.5, 1.0);
              } else if (hasText && !hasImage) {
                item.matchScore = (item.matchScore || 0.5) * 0.15;
              }
            });
            debugEntry.warnings.push(`Image-priority: text penalized (divergence ${priceDivergence.toFixed(1)}x)`);
          } else {
            // Low divergence — just boost image items slightly
            results.forEach((item) => {
              if (item.sources?.includes("image")) {
                item.matchScore = Math.min((item.matchScore || 0.5) * 1.5, 1.0);
              }
            });
          }
        }

        debugEntry.search = {
          text: textResponse?.debug || null,
          image: imageResponse?.debug || null,
          combinedCount: results.length,
        };
      } else if (usingImageMode) {
        results = imageResponse?.results || [];
        debugEntry.search = imageResponse?.debug || null;
      } else {
        results = textResponse?.results || [];
        debugEntry.search = textResponse?.debug || null;
      }

      debugEntry.apiCalls = (textResponse?.debug?.apiCalls || 0) + (imageResponse?.debug?.apiCalls || 0);

      debugEntry.topResults = results.slice(0, 3).map((item) => ({
        title: item.title,
        price: item.price,
        matchScore: typeof item.matchScore === "number" ? Number(item.matchScore.toFixed(3)) : null,
        isAuctionOnly: !!item.isAuctionOnly,
        bidCount: item.bidCount || 0,
        sources: item.sources || null,
      }));

      // In hybrid mode, also log image-only results separately for debugging
      if (usingHybridMode) {
        const imageOnlyResults = results
            .filter((item) => item.sources?.includes("image"))
            .slice(0, 5);
        if (imageOnlyResults.length > 0) {
          debugEntry.imageTopResults = imageOnlyResults.map((item) => ({
            title: item.title,
            price: item.price,
            matchScore: typeof item.matchScore === "number" ? Number(item.matchScore.toFixed(3)) : null,
            sources: item.sources,
          }));
        }
      }

      if (results.length > 0) {
        const priceInfo = calculateEstimatedPriceDetailed(results);
        const estimatedPrice = priceInfo?.price || null;
        const priceConfidence = priceInfo?.confidence || null;
        debugEntry.pricing = priceInfo?.debug || null;
        debugEntry.estimatedPrice = estimatedPrice;

        if (estimatedPrice) {
          const previousPrice = parseFloat(card.current) || 0;
          const priceRatio = previousPrice > 0 ? estimatedPrice / previousPrice : 1;

          // Price drop protection
          if (previousPrice > 0 && priceRatio < 0.2) {
            console.log(`  ⚠ ${card.item}: Price drop blocked (€${previousPrice} → €${estimatedPrice}, ${(priceRatio * 100).toFixed(0)}%)`);
            debugEntry.outcome = "price-drop-blocked";
            debugEntry.warnings.push(`Price drop ${(priceRatio * 100).toFixed(0)}% blocked (${previousPrice} → ${estimatedPrice})`);
            debugEntry.durationMs = Date.now() - cardStartTime;
            return {debugEntry, success: false, error: `Price drop blocked: €${previousPrice} → €${estimatedPrice}`};
          }

          // Build update data
          const priceHistoryEntry = {
            date: new Date(),
            price: estimatedPrice,
            source: "ebay",
          };

          const updateData = {
            current: estimatedPrice,
            lastPriceUpdate: admin.firestore.FieldValue.serverTimestamp(),
            priceSource: "ebay",
            ebayPriceSource: true,
            ebaySearchMode: pricingMode,
            priceHistory: admin.firestore.FieldValue.arrayUnion(priceHistoryEntry),
          };

          if (priceConfidence != null) {
            updateData.priceConfidence = priceConfidence;
          }

          // Price drop alert (50-80% drop) or spike alert (>300% rise)
          if (previousPrice > 0 && priceRatio < 0.5) {
            updateData.priceDropAlert = true;
            updateData.priceDropPct = parseFloat(((1 - priceRatio) * 100).toFixed(1));
            console.log(`  ⚠ ${card.item}: Price drop alert (${((1 - priceRatio) * 100).toFixed(0)}%)`);
          } else if (previousPrice > 0 && priceRatio > 3.0) {
            updateData.priceSpikeAlert = true;
            updateData.priceSpikePct = parseFloat(((priceRatio - 1) * 100).toFixed(1));
            console.log(`  ⚠ ${card.item}: Price spike alert (${((priceRatio - 1) * 100).toFixed(0)}%)`);
          } else {
            updateData.priceDropAlert = false;
            updateData.priceSpikeAlert = false;
          }

          await cardDoc.ref.update(updateData);

          const cardDuration = Date.now() - cardStartTime;
          console.log(`  ✓ ${card.item}: €${estimatedPrice} (confidence: ${priceConfidence}%) [${(cardDuration / 1000).toFixed(1)}s]`);
          debugEntry.outcome = "updated";
          debugEntry.durationMs = cardDuration;
          return {debugEntry, success: true};
        } else {
          debugEntry.outcome = "no-price";
          debugEntry.durationMs = Date.now() - cardStartTime;
          return {debugEntry, success: false, error: "Cannot calculate price"};
        }
      } else {
        console.log(`  ✗ ${card.item}: No eBay results`);
        debugEntry.outcome = "no-results";
        debugEntry.durationMs = Date.now() - cardStartTime;
        return {debugEntry, success: false, error: "No eBay results"};
      }
    } catch (error) {
      console.error(`  ❌ Error updating card ${cardId}:`, error.message);
      debugEntry.outcome = "error";
      debugEntry.error = error.message;
      debugEntry.durationMs = Date.now() - cardStartTime;

      // If rate limit error, add extra pause
      if (error.message.includes("Rate limit") || error.message.includes("429")) {
        console.log("  ⏸️  Rate limit detected, pausing 60s...");
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }

      return {debugEntry, success: false, error: error.message};
    }
  }

  // Main processing loop — try/finally ensures log is always saved
  try {
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, Math.min(i + BATCH_SIZE, cards.length));

      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(cards.length / BATCH_SIZE);
      const batchStartTime = Date.now();
      console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} cards)`);

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

      // Process cards in parallel within batch
      const batchResults = await Promise.all(batch.map((cardDoc) => processCard(cardDoc)));

      for (const result of batchResults) {
        if (result.success) {
          successCount++;
        } else {
          failCount++;
          if (result.error) {
            errors.push({
              cardId: result.debugEntry.cardId,
              cardName: result.debugEntry.cardName,
              error: result.error,
            });
          }
        }
        if (debugSamples.length < DEBUG_SAMPLE_LIMIT) {
          debugSamples.push(result.debugEntry);
        }
      }

      // Update progress after each batch
      await statusRef.update({
        successCount,
        failCount,
        progress: successCount + failCount,
      }).catch(() => {});

      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      const elapsed = ((Date.now() - updateStartTime) / 1000).toFixed(0);
      console.log(`  ⏱️  Batch ${batchNum} done in ${batchDuration}s (total: ${elapsed}s, ${successCount + failCount}/${cards.length} cards)`);

      // Pause between batches
      if (i + BATCH_SIZE < cards.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
      }
    }
  } finally {
    // Always save update log, even if processing was interrupted
    const totalDurationMs = Date.now() - updateStartTime;
    const totalDurationS = (totalDurationMs / 1000).toFixed(1);

    // Collect duplicate query warnings
    for (const [query, count] of textQueryCardCount.entries()) {
      if (count > 1) {
        duplicateQueryWarnings.push({query, cardCount: count});
        console.log(`⚠️  ${count} cards share identical query "${query}" — add year/edition for unique pricing`);
      }
    }

    const logData = {
      userId,
      userEmail: userData?.email || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      totalCards: cards.length,
      successCount,
      failCount,
      errors: errors.slice(0, 10),
      apiCallsUsed,
      cacheHits,
      status: failCount === 0 ? "success" : (successCount > 0 ? "partial" : "failed"),
      triggerType,
      pricingMode,
      durationMs: totalDurationMs,
      debugSamples,
      duplicateQueryWarnings: duplicateQueryWarnings.length ? duplicateQueryWarnings : null,
    };

    const logRef = await db.collection("updateLogs").add(logData);

    await createUserNotification(userId, {
      id: logRef.id,
      totalCards: cards.length,
      successCount,
      failCount,
      oldTotalValue,
    });

    console.log(`✅ Update complete for ${userId}: ${successCount}/${cards.length} success, ${failCount} failed, ${apiCallsUsed} API calls, ${cacheHits} cache hits, ${totalDurationS}s`);
  }

  return {
    success: true,
    cardsProcessed: cards.length,
    successCount,
    failCount,
    apiCallsUsed,
  };
}

/**
 * Send email notification after collection update
 * @param {string} userEmail - User's email address
 * @param {Object} data - Update summary data
 */
async function sendUpdateEmail(userEmail, data) {
  if (!userEmail) return;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    console.log("📧 Email not configured — skipping");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {user: gmailUser, pass: gmailPass},
  });

  const change = data.newValue - data.oldValue;
  const changePercent = data.oldValue > 0 ?
    ((change / data.oldValue) * 100).toFixed(1) : "0.0";
  const changeSign = change >= 0 ? "+" : "";
  const changeColor = change >= 0 ? "#10b981" : "#ef4444";
  const successRate = data.totalCards > 0 ?
    Math.round((data.successCount / data.totalCards) * 100) : 0;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 20px; color: white;">Assetide</h1>
        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">Aktualizácia zbierky dokončená</p>
      </div>
      <div style="padding: 24px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #94a3b8;">Aktualizované karty</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${data.successCount} / ${data.totalCards} (${successRate}%)</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94a3b8;">Pôvodná hodnota</td>
            <td style="padding: 8px 0; text-align: right;">&euro;${data.oldValue.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94a3b8;">Nová hodnota</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 18px;">&euro;${data.newValue.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94a3b8;">Zmena</td>
            <td style="padding: 8px 0; text-align: right; color: ${changeColor}; font-weight: bold;">${changeSign}&euro;${Math.abs(change).toFixed(2)} (${changeSign}${changePercent}%)</td>
          </tr>
        </table>
        <div style="text-align: center; margin-top: 24px;">
          <a href="https://assetide.com" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">Otvoriť Assetide</a>
        </div>
      </div>
      <div style="padding: 16px 24px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #1e293b;">
        Assetide &mdash; Správa zbierky a sledovanie hodnoty
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Assetide" <${gmailUser}>`,
    to: userEmail,
    subject: `Zbierka aktualizovaná — ${changeSign}€${Math.abs(change).toFixed(2)} (${changeSign}${changePercent}%)`,
    html,
  });
  console.log(`📧 Email sent to ${userEmail}`);
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
      const qty = card.quantity || 1;
      totalValue += (card.current || 0) * qty;
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

    // Send email notification
    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    if (userData.emailNotifications !== false && userData.email) {
      await sendUpdateEmail(userData.email, {
        successCount: logData.successCount,
        failCount: logData.failCount,
        totalCards: logData.totalCards,
        oldValue: logData.oldTotalValue || 0,
        newValue: totalValue,
      }).catch((err) => console.error("Email send error:", err));
    }
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

exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  console.log(`👤 New user created: ${user.uid}`);

  try {
    // Find a free time slot with collision detection
    const {dayOfMonth, hour, nextUpdate} = await findFreeTimeSlot();

    // Determine user role (default: standard)
    // Admin users must be set manually after creation
    const userRole = "standard";

    // Role-based configuration
    // Standard users: eBay price updates 1x per month + on card creation
    // Premium/Admin: eBay price updates every 15 days + on card creation
    const roleConfig = {
      standard: {
        cardLimit: 100,
        updateIntervalDays: 30, // 1x per month
        updatesPerMonth: 1,
        ebayUpdatesEnabled: true,
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
      emailNotifications: true,
      inAppNotifications: true,

      // Currency preferences
      currency: "EUR",
      pricingMode: "text",

      // Timestamps
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ User ${user.uid} initialized with schedule: Day ${dayOfMonth}, Hour ${hour}`);

    // Notify all admins about new user registration
    try {
      const adminsSnapshot = await db.collection("users").where("role", "==", "admin").get();
      const batch = db.batch();
      adminsSnapshot.forEach((adminDoc) => {
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          userId: adminDoc.id,
          type: "new_user",
          title: "Nový používateľ",
          message: `Zaregistroval sa ${user.displayName || user.email || "neznámy používateľ"} (${user.email || "bez emailu"})`,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          actionType: "new_user",
          actionData: {
            uid: user.uid,
            email: user.email || null,
            displayName: user.displayName || null,
          },
        });
      });
      if (!adminsSnapshot.empty) {
        await batch.commit();
        console.log(`📬 Notified ${adminsSnapshot.size} admin(s) about new user ${user.uid}`);
      }
    } catch (notifError) {
      console.error("Error notifying admins about new user:", notifError.message);
    }
  } catch (error) {
    console.error("Error creating user document:", error);
    // Don't throw - user can still use the app
  }
});

async function refreshExchangeRatesAndStats() {
  console.log("💱 Refreshing ECB exchange rates...");

  const [usd, czk] = await Promise.all([
    fetchEcbRate("USD"),
    fetchEcbRate("CZK"),
  ]);

  if (!usd?.value || !czk?.value) {
    throw new Error("Missing ECB rate values");
  }

  const rates = {
    EUR: 1,
    USD: usd.value,
    CZK: czk.value,
  };

  const asOf = usd.asOf || czk.asOf || null;

  await db.collection("exchangeRates").doc("latest").set({
    base: "EUR",
    rates,
    asOf,
    source: "ECB",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});

  // Update global stats (total value in EUR)
  const cardsSnapshot = await db.collection("cards")
      .where("status", "==", "zbierka")
      .get();

  let totalValueEur = 0;
  let totalItems = 0;
  cardsSnapshot.forEach((doc) => {
    const card = doc.data();
    const qty = card.quantity || 1;
    totalItems += qty;
    totalValueEur += (card.current || 0) * qty;
  });

  await db.collection("stats").doc("global").set({
    totalCollectionValueEur: parseFloat(totalValueEur.toFixed(2)),
    totalItems,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "cards",
    asOf,
  }, {merge: true});

  console.log("✅ ECB rates updated");
  return {rates, asOf, totalValueEur, totalItems};
}

exports.refreshExchangeRatesV2 = onSchedule(
    {schedule: "10 6 * * *", timeZone: "Europe/Bratislava"},
    async () => {
      try {
        await refreshExchangeRatesAndStats();
        return null;
      } catch (error) {
        console.error("💥 ECB refresh failed:", error);
        throw error;
      }
    },
);

exports.refreshExchangeRatesNowV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const userId = request.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();
  if (!isAllowlistedAdmin(request) && (!userDoc.exists || userDoc.data().role !== "admin")) {
    throw new HttpsError("permission-denied", "Only admins can refresh exchange rates");
  }

  try {
    const result = await refreshExchangeRatesAndStats();
    return {success: true, ...result};
  } catch (error) {
    console.error("Manual ECB refresh failed:", error);
    throw new HttpsError("internal", error.message || "ECB refresh failed");
  }
});

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
            await updateUserCollection(userId, {triggerType: "scheduled"});

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
              userEmail: userData?.email || null,
              pricingMode: userData?.pricingMode || "text",
              triggerType: "scheduled",
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

exports.cleanupUpdateLogsV2 = onSchedule(
    {schedule: "30 4 * * *", timeZone: "Europe/Bratislava"},
    async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      const cutoff = admin.firestore.Timestamp.fromDate(cutoffDate);

      console.log(`🧹 Cleaning updateLogs older than ${cutoffDate.toISOString()}`);

      const batchSize = 250;
      let totalDeleted = 0;

      while (true) {
        const snapshot = await db.collection("updateLogs")
            .where("timestamp", "<", cutoff)
            .orderBy("timestamp", "asc")
            .limit(batchSize)
            .get();

        if (snapshot.empty) break;

        const batch = db.batch();
        snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();

        totalDeleted += snapshot.size;
        console.log(`🗑️ Deleted ${snapshot.size} updateLogs (total ${totalDeleted})`);

        if (snapshot.size < batchSize) break;
      }

      return null;
    },
);

exports.updateUserCollectionV2 = onCall(
    {timeoutSeconds: 3600, memory: "1GiB", cpu: 1},
    async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const callerId = request.auth.uid;
  const targetUserId = request.data?.userId || callerId;

  const callerDoc = await db.collection("users").doc(callerId).get();
  const callerData = callerDoc.data();
  const callerRole = callerData?.role || "standard";
  const isAdmin = isAllowlistedAdmin(request) || callerRole === "admin";
  const isPremiumOrAdmin = isAllowlistedAdmin(request) || callerRole === "premium" || callerRole === "admin";

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

    // Await keeps the Cloud Run instance alive for the full timeoutSeconds: 3600
    // Client may get deadline-exceeded on their side, but that's OK —
    // admin panel tracks progress via onSnapshot on updateStatus doc
    let result;
    try {
      result = await updateUserCollection(targetUserId, {triggerType: "manual"});
      await statusRef.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        successCount: result.successCount || 0,
        failCount: result.failCount || 0,
        cardsProcessed: result.cardsProcessed || 0,
        apiCallsUsed: result.apiCallsUsed || 0,
      });
      console.log(`✅ Update completed for user ${targetUserId}`);
    } catch (updateError) {
      console.error("Update error:", updateError);
      await statusRef.update({
        status: "error",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: updateError.message || "Unknown error",
      });
    }

    return {
      success: true,
      message: result
        ? `Update completed: ${result.successCount} success, ${result.failCount} failed`
        : "Update finished with errors. Check logs.",
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
  if (!isAllowlistedAdmin(request) && (!userDoc.exists || userDoc.data().role !== "admin")) {
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

      const role = userData.role || "standard";
      const defaultLimit = role === "standard" ? 20 : 999999;
      const defaultInterval = role === "standard" ? 0 : 15;

      users.push({
        id: docSnap.id,
        email: userData.email,
        displayName: userData.displayName,
        role,
        pricingMode: userData.pricingMode || "text",
        cardLimit: userData.cardLimit ?? defaultLimit,
        currentCardCount: cardsSnapshot.size,
        priceUpdatesEnabled: userData.priceUpdatesEnabled,
        updateIntervalDays: userData.updateIntervalDays ?? defaultInterval,
        nextUpdateDate: userData.nextUpdateDate?.toDate?.().toISOString?.() || null,
        lastCollectionUpdate: userData.lastCollectionUpdate?.toDate?.().toISOString?.() || null,
        emailNotifications: userData.emailNotifications ?? false,
        createdAt: userData.createdAt?.toDate?.().toISOString?.() || null,
      });
    }

    return {success: true, users};
  } catch (error) {
    console.error("Error getting users:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.getUpdateLogsV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const userId = request.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();
  if (!isAllowlistedAdmin(request) && (!userDoc.exists || userDoc.data().role !== "admin")) {
    throw new HttpsError("permission-denied", "Only admins can access this function");
  }

  const limit = Math.min(Math.max(request.data?.limit || 30, 1), 100);
  const filters = request.data?.filters || {};
  const startAfter = request.data?.startAfter || null;

  try {
    let query = db.collection("updateLogs");

    if (filters.userEmail) {
      query = query.where("userEmail", "==", filters.userEmail);
    }
    if (filters.triggerType) {
      query = query.where("triggerType", "==", filters.triggerType);
    }
    if (filters.pricingMode) {
      query = query.where("pricingMode", "==", filters.pricingMode);
    }

    query = query
        .orderBy("timestamp", "desc")
        .orderBy(admin.firestore.FieldPath.documentId(), "desc")
        .limit(limit);

    if (startAfter?.timestamp && startAfter?.id) {
      const ts = admin.firestore.Timestamp.fromDate(new Date(startAfter.timestamp));
      query = query.startAfter(ts, startAfter.id);
    }

    const logsSnapshot = await query.get();

    const logs = logsSnapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        id: docSnap.id,
        userId: data.userId || null,
        userEmail: data.userEmail || null,
        timestamp: data.timestamp?.toDate?.().toISOString?.() || null,
        totalCards: data.totalCards ?? data.cardsProcessed ?? 0,
        successCount: data.successCount ?? 0,
        failCount: data.failCount ?? 0,
        status: data.status || null,
        triggerType: data.triggerType || null,
        pricingMode: data.pricingMode || null,
        apiCallsUsed: data.apiCallsUsed ?? null,
        cacheHits: data.cacheHits ?? 0,
        durationMs: data.durationMs ?? null,
        errors: data.errors || [],
        debugSamples: data.debugSamples || [],
      };
    });

    const lastDoc = logsSnapshot.docs[logsSnapshot.docs.length - 1] || null;
    const lastData = lastDoc?.data?.() || null;
    const nextPageToken = lastDoc
      ? {
        id: lastDoc.id,
        timestamp: lastData?.timestamp?.toDate?.().toISOString?.() || null,
      }
      : null;

    return {success: true, logs, nextPageToken};
  } catch (error) {
    console.error("Error loading update logs:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.getApiUsageV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const userId = request.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();
  if (!isAllowlistedAdmin(request) && (!userDoc.exists || userDoc.data().role !== "admin")) {
    throw new HttpsError("permission-denied", "Only admins can access this function");
  }

  try {
    const usageSnap = await db.collection("apiUsage").doc("ebay").get();
    const data = usageSnap.data() || {};
    const today = new Date().toISOString().slice(0, 10);
    const callsToday = data.date === today ? (data.calls || 0) : 0;
    const dailyBudget = data.dailyBudget || DAILY_BUDGET;
    const remaining = Math.max(0, dailyBudget - callsToday);

    return {
      success: true,
      usage: {
        date: data.date || today,
        callsToday,
        dailyBudget,
        remaining,
        byType: data.byType || {},
        updatedAt: data.updatedAt?.toDate?.().toISOString?.() || null,
      },
    };
  } catch (error) {
    console.error("Error loading API usage:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.updateUserRoleV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const adminId = request.auth.uid;

  const adminDoc = await db.collection("users").doc(adminId).get();
  if (!isAllowlistedAdmin(request) && (!adminDoc.exists || adminDoc.data().role !== "admin")) {
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
      standard: {cardLimit: 100, updateIntervalDays: 30, updatesPerMonth: 1, ebayUpdatesEnabled: true},
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

exports.updatePricingModeV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const adminId = request.auth.uid;
  const adminDoc = await db.collection("users").doc(adminId).get();
  if (!isAllowlistedAdmin(request) && (!adminDoc.exists || adminDoc.data().role !== "admin")) {
    throw new HttpsError("permission-denied", "Only admins can update pricing mode");
  }

  const {targetUserId, pricingMode} = request.data || {};

  if (!targetUserId || !pricingMode) {
    throw new HttpsError("invalid-argument", "Missing targetUserId or pricingMode");
  }

  if (!["text", "image", "hybrid"].includes(pricingMode)) {
    throw new HttpsError("invalid-argument", "Invalid pricingMode. Must be: text, image, or hybrid");
  }

  console.log(`🔧 updatePricingMode: ${adminId} changing ${targetUserId} to ${pricingMode}`);

  try {
    await db.collection("users").doc(targetUserId).update({
      pricingMode,
      pricingModeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      pricingModeUpdatedBy: adminId,
    });

    console.log(`✅ User ${targetUserId} pricing mode updated to ${pricingMode}`);
    return {success: true, pricingMode};
  } catch (error) {
    console.error("Error updating pricing mode:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.toggleEmailNotificationsV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const adminId = request.auth.uid;
  const adminDoc = await db.collection("users").doc(adminId).get();
  if (!isAllowlistedAdmin(request) && (!adminDoc.exists || adminDoc.data().role !== "admin")) {
    throw new HttpsError("permission-denied", "Only admins can toggle email notifications");
  }

  const {targetUserId, enabled} = request.data || {};

  if (!targetUserId || typeof enabled !== "boolean") {
    throw new HttpsError("invalid-argument", "Missing targetUserId or enabled (boolean)");
  }

  console.log(`📧 toggleEmailNotifications: ${adminId} setting ${targetUserId} to ${enabled}`);

  try {
    await db.collection("users").doc(targetUserId).update({
      emailNotifications: enabled,
    });

    console.log(`✅ User ${targetUserId} emailNotifications set to ${enabled}`);
    return {success: true, emailNotifications: enabled};
  } catch (error) {
    console.error("Error toggling email notifications:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.grantAdminRoleV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  if (!isTestProject()) {
    throw new HttpsError("permission-denied", "Admin bootstrap is only allowed in TEST");
  }

  const email = request.auth.token?.email || "";
  if (!ADMIN_ALLOWLIST.includes(email)) {
    throw new HttpsError("permission-denied", "Email is not allowed to bootstrap admin role");
  }

  const userId = request.auth.uid;
  const userRecord = await admin.auth().getUser(userId);
  const userDocRef = db.collection("users").doc(userId);
  const userDoc = await userDocRef.get();
  const currentData = userDoc.exists ? userDoc.data() : {};
  const nowTs = admin.firestore.Timestamp.now();

  await userDocRef.set({
    uid: userId,
    email: userRecord.email || email,
    displayName: userRecord.displayName || currentData.displayName || email.split("@")[0] || "Admin",
    photoURL: userRecord.photoURL || currentData.photoURL || null,
    role: "admin",
    subscriptionStatus: "active",
    subscriptionStartDate: currentData.subscriptionStartDate || nowTs,
    cardLimit: 999999,
    currentCardCount: currentData.currentCardCount || 0,
    priceUpdatesEnabled: true,
    updateIntervalDays: 15,
    updatesPerMonth: 2,
    updateDayOfMonth: currentData.updateDayOfMonth || Math.floor(Math.random() * 28) + 1,
    updateHourOfDay: currentData.updateHourOfDay || 11,
    nextUpdateDate: currentData.nextUpdateDate || nowTs,
    emailNotifications: currentData.emailNotifications || false,
    inAppNotifications: currentData.inAppNotifications !== false,
    createdAt: currentData.createdAt || nowTs,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    roleUpdatedBy: userId,
  }, {merge: true});

  return {success: true, userId, role: "admin"};
});

exports.updateNextUpdateDateV2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User not logged in");
  }

  const adminId = request.auth.uid;

  const adminDoc = await db.collection("users").doc(adminId).get();
  if (!isAllowlistedAdmin(request) && (!adminDoc.exists || adminDoc.data().role !== "admin")) {
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
    const cardLimit = userData.cardLimit || 100;

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

      return null; // Card was deleted, skip pricing
    }

    // Auto-price the new card via eBay search
    if (cardData.item) {
      try {
        const fxRates = await getLatestExchangeRates();
        const textResponse = await searchEbayCardWithDebug(cardData.item, fxRates, {
          categoryId: cardData.ebayCategory || null,
        });

        if (textResponse?.results?.length > 0) {
          const priceInfo = calculateEstimatedPriceDetailed(textResponse.results);
          if (priceInfo?.price) {
            await snap.ref.update({
              current: priceInfo.price,
              lastPriceUpdate: admin.firestore.FieldValue.serverTimestamp(),
              priceSource: "ebay",
              ebayPriceSource: true,
              ebaySearchMode: "text",
              priceHistory: admin.firestore.FieldValue.arrayUnion({
                date: new Date(),
                price: priceInfo.price,
                source: "ebay",
              }),
              ...(priceInfo.confidence != null ? {priceConfidence: priceInfo.confidence} : {}),
            });
            console.log(`💰 Auto-priced new card "${cardData.item}": €${priceInfo.price}`);
          }
        }
      } catch (priceError) {
        console.error(`⚠️ Auto-pricing failed for "${cardData.item}":`, priceError.message);
      }
    }

    return null;
  } catch (error) {
    console.error("Error checking card limit:", error);
    return null;
  }
});