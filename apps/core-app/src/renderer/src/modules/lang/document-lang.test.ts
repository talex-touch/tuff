// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { setI18nLanguage } from './i18n'

/**
 * The document's declared language must follow the UI language (#504).
 *
 * A screen reader picks its speech synthesiser from `<html lang>`. If it stays `en` while the UI
 * renders Chinese, every string is announced by an English voice — unintelligible rather than
 * merely wrong — and CJK font selection and hyphenation heuristics go with it.
 *
 * #504 reported this as broken, on the evidence that `documentElement.lang` appears nowhere in the
 * renderer. It does not: `setI18nLanguage` writes the attribute through
 * `document.querySelector('html')`, which is the same thing spelled differently. The behaviour was
 * already correct, and this test exists so that stays checkable by something other than the
 * spelling someone happens to grep for.
 */

const RENDERER_ROOT = path.resolve(__dirname, '../..')

function fakeI18n() {
  return { global: { locale: { value: '' } } } as Parameters<typeof setI18nLanguage>[0]
}

describe('setI18nLanguage', () => {
  it('declares the document language', () => {
    setI18nLanguage(fakeI18n(), 'zh-CN')

    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('follows a later switch rather than sticking', () => {
    // Positive control for the case above: an implementation that set the attribute once at boot
    // would satisfy it and still leave a screen reader on the wrong voice after the user switches.
    setI18nLanguage(fakeI18n(), 'zh-CN')
    setI18nLanguage(fakeI18n(), 'en-US')

    expect(document.documentElement.lang).toBe('en-US')
  })

  it('sets the locale it was given on the i18n instance too', () => {
    // Both halves matter: the attribute alone would be a lie, the locale alone leaves the reader on
    // the wrong voice.
    const i18n = fakeI18n()
    setI18nLanguage(i18n, 'zh-CN')

    expect(i18n.global.locale.value).toBe('zh-CN')
  })
})

describe('the startup path reaches it', () => {
  it('runs setI18nLanguage before the Vue app is created', () => {
    // The static lang="en" in index.html is only ever true for the window before bootstrap, and
    // this is what closes it: setupI18n is awaited ahead of createApp.
    const main = readFileSync(path.join(RENDERER_ROOT, 'main.ts'), 'utf8')
    const setup = readFileSync(path.join(__dirname, 'i18n.ts'), 'utf8')

    expect(setup).toContain('setI18nLanguage(i18n, options.locale)')
    expect(main.indexOf('setupI18n({ locale: initialLanguage })')).toBeGreaterThan(-1)
    expect(main.indexOf('setupI18n({ locale: initialLanguage })')).toBeLessThan(
      main.indexOf('createApp(App)')
    )
  })

  it('is wired into the language switcher as well', () => {
    const useLanguage = readFileSync(path.join(__dirname, 'useLanguage.ts'), 'utf8')

    expect(useLanguage).toContain('setI18nLanguage(i18n, lang)')
  })
})
