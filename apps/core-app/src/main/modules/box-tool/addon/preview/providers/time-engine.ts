/**
 * TimeEngine - 时间计算引擎
 *
 * 功能:
 * - 时间解析与计算 (now + 3h, date - 42d)
 * - 时区转换
 * - 时间差计算
 * - 倒计时格式化
 */

import { createLogger } from '../../../../../utils/logger'

const log = createLogger('TimeEngine')

// 时间单位映射 (毫秒)
const TIME_UNITS: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  毫秒: 1,
  s: 1000,
  sec: 1000,
  second: 1000,
  seconds: 1000,
  秒: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  分: 60 * 1000,
  分钟: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  小时: 60 * 60 * 1000,
  时: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  天: 24 * 60 * 60 * 1000,
  日: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  周: 7 * 24 * 60 * 60 * 1000,
  星期: 7 * 24 * 60 * 60 * 1000,
  mo: 30 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
  月: 30 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  years: 365 * 24 * 60 * 60 * 1000,
  年: 365 * 24 * 60 * 60 * 1000
}

// 时区别名
const TIMEZONE_ALIASES: Record<string, string> = {
  beijing: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai',
  china: 'Asia/Shanghai',
  中国: 'Asia/Shanghai',
  北京: 'Asia/Shanghai',
  上海: 'Asia/Shanghai',
  tokyo: 'Asia/Tokyo',
  japan: 'Asia/Tokyo',
  东京: 'Asia/Tokyo',
  日本: 'Asia/Tokyo',
  seoul: 'Asia/Seoul',
  korea: 'Asia/Seoul',
  首尔: 'Asia/Seoul',
  韩国: 'Asia/Seoul',
  london: 'Europe/London',
  uk: 'Europe/London',
  伦敦: 'Europe/London',
  英国: 'Europe/London',
  paris: 'Europe/Paris',
  france: 'Europe/Paris',
  巴黎: 'Europe/Paris',
  法国: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  germany: 'Europe/Berlin',
  柏林: 'Europe/Berlin',
  德国: 'Europe/Berlin',
  newyork: 'America/New_York',
  'new york': 'America/New_York',
  nyc: 'America/New_York',
  纽约: 'America/New_York',
  la: 'America/Los_Angeles',
  'los angeles': 'America/Los_Angeles',
  洛杉矶: 'America/Los_Angeles',
  sf: 'America/Los_Angeles',
  pst: 'America/Los_Angeles',
  est: 'America/New_York',
  cst: 'America/Chicago',
  mst: 'America/Denver',
  utc: 'UTC',
  gmt: 'UTC',
  sydney: 'Australia/Sydney',
  悉尼: 'Australia/Sydney',
  singapore: 'Asia/Singapore',
  新加坡: 'Asia/Singapore',
  hongkong: 'Asia/Hong_Kong',
  'hong kong': 'Asia/Hong_Kong',
  香港: 'Asia/Hong_Kong',
  taipei: 'Asia/Taipei',
  台北: 'Asia/Taipei',
  bangkok: 'Asia/Bangkok',
  曼谷: 'Asia/Bangkok',
  dubai: 'Asia/Dubai',
  迪拜: 'Asia/Dubai',
  moscow: 'Europe/Moscow',
  莫斯科: 'Europe/Moscow'
}

// 时间计算结果
export interface TimeResult {
  timestamp: number
  date: Date
  formatted: {
    local: string
    utc: string
    iso: string
  }
  weekday: string
  weekNumber: number
  dayOfYear: number
  timezone: string
}

// 时间差结果
export interface TimeDiffResult {
  totalMs: number
  years: number
  months: number
  weeks: number
  days: number
  hours: number
  minutes: number
  seconds: number
  formatted: string
  humanReadable: string
}

/**
 * TimeEngine 类
 */
export class TimeEngine {
  private localTimezone: string

  constructor() {
    this.localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    log.debug('TimeEngine initialized', { meta: { timezone: this.localTimezone } })
  }

  /**
   * 解析时间表达式
   * 支持: now, today, tomorrow, yesterday, 日期字符串, 时间戳
   */
  parseTime(input: string): Date | null {
    const normalized = input.trim().toLowerCase()

    // Special keywords
    if (normalized === 'now' || normalized === '现在') {
      return new Date()
    }
    if (normalized === 'today' || normalized === '今天') {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d
    }
    if (normalized === 'tomorrow' || normalized === '明天') {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(0, 0, 0, 0)
      return d
    }
    if (normalized === 'yesterday' || normalized === '昨天') {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      d.setHours(0, 0, 0, 0)
      return d
    }

    // Try parsing as date
    const parsed = new Date(input)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }

    // Try parsing as timestamp
    const timestamp = Number.parseInt(input, 10)
    if (!Number.isNaN(timestamp)) {
      // Assume milliseconds if > 10 digits, otherwise seconds
      return new Date(timestamp > 1e11 ? timestamp : timestamp * 1000)
    }

    return null
  }

  /**
   * 解析时间偏移
   * 支持: +3h, -2d, +1h30m
   */
  parseOffset(input: string): number | null {
    const pattern = /([+-]?\d+(?:\.\d+)?)\s*([a-z\u4E00-\u9FA5]+)/gi
    let totalMs = 0
    let hasMatch = false

    let match
    while ((match = pattern.exec(input)) !== null) {
      const value = Number.parseFloat(match[1])
      const unit = match[2].toLowerCase()
      const unitMs = TIME_UNITS[unit]

      if (unitMs) {
        totalMs += value * unitMs
        hasMatch = true
      }
    }

    return hasMatch ? totalMs : null
  }

  /**
   * 执行时间计算
   * 支持: now + 3h, 2025-01-01 - 42d
   */
  calculate(expression: string): TimeResult | null {
    try {
      // Split by +/- but keep the operator
      const parts = expression.split(/\s*([+-])\s*/).filter(Boolean)

      if (parts.length === 0) return null

      // First part should be a time reference
      let baseTime = this.parseTime(parts[0])
      if (!baseTime) {
        // If not a time, try as expression starting with now
        baseTime = new Date()
        parts.unshift('now')
      }

      let result = baseTime.getTime()

      // Process remaining parts
      for (let i = 1; i < parts.length; i += 2) {
        const operator = parts[i]
        const operand = parts[i + 1]

        if (!operand) break

        // Try to parse as offset
        const offset = this.parseOffset(operand)
        if (offset !== null) {
          result = operator === '+' ? result + offset : result - offset
        } else {
          // Try to parse as date for subtraction
          const otherTime = this.parseTime(operand)
          if (otherTime && operator === '-') {
            // Return time difference instead
            return this.getTimeResult(new Date(result - otherTime.getTime()))
          }
        }
      }

      return this.getTimeResult(new Date(result))
    } catch (error) {
      log.debug('Time calculation error', { error })
      return null
    }
  }

  /**
   * 计算两个时间之间的差值
   */
  diff(from: Date | string, to: Date | string): TimeDiffResult | null {
    const fromDate = typeof from === 'string' ? this.parseTime(from) : from
    const toDate = typeof to === 'string' ? this.parseTime(to) : to

    if (!fromDate || !toDate) return null

    const diffMs = toDate.getTime() - fromDate.getTime()
    const absDiff = Math.abs(diffMs)
    const isPast = diffMs < 0

    const seconds = Math.floor(absDiff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    const weeks = Math.floor(days / 7)
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)

    return {
      totalMs: diffMs,
      years,
      months: months % 12,
      weeks: weeks % 4,
      days: days % 7,
      hours: hours % 24,
      minutes: minutes % 60,
      seconds: seconds % 60,
      formatted: this.formatDuration(absDiff),
      humanReadable: this.humanReadableDuration(absDiff, isPast)
    }
  }

  /**
   * 时区转换
   */
  convertTimezone(date: Date | string, fromTz: string, toTz: string): TimeResult | null {
    const sourceDate = typeof date === 'string' ? this.parseTime(date) : date
    if (!sourceDate) return null

    const fromTimezone = this.normalizeTimezone(fromTz)
    const toTimezone = this.normalizeTimezone(toTz)

    if (!fromTimezone || !toTimezone) return null

    try {
      // Get UTC time
      const utcTime = sourceDate.getTime()

      // Format in target timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: toTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })

      const targetDateStr = formatter.format(new Date(utcTime))
      const targetDate = new Date(targetDateStr)

      return this.getTimeResult(targetDate, toTimezone)
    } catch (error) {
      log.debug('Timezone conversion error', { error })
      return null
    }
  }

  /**
   * 获取当前时间信息
   */
  now(timezone?: string): TimeResult {
    const tz = timezone ? this.normalizeTimezone(timezone) : this.localTimezone
    return this.getTimeResult(new Date(), tz || this.localTimezone)
  }

  /**
   * 规范化时区名称
   */
  normalizeTimezone(input: string): string | null {
    const normalized = input.trim().toLowerCase().replace(/\s+/g, '')

    // Check alias
    if (TIMEZONE_ALIASES[normalized]) {
      return TIMEZONE_ALIASES[normalized]
    }

    // Check if it's a valid IANA timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: input })
      return input
    } catch {
      return null
    }
  }

  /**
   * 格式化持续时间
   */
  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    const parts: string[] = []

    if (days > 0) parts.push(`${days}d`)
    if (hours % 24 > 0) parts.push(`${hours % 24}h`)
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`)
    if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`)

    return parts.join(' ')
  }

  /**
   * 人类可读的时长描述
   */
  humanReadableDuration(ms: number, isPast: boolean = false): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    const weeks = Math.floor(days / 7)
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)

    let result: string

    if (years > 0) {
      result = `${years} 年 ${months % 12 > 0 ? `${months % 12} 个月` : ''}`
    } else if (months > 0) {
      result = `${months} 个月 ${days % 30 > 0 ? `${days % 30} 天` : ''}`
    } else if (weeks > 0) {
      result = `${weeks} 周 ${days % 7 > 0 ? `${days % 7} 天` : ''}`
    } else if (days > 0) {
      result = `${days} 天 ${hours % 24 > 0 ? `${hours % 24} 小时` : ''}`
    } else if (hours > 0) {
      result = `${hours} 小时 ${minutes % 60 > 0 ? `${minutes % 60} 分钟` : ''}`
    } else if (minutes > 0) {
      result = `${minutes} 分钟 ${seconds % 60 > 0 ? `${seconds % 60} 秒` : ''}`
    } else {
      result = `${seconds} 秒`
    }

    return isPast ? `${result.trim()}前` : `${result.trim()}后`
  }

  /**
   * 获取时间结果
   */
  private getTimeResult(date: Date, timezone?: string): TimeResult {
    const tz = timezone || this.localTimezone

    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const startOfYear = new Date(date.getFullYear(), 0, 1)
    const dayOfYear =
      Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1

    // Calculate week number
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
    const pastDays = (date.getTime() - firstDayOfYear.getTime()) / 86400000
    const weekNumber = Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7)

    return {
      timestamp: date.getTime(),
      date,
      formatted: {
        local: date.toLocaleString('zh-CN', { timeZone: tz }),
        utc: date.toISOString(),
        iso: date.toISOString()
      },
      weekday: weekdays[date.getDay()],
      weekNumber,
      dayOfYear,
      timezone: tz
    }
  }
}

// Singleton instance
export const timeEngine = new TimeEngine()
