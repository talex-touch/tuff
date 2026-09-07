import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODEL_FAMILIES, MODEL_FAMILY_ICON_CLASSES, modelFamilyIconFor } from './model-family-icons'
import { PROVIDER_ICON_CLASSES } from './provider-icons'

const GENERIC = 'i-carbon-machine-learning-model'

/** Resolves from this file, so the collections are the ones installed for core-app. */
const nodeRequire = createRequire(import.meta.url)

/** The collections `uno.config.ts` registers with preset-icons; each owns the `i-<name>-` prefix. */
const ICON_COLLECTIONS = ['simple-icons', 'carbon', 'ri'] as const

const installedIconNames = new Map<string, Set<string>>()

/** Whether an `i-<collection>-<icon>` class names a glyph the installed Iconify set has. */
function installedIconExists(className: string): boolean {
  const collection = ICON_COLLECTIONS.find((name) => className.startsWith(`i-${name}-`))
  if (!collection) return false
  let names = installedIconNames.get(collection)
  if (!names) {
    const set = JSON.parse(
      readFileSync(nodeRequire.resolve(`@iconify-json/${collection}/icons.json`), 'utf8')
    ) as { icons: Record<string, unknown>; aliases?: Record<string, unknown> }
    names = new Set([...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})])
    installedIconNames.set(collection, names)
  }
  return names.has(className.slice(`i-${collection}-`.length))
}

describe('modelFamilyIconFor', () => {
  it.each([
    // Real ids from this machine's catalogues: the source prefix is stripped before matching.
    ['codex/gpt-6-astra', 'i-simple-icons-openai'],
    ['cpa/grok-4.6', 'i-simple-icons-x'],
    ['DeepSeekOfficial/deepseek-v4-pro', 'i-simple-icons-deepseek'],
    ['qwen2.5:3b', 'i-simple-icons-qwen'],
    ['claude-sonnet-5', 'i-simple-icons-claude'],
    ['gemma-3', 'i-simple-icons-googlegemini'],
    // One per remaining family.
    ['o3-mini', 'i-simple-icons-openai'],
    ['gemini-2.5-pro', 'i-simple-icons-googlegemini'],
    ['qwq-32b', 'i-simple-icons-qwen'],
    ['llama-4-maverick', 'i-simple-icons-meta'],
    ['codestral-latest', 'i-simple-icons-mistralai'],
    ['mixtral-8x22b', 'i-simple-icons-mistralai'],
    ['moonshot-v1-128k', 'i-simple-icons-kimi'],
    ['kimi-k2', 'i-simple-icons-kimi'],
    ['minimax-m2', 'i-simple-icons-minimax'],
    ['doubao-seed-1.8', 'i-simple-icons-bytedance'],
    ['ernie-4.5', 'i-simple-icons-baidu'],
    ['glm-4.6', GENERIC],
    ['yi-lightning', GENERIC]
  ])('maps %s to %s', (modelId, value) => {
    expect(modelFamilyIconFor(modelId)).toEqual({ type: 'class', value })
  })

  it('returns null for a name that names no family, so the caller shows the provider icon', () => {
    // Expected misses, not gaps: the *source* is kimi, but the name part `k3` says nothing.
    expect(modelFamilyIconFor('kimi/k3')).toBeNull()
    expect(modelFamilyIconFor('mesh/k3')).toBeNull()
    expect(modelFamilyIconFor('default')).toBeNull()
    expect(modelFamilyIconFor('')).toBeNull()
  })

  it('matches on the name part, never on the source', () => {
    // `codex/…` is where the model is listed; the family is what the name says it is.
    expect(modelFamilyIconFor('codex/gpt-6-astra')?.value).toBe('i-simple-icons-openai')
    // A source that names a family does not colour an unrelated model.
    expect(modelFamilyIconFor('openai/claude-sonnet-5')?.value).toBe('i-simple-icons-claude')
    expect(modelFamilyIconFor('claude/k3')).toBeNull()
  })

  it('is case-insensitive and anchored where the pattern says so', () => {
    expect(modelFamilyIconFor('GPT-5.5')?.value).toBe('i-simple-icons-openai')
    expect(modelFamilyIconFor('Qwen3-235B')?.value).toBe('i-simple-icons-qwen')
    // `codestral` is Mistral's; the OpenAI `codex` pattern is anchored to the start so it
    // cannot steal it, and an unanchored `yi` would swallow half the catalogue.
    expect(modelFamilyIconFor('codestral-2501')?.value).toBe('i-simple-icons-mistralai')
    expect(modelFamilyIconFor('gpt-oss-yi')?.value).toBe('i-simple-icons-openai')
    expect(modelFamilyIconFor('mistral-yi')?.value).toBe('i-simple-icons-mistralai')
  })

  it('needs a digit after the o, so olmo and orca are not OpenAI', () => {
    expect(modelFamilyIconFor('o1-preview')?.value).toBe('i-simple-icons-openai')
    expect(modelFamilyIconFor('o4-mini')?.value).toBe('i-simple-icons-openai')
    // A bare `o` would swallow every name that starts with one.
    expect(modelFamilyIconFor('olmo-2-7b')).toBeNull()
    expect(modelFamilyIconFor('orca-mini')).toBeNull()
    expect(modelFamilyIconFor('openchat-3.5')).toBeNull()
  })

  it('gives the same answer twice: no stateful regex in the table', () => {
    for (const family of MODEL_FAMILIES) {
      expect(family.test.global).toBe(false)
      expect(family.test.sticky).toBe(false)
      expect(Object.isFrozen(family.test)).toBe(true)
    }
    expect(modelFamilyIconFor('cpa/grok-4.6')).toEqual(modelFamilyIconFor('cpa/grok-4.6'))
  })
})

/**
 * The classes live in a `.ts` module, which UnoCSS never scans, so they reach the stylesheet
 * only through the safelist in `uno.config.ts` — the same wiring `PROVIDER_ICON_CLASSES` has.
 */
describe('MODEL_FAMILY_ICON_CLASSES', () => {
  it('is the de-duplicated set of icon classes in the table', () => {
    expect(MODEL_FAMILY_ICON_CLASSES).toEqual(
      Array.from(new Set(MODEL_FAMILIES.map((family) => family.icon.value)))
    )
    expect(new Set(MODEL_FAMILY_ICON_CLASSES).size).toBe(MODEL_FAMILY_ICON_CLASSES.length)
    expect(MODEL_FAMILY_ICON_CLASSES).toEqual([
      'i-simple-icons-openai',
      'i-simple-icons-claude',
      'i-simple-icons-googlegemini',
      'i-simple-icons-deepseek',
      'i-simple-icons-qwen',
      'i-simple-icons-meta',
      'i-simple-icons-mistralai',
      'i-simple-icons-x',
      'i-simple-icons-kimi',
      'i-simple-icons-minimax',
      'i-simple-icons-bytedance',
      'i-simple-icons-baidu',
      GENERIC
    ])
  })

  it('names only glyphs the installed icon sets have, so a typo cannot ship as a blank square', () => {
    // A safelisted class UnoCSS cannot resolve is accepted silently: no CSS, no warning, and
    // the row shows TxIcon's empty box. Checked against the same packages the dev server reads,
    // for this table and for the provider table a row falls back to.
    const missing = [...MODEL_FAMILY_ICON_CLASSES, ...PROVIDER_ICON_CLASSES].filter(
      (className) => !installedIconExists(className)
    )
    expect(missing).toEqual([])
    // Positive control: a lookup that cannot fail proves nothing. simple-icons has no xAI mark,
    // which is why the table draws grok with the X glyph.
    expect(installedIconExists('i-simple-icons-xai')).toBe(false)
    expect(installedIconExists('i-simple-icons-x')).toBe(true)
  })

  it('is spread into the UnoCSS safelist and watched by the dev server, not copied there', () => {
    // Read as text: evaluating the config would pull the icon collections and the UnoCSS
    // presets into a unit test, and the resolution of those is the dev server's, not vitest's.
    const unoConfig = readFileSync(path.resolve(__dirname, '../../../../../uno.config.ts'), 'utf8')
    expect(unoConfig).toMatch(
      /import \{ MODEL_FAMILY_ICON_CLASSES \} from '\.\/src\/renderer\/src\/modules\/intelligence\/model-family-icons'/
    )
    expect(unoConfig).toMatch(/safelist: \[[^\]]*\.\.\.MODEL_FAMILY_ICON_CLASSES/)
    // The config is evaluated once per load, and the dev server watches only the files it is
    // told about. Without this module in `configDeps`, a new family's icon would stay an empty
    // box until the next restart — the same defect one step removed.
    const binding =
      /const (\w+) = fileURLToPath\(\s*new URL\('\.\/src\/renderer\/src\/modules\/intelligence\/model-family-icons\.ts', import\.meta\.url\)\s*\)/.exec(
        unoConfig
      )?.[1]
    expect(binding).toBeDefined()
    expect(unoConfig).toMatch(new RegExp(`configDeps: \\[[^\\]]*\\b${binding}\\b`))
    // A literal copy here would be the drift this module exists to prevent.
    for (const className of MODEL_FAMILY_ICON_CLASSES) {
      expect(unoConfig).not.toContain(`'${className}'`)
    }
  })
})
