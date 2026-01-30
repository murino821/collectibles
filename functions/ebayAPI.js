/**
 * eBay Browse API wrapper for server-side
 * Handles OAuth, search, and price calculation
 */

const fetch = require("node-fetch");

// Get credentials from environment variables (.env file)
// Using process.env instead of deprecated functions.config()
// Firebase Functions v5+ automatically loads .env files
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_ENV = process.env.EBAY_ENV || "production";

// API base URLs
const OAUTH_BASE = EBAY_ENV === "sandbox" ?
  "https://api.sandbox.ebay.com" :
  "https://api.ebay.com";

const BROWSE_BASE = EBAY_ENV === "sandbox" ?
  "https://api.sandbox.ebay.com" :
  "https://api.ebay.com";

const HOCKEY_CARDS_CATEGORY = "261328"; // Sports Trading Card Singles
const EBAY_MARKETPLACE = "EBAY_US"; // US marketplace has most hockey cards

// Token cache (in-memory for function lifetime)
let cachedToken = null;
let tokenExpiry = null;

/**
 * Get eBay OAuth access token
 * @return {Promise<string>} Access token
 */
async function getEbayToken() {
  // Check cache
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    console.log("Using cached eBay token");
    return cachedToken;
  }

  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    throw new Error("eBay credentials not configured. Add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to functions/.env file");
  }

  console.log("Fetching new eBay token...");

  // Base64 encode credentials
  const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");

  try {
    const response = await fetch(`${OAUTH_BASE}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`eBay OAuth failed: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Cache token
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);

    console.log(`✅ New eBay token acquired (valid for ${data.expires_in / 3600} hours)`);
    return cachedToken;
  } catch (error) {
    console.error("eBay token fetch error:", error);
    throw error;
  }
}

/**
 * Search eBay for ACTIVE listings
 * Note: Browse API returns active (asking) prices, not sold prices.
 * The calculateEstimatedPrice() function compensates with discount factors.
 * @param {string} query - Search term
 * @return {Promise<Array>} Array of active listing results
 */
async function searchEbayCard(query) {
  const token = await getEbayToken();

  // Calculate date 90 days ago (only recent sold items)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateFilter = ninetyDaysAgo.toISOString();

  // Build search URL for ACTIVE listings
  // eBay Browse API Best Practices:
  // 1. Use broader search terms (remove overly specific details)
  // 2. Get multiple results for better price averaging
  // 3. Use fieldgroups=EXTENDED for more details
  // 4. Filter by recent listings only (last 90 days)
  const params = new URLSearchParams({
    q: query,
    // Remove category filter - might be too restrictive
    // category_ids: HOCKEY_CARDS_CATEGORY,
    limit: "50", // Get more results for better average (max 200)
    fieldgroups: "EXTENDED", // Get soldDate and more details
    // Only filter by date range - no buyingOptions filter for sold items
    filter: `itemEndDate:[${dateFilter}..]`,
    sort: "price", // From cheapest
  });

  try {
    const response = await fetch(
        `${BROWSE_BASE}/buy/browse/v1/item_summary/search?${params}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE, // EUR marketplace
            "Content-Type": "application/json",
          },
        },
    );

    if (!response.ok) {
      // Token expired
      if (response.status === 401) {
        cachedToken = null;
        tokenExpiry = null;
        throw new Error("Token expired");
      }

      // Rate limit
      if (response.status === 429) {
        throw new Error("Rate limit exceeded");
      }

      throw new Error(`eBay API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.itemSummaries || data.itemSummaries.length === 0) {
      console.log(`No eBay results for: ${query}`);
      return [];
    }

    // Parse ACTIVE listings results - only store essential data
    const USD_TO_EUR = 0.92; // Approximate conversion rate
    return data.itemSummaries
        .filter((item) => item.price && item.price.value > 0) // Only valid prices
        .map((item) => {
          let priceInEur = parseFloat(item.price.value);
          const currency = item.price.currency;

          // Convert USD to EUR
          if (currency === "USD") {
            priceInEur = priceInEur * USD_TO_EUR;
          }

          // Only store price and soldDate - minimize data
          return {
            price: priceInEur,
            soldDate: item.itemEndDate || null, // null if missing, don't use default
          };
        });
  } catch (error) {
    console.error("eBay search error:", error);
    throw error;
  }
}

/**
 * Calculate realistic market price from ACTIVE listings
 *
 * Browse API returns active (asking) prices, not sold prices.
 * This algorithm compensates by:
 * 1. Removing outliers (top/bottom 15%)
 * 2. Calculating trimmed average
 * 3. Applying discount factor based on market competition
 *
 * Discount logic:
 * - More listings = higher competition = buyers can negotiate more
 * - Fewer listings = rare card = less negotiating power
 *
 * @param {Array} results - Results from searchEbayCard (active listings)
 * @return {number|null} Estimated realistic price in EUR
 */
function calculateEstimatedPrice(results) {
  if (!results || results.length === 0) return null;

  // 1. Get prices and sort ascending
  const prices = results.map((r) => r.price).sort((a, b) => a - b);

  // 2. Remove outliers (top 15% and bottom 15%)
  const trimPercent = 0.15;
  const trimCount = Math.floor(prices.length * trimPercent);
  const trimmedPrices = trimCount > 0 ?
    prices.slice(trimCount, prices.length - trimCount) :
    prices;

  // 3. Calculate average
  let average;
  if (trimmedPrices.length === 0) {
    // Fallback to median if not enough data after trimming
    average = prices[Math.floor(prices.length / 2)];
  } else {
    average = trimmedPrices.reduce((sum, p) => sum + p, 0) / trimmedPrices.length;
  }

  // 4. Apply discount factor based on market competition
  // More results = more competition = higher discount
  let discountFactor;
  let competitionLevel;

  if (results.length >= 20) {
    discountFactor = 0.65; // -35% (high competition)
    competitionLevel = "vysoká";
  } else if (results.length >= 10) {
    discountFactor = 0.70; // -30% (medium competition)
    competitionLevel = "stredná";
  } else if (results.length >= 5) {
    discountFactor = 0.75; // -25% (low competition)
    competitionLevel = "nízka";
  } else {
    discountFactor = 0.80; // -20% (rare card)
    competitionLevel = "vzácna karta";
  }

  // 5. Calculate final realistic price
  const realisticPrice = average * discountFactor;
  const discountPercent = Math.round((1 - discountFactor) * 100);

  console.log(`  📊 eBay: ${results.length} aktívnych inzerátov, konkurencia: ${competitionLevel}`);
  console.log(`  💰 Priemer: €${average.toFixed(2)} → Realistická cena: €${realisticPrice.toFixed(2)} (-${discountPercent}%)`);
  console.log(`  📈 Cenové rozpätie: €${prices[0].toFixed(2)} - €${prices[prices.length - 1].toFixed(2)}`);

  return parseFloat(realisticPrice.toFixed(2));
}

/**
 * Enhance query for better eBay search results
 * @param {string} cardName - Original card name
 * @return {string} Enhanced query
 */
function enhanceQuery(cardName) {
  let enhanced = cardName
      .toLowerCase()
      .trim();

  // Remove common noise words
  enhanced = enhanced.replace(/^nhl\s+/i, "");

  // Remove very specific details that might limit results
  // Keep player name, year, brand, but remove numbered variants
  enhanced = enhanced.replace(/\/\d+$/i, ""); // Remove "/50" at end
  enhanced = enhanced.replace(/\s+#\d+$/i, ""); // Remove "#123" at end

  // Simplify some brand variations
  enhanced = enhanced.replace(/\bmetal universe\b/i, "metal");
  enhanced = enhanced.replace(/\bcache gold\b/i, "");

  // Add "card" if missing (more generic for all collectibles)
  if (!enhanced.includes("card") && !enhanced.includes("pokemon") && !enhanced.includes("coin")) {
    enhanced += " card";
  }

  // Clean up extra spaces
  enhanced = enhanced.replace(/\s+/g, " ").trim();

  console.log(`  🔍 Query transformation: "${cardName}" → "${enhanced}"`);

  return enhanced;
}

module.exports = {
  searchEbayCard,
  calculateEstimatedPrice,
  enhanceQuery,
};
