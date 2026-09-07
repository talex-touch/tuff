import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MODEL_SOURCE_ICON_CLASSES,
  MODEL_SOURCES,
  modelSourceIconFor,
  modelSourceInitialFor
} from './model-source-icons'

describe('modelSourceIconFor', () => {
  it.each([
    ['openai', 'i-simple-icons-openai'],
    // codex is OpenAI's CLI and simple-icons has no glyph of its own for it.
    ['codex', 'i-simple-icons-openai'],
    ['anthropic', 'i-simple-icons-anthropic'],
    ['claude', 'i-simple-icons-anthropic'],
    ['deepseek', 'i-simple-icons-deepseek'],
    ['kimi', 'i-simple-icons-kimi'],
    ['moonshot', 'i-simple-icons-kimi'],
    ['ollama', 'i-simple-icons-ollama'],
    ['openrouter', 'i-simple-icons-openrouter'],
    ['gemini', 'i-simple-icons-googlegemini'],
    ['qwen', 'i-simple-icons-qwen'],
    ['mistral', 'i-simple-icons-mistralai'],
    ['huggingface', 'i-simple-icons-huggingface'],
    ['copilot', 'i-simple-icons-githubcopilot']
  ])('resolves %s to its brand icon', (source, value) => {
    expect(modelSourceIconFor(source)).toEqual({ type: 'class', value })
  })

  /**
   * A channel name is written by the user in their own pi config, so the table matches on
   * containment and on a lower-cased name. `DeepSeekOfficial` is a real entry on the machine this
   * was built against; an exact lookup would have missed it.
   */
  it.each([
    ['DeepSeekOfficial', 'i-simple-icons-deepseek'],
    ['OpenAI', 'i-simple-icons-openai'],
    ['Codex', 'i-simple-icons-openai'],
    ['my-ollama-box', 'i-simple-icons-ollama']
  ])('places %s despite its casing and surrounding words', (source, value) => {
    expect(modelSourceIconFor(source)).toEqual({ type: 'class', value })
  })

  /**
   * The other half of the same machine's channel list: private endpoints the user named. None of
   * them may be branded. `router` is the one that pays for the rule that `/openrouter/` is spelled
   * out in full — a `/router/` pattern would sell the user's own endpoint as OpenRouter.
   */
  it.each(['touchapi', 'mesh', 'cpa', 'router', 'Router', 'internal', ''])(
    'leaves %s unplaced rather than guessing a brand',
    (source) => {
      expect(modelSourceIconFor(source)).toBeNull()
    }
  )

  it('does not resolve prototype members as icons', () => {
    expect(modelSourceIconFor('constructor')).toBeNull()
    expect(modelSourceIconFor('toString')).toBeNull()
  })

  it('keeps every pattern stateless, so a repeated lookup gives the same answer', () => {
    // A `g` or `y` flag would carry `lastIndex` between calls and make the second one miss.
    for (const source of MODEL_SOURCES) {
      expect(source.test.global).toBe(false)
      expect(source.test.sticky).toBe(false)
    }
    expect(modelSourceIconFor('codex')).toEqual(modelSourceIconFor('codex'))
  })
})

describe('modelSourceInitialFor', () => {
  it.each([
    ['touchapi', 'T'],
    ['mesh', 'M'],
    ['cpa', 'C'],
    ['router', 'R'],
    ['  spaced', 'S']
  ])('badges %s with %s', (source, initial) => {
    expect(modelSourceInitialFor(source)).toBe(initial)
  })

  it('takes a whole code point, not half a surrogate pair', () => {
    // `'🚀'[0]` is a lone high surrogate, which renders as a replacement glyph.
    expect(modelSourceInitialFor('🚀-relay')).toBe('🚀')
    expect(modelSourceInitialFor('内网中转')).toBe('内')
  })

  it('has something to draw even for an empty name', () => {
    expect(modelSourceInitialFor('')).toBe('?')
    expect(modelSourceInitialFor('   ')).toBe('?')
  })
})

/**
 * The classes live in a `.ts` module, which UnoCSS never scans, so they reach the stylesheet only
 * through the safelist in `uno.config.ts`. Both `provider-icons` and `model-family-icons` carry the
 * same guard for the same reason: the first regression of this kind turned every provider icon into
 * an empty box.
 */
describe('MODEL_SOURCE_ICON_CLASSES', () => {
  it('lists exactly the classes the table can render, de-duplicated', () => {
    const fromTable = MODEL_SOURCES.map((source) => source.icon.value)
    expect(MODEL_SOURCE_ICON_CLASSES).toEqual([...new Set(fromTable)])
    for (const className of fromTable) {
      expect(MODEL_SOURCE_ICON_CLASSES).toContain(className)
    }
  })

  it('is spread into the UnoCSS safelist and watched by the dev server, not copied there', () => {
    // Read as text: evaluating the config would pull the icon collections and the UnoCSS presets
    // into a unit test, and the resolution of those is the dev server's, not vitest's.
    const unoConfig = readFileSync(path.resolve(__dirname, '../../../../../uno.config.ts'), 'utf8')
    expect(unoConfig).toMatch(
      /import \{ MODEL_SOURCE_ICON_CLASSES \} from '\.\/src\/renderer\/src\/modules\/intelligence\/model-source-icons'/
    )
    expect(unoConfig).toMatch(/safelist: \[[^\]]*\.\.\.MODEL_SOURCE_ICON_CLASSES/)
    // The config is evaluated once per load, and the dev server watches only the files it is told
    // about. Without this module in `configDeps`, a new channel's icon would stay an empty box
    // until the next restart — the same defect one step removed.
    const binding =
      /const (\w+) = fileURLToPath\(\s*new URL\('\.\/src\/renderer\/src\/modules\/intelligence\/model-source-icons\.ts', import\.meta\.url\)\s*\)/.exec(
        unoConfig
      )?.[1]
    expect(binding).toBeDefined()
    expect(unoConfig).toMatch(new RegExp(`configDeps: \\[[^\\]]*\\b${binding}\\b`))
    // A literal copy here would be the drift this module exists to prevent.
    for (const className of MODEL_SOURCE_ICON_CLASSES) {
      expect(unoConfig).not.toContain(`'${className}'`)
    }
  })
})
