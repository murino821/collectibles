/**
 * eBay Browse API wrapper for server-side
 * Handles OAuth, search, and price calculation
 */

const fetch = require("node-fetch");
const {globalLimiter} = require("./rateLimiter");

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

const MAX_QUERY_LENGTH = 100;
const DEFAULT_LIMIT = 50;
const MIN_RESULTS_TARGET = 8;
const MAX_QUERY_ATTEMPTS = 3;
const AUCTION_FLOOR_HOURS = 48;

const STOP_WORDS = new Set([
  "nhl",
  "hockey",
  "card",
  "cards",
  "trading",
  "sports",
  "the",
  "a",
  "an",
  "and",
  "of",
  "for",
  "to",
  "in",
  "set",
]);

const PHRASE_KEYWORDS = [
  "young guns",
  "upper deck",
  "o-pee-chee",
  "opc",
  "sp authentic",
  "spa",
  "the cup",
  "sign of the times",
  "sott",
  "mvp",
  "stature",
  "artifacts",
  "trilogy",
  "premier",
  "credentials",
  "ice",
  "series 1",
  "series 2",
  "chronology",
  "allure",
  "clear cut",
  "tim hortons",
  "metal universe",
  "future watch",
  "canvas",
  "star rookie",
];

const GRADE_TOKENS = ["psa", "bgs", "sgc", "cgc"];
const STRONG_PHRASES = new Set([
  "young guns",
  "future watch",
  "sign of the times",
  "sott",
  "the cup",
  "beehive",
  "mvp",
]);
const EXCLUDE_REGEXES = [
  /\blot\b/,
  /\blots\b/,
  /\bu\s?pick\b/,
  /\bpick (from|your)\b/,
  /\b(you choose|choose from|your choice)\b/,
  /\b(complete|team|base|master) set\b/,
  /\b(hobby|blaster|mega)?\s*box\b/,
  /\bcase\b/,
  /\bpacks?\b/,
  /\bsealed\b/,
  /\bunopened\b/,
  /\bempty\b/,
  /\b(binder|album|page|sheet)\b/,
  /\b(reprint|replica)\b/,
  /\b(case break|box break|group break|breakers?)\b/,
];

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

    console.log(`New eBay token acquired (valid for ${data.expires_in / 3600} hours)`);
    return cachedToken;
  } catch (error) {
    console.error("eBay token fetch error:", error);
    throw error;
  }
}

function normalizeText(value) {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["'`]/g, "")
    .replace(/[_]/g, " ")
    .replace(/[^a-z0-9\s\/#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return value
    .replace(/[#/.-]/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

const PHRASE_TOKENS = new Set(PHRASE_KEYWORDS.flatMap((phrase) => tokenize(phrase)));
const EXTRA_PLAYER_STOP_WORDS = [
  "auto",
  "autograph",
  "autographed",
  "signature",
  "signed",
  "patch",
  "jersey",
  "rookie",
  "rc",
  "base",
  "insert",
  "parallel",
  "limited",
  "numbered",
  "serial",
  "short",
  "print",
  "sp",
  "ssp",
  "sott",
  "mvp",
  "cup",
  "beehive",
  "future",
  "watch",
  "young",
  "guns",
  "upper",
  "deck",
  "ud",
  "opc",
  "authentic",
  "series",
  "stature",
  "artifacts",
  "trilogy",
  "premier",
  "credentials",
  "ice",
  "chronology",
  "allure",
  "clear",
  "cut",
  "tim",
  "hortons",
  "metal",
  "universe",
  "canvas",
  "rookies",
];
const PLAYER_STOP_WORDS = new Set([
  ...STOP_WORDS,
  ...PHRASE_TOKENS,
  ...EXTRA_PLAYER_STOP_WORDS,
]);

function extractSignals(cardName) {
  const normalized = normalizeText(cardName);
  const yearRangeMatch = normalized.match(/\b(19|20)\d{2}\s*[-/]\s*\d{2}\b/);
  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  const cardNumberMatch = normalized.match(/#\s*(\d{1,4})\b/) || normalized.match(/\bno\.?\s*(\d{1,4})\b/);
  const serialMatch = normalized.match(/\/\s*(\d{2,4})\b/);
  const gradeMatch = normalized.match(/\b(psa|bgs|sgc|cgc)\s*(10|9\.5|9|8\.5|8|7|6|5)\b/);

  const phrases = PHRASE_KEYWORDS.filter((phrase) => normalized.includes(phrase));
  const rawTokens = tokenize(normalized);
  const filteredTokens = rawTokens.filter((token) => !STOP_WORDS.has(token));
  const nonNumericTokens = filteredTokens
    .filter((token) => !/^\d+$/.test(token) && !GRADE_TOKENS.includes(token));
  const strongPlayerTokens = nonNumericTokens
    .filter((token) => !PLAYER_STOP_WORDS.has(token));
  let playerTokens = strongPlayerTokens.slice(0, 2);
  const hasStrongPlayerTokens = playerTokens.length > 0;

  if (!playerTokens.length) {
    playerTokens = nonNumericTokens.slice(0, 1);
  }

  const yearRange = yearRangeMatch ? yearRangeMatch[0].replace(/\s+/g, "") : null;
  const year = yearMatch ? yearMatch[0] : null;
  const cardNumber = cardNumberMatch ? cardNumberMatch[1] : null;
  const serial = serialMatch ? serialMatch[1] : null;
  const grade = gradeMatch ? `${gradeMatch[1]} ${gradeMatch[2]}` : null;

  const keyTokens = filteredTokens.filter((token) => {
    if (playerTokens.includes(token)) return false;
    if (token === year || token === cardNumber || token === serial) return false;
    if (GRADE_TOKENS.includes(token)) return false;
    return true;
  });

  return {
    normalized,
    playerTokens,
    hasStrongPlayerTokens,
    keyTokens,
    year,
    yearRange,
    cardNumber,
    serial,
    grade,
    phrases,
  };
}

function buildSignalsSummary(signals) {
  if (!signals) return null;
  return {
    playerTokens: signals.playerTokens || [],
    hasStrongPlayerTokens: !!signals.hasStrongPlayerTokens,
    phrases: signals.phrases || [],
    year: signals.year || null,
    yearRange: signals.yearRange || null,
    cardNumber: signals.cardNumber || null,
    serial: signals.serial || null,
    grade: signals.grade || null,
  };
}

function buildQueryString(parts) {
  const seen = new Set();
  const unique = [];

  parts.forEach((part) => {
    if (!part) return;
    const token = String(part).trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    unique.push(token);
  });

  let query = unique.join(" ").replace(/\s+/g, " ").trim();

  if (query.length > MAX_QUERY_LENGTH) {
    const tokens = query.split(" ");
    while (tokens.length > 1 && tokens.join(" ").length > MAX_QUERY_LENGTH) {
      tokens.pop();
    }
    query = tokens.join(" ");
  }

  return query;
}

function buildSearchQueries(signals) {
  const yearToken = signals.yearRange || signals.year || null;
  const phraseTokens = signals.phrases || [];
  const gradeTokens = signals.grade ? signals.grade.split(" ") : [];
  const strict = buildQueryString([
    ...signals.playerTokens,
    yearToken,
    ...phraseTokens,
    signals.cardNumber,
    ...gradeTokens,
  ]);
  const balanced = buildQueryString([
    ...signals.playerTokens,
    yearToken,
    ...phraseTokens,
    "card",
  ]);
  const loose = buildQueryString([
    ...signals.playerTokens,
    ...phraseTokens,
    "card",
  ]);

  const queries = [strict, balanced, loose]
    .filter((query) => query)
    .filter((query, index, all) => all.indexOf(query) === index)
    .slice(0, MAX_QUERY_ATTEMPTS);

  if (!queries.length && signals.normalized) {
    return [signals.normalized.slice(0, MAX_QUERY_LENGTH)];
  }

  return queries;
}

function convertToEur(amount, currency, fxRates) {
  const value = parseFloat(amount);
  if (!Number.isFinite(value)) return null;
  if (!currency || currency === "EUR") return value;
  const rate = fxRates && typeof fxRates[currency] === "number" ? fxRates[currency] : null;
  if (!rate || rate <= 0) return value;
  return value / rate;
}

function mapItemSummary(item, fxRates) {
  if (!item) return null;
  const buyingOptions = Array.isArray(item.buyingOptions) ? item.buyingOptions : [];
  const isAuctionOnly = buyingOptions.includes("AUCTION") && !buyingOptions.includes("FIXED_PRICE");
  const priceInfo = isAuctionOnly && item.currentBidPrice ? item.currentBidPrice : item.price;

  if (!priceInfo || !priceInfo.value) return null;

  const priceEur = convertToEur(priceInfo.value, priceInfo.currency, fxRates);
  if (!Number.isFinite(priceEur) || priceEur <= 0) return null;

  return {
    id: item.itemId || null,
    title: item.title || "",
    price: parseFloat(priceEur.toFixed(2)),
    currency: "EUR",
    buyingOptions,
    isAuctionOnly,
    bidCount: typeof item.bidCount === "number" ? item.bidCount : 0,
    endDate: item.itemEndDate || null,
  };
}

function mergeUniqueResults(existing, incoming) {
  const merged = [...existing];
  const seen = new Set(existing.map((item) => item.id || `${item.title}-${item.price}`));

  incoming.forEach((item) => {
    const key = item.id || `${item.title}-${item.price}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  });

  return merged;
}

function computeMatchScoreWithTokens(normalizedTitle, titleTokens, signals) {
  if (!signals) return 0;

  let score = 0;
  let maxScore = 0;

  const addScore = (weight, condition) => {
    maxScore += weight;
    if (condition) score += weight;
  };

  signals.playerTokens.forEach((token) => addScore(4, titleTokens.has(token)));

  if (signals.year) {
    addScore(3, titleTokens.has(signals.year));
  }

  if (signals.yearRange) {
    const yearRangeNormalized = signals.yearRange.replace("/", "-");
    addScore(3, normalizedTitle.includes(signals.yearRange) || normalizedTitle.includes(yearRangeNormalized));
  }

  signals.phrases.forEach((phrase) => addScore(3, normalizedTitle.includes(phrase)));

  if (signals.cardNumber) {
    addScore(2, titleTokens.has(signals.cardNumber));
  }

  if (signals.serial) {
    const serialToken = signals.serial;
    const hasSerial =
      normalizedTitle.includes(`/${serialToken}`) ||
      normalizedTitle.includes(`${serialToken}/`) ||
      titleTokens.has(serialToken);
    addScore(2, hasSerial);
  }

  if (signals.grade) {
    addScore(2, normalizedTitle.includes(signals.grade));
  }

  signals.keyTokens.forEach((token) => addScore(1, titleTokens.has(token)));

  return maxScore > 0 ? score / maxScore : 0;
}

function computeMatchScore(title, signals) {
  if (!title) return 0;
  const normalizedTitle = normalizeText(title);
  const titleTokens = new Set(tokenize(normalizedTitle));
  return computeMatchScoreWithTokens(normalizedTitle, titleTokens, signals);
}

function isExcludedTitle(normalizedTitle) {
  return EXCLUDE_REGEXES.some((regex) => regex.test(normalizedTitle));
}

function filterRelevantResults(results, signals, mode) {
  const scored = results.map((item) => {
    const normalizedTitle = normalizeText(item.title);
    const titleTokens = new Set(tokenize(normalizedTitle));
    const matchScore = computeMatchScoreWithTokens(normalizedTitle, titleTokens, signals);
    const excluded = isExcludedTitle(normalizedTitle);
    return {...item, matchScore, _normalizedTitle: normalizedTitle, _titleTokens: titleTokens, _excluded: excluded};
  });

  let filtered = scored.filter((item) => !item._excluded);

  if (signals?.hasStrongPlayerTokens && signals.playerTokens.length) {
    const requiredMatches = filtered.filter((item) =>
      signals.playerTokens.some((token) => item._titleTokens.has(token)),
    );
    if (requiredMatches.length) {
      filtered = requiredMatches;
    } else {
      filtered = [];
    }
  }

  if (signals?.phrases?.length) {
    const strongPhrases = signals.phrases.filter((phrase) => STRONG_PHRASES.has(phrase));
    if (strongPhrases.length) {
      const withPhrase = filtered.filter((item) =>
        strongPhrases.some((phrase) => item._normalizedTitle.includes(phrase)),
      );
      if (withPhrase.length) {
        filtered = withPhrase;
      }
    }
  }

  const baseThreshold = mode === "image" ? 0.3 : 0.4;
  const fallbackThreshold = mode === "image" ? 0.2 : 0.3;

  let thresholded = filtered.filter((item) => item.matchScore >= baseThreshold);
  if (thresholded.length < 5) {
    thresholded = filtered.filter((item) => item.matchScore >= fallbackThreshold);
  }

  if (!thresholded.length) {
    thresholded = filtered;
  }

  return thresholded
    .sort((a, b) => b.matchScore - a.matchScore || a.price - b.price)
    .slice(0, 80)
    .map(({_normalizedTitle, _titleTokens, _excluded, ...rest}) => rest);
}

async function searchEbayTextOnceDetailed(query, fxRates) {
  const token = await getEbayToken();
  await globalLimiter.throttle();

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateFilter = ninetyDaysAgo.toISOString();

  const params = new URLSearchParams({
    q: query,
    limit: String(DEFAULT_LIMIT),
    fieldgroups: "EXTENDED",
    category_ids: HOCKEY_CARDS_CATEGORY,
    filter: `buyingOptions:{AUCTION|FIXED_PRICE},itemEndDate:[${dateFilter}..]`,
    sort: "price",
  });

  const response = await fetch(
    `${BROWSE_BASE}/buy/browse/v1/item_summary/search?${params}`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    if (response.status === 401) {
      cachedToken = null;
      tokenExpiry = null;
      throw new Error("Token expired");
    }

    if (response.status === 429) {
      throw new Error("Rate limit exceeded");
    }

    throw new Error(`eBay API error: ${response.status}`);
  }

  const data = await response.json();
  const rawCount = data.itemSummaries ? data.itemSummaries.length : 0;
  const items = data.itemSummaries
    ? data.itemSummaries.map((item) => mapItemSummary(item, fxRates)).filter(Boolean)
    : [];

  return {items, rawCount};
}

async function searchEbayTextOnce(query, fxRates) {
  const {items} = await searchEbayTextOnceDetailed(query, fxRates);
  return items;
}

async function fetchImageBase64(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

async function searchEbayImageOnceDetailed(imageUrl, fxRates) {
  const token = await getEbayToken();
  await globalLimiter.throttle();

  const imageBase64 = await fetchImageBase64(imageUrl);

  const params = new URLSearchParams({
    limit: String(DEFAULT_LIMIT),
    category_ids: HOCKEY_CARDS_CATEGORY,
    filter: "buyingOptions:{AUCTION|FIXED_PRICE}",
  });

  const response = await fetch(
    `${BROWSE_BASE}/buy/browse/v1/item_summary/search_by_image?${params}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({image: imageBase64}),
    },
  );

  if (!response.ok) {
    if (response.status === 401) {
      cachedToken = null;
      tokenExpiry = null;
      throw new Error("Token expired");
    }

    if (response.status === 429) {
      throw new Error("Rate limit exceeded");
    }

    throw new Error(`eBay image API error: ${response.status}`);
  }

  const data = await response.json();
  const rawCount = data.itemSummaries ? data.itemSummaries.length : 0;
  const items = data.itemSummaries
    ? data.itemSummaries.map((item) => mapItemSummary(item, fxRates)).filter(Boolean)
    : [];

  return {items, rawCount};
}

/**
 * Search eBay for ACTIVE listings based on text
 * @param {string} cardName - Original card name
 * @param {Object|null} fxRates - FX rates (EUR base)
 * @return {Promise<Array>} Array of listing results
 */
async function searchEbayCard(cardName, fxRates = null) {
  if (!cardName) return [];

  const signals = extractSignals(cardName);
  const queries = buildSearchQueries(signals);

  let aggregated = [];

  for (const query of queries) {
    if (!query) continue;
    console.log(`eBay text search query: "${query}"`);
    const results = await searchEbayTextOnce(query, fxRates);
    aggregated = mergeUniqueResults(aggregated, results);
    if (aggregated.length >= MIN_RESULTS_TARGET) break;
  }

  if (!aggregated.length) {
    console.log(`No eBay results for: ${cardName}`);
    return [];
  }

  return filterRelevantResults(aggregated, signals, "text");
}

async function searchEbayCardWithDebug(cardName, fxRates = null) {
  if (!cardName) {
    return {results: [], debug: {mode: "text", reason: "empty-name"}};
  }

  const signals = extractSignals(cardName);
  const queries = buildSearchQueries(signals);
  const queryStats = [];

  let aggregated = [];

  for (const query of queries) {
    if (!query) continue;
    console.log(`eBay text search query: "${query}"`);
    const {items, rawCount} = await searchEbayTextOnceDetailed(query, fxRates);
    aggregated = mergeUniqueResults(aggregated, items);
    queryStats.push({
      query,
      rawCount,
      mappedCount: items.length,
      aggregatedCount: aggregated.length,
    });
    if (aggregated.length >= MIN_RESULTS_TARGET) break;
  }

  const filtered = aggregated.length ? filterRelevantResults(aggregated, signals, "text") : [];

  return {
    results: filtered,
    debug: {
      mode: "text",
      signals: buildSignalsSummary(signals),
      queries: queryStats,
      aggregatedCount: aggregated.length,
      filteredCount: filtered.length,
    },
  };
}

/**
 * Search eBay for ACTIVE listings based on image
 * @param {string} imageUrl - Public image URL
 * @param {string} cardName - Original card name (for relevance scoring)
 * @param {Object|null} fxRates - FX rates (EUR base)
 * @return {Promise<Array>} Array of listing results
 */
async function searchEbayCardByImage(imageUrl, cardName, fxRates = null) {
  if (!imageUrl) return [];
  const {items} = await searchEbayImageOnceDetailed(imageUrl, fxRates);
  if (!items.length) return [];

  const signals = cardName ? extractSignals(cardName) : null;
  if (!signals) {
    return items;
  }

  return filterRelevantResults(items, signals, "image");
}

async function searchEbayCardByImageWithDebug(imageUrl, cardName, fxRates = null) {
  if (!imageUrl) {
    return {results: [], debug: {mode: "image", reason: "missing-image"}};
  }

  const {items, rawCount} = await searchEbayImageOnceDetailed(imageUrl, fxRates);
  const signals = cardName ? extractSignals(cardName) : null;
  const filtered = signals ? filterRelevantResults(items, signals, "image") : items;

  return {
    results: filtered,
    debug: {
      mode: "image",
      signals: buildSignalsSummary(signals),
      rawCount,
      mappedCount: items.length,
      filteredCount: filtered.length,
    },
  };
}

function percentile(sorted, percentileValue) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function getBaseDiscount(count) {
  if (count <= 2) return 0.45;
  if (count <= 4) return 0.35;
  if (count <= 7) return 0.30;
  if (count <= 12) return 0.25;
  if (count <= 20) return 0.20;
  return 0.15;
}

function getAuctionFloor(results) {
  const now = Date.now();
  const cutoff = AUCTION_FLOOR_HOURS * 60 * 60 * 1000;

  const auctionPrices = results
    .filter((item) => item.isAuctionOnly)
    .filter((item) => item.bidCount > 0)
    .filter((item) => {
      if (!item.endDate) return false;
      const endTime = new Date(item.endDate).getTime();
      const remaining = endTime - now;
      return remaining > 0 && remaining <= cutoff;
    })
    .map((item) => item.price)
    .filter((price) => Number.isFinite(price))
    .sort((a, b) => a - b);

  if (!auctionPrices.length) {
    return null;
  }

  return percentile(auctionPrices, 0.5);
}

/**
 * Calculate realistic market price from ACTIVE listings
 * Uses dynamic discount based on data volume and price dispersion.
 * Auction listings only contribute to a conservative floor value.
 * @param {Array} results - Results from searchEbayCard or searchEbayCardByImage
 * @return {number|null} Estimated realistic price in EUR
 */
function calculateEstimatedPriceDetailed(results) {
  if (!results || results.length === 0) return null;

  const fixedResults = results.filter((item) => !item.isAuctionOnly);
  const auctionFloor = getAuctionFloor(results);

  const baseResults = fixedResults.length ? fixedResults : results;
  const prices = baseResults
    .map((item) => item.price)
    .filter((price) => Number.isFinite(price))
    .sort((a, b) => a - b);

  if (!prices.length) return {price: null, debug: {reason: "no-prices"}};

  const trimPercent = prices.length >= 8 ? 0.15 : prices.length >= 5 ? 0.1 : 0;
  const trimCount = Math.floor(prices.length * trimPercent);
  const trimmedPrices = trimCount > 0 ? prices.slice(trimCount, prices.length - trimCount) : prices;

  const median = percentile(prices, 0.5);
  const baseAverage = trimmedPrices.length
    ? trimmedPrices.reduce((sum, price) => sum + price, 0) / trimmedPrices.length
    : median;

  const q1 = percentile(prices, 0.25);
  const q3 = percentile(prices, 0.75);
  const spreadRatio = median && q1 != null && q3 != null ? (q3 - q1) / median : 0;

  let discountPct = getBaseDiscount(prices.length);

  if (spreadRatio < 0.08) {
    discountPct -= 0.03;
  } else if (spreadRatio < 0.12) {
    discountPct -= 0.02;
  } else if (spreadRatio > 0.6) {
    discountPct += 0.05;
  } else if (spreadRatio > 0.45) {
    discountPct += 0.03;
  }

  const matchScores = results.map((item) => item.matchScore).filter((score) => typeof score === "number");
  if (matchScores.length) {
    const avgMatch = matchScores.reduce((sum, score) => sum + score, 0) / matchScores.length;
    if (avgMatch < 0.3) {
      discountPct += 0.05;
    } else if (avgMatch < 0.4) {
      discountPct += 0.03;
    } else if (avgMatch > 0.7) {
      discountPct -= 0.02;
    }
  }

  discountPct = Math.min(Math.max(discountPct, 0.1), 0.55);

  const discountedPrice = baseAverage * (1 - discountPct);
  const finalPrice = auctionFloor ? Math.max(discountedPrice, auctionFloor) : discountedPrice;

  console.log(`eBay pricing: ${prices.length} listings, discount ${(discountPct * 100).toFixed(0)}%`);
  if (auctionFloor) {
    console.log(`Auction floor applied: €${auctionFloor.toFixed(2)}`);
  }

  const debug = {
    totalResults: results.length,
    fixedResults: fixedResults.length,
    auctionCandidates: results.filter((item) => item.isAuctionOnly).length,
    auctionFloor: auctionFloor ? parseFloat(auctionFloor.toFixed(2)) : null,
    priceStats: {
      min: prices[0],
      max: prices[prices.length - 1],
      median: median != null ? parseFloat(median.toFixed(2)) : null,
      average: parseFloat(baseAverage.toFixed(2)),
      q1: q1 != null ? parseFloat(q1.toFixed(2)) : null,
      q3: q3 != null ? parseFloat(q3.toFixed(2)) : null,
      spreadRatio: parseFloat(spreadRatio.toFixed(3)),
      trimmedCount: trimmedPrices.length,
    },
    discountPct: parseFloat((discountPct * 100).toFixed(1)),
    avgMatchScore: matchScores.length
      ? parseFloat((matchScores.reduce((sum, score) => sum + score, 0) / matchScores.length).toFixed(3))
      : null,
    appliedFloor: !!auctionFloor,
  };

  return {price: parseFloat(finalPrice.toFixed(2)), debug};
}

function calculateEstimatedPrice(results) {
  const detailed = calculateEstimatedPriceDetailed(results);
  return detailed ? detailed.price : null;
}

/**
 * Enhance query for better eBay search results
 * @param {string} cardName - Original card name
 * @return {string} Enhanced query
 */
function enhanceQuery(cardName) {
  const signals = extractSignals(cardName);
  const queries = buildSearchQueries(signals);
  return queries[0] || cardName;
}

module.exports = {
  searchEbayCard,
  searchEbayCardWithDebug,
  searchEbayCardByImage,
  searchEbayCardByImageWithDebug,
  calculateEstimatedPrice,
  calculateEstimatedPriceDetailed,
  enhanceQuery,
};
