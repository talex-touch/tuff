import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { ADMIN_FORMAT_EMPTY, createAdminFormat, resolveAdminLocale } from './useAdminFormat'

// Shaped like vue-i18n for the duration messages: the key and its values.
function fakeT(key: string, named: Record<string, unknown>) {
  return `${key.split('.').at(-1)}(${Object.values(named).join(',')})`
}

function formatFor(locale: string) {
  return createAdminFormat(() => locale, fakeT)
}

// Built from local fields, so the expectations hold in any test time zone.
const SAMPLE = new Date(2026, 8, 30, 20, 46, 5)

describe('resolveAdminLocale', () => {
  it('maps the app locales to BCP-47 and falls back to en-US', () => {
    expect(resolveAdminLocale('zh')).toBe('zh-CN')
    expect(resolveAdminLocale('zh-TW')).toBe('zh-CN')
    expect(resolveAdminLocale('en')).toBe('en-US')
    expect(resolveAdminLocale('fr')).toBe('en-US')
    expect(resolveAdminLocale(undefined)).toBe('en-US')
  })
})

describe('createAdminFormat', () => {
  it('prints table times as one fixed-width line in either locale', () => {
    // The audit log wrapped "Sep 30, 2026, 8:46 PM" across five lines and printed
    // it in English to Chinese administrators.
    expect(formatFor('en').tableDateTime(SAMPLE)).toBe('2026-09-30 20:46')
    expect(formatFor('zh').tableDateTime(SAMPLE.toISOString())).toBe('2026-09-30 20:46')
  })

  it('keeps the full localized time for the tooltip', () => {
    expect(formatFor('en').dateTimeTitle(SAMPLE)).toMatch(/^Sep 30, 2026, 8:46:05\sPM$/)
    expect(formatFor('zh').dateTimeTitle(SAMPLE)).toBe('2026年9月30日 20:46:05')
    expect(formatFor('en').date(SAMPLE)).toBe('Sep 30, 2026')
    expect(formatFor('zh').date(SAMPLE)).toBe('2026年9月30日')
    expect(formatFor('zh').dateTime(SAMPLE)).toBe('2026年9月30日 20:46')
  })

  it('follows a locale switch', () => {
    const locale = ref('en')
    const format = createAdminFormat(() => locale.value, fakeT)
    expect(format.date(SAMPLE)).toBe('Sep 30, 2026')
    locale.value = 'zh'
    expect(format.locale.value).toBe('zh-CN')
    expect(format.date(SAMPLE)).toBe('2026年9月30日')
  })

  it('prints relative times in the reader\'s language', () => {
    const now = SAMPLE.getTime()
    expect(formatFor('en').relative(now - 3 * 60_000, now)).toBe('3 minutes ago')
    expect(formatFor('zh').relative(now - 3 * 60_000, now)).toBe('3分钟前')
    expect(formatFor('en').relative(now + 2 * 3_600_000, now)).toBe('in 2 hours')
    expect(formatFor('en').relative(now - 10_000, now)).toBe('10 seconds ago')
  })

  it('formats numbers, sizes, durations and ratios', () => {
    const en = formatFor('en')
    expect(en.number(1234567.5)).toBe('1,234,567.5')
    expect(en.compact(12345)).toBe('12.3K')
    expect(formatFor('zh').compact(12345)).toBe('1.2万')
    expect(en.bytes(512)).toBe('512 B')
    expect(en.bytes(1536)).toBe('1.5 KB')
    expect(en.bytes(5 * 1024 ** 3)).toBe('5 GB')
    expect(en.percent(0.1256)).toBe('12.6%')
    expect(en.percent(0.1256, 0)).toBe('13%')
    expect(en.duration(850)).toBe('durationMs(850)')
    expect(en.duration(12_400)).toBe('durationSeconds(12)')
    expect(en.duration(65_000)).toBe('durationMinutes(1,5)')
    expect(en.duration(2 * 3_600_000 + 3 * 60_000)).toBe('durationHours(2,3)')
  })

  it('prints a dash for anything missing or unreadable, never Invalid Date or NaN', () => {
    const format = formatFor('en')
    for (const value of [null, undefined, '', 'not a date']) {
      expect(format.tableDateTime(value)).toBe(ADMIN_FORMAT_EMPTY)
      expect(format.dateTimeTitle(value)).toBe(ADMIN_FORMAT_EMPTY)
      expect(format.date(value)).toBe(ADMIN_FORMAT_EMPTY)
      expect(format.relative(value)).toBe(ADMIN_FORMAT_EMPTY)
    }
    for (const value of [null, undefined, '', 'abc', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(format.number(value)).toBe(ADMIN_FORMAT_EMPTY)
      expect(format.compact(value)).toBe(ADMIN_FORMAT_EMPTY)
      expect(format.bytes(value)).toBe(ADMIN_FORMAT_EMPTY)
      expect(format.duration(value)).toBe(ADMIN_FORMAT_EMPTY)
      expect(format.percent(value)).toBe(ADMIN_FORMAT_EMPTY)
    }
    expect(format.number(0)).toBe('0')
    expect(format.bytes(-1)).toBe(ADMIN_FORMAT_EMPTY)
  })
})
