import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const darkToggle = readFileSync(new URL('./DarkToggle.vue', import.meta.url), 'utf8')
const theHeader = readFileSync(new URL('./TheHeader.vue', import.meta.url), 'utf8')
const enLocale = readFileSync(new URL('../../i18n/locales/en.ts', import.meta.url), 'utf8')
const zhLocale = readFileSync(new URL('../../i18n/locales/zh.ts', import.meta.url), 'utf8')

function blockBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start)
  expect(startIndex).toBeGreaterThanOrEqual(0)

  const endIndex = source.indexOf(end, startIndex)
  expect(endIndex).toBeGreaterThan(startIndex)

  return source.slice(startIndex, endIndex)
}

describe('public header UI contracts', () => {
  it('renders theme selection as a dropdown of dark, light, and auto radio menu options', () => {
    const themeOptions = blockBetween(darkToggle, 'const themeOptions: ThemeOption[] = [\n', '\n]\n\nconst { color')
    expect(themeOptions).toContain("{ value: 'dark', labelKey: 'ui.themeToggle.dark' }")
    expect(themeOptions).toContain("{ value: 'light', labelKey: 'ui.themeToggle.light' }")
    expect(themeOptions).toContain("{ value: 'auto', labelKey: 'ui.themeToggle.auto' }")

    const template = blockBetween(darkToggle, '<template>', '</template>')
    expect(template).toContain('aria-haspopup="menu"')
    expect(template).toContain('role="menu"')
    expect(template).toContain('v-for="option in themeOptions"')
    expect(template).toContain('role="menuitemradio"')
    expect(template).toContain(':aria-checked="selectedMode === option.value"')
  })

  it('passes the selected theme mode to toggleDark from each dropdown item', () => {
    const selectTheme = blockBetween(darkToggle, 'function selectTheme(mode: ThemeMode, event: MouseEvent) {', '}')
    expect(selectTheme).toContain('toggleDark(mode, event)')

    const template = blockBetween(darkToggle, '<template>', '</template>')
    expect(template).toContain('@click="selectTheme(option.value, $event)"')
  })

  it('keeps theme labels available in English and Chinese locales', () => {
    for (const locale of [enLocale, zhLocale]) {
      const themeToggle = blockBetween(locale, 'themeToggle: {', '},')
      expect(themeToggle).toContain('dark:')
      expect(themeToggle).toContain('light:')
      expect(themeToggle).toContain('auto:')
    }
  })

  it('prevents the login CTA from wrapping or shrinking in the header', () => {
    const signInLinkStart = theHeader.indexOf(':to="signInRoute"')
    expect(signInLinkStart).toBeGreaterThanOrEqual(0)

    const signInLinkEnd = theHeader.indexOf('</NuxtLink>', signInLinkStart)
    expect(signInLinkEnd).toBeGreaterThan(signInLinkStart)

    const signInLink = theHeader.slice(signInLinkStart, signInLinkEnd)
    expect(signInLink).toContain('whitespace-nowrap')
    expect(signInLink).toContain('shrink-0')
  })
})
