/**
 * Global rate limiter for eBay API and user requests
 * Ensures we stay within daily budget limits and prevent abuse
 */

const REQUESTS_PER_SECOND = 2; // Max 2 eBay calls/second
const DAILY_BUDGET = 4500; // 90% of 5,000 (10% safety margin)

// User rate limits - prevent abuse
const USER_LIMITS = {
  MAX_CARDS_PER_USER: 500,           // Max cards per user
  MAX_UPDATES_PER_HOUR: 2,           // Max manual price updates per hour
  MAX_FUNCTION_CALLS_PER_MINUTE: 30, // Max Cloud Function calls per user per minute
};

/**
 * Global rate limiter singleton
 */
class GlobalRateLimiter {
  /**
   * Constructor
   */
  constructor() {
    this.callsToday = 0;
    this.lastReset = new Date().setHours(0, 0, 0, 0);
    this.lastRequest = 0;
    this.delay = 1000 / REQUESTS_PER_SECOND;
    // Track per-user function calls
    this.userCalls = new Map();
  }

  /**
   * Check if we have budget remaining
   * Resets counter at midnight
   */
  async checkBudget() {
    const today = new Date().setHours(0, 0, 0, 0);

    // Reset counter at midnight
    if (today > this.lastReset) {
      console.log("🔄 Daily budget reset");
      this.callsToday = 0;
      this.lastReset = today;
      this.userCalls.clear(); // Clear user tracking too
    }

    // Check if we have budget
    if (this.callsToday >= DAILY_BUDGET) {
      throw new Error("Daily eBay API budget exceeded");
    }
  }

  /**
   * Check if user is within rate limits
   * @param {string} userId - Firebase user ID
   * @return {boolean} True if allowed
   */
  checkUserRateLimit(userId) {
    if (!userId) return false;

    const now = Date.now();
    const minuteAgo = now - 60000;

    // Get or create user tracking
    if (!this.userCalls.has(userId)) {
      this.userCalls.set(userId, []);
    }

    const userCallTimes = this.userCalls.get(userId);

    // Remove old entries (older than 1 minute)
    const recentCalls = userCallTimes.filter(t => t > minuteAgo);
    this.userCalls.set(userId, recentCalls);

    // Check limit
    if (recentCalls.length >= USER_LIMITS.MAX_FUNCTION_CALLS_PER_MINUTE) {
      console.warn(`⚠️ User ${userId} exceeded rate limit: ${recentCalls.length} calls/min`);
      return false;
    }

    // Record this call
    recentCalls.push(now);
    return true;
  }

  /**
   * Throttle request to respect rate limit
   * Must be called before each eBay API call
   */
  async throttle() {
    // Check budget first
    await this.checkBudget();

    // Calculate time since last request
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;

    // Wait if needed
    if (timeSinceLastRequest < this.delay) {
      const waitTime = this.delay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Update counters
    this.lastRequest = Date.now();
    this.callsToday++;
  }

  /**
   * Get remaining budget for today
   * @return {number} Remaining API calls
   */
  getRemainingBudget() {
    const today = new Date().setHours(0, 0, 0, 0);

    // Reset if new day
    if (today > this.lastReset) {
      this.callsToday = 0;
      this.lastReset = today;
    }

    return Math.max(0, DAILY_BUDGET - this.callsToday);
  }

  /**
   * Get statistics
   * @return {Object} Stats object
   */
  getStats() {
    return {
      callsToday: this.callsToday,
      dailyBudget: DAILY_BUDGET,
      remainingBudget: this.getRemainingBudget(),
      utilizationPercent: Math.round((this.callsToday / DAILY_BUDGET) * 100),
      lastReset: new Date(this.lastReset).toISOString(),
      activeUsers: this.userCalls.size,
    };
  }
}

// Export singleton instance
const globalLimiter = new GlobalRateLimiter();

module.exports = {
  globalLimiter,
  DAILY_BUDGET,
  USER_LIMITS,
};
