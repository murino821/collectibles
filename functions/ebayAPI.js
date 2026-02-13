/**
 * eBay Browse API wrapper for server-side
 * Handles OAuth, search, and price calculation
 */

const fetch = require("node-fetch");
const admin = require("firebase-admin");
const {globalLimiter, DAILY_BUDGET} = require("./rateLimiter");

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
const DEFAULT_LIMIT = 200;
const MIN_RESULTS_TARGET = 8;
const MAX_QUERY_ATTEMPTS = 3;
const AUCTION_FLOOR_HOURS = 48;

// NHL player lookup for first name disambiguation (BOD 9)
const NHL_PLAYER_NAMES = {
  mcdavid: "connor", crosby: "sidney", ovechkin: ["alexander", "alex"],
  gretzky: "wayne", lemieux: "mario", matthews: "auston", draisaitl: "leon",
  mackinnon: "nathan", makar: "cale", bedard: "connor", kaprizov: "kirill",
  pastrnak: "david", kucherov: "nikita", vasilevskiy: "andrei",
  panarin: "artemi", marchand: "brad", rantanen: "mikko", hellebuyck: "connor",
  mcdonald: null, // common false positive — not NHL
  hedman: "victor", fox: "adam", josi: "roman", marner: "mitch",
  tkachuk: ["matthew", "brady"], hughes: ["jack", "quinn", "luke"],
  svechnikov: "andrei", barkov: "aleksander", huberdeau: "jonathan",
  gaudreau: "johnny", pettersson: "elias", zegras: "trevor",
  seider: "moritz", raymond: "lucas", robertson: "jason",
  stutzle: "tim", demko: "thatcher", oettinger: "jake",
  caufield: "cole", suzuki: "nick", slavin: "jaccob",
  mcavoy: "charlie", zibanejad: "mika", kreider: "chris",
  shesterkin: "igor", saros: "juuse", sorokin: "ilya",
  fehervary: "martin", hischier: "nico", lafreniere: "alexis",
  byfield: "quinton", dach: "kirby", debrincat: "alex",
  duclair: "anthony", eichel: "jack", forsberg: "filip",
  giroux: "claude", hintz: "roope", jarvis: "seth",
  johnson: null, jones: null, smith: null, miller: null, // too common
  landeskog: "gabriel", lindholm: "elias", meier: "timo",
  norris: "josh", nylander: "william", oconnor: null, point: "brayden",
  rielly: "morgan", aho: "sebastian", terravainen: "teuvo",
  toews: "jonathan", trocheck: "vincent",
};

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
  "beehive",
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
  "acetate",
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
  "acetate",
  "clear cut",
]);
const EXCLUDE_REGEXES = [
  /\blot\b/,
  /\blots\b/,
  /u[\s-]*pick/,
  /\bupick\b/,
  /\bpick\s+(from|your|a)\b/,
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
  // T2: Checklist cards — different product, different price
  /\bchecklist\b/,
];

// Variant keywords that indicate a different card variant
const VARIANT_PENALTY_KEYWORDS = ["renewed", "retro", "tribute", "throwback"];
const AUTOGRAPH_KEYWORDS = ["auto", "autograph", "autographed", "signature", "signed"];

// Token cache (in-memory for function lifetime)
let cachedToken = null;
let tokenExpiry = null;
let cachedDb = null;

function getDb() {
  if (cachedDb) return cachedDb;
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  cachedDb = admin.firestore();
  return cachedDb;
}

async function recordApiCall(kind) {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const ref = db.collection("apiUsage").doc("ebay");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data()?.date !== today) {
        tx.set(ref, {
          date: today,
          calls: 1,
          byType: {[kind]: 1},
          dailyBudget: DAILY_BUDGET,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
        return;
      }

      tx.update(ref, {
        calls: admin.firestore.FieldValue.increment(1),
        [`byType.${kind}`]: admin.firestore.FieldValue.increment(1),
        dailyBudget: DAILY_BUDGET,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    console.warn("API usage log failed:", error.message);
  }
}

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

function sanitizeUtf8(value) {
  if (!value) return "";
  return value
    .replace(/â€"/g, "-").replace(/â€™/g, "'").replace(/â€œ/g, "\"").replace(/â€\u009D/g, "\"")
    .replace(/Ã©/g, "e").replace(/Ã¡/g, "a").replace(/Ã­/g, "i").replace(/Ã³/g, "o").replace(/Ãº/g, "u")
    .replace(/Ã¤/g, "a").replace(/Ã¶/g, "o").replace(/Ã¼/g, "u")
    .replace(/â/g, " ")
    .replace(/[\u0080-\u009F]/g, "")
    .replace(/[\uFFFD]/g, "")
    .trim();
}

function normalizeText(value) {
  if (!value) return "";
  return sanitizeUtf8(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["'`]/g, "")
    .replace(/[_]/g, " ")
    .replace(/[^a-z0-9\s\/#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countKnownPlayers(normalizedTitle) {
  const knownPlayers = Object.keys(NHL_PLAYER_NAMES);
  return knownPlayers.filter((name) => {
    const regex = new RegExp(`\\b${name}\\b`);
    return regex.test(normalizedTitle);
  }).length;
}

function isMultiPlayerListing(normalizedTitle) {
  return countKnownPlayers(normalizedTitle) >= 3;
}

// T2: Detect checklist-style listings (2 players separated by / or "cl" prefix)
const BRAND_TOKENS = new Set([
  "upper", "deck", "opc", "ud", "spx", "spa", "ice", "mvp", "nhl",
  "series", "extended", "authentic", "premier", "artifacts", "allure",
]);
function isChecklistListing(normalizedTitle) {
  // Explicit CL marker: "#cl", "cl-", "cl #" patterns
  if (/\bcl\b/.test(normalizedTitle)) return true;
  // Slash-separated names (e.g., "Celebrini / Michkov", "Celebrini/Michkov")
  if (/[a-z]{3,}\s*\/\s*[a-z]{3,}/.test(normalizedTitle)) {
    if (countKnownPlayers(normalizedTitle) >= 2) return true;
    const slashMatch = normalizedTitle.match(/([a-z]{3,})\s*\/\s*([a-z]{3,})/);
    if (slashMatch && !BRAND_TOKENS.has(slashMatch[1]) && !BRAND_TOKENS.has(slashMatch[2])) {
      return true;
    }
  }
  return false;
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
  // Autograph / patch keywords
  "auto", "autograph", "autographed", "signature", "signed",
  "patch", "jersey",
  // Card type keywords
  "rookie", "rc", "base", "insert", "parallel",
  "limited", "numbered", "serial", "short", "print",
  "sp", "ssp", "sott", "mvp", "cup",
  // Set / brand keywords
  "beehive", "future", "watch", "young", "guns",
  "upper", "deck", "ud", "opc", "authentic", "series",
  "stature", "artifacts", "trilogy", "premier", "credentials",
  "ice", "chronology", "allure", "clear", "cut",
  "tim", "hortons", "metal", "universe", "canvas",
  "rookies", "star",
  // Color / finish keywords
  "matte", "gold", "silver", "bronze", "platinum", "chrome",
  "speckled", "rainbow", "foil", "preview", "retro",
  // Variant keywords
  "renewed", "salute", "cache", "acetate",
  // T1 fix: words incorrectly parsed as player names
  "high", "gloss", "team", "canada", "juniors", "junior",
  "lucky", "shot", "arena", "giveaway",
  "oversize", "oversized", "jumbo", "topper",
  "second", "year", "first",
  "marquee", "checklist", "cl",
  "exclusives", "exclusive", "bonus", "french",
  "mega", "update", "extended", "tribute", "throwback",
  "world", "national", "international", "usa",
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
    .filter((token) => !/^\d+$/.test(token) && !GRADE_TOKENS.includes(token))
    .filter((token) => !/^[a-z]{0,2}\d+/.test(token) && !/^\d+[a-z]{0,2}$/.test(token)); // filter card codes like "la5", "c375", "82a"
  const strongPlayerTokens = nonNumericTokens
    .filter((token) => !PLAYER_STOP_WORDS.has(token));
  let playerTokens = strongPlayerTokens.slice(0, 2);
  const hasStrongPlayerTokens = playerTokens.length > 0;

  if (!playerTokens.length) {
    playerTokens = nonNumericTokens.slice(0, 1);
  }
  const playerKeyToken = playerTokens.length ? playerTokens[playerTokens.length - 1] : null;

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

  const hasAutograph = AUTOGRAPH_KEYWORDS.some((kw) => normalized.includes(kw));
  const hasVariant = (keyword) => normalized.includes(keyword);
  const sourceVariants = VARIANT_PENALTY_KEYWORDS.filter((kw) => hasVariant(kw));

  // Resolve first name from NHL_PLAYER_NAMES lookup
  let playerFirstName = null;
  if (playerKeyToken && NHL_PLAYER_NAMES[playerKeyToken] !== undefined) {
    const firstName = NHL_PLAYER_NAMES[playerKeyToken];
    if (firstName) {
      playerFirstName = Array.isArray(firstName) ? firstName : [firstName];
    }
  }

  return {
    normalized,
    playerTokens,
    hasStrongPlayerTokens,
    playerKeyToken,
    playerFirstName,
    keyTokens,
    year,
    yearRange,
    cardNumber,
    serial,
    grade,
    phrases,
    hasAutograph,
    sourceVariants,
  };
}

function buildSignalsSummary(signals) {
  if (!signals) return null;
  return {
    playerTokens: signals.playerTokens || [],
    hasStrongPlayerTokens: !!signals.hasStrongPlayerTokens,
    playerKeyToken: signals.playerKeyToken || null,
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

  // Add first name for disambiguation if available
  const playerParts = signals.playerFirstName
    ? [signals.playerFirstName[0], ...signals.playerTokens]
    : [...signals.playerTokens];

  const strict = buildQueryString([
    ...playerParts,
    yearToken,
    ...phraseTokens,
    signals.cardNumber,
    ...gradeTokens,
  ]);
  const balanced = buildQueryString([
    ...playerParts,
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

  let baseScore = maxScore > 0 ? score / maxScore : 0;

  // T5: Serial tier mismatch penalty — /25 card priced very differently from /999
  if (signals.serial) {
    const sourceSerial = parseInt(signals.serial, 10);
    const listingSerialMatch = normalizedTitle.match(/\/\s*(\d{2,4})\b/);
    if (listingSerialMatch) {
      const listingSerial = parseInt(listingSerialMatch[1], 10);
      if (sourceSerial !== listingSerial) {
        const getTier = (s) => s <= 10 ? 1 : s <= 50 ? 2 : s <= 199 ? 3 : 4;
        const tierDiff = Math.abs(getTier(sourceSerial) - getTier(listingSerial));
        if (tierDiff >= 2) baseScore *= 0.3;       // e.g., /10 vs /999
        else if (tierDiff === 1) baseScore *= 0.6;  // e.g., /25 vs /99
      }
    }
  }

  // T2: Checklist penalty — listing looks like CL but source card is not
  const sourceIsChecklist = signals.normalized &&
    (/\bchecklist\b/.test(signals.normalized) || /\bcl\b/.test(signals.normalized));
  if (!sourceIsChecklist && isChecklistListing(normalizedTitle)) {
    baseScore *= 0.15; // heavy penalty — checklist cards have very different prices
  }

  // T6: Oversized/Jumbo penalty — different product format, different price
  const sourceIsOversized = signals.normalized &&
    /\b(oversized?|jumbo|box\s*topper)\b/.test(signals.normalized);
  if (!sourceIsOversized && /\b(oversized?|jumbo|box\s*topper)\b/.test(normalizedTitle)) {
    baseScore *= 0.3;
  }

  // Variant penalty: listing has "renewed/retro" but source card does not
  VARIANT_PENALTY_KEYWORDS.forEach((variant) => {
    const listingHas = normalizedTitle.includes(variant);
    const sourceHas = signals.sourceVariants && signals.sourceVariants.includes(variant);
    if (listingHas && !sourceHas) {
      const penalty = variant === "renewed" ? 0.4 : 0.3;
      baseScore *= (1 - penalty);
    }
  });

  // T8: SSP mismatch penalty — SSP cards are much rarer and more expensive
  const sourceHasSSP = signals.normalized && /\bssp\b/.test(signals.normalized);
  const listingHasSSP = /\bssp\b/.test(normalizedTitle);
  if (sourceHasSSP && !listingHasSSP) {
    baseScore *= 0.25; // source is SSP, listing is not — huge price difference
  }

  // T4: Graded vs Raw mismatch penalty
  const gradeRegex = /\b(psa|bgs|sgc|cgc)\s*(10|9\.5|9|8\.5|8|7|6|5)\b/;
  const listingHasGrade = gradeRegex.test(normalizedTitle);
  if (signals.grade && !listingHasGrade) {
    baseScore *= 0.5; // source is graded, listing is raw — significant price difference
  } else if (!signals.grade && listingHasGrade) {
    baseScore *= 0.6; // source is raw, listing is graded — inflate price risk
  }

  // Autograph mismatch penalty
  const listingHasAuto = AUTOGRAPH_KEYWORDS.some((kw) => normalizedTitle.includes(kw));
  if (signals.hasAutograph && !listingHasAuto) {
    baseScore *= 0.6;
  } else if (!signals.hasAutograph && listingHasAuto) {
    baseScore *= 0.7;
  }

  // Wrong first name penalty
  if (signals.playerFirstName && signals.playerKeyToken && titleTokens.has(signals.playerKeyToken)) {
    const allFirstNames = Object.values(NHL_PLAYER_NAMES)
        .filter(Boolean)
        .flatMap((v) => Array.isArray(v) ? v : [v]);
    const titleFirstNames = allFirstNames.filter((fn) => titleTokens.has(fn));
    if (titleFirstNames.length > 0) {
      const matchesExpected = titleFirstNames.some((fn) => signals.playerFirstName.includes(fn));
      if (!matchesExpected) {
        baseScore *= 0.2;
      }
    }
  }

  return baseScore;
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

function hasStrongPhraseMatch(normalizedTitle, phrase) {
  if (!phrase) return false;
  if (phrase === "young guns") {
    return normalizedTitle.includes("young guns") || /\byg\b/.test(normalizedTitle) || /\byg\d+\b/.test(normalizedTitle);
  }
  if (phrase === "sign of the times") {
    return normalizedTitle.includes("sign of the times") || /\bsott\b/.test(normalizedTitle);
  }
  if (phrase === "future watch") {
    return normalizedTitle.includes("future watch") || /\bfw\b/.test(normalizedTitle);
  }
  return normalizedTitle.includes(phrase);
}

function hasSerialMatch(normalizedTitle, titleTokens, serial) {
  if (!serial) return null;
  return (
    normalizedTitle.includes(`/${serial}`) ||
    normalizedTitle.includes(`${serial}/`) ||
    titleTokens.has(serial)
  );
}

function hasGradeMatch(normalizedTitle, grade) {
  if (!grade) return null;
  return normalizedTitle.includes(grade);
}

function filterRelevantResults(results, signals, mode) {
  const scored = results.map((item) => {
    const normalizedTitle = normalizeText(item.title);
    const titleTokens = new Set(tokenize(normalizedTitle));
    const matchScore = computeMatchScoreWithTokens(normalizedTitle, titleTokens, signals);
    const excluded = isExcludedTitle(normalizedTitle);
    const serialMatch = hasSerialMatch(normalizedTitle, titleTokens, signals?.serial || null);
    const gradeMatch = hasGradeMatch(normalizedTitle, signals?.grade || null);
    return {
      ...item,
      matchScore,
      serialMatch,
      gradeMatch,
      _normalizedTitle: normalizedTitle,
      _titleTokens: titleTokens,
      _excluded: excluded,
    };
  });

  let filtered = scored.filter((item) => !item._excluded);

  // Multi-player listing detection (3+ known NHL players = lot/u-pick)
  filtered = filtered.filter((item) => !isMultiPlayerListing(item._normalizedTitle));

  if (signals?.hasStrongPlayerTokens && signals.playerKeyToken) {
    const requiredMatches = filtered.filter((item) => item._titleTokens.has(signals.playerKeyToken));
    filtered = requiredMatches;
  }

  if (signals?.phrases?.length) {
    const strongPhrases = signals.phrases.filter((phrase) => STRONG_PHRASES.has(phrase));
    if (strongPhrases.length) {
      const withPhrase = filtered.filter((item) =>
        strongPhrases.some((phrase) => hasStrongPhraseMatch(item._normalizedTitle, phrase)),
      );
      filtered = withPhrase;
    }
  }

  let serialFallbackApplied = false;
  if (signals?.serial) {
    const serialMatches = filtered.filter((item) => item.serialMatch);
    if (serialMatches.length) {
      filtered = serialMatches;
    } else if (filtered.length) {
      serialFallbackApplied = true;
    }
  }

  let gradeFallbackApplied = false;
  if (signals?.grade) {
    const gradeMatches = filtered.filter((item) => item.gradeMatch);
    if (gradeMatches.length) {
      filtered = gradeMatches;
    } else if (filtered.length) {
      gradeFallbackApplied = true;
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
    .map(({_normalizedTitle, _titleTokens, _excluded, ...rest}) => ({
      ...rest,
      serialFallback: serialFallbackApplied,
      gradeFallback: gradeFallbackApplied,
    }));
}

async function searchEbayTextOnceDetailed(query, fxRates, options = {}) {
  const token = await getEbayToken();
  await globalLimiter.throttle();
  await recordApiCall("text");

  const useEndDateFilter = options.useEndDateFilter !== false;
  const autoCorrect = options.autoCorrect || null;
  const sortOrder = options.sort || "price";

  const params = new URLSearchParams({
    q: query,
    limit: String(DEFAULT_LIMIT),
    fieldgroups: "EXTENDED",
    category_ids: options.categoryId || HOCKEY_CARDS_CATEGORY,
    sort: sortOrder,
  });

  if (useEndDateFilter) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateFilter = ninetyDaysAgo.toISOString();
    params.set("filter", `buyingOptions:{AUCTION|FIXED_PRICE},itemEndDate:[${dateFilter}..]`);
  } else {
    params.set("filter", "buyingOptions:{AUCTION|FIXED_PRICE}");
  }

  if (autoCorrect) {
    params.set("auto_correct", autoCorrect);
  }

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

    if (response.status === 400 && autoCorrect && !options._retrying) {
      return searchEbayTextOnceDetailed(query, fxRates, {...options, autoCorrect: null, _retrying: true});
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

async function searchEbayTextOnce(query, fxRates, options = {}) {
  const {items} = await searchEbayTextOnceDetailed(query, fxRates, options);
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

async function searchEbayImageOnceDetailed(imageUrl, fxRates, options = {}) {
  const token = await getEbayToken();
  await globalLimiter.throttle();
  await recordApiCall("image");

  const imageBase64 = await fetchImageBase64(imageUrl);

  const params = new URLSearchParams({
    limit: String(DEFAULT_LIMIT),
    category_ids: options.categoryId || HOCKEY_CARDS_CATEGORY,
  });
  if (options.useFilters !== false) {
    params.set("filter", "buyingOptions:{AUCTION|FIXED_PRICE}");
  }

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
  const {results} = await searchEbayCardWithDebug(cardName, fxRates);
  return results;
}

async function searchEbayCardWithDebug(cardName, fxRates = null, {categoryId} = {}) {
  if (!cardName) {
    return {results: [], debug: {mode: "text", reason: "empty-name"}};
  }

  const sanitizedName = sanitizeUtf8(cardName);
  const signals = extractSignals(sanitizedName);
  const queries = buildSearchQueries(signals);
  const queryStats = [];

  let aggregated = [];

  const runQueries = async (queryList, options, phase) => {
    for (const query of queryList) {
      if (!query) continue;
      console.log(`eBay text search query: "${query}" (${phase})`);
      const opts = categoryId ? {...options, categoryId} : options;
      const {items, rawCount} = await searchEbayTextOnceDetailed(query, fxRates, opts);
      aggregated = mergeUniqueResults(aggregated, items);
      queryStats.push({
        query,
        rawCount,
        mappedCount: items.length,
        aggregatedCount: aggregated.length,
        phase,
        options: {
          useEndDateFilter: options?.useEndDateFilter !== false,
          autoCorrect: options?.autoCorrect || null,
        },
      });
      if (aggregated.length >= MIN_RESULTS_TARGET) break;
    }
  };

  // Phase A: ascending price (cheapest first)
  await runQueries(queries, {useEndDateFilter: true}, "A");

  // Phase A2: descending price (most expensive first) — gives full price spectrum
  const firstQuery = queries[0];
  if (firstQuery && aggregated.length > 0) {
    console.log(`eBay text search query: "${firstQuery}" (A-desc)`);
    const descOpts = {useEndDateFilter: true, sort: "-price"};
    if (categoryId) descOpts.categoryId = categoryId;
    const {items: descItems, rawCount: descRaw} = await searchEbayTextOnceDetailed(
        firstQuery, fxRates, descOpts,
    );
    aggregated = mergeUniqueResults(aggregated, descItems);
    queryStats.push({
      query: firstQuery, rawCount: descRaw, mappedCount: descItems.length,
      aggregatedCount: aggregated.length, phase: "A-desc",
      options: {useEndDateFilter: true, sort: "-price"},
    });
  }

  if (!aggregated.length) {
    await runQueries(queries, {useEndDateFilter: false}, "B");
  }

  if (!aggregated.length) {
    const rawQuery = buildQueryString([sanitizeUtf8(cardName)]);
    await runQueries([rawQuery], {useEndDateFilter: false, autoCorrect: "KEYWORD"}, "C");
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
      apiCalls: queryStats.length,
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
  const {results} = await searchEbayCardByImageWithDebug(imageUrl, cardName, fxRates);
  return results;
}

async function searchEbayCardByImageWithDebug(imageUrl, cardName, fxRates = null, {categoryId} = {}) {
  if (!imageUrl) {
    return {results: [], debug: {mode: "image", reason: "missing-image"}};
  }

  const imgOpts = categoryId ? {categoryId} : {};
  const {items, rawCount} = await searchEbayImageOnceDetailed(imageUrl, fxRates, imgOpts);
  const signals = cardName ? extractSignals(cardName) : null;
  let filtered = signals ? filterRelevantResults(items, signals, "image") : items;
  let fallback = null;

  if (!filtered.length) {
    const fallbackOpts = {useFilters: false};
    if (categoryId) fallbackOpts.categoryId = categoryId;
    const fallbackResp = await searchEbayImageOnceDetailed(imageUrl, fxRates, fallbackOpts);
    const fallbackItems = fallbackResp.items || [];
    fallback = {
      rawCount: fallbackResp.rawCount,
      mappedCount: fallbackItems.length,
    };
    filtered = signals ? filterRelevantResults(fallbackItems, signals, "image") : fallbackItems;
  }

  return {
    results: filtered,
    debug: {
      mode: "image",
      signals: buildSignalsSummary(signals),
      rawCount,
      mappedCount: items.length,
      filteredCount: filtered.length,
      apiCalls: 1 + (fallback ? 1 : 0),
      fallback,
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
 * Remove statistical outliers using IQR method
 */
function removeIqrOutliers(sortedPrices) {
  if (sortedPrices.length < 4) return {cleaned: sortedPrices, outliersRemoved: 0};

  const q1 = percentile(sortedPrices, 0.25);
  const q3 = percentile(sortedPrices, 0.75);
  const iqr = q3 - q1;

  if (iqr <= 0) return {cleaned: sortedPrices, outliersRemoved: 0};

  let multiplier = 1.5;
  let cleaned = sortedPrices.filter((p) => p >= q1 - multiplier * iqr && p <= q3 + multiplier * iqr);

  // If too aggressive, use wider fence
  if (cleaned.length < 3 && sortedPrices.length >= 5) {
    multiplier = 2.5;
    cleaned = sortedPrices.filter((p) => p >= q1 - multiplier * iqr && p <= q3 + multiplier * iqr);
  }

  if (cleaned.length < 2) return {cleaned: sortedPrices, outliersRemoved: 0};

  return {cleaned, outliersRemoved: sortedPrices.length - cleaned.length};
}

/**
 * Calculate weighted average using match scores as weights
 */
function weightedAverage(items) {
  if (!items.length) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  items.forEach((item) => {
    let weight = typeof item.matchScore === "number" ? Math.max(item.matchScore, 0.1) : 0.5;

    if (Array.isArray(item.sources)) {
      const hasText = item.sources.includes("text");
      const hasImage = item.sources.includes("image");
      if (hasText && hasImage) {
        // Cross-validated: found by both text and image — strongest signal
        weight *= 3.0;
      } else if (hasImage && !hasText) {
        // Image-only: visual match identifies exact card — strong signal
        weight *= 2.0;
      }
    }

    weightedSum += item.price * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate confidence score (0-100) for the price estimate
 */
function calculateConfidence(results, spreadRatio, serialFallback, gradeFallback) {
  let confidence = 0;

  // Factor 1: Number of results (30%)
  const count = results.length;
  const countScore = count >= 21 ? 100 : count >= 11 ? 80 : count >= 6 ? 60 : count >= 3 ? 40 : 20;
  confidence += countScore * 0.3;

  // Factor 2: Average match score (25%)
  const matchScores = results.map((item) => item.matchScore).filter((s) => typeof s === "number");
  const avgMatch = matchScores.length ? matchScores.reduce((s, v) => s + v, 0) / matchScores.length : 0;
  confidence += (avgMatch * 100) * 0.25;

  // Factor 3: Spread ratio (20%)
  const spreadScore = spreadRatio < 0.2 ? 100 : spreadRatio < 0.5 ? 70 : spreadRatio < 1.0 ? 40 : 10;
  confidence += spreadScore * 0.2;

  // Factor 4: Serial/grade fallback (10%)
  const fallbackScore = (serialFallback || gradeFallback) ? 30 : 100;
  confidence += fallbackScore * 0.1;

  // Factor 5: Hybrid cross-validation (15%)
  const hasSources = results.some((item) => Array.isArray(item.sources));
  if (hasSources) {
    const crossValidated = results.filter(
        (item) => Array.isArray(item.sources) && item.sources.includes("text") && item.sources.includes("image"),
    ).length;
    const crossPct = results.length > 0 ? crossValidated / results.length : 0;
    const crossScore = crossPct > 0.5 ? 100 : crossPct > 0.3 ? 70 : crossPct > 0 ? 50 : 30;
    confidence += crossScore * 0.15;
  } else {
    confidence += 50 * 0.15;
  }

  return Math.round(Math.min(100, Math.max(0, confidence)));
}

/**
 * Calculate realistic market price from ACTIVE listings
 * Uses IQR outlier removal, weighted median, dynamic discount,
 * and hybrid cross-validation for maximum accuracy.
 * @param {Array} results - Results from searchEbayCard or searchEbayCardByImage
 * @return {Object|null} {price, confidence, debug}
 */
function calculateEstimatedPriceDetailed(results) {
  if (!results || results.length === 0) return null;

  const fixedResults = results.filter((item) => !item.isAuctionOnly);
  const auctionFloor = getAuctionFloor(results);

  const baseResults = fixedResults.length ? fixedResults : results;
  const allPrices = baseResults
    .map((item) => item.price)
    .filter((price) => Number.isFinite(price))
    .sort((a, b) => a - b);

  if (!allPrices.length) return {price: null, debug: {reason: "no-prices"}};

  // IQR outlier removal
  const {cleaned: prices, outliersRemoved} = removeIqrOutliers(allPrices);

  // Trimmed mean after IQR cleaning
  const trimPercent = prices.length >= 8 ? 0.15 : prices.length >= 5 ? 0.1 : 0;
  const trimCount = Math.floor(prices.length * trimPercent);
  const trimmedPrices = trimCount > 0 ? prices.slice(trimCount, prices.length - trimCount) : prices;

  const median = percentile(prices, 0.5);

  // Weighted average using match scores
  const priceSet = new Set(trimmedPrices);
  const weightedItems = baseResults.filter((item) => Number.isFinite(item.price) && priceSet.has(item.price));
  const baseAverage = weightedItems.length >= 3
    ? weightedAverage(weightedItems)
    : (trimmedPrices.length
      ? trimmedPrices.reduce((sum, price) => sum + price, 0) / trimmedPrices.length
      : median);

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
  const avgMatch = matchScores.length
    ? matchScores.reduce((sum, score) => sum + score, 0) / matchScores.length : 0;
  if (avgMatch < 0.3) {
    discountPct += 0.05;
  } else if (avgMatch < 0.4) {
    discountPct += 0.03;
  } else if (avgMatch > 0.7) {
    discountPct -= 0.02;
  }

  const serialFallback = results.some((item) => item.serialFallback);
  if (serialFallback) {
    discountPct += 0.06;
  }

  const gradeFallback = results.some((item) => item.gradeFallback);
  if (gradeFallback) {
    discountPct += 0.05;
  }

  // Hybrid cross-validation discount adjustment
  const hasSources = results.some((item) => Array.isArray(item.sources));
  let crossValidatedPct = 0;
  if (hasSources) {
    const crossValidated = results.filter(
        (item) => Array.isArray(item.sources) && item.sources.includes("text") && item.sources.includes("image"),
    ).length;
    crossValidatedPct = results.length > 0 ? crossValidated / results.length : 0;
    if (crossValidatedPct > 0.5) {
      discountPct -= 0.05;
    } else if (crossValidatedPct > 0.3) {
      discountPct -= 0.03;
    } else if (hasSources && crossValidatedPct === 0) {
      discountPct += 0.05;
    }
  }

  // T3: Generic name protection — huge spread with many results indicates
  // the query was too broad (e.g., just "Connor McDavid" with no year/set)
  // Use P25 instead of weighted average to avoid inflated prices
  let genericFallback = false;
  const cleanedRange = prices.length >= 2 ? prices[prices.length - 1] / prices[0] : 1;
  // Only activate for cards with high absolute price ceiling (>€10) to avoid
  // penalizing cheap base cards (e.g., Valábik €0.61-€1.68)
  const maxCleanedPrice = prices[prices.length - 1] || 0;
  if (prices.length >= 20 && maxCleanedPrice > 10 && (spreadRatio > 2.0 || cleanedRange > 50)) {
    genericFallback = true;
    discountPct += 0.10;
  }

  discountPct = Math.min(Math.max(discountPct, 0.1), 0.55);

  let discountedPrice;
  if (genericFallback) {
    // For generic queries, use P25 (lower quartile) as base instead of weighted average
    // This biases toward cheaper (more common base) cards which are more likely what the user has
    const p25 = percentile(prices, 0.25);
    discountedPrice = p25 * (1 - discountPct);
  } else {
    discountedPrice = baseAverage * (1 - discountPct);
  }
  const finalPrice = auctionFloor ? Math.max(discountedPrice, auctionFloor) : discountedPrice;

  let confidence = calculateConfidence(results, spreadRatio, serialFallback, gradeFallback);
  if (genericFallback) {
    confidence = Math.min(confidence, 35); // cap confidence for generic queries
  }

  console.log(`eBay pricing: ${prices.length} listings (${outliersRemoved} outliers removed), discount ${(discountPct * 100).toFixed(0)}%, confidence ${confidence}%`);
  if (auctionFloor) {
    console.log(`Auction floor applied: €${auctionFloor.toFixed(2)}`);
  }

  const debug = {
    totalResults: results.length,
    fixedResults: fixedResults.length,
    auctionCandidates: results.filter((item) => item.isAuctionOnly).length,
    auctionFloor: auctionFloor ? parseFloat(auctionFloor.toFixed(2)) : null,
    outliersRemoved,
    serialFallback,
    gradeFallback,
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
    avgMatchScore: avgMatch ? parseFloat(avgMatch.toFixed(3)) : null,
    crossValidatedPct: hasSources ? parseFloat(crossValidatedPct.toFixed(3)) : null,
    confidence,
    appliedFloor: auctionFloor ? finalPrice === auctionFloor : false,
    genericFallback,
    cleanedRange: parseFloat(cleanedRange.toFixed(1)),
  };

  return {price: parseFloat(finalPrice.toFixed(2)), confidence, debug};
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
