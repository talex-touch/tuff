/**
 * FxRateProvider - 实时汇率服务
 *
 * 功能:
 * - 从 ECB 或备用 API 获取实时汇率
 * - SQLite 缓存 + 定时刷新
 * - 离线 fallback 支持
 */

import { createLogger } from '../../../../../utils/logger'

const log = createLogger('FxRateProvider')

// 汇率数据结构
export interface FxRate {
  base: string
  quote: string
  rate: number
  updatedAt: number
  source: string
}

// 汇率缓存
export interface FxRateCache {
  rates: Map<string, FxRate>
  lastRefresh: number
  source: string
}

// 货币别名
const CURRENCY_ALIASES: Record<string, string> = {
  '美元': 'USD',
  '人民币': 'CNY',
  '元': 'CNY',
  '欧元': 'EUR',
  '日元': 'JPY',
  '英镑': 'GBP',
  '港币': 'HKD',
  '港元': 'HKD',
  '台币': 'TWD',
  '新台币': 'TWD',
  '韩元': 'KRW',
  '澳元': 'AUD',
  '加元': 'CAD',
  '新币': 'SGD',
  '新加坡元': 'SGD',
  '泰铢': 'THB',
  '越南盾': 'VND',
  '印度卢比': 'INR',
  '瑞士法郎': 'CHF',
  '比特币': 'BTC',
  '以太坊': 'ETH',
  'dollar': 'USD',
  'dollars': 'USD',
  'euro': 'EUR',
  'euros': 'EUR',
  'yen': 'JPY',
  'pound': 'GBP',
  'pounds': 'GBP',
  'yuan': 'CNY',
  'rmb': 'CNY',
}

// 货币符号
const CURRENCY_SYMBOLS: Record<string, string> = {
  '$': 'USD',
  '¥': 'CNY',
  '￥': 'CNY',
  '€': 'EUR',
  '£': 'GBP',
  '₩': 'KRW',
  '₫': 'VND',
  '฿': 'THB',
  '₿': 'BTC',
  'Ξ': 'ETH',
}

// 默认汇率 (fallback)
const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  CNY: 7.25,
  EUR: 0.92,
  JPY: 151.2,
  GBP: 0.79,
  HKD: 7.81,
  TWD: 32.4,
  KRW: 1364,
  AUD: 1.49,
  CAD: 1.37,
  SGD: 1.36,
  THB: 36.4,
  VND: 24840,
  INR: 83.2,
  CHF: 0.86,
  BTC: 0.000018,
  ETH: 0.00026,
}

// API 配置
const ECB_API = 'https://api.frankfurter.app/latest?base=USD'
const BACKUP_API = 'https://open.er-api.com/v6/latest/USD'
const REFRESH_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000 // 72 hours
const REQUEST_TIMEOUT_MS = 10_000

/**
 * FxRateProvider 类
 */
export class FxRateProvider {
  private cache: FxRateCache = {
    rates: new Map(),
    lastRefresh: 0,
    source: 'default',
  }

  private refreshTimer: NodeJS.Timeout | null = null
  private isRefreshing = false
  private retryCount = 0
  private maxRetries = 3

  constructor() {
    // Initialize with default rates
    this.loadDefaultRates()
  }

  /**
   * Initialize and start auto-refresh
   */
  start(): void {
    log.info('Starting FxRateProvider')
    this.refresh()
    this.refreshTimer = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS)
  }

  /**
   * Stop auto-refresh
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
    log.info('FxRateProvider stopped')
  }

  /**
   * Get exchange rate between two currencies
   */
  getRate(from: string, to: string): FxRate | null {
    const fromCode = this.normalizeCurrency(from)
    const toCode = this.normalizeCurrency(to)

    if (!fromCode || !toCode) return null

    const fromRate = this.cache.rates.get(fromCode)
    const toRate = this.cache.rates.get(toCode)

    if (!fromRate || !toRate) return null

    // Calculate cross rate (both rates are against USD)
    const rate = toRate.rate / fromRate.rate

    return {
      base: fromCode,
      quote: toCode,
      rate,
      updatedAt: this.cache.lastRefresh,
      source: this.cache.source,
    }
  }

  /**
   * Convert currency amount
   */
  convert(amount: number, from: string, to: string): {
    result: number
    rate: FxRate | null
    formatted: string
  } | null {
    const fxRate = this.getRate(from, to)
    if (!fxRate) return null

    const result = amount * fxRate.rate
    return {
      result,
      rate: fxRate,
      formatted: this.formatCurrency(result, fxRate.quote),
    }
  }

  /**
   * Get all available currencies
   */
  getCurrencies(): string[] {
    return Array.from(this.cache.rates.keys())
  }

  /**
   * Get cache status
   */
  getStatus(): {
    lastRefresh: number
    source: string
    isStale: boolean
    currencyCount: number
  } {
    const isStale = Date.now() - this.cache.lastRefresh > CACHE_MAX_AGE_MS

    return {
      lastRefresh: this.cache.lastRefresh,
      source: this.cache.source,
      isStale,
      currencyCount: this.cache.rates.size,
    }
  }

  /**
   * Normalize currency input to ISO code
   */
  normalizeCurrency(input: string): string | null {
    if (!input) return null

    const trimmed = input.trim().toUpperCase()

    // Check if it's already a valid code
    if (this.cache.rates.has(trimmed)) {
      return trimmed
    }

    // Check symbol
    const symbol = CURRENCY_SYMBOLS[input.trim()]
    if (symbol) return symbol

    // Check alias
    const alias = CURRENCY_ALIASES[input.trim().toLowerCase()]
    if (alias) return alias

    // Check lowercase version
    const lower = input.trim().toLowerCase()
    if (CURRENCY_ALIASES[lower]) {
      return CURRENCY_ALIASES[lower]
    }

    return null
  }

  /**
   * Refresh rates from API
   */
  async refresh(): Promise<boolean> {
    if (this.isRefreshing) {
      log.debug('Refresh already in progress')
      return false
    }

    this.isRefreshing = true
    log.debug('Refreshing exchange rates')

    try {
      // Try ECB first
      let rates = await this.fetchFromECB()

      // Fallback to backup API
      if (!rates) {
        log.warn('ECB API failed, trying backup')
        rates = await this.fetchFromBackup()
      }

      if (rates) {
        this.updateCache(rates, 'ecb')
        this.retryCount = 0
        log.info('Exchange rates refreshed', {
          meta: { count: Object.keys(rates).length, source: this.cache.source },
        })
        return true
      }

      // Exponential backoff on failure
      this.retryCount++
      if (this.retryCount < this.maxRetries) {
        const delay = Math.min(1000 * 2 ** this.retryCount, 30000)
        log.warn(`Rate refresh failed, retrying in ${delay}ms`, { meta: { attempt: this.retryCount } })
        setTimeout(() => this.refresh(), delay)
      }
      else {
        log.error('Max retries reached, using cached/default rates')
      }

      return false
    }
    finally {
      this.isRefreshing = false
    }
  }

  /**
   * Fetch from ECB (Frankfurter API)
   */
  private async fetchFromECB(): Promise<Record<string, number> | null> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const response = await fetch(ECB_API, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })

      clearTimeout(timeout)

      if (!response.ok) return null

      const data = await response.json() as {
        base: string
        rates: Record<string, number>
      }

      // Convert to USD-based rates
      const rates: Record<string, number> = { USD: 1 }
      for (const [currency, rate] of Object.entries(data.rates)) {
        rates[currency] = rate
      }

      return rates
    }
    catch (error) {
      log.debug('ECB API error', { error })
      return null
    }
  }

  /**
   * Fetch from backup API
   */
  private async fetchFromBackup(): Promise<Record<string, number> | null> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const response = await fetch(BACKUP_API, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })

      clearTimeout(timeout)

      if (!response.ok) return null

      const data = await response.json() as {
        base_code: string
        rates: Record<string, number>
      }

      return data.rates
    }
    catch (error) {
      log.debug('Backup API error', { error })
      return null
    }
  }

  /**
   * Update cache with new rates
   */
  private updateCache(rates: Record<string, number>, source: string): void {
    const now = Date.now()

    for (const [currency, rate] of Object.entries(rates)) {
      this.cache.rates.set(currency, {
        base: 'USD',
        quote: currency,
        rate,
        updatedAt: now,
        source,
      })
    }

    // Add crypto rates if not present
    if (!this.cache.rates.has('BTC')) {
      this.cache.rates.set('BTC', {
        base: 'USD',
        quote: 'BTC',
        rate: DEFAULT_RATES.BTC,
        updatedAt: now,
        source: 'default',
      })
    }

    if (!this.cache.rates.has('ETH')) {
      this.cache.rates.set('ETH', {
        base: 'USD',
        quote: 'ETH',
        rate: DEFAULT_RATES.ETH,
        updatedAt: now,
        source: 'default',
      })
    }

    this.cache.lastRefresh = now
    this.cache.source = source
  }

  /**
   * Load default rates
   */
  private loadDefaultRates(): void {
    const now = Date.now()

    for (const [currency, rate] of Object.entries(DEFAULT_RATES)) {
      this.cache.rates.set(currency, {
        base: 'USD',
        quote: currency,
        rate,
        updatedAt: now,
        source: 'default',
      })
    }

    this.cache.lastRefresh = now
    this.cache.source = 'default'

    log.debug('Loaded default rates', { meta: { count: Object.keys(DEFAULT_RATES).length } })
  }

  /**
   * Format currency for display
   */
  private formatCurrency(amount: number, currency: string): string {
    // Use appropriate decimal places based on currency
    const decimals = ['JPY', 'KRW', 'VND'].includes(currency) ? 0 : 2
    return `${amount.toFixed(decimals)} ${currency}`
  }
}

// Singleton instance
export const fxRateProvider = new FxRateProvider()
