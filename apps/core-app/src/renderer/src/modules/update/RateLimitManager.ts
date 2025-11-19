/**
 * Rate limit information interface
 */
export interface RateLimitInfo {
  limit: number
  remaining: number
  resetTime: number
  retryAfter?: number
}

/**
 * Rate limit manager for handling API rate limits
 */
export class RateLimitManager {
  private rateLimits: Map<string, RateLimitInfo> = new Map()
  private readonly defaultRetryAfter = 60 * 1000 // 1 minute default retry after

  /**
   * Get default retry after time
   * @returns Default retry after time in milliseconds
   */
  getDefaultRetryAfter(): number {
    return this.defaultRetryAfter
  }

  /**
   * Update rate limit information from API response headers
   * @param source - API source identifier
   * @param headers - Response headers
   */
  updateRateLimit(source: string, headers: Record<string, string>): void {
    try {
      const limit = Number.parseInt(headers['x-ratelimit-limit'] || '0', 10)
      const remaining = Number.parseInt(headers['x-ratelimit-remaining'] || '0', 10)
      const resetTime = Number.parseInt(headers['x-ratelimit-reset'] || '0', 10) * 1000 // Convert to milliseconds
      const retryAfter = Number.parseInt(headers['retry-after'] || '0', 10) * 1000 // Convert to milliseconds

      // Validate parsed values
      if (limit > 0 && !isNaN(limit) && !isNaN(remaining) && !isNaN(resetTime)) {
        this.rateLimits.set(source, {
          limit,
          remaining: Math.max(0, remaining), // Ensure non-negative
          resetTime: Math.max(Date.now(), resetTime), // Ensure reset time is in the future
          retryAfter: retryAfter > 0 && !isNaN(retryAfter) ? retryAfter : undefined,
        })
      }
    }
    catch (error) {
      console.warn(`Failed to update rate limit for ${source}:`, error)
    }
  }

  /**
   * Check if API call is allowed based on rate limits
   * @param source - API source identifier
   * @returns True if API call is allowed
   */
  isAllowed(source: string): boolean {
    const rateLimit = this.rateLimits.get(source)
    if (!rateLimit) {
      return true // No rate limit info, allow the call
    }

    const now = Date.now()

    // Check if we're still in the retry-after period
    if (rateLimit.retryAfter && now < rateLimit.retryAfter) {
      return false
    }

    // Check if rate limit has reset
    if (now >= rateLimit.resetTime) {
      return true
    }

    // Check if we have remaining requests
    return rateLimit.remaining > 0
  }

  /**
   * Get time until rate limit resets
   * @param source - API source identifier
   * @returns Time in milliseconds until reset, or 0 if no limit
   */
  getTimeUntilReset(source: string): number {
    const rateLimit = this.rateLimits.get(source)
    if (!rateLimit) {
      return 0
    }

    const now = Date.now()

    // If we're in retry-after period, return retry-after time
    if (rateLimit.retryAfter && now < rateLimit.retryAfter) {
      return rateLimit.retryAfter - now
    }

    // Return time until reset
    return Math.max(0, rateLimit.resetTime - now)
  }

  /**
   * Get human-readable time until rate limit resets
   * @param source - API source identifier
   * @returns Human-readable time string
   */
  getTimeUntilResetString(source: string): string {
    const timeUntilReset = this.getTimeUntilReset(source)

    if (timeUntilReset === 0) {
      return 'No limit'
    }

    const minutes = Math.floor(timeUntilReset / (60 * 1000))
    const seconds = Math.floor((timeUntilReset % (60 * 1000)) / 1000)

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    else {
      return `${seconds}s`
    }
  }

  /**
   * Get rate limit status for a source
   * @param source - API source identifier
   * @returns Rate limit status or null if no info
   */
  getRateLimitStatus(source: string): RateLimitInfo | null {
    return this.rateLimits.get(source) || null
  }

  /**
   * Check if we're approaching rate limit (less than 10% remaining)
   * @param source - API source identifier
   * @returns True if approaching rate limit
   */
  isApproachingLimit(source: string): boolean {
    const rateLimit = this.rateLimits.get(source)
    if (!rateLimit) {
      return false
    }

    const remainingPercentage = (rateLimit.remaining / rateLimit.limit) * 100
    return remainingPercentage < 10
  }

  /**
   * Get recommended delay before next API call
   * @param source - API source identifier
   * @returns Recommended delay in milliseconds
   */
  getRecommendedDelay(source: string): number {
    const rateLimit = this.rateLimits.get(source)
    if (!rateLimit) {
      return 0
    }

    const now = Date.now()

    // If we're in retry-after period, return retry-after time
    if (rateLimit.retryAfter && now < rateLimit.retryAfter) {
      return rateLimit.retryAfter - now
    }

    // If we're approaching limit, add some delay
    if (this.isApproachingLimit(source)) {
      const timeUntilReset = rateLimit.resetTime - now
      return Math.min(timeUntilReset / rateLimit.remaining, 60000) // Max 1 minute delay
    }

    return 0
  }

  /**
   * Clear rate limit information for a source
   * @param source - API source identifier
   */
  clearRateLimit(source: string): void {
    this.rateLimits.delete(source)
  }

  /**
   * Clear all rate limit information
   */
  clearAllRateLimits(): void {
    this.rateLimits.clear()
  }

  /**
   * Get all rate limit information
   * @returns Map of all rate limit info
   */
  getAllRateLimits(): Map<string, RateLimitInfo> {
    return new Map(this.rateLimits)
  }

  /**
   * Calculate exponential backoff delay
   * @param attempt - Current attempt number (0-based)
   * @param baseDelay - Base delay in milliseconds
   * @param maxDelay - Maximum delay in milliseconds
   * @returns Calculated delay
   */
  calculateBackoffDelay(attempt: number, baseDelay = 1000, maxDelay = 60000): number {
    const delay = Math.min(baseDelay * 2 ** attempt, maxDelay)
    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay
    return delay + jitter
  }

  /**
   * Check if we should use exponential backoff
   * @param source - API source identifier
   * @param attempt - Current attempt number
   * @returns True if should use backoff
   */
  shouldUseBackoff(source: string, attempt: number): boolean {
    const rateLimit = this.rateLimits.get(source)
    if (!rateLimit) {
      return false
    }

    // Use backoff if we're rate limited or approaching limit
    return rateLimit.remaining === 0 || this.isApproachingLimit(source) || attempt > 0
  }

  /**
   * Get remaining requests for a source
   * @param source - API source identifier
   * @returns Number of remaining requests or null if no info
   */
  getRemainingRequests(source: string): number | null {
    const rateLimit = this.rateLimits.get(source)
    return rateLimit ? rateLimit.remaining : null
  }

  /**
   * Get total limit for a source
   * @param source - API source identifier
   * @returns Total limit or null if no info
   */
  getTotalLimit(source: string): number | null {
    const rateLimit = this.rateLimits.get(source)
    return rateLimit ? rateLimit.limit : null
  }

  /**
   * Check if a source has any rate limit information
   * @param source - API source identifier
   * @returns True if source has rate limit info
   */
  hasRateLimitInfo(source: string): boolean {
    return this.rateLimits.has(source)
  }

  /**
   * Get the number of sources with rate limit information
   * @returns Number of sources
   */
  getSourceCount(): number {
    return this.rateLimits.size
  }
}

/**
 * Singleton rate limit manager instance
 */
export const rateLimitManager = new RateLimitManager()
