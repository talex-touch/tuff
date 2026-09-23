import type { ResolvedLocalModel } from './types'
import { describe, expect, it } from 'vitest'
import { narrowLanguageTag, narrowToDeclaredLanguages, primaryLanguageTag } from './language'

/** Only the descriptor matters here: narrowing is a pure decision about a bundle, not about files. */
function bundle(languages: readonly string[], defaultLanguage?: string): ResolvedLocalModel {
  return {
    directory: '/models/demo',
    weightsPath: '/models/demo/ggml-demo.bin',
    descriptor: {
      schemaVersion: 1,
      id: 'demo-whisper',
      version: '1.0.0',
      name: 'Demo',
      engine: 'whisper-cpp',
      languages,
      ...(defaultLanguage ? { defaultLanguage } : {}),
      runtime: { kind: 'ggml', file: 'ggml-demo.bin', bytes: 24, sha256: 'a'.repeat(64) },
      capabilities: { stream: false, upload: true },
      license: { spdx: 'MIT', redistributable: true },
    },
  }
}

describe('primaryLanguageTag', () => {
  it('reduces a locale, an underscored tag or a script subtag to its primary tag', () => {
    const rows = [
      ['ZH-CN', 'zh'],
      ['zh_CN', 'zh'],
      ['zh', 'zh'],
      ['zh-Hans', 'zh'],
      ['en-US', 'en'],
      ['  zh-CN  ', 'zh'],
      ['', ''],
      [undefined, ''],
    ] as const

    for (const [tag, expected] of rows)
      expect(primaryLanguageTag(tag), String(tag)).toBe(expected)
  })
})

describe('narrowLanguageTag', () => {
  /** The fixed tag table a recogniser CLI accepts; `narrowLanguageTag` takes it as a set. */
  const ACCEPTED_TAGS: Record<string, true> = { auto: true, zh: true, en: true }
  const accepted = new Set<string>(Object.keys(ACCEPTED_TAGS))

  it('keeps a request the recogniser accepts and asks for detection for one it does not', () => {
    const rows = [
      ['zh-CN', 'zh'],
      ['zh', 'zh'],
      ['EN-us', 'en'],
      ['ja', 'auto'],
      ['fr-FR', 'auto'],
      ['', 'auto'],
    ] as const

    for (const [requested, expected] of rows)
      expect(narrowLanguageTag(requested, accepted), requested).toBe(expected)
  })

  it('passes a detection request through unchanged', () => {
    expect(narrowLanguageTag('auto', accepted)).toBe('auto')
  })
})

describe('narrowToDeclaredLanguages', () => {
  it('narrows onto the languages the bundle declares, and detects for anything else', () => {
    const model = bundle(['zh', 'en'])
    const rows = [
      ['zh-CN', 'zh'],
      ['en-US', 'en'],
      ['ja', 'auto'],
      ['auto', 'auto'],
    ] as const

    for (const [requested, expected] of rows)
      expect(narrowToDeclaredLanguages(model, requested), requested).toBe(expected)
  })

  it('honours a default language even when the declared list is empty', () => {
    const model = bundle([], 'zh')

    expect(narrowToDeclaredLanguages(model, 'zh-CN')).toBe('zh')
    expect(narrowToDeclaredLanguages(model, 'en-US')).toBe('auto')
  })

  it('narrows the declared side too, so a script-tagged bundle still matches its locale', () => {
    expect(narrowToDeclaredLanguages(bundle(['zh-Hans']), 'zh-CN')).toBe('zh')
  })

  it('trusts the bundle over any list of its own', () => {
    expect(narrowToDeclaredLanguages(bundle(['fr']), 'fr-CA')).toBe('fr')
  })
})
