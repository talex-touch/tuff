import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// Compiled CSS, not source text: the guards arrive through shared `bui-*`
// mixins, so asserting on the `@include` would pass even if the mixin lost them.
const here = dirname(fileURLToPath(import.meta.url))

const ANIMATED_COMPONENTS = [
  ['TxFineTuneCard', resolve(here, '../src/TxFineTuneCard.vue')],
  ['TxFineTuneChipSelect', resolve(here, '../src/TxFineTuneChipSelect.vue')],
] as const

const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/g

function compileStyles(vuePath: string): string {
  const source = readFileSync(vuePath, 'utf8')
  const blocks = [...source.matchAll(STYLE_BLOCK_RE)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)

  return blocks
    .map(block => sass.compileString(block, {
      url: pathToFileURL(vuePath),
      syntax: 'scss',
    }).css)
    .join('\n')
}

/** Leaf declaration bodies — `[^{}]` never matches a wrapper such as `@media`. */
function ruleBodies(css: string): string[] {
  return [...css.matchAll(/\{([^{}]*)\}/g)].map(match => match[1] ?? '')
}

describe('fineTuneCard motion contract', () => {
  it.each(ANIMATED_COMPONENTS)('%s stops every animation under reduced motion', (_name, path) => {
    const css = compileStyles(path)

    // The lookahead sits against the colon on purpose: `animation:\s*(?!none)`
    // would let `\s*` backtrack to zero width and match `animation: none` too.
    const played = css.match(/animation:(?!\s*none\b)/g) ?? []
    const stopped = css.match(/animation:\s*none\b/g) ?? []

    expect(played.length).toBeGreaterThan(0)
    expect(stopped).toHaveLength(played.length)
  })

  it.each(ANIMATED_COMPONENTS)('%s never rests at opacity 0 waiting to be animated in', (_name, path) => {
    // The reduced-motion guard is `animation: none`, so an element whose only
    // route to being visible is the animation's fill would stay invisible —
    // a blank gap instead of a calmer entrance.
    for (const body of ruleBodies(compileStyles(path))) {
      if (!/animation:\s*tx-bui-/.test(body))
        continue
      expect(body).not.toMatch(/opacity:\s*0\s*[;}]?/)
      expect(body).not.toMatch(/visibility:\s*hidden/)
      expect(body).not.toMatch(/display:\s*none/)
    }
  })

  it.each(ANIMATED_COMPONENTS)('%s hides nothing inside its reduced-motion blocks', (_name, path) => {
    const css = compileStyles(path)
    const guards = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? []

    expect(guards.length).toBeGreaterThan(0)
    for (const guard of guards) {
      expect(guard).not.toMatch(/display:\s*none/)
      expect(guard).not.toMatch(/visibility:\s*hidden/)
      expect(guard).not.toMatch(/opacity:\s*0\s*[;}]?/)
    }
  })

  it('keeps the Adjust label readable once its shimmer is switched off', () => {
    const css = compileStyles(ANIMATED_COMPONENTS[0][1])

    // The shimmer paints the text transparent and fills it through a moving
    // gradient. With the animation gone that would be an invisible label, so
    // the guard has to restore a solid colour as well as stop the motion.
    const guards = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    const labelGuard = guards.find(guard => guard.includes('adjust-label'))

    expect(labelGuard).toBeDefined()
    expect(labelGuard).toMatch(/color:\s*var\(--tx-bui-accent-ink/)
    expect(labelGuard).toMatch(/background:\s*none/)
  })

  it('emits the keyframes it plays instead of relying on base.css', () => {
    // Subpath consumers only receive this component's CSS.
    const card = compileStyles(ANIMATED_COMPONENTS[0][1])
    const menu = compileStyles(ANIMATED_COMPONENTS[1][1])

    expect(card).toContain('@keyframes tx-bui-pop-in')
    expect(card).toContain('@keyframes tx-bui-shimmer-text')
    expect(menu).toContain('@keyframes tx-bui-pop-in')
  })
})
