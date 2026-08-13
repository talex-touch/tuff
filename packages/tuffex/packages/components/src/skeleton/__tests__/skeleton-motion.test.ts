import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// These assertions run against the *compiled* style block rather than the source
// text: a component could keep the `@include` and still lose the guard if the
// shared mixin changed, and matching on source text would not notice.
const here = dirname(fileURLToPath(import.meta.url))

const SKELETON_COMPONENTS = [
  ['TxSkeleton', resolve(here, '../src/TxSkeleton.vue')],
  ['TxCardSkeleton', resolve(here, '../src/TxCardSkeleton.vue')],
  ['TxListItemSkeleton', resolve(here, '../src/TxListItemSkeleton.vue')],
  ['TxRowSkeleton', resolve(here, '../src/TxRowSkeleton.vue')],
  ['TxLayoutSkeleton', resolve(here, '../../layout-skeleton/src/TxLayoutSkeleton.vue')],
] as const

const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/g

function readStyleBlocks(vuePath: string): string[] {
  const source = readFileSync(vuePath, 'utf8')
  return [...source.matchAll(STYLE_BLOCK_RE)].map(match => match[1] ?? '')
}

function compileStyles(vuePath: string): string {
  const blocks = readStyleBlocks(vuePath)
  expect(blocks.length).toBeGreaterThan(0)

  return blocks
    .map(block => sass.compileString(block, {
      // Anchors relative `@use` resolution to the component's own directory.
      url: pathToFileURL(vuePath),
      syntax: 'scss',
    }).css)
    .join('\n')
}

describe('skeleton motion contract', () => {
  it.each(SKELETON_COMPONENTS)('%s stops its shimmer under prefers-reduced-motion', (_name, path) => {
    const css = compileStyles(path)

    expect(css).toContain('prefers-reduced-motion: reduce')

    // Every animated placeholder must be covered, not just the first one: the
    // guard is emitted per include, so the counts have to line up exactly.
    const animated = css.match(/animation:\s*tx-skeleton-shimmer/g) ?? []
    const guards = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g) ?? []
    const stopped = css.match(/animation:\s*none/g) ?? []
    expect(animated.length).toBeGreaterThan(0)
    expect(guards).toHaveLength(animated.length)
    expect(stopped).toHaveLength(animated.length)
  })

  it.each(SKELETON_COMPONENTS)('%s keeps the placeholder visible when motion is reduced', (_name, path) => {
    const css = compileStyles(path)

    // The guard must only drop the motion. Hiding the placeholder would defeat
    // the point of a skeleton, which is to hold the layout steady.
    const reducedBlocks = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    expect(reducedBlocks.length).toBeGreaterThan(0)
    for (const block of reducedBlocks) {
      expect(block).not.toMatch(/display:\s*none/)
      expect(block).not.toMatch(/visibility:\s*hidden/)
      expect(block).not.toMatch(/opacity:\s*0\b/)
    }
  })

  it.each(SKELETON_COMPONENTS)('%s declares no bespoke keyframes of its own', (_name, path) => {
    // The shared mixin is the single source; a component re-declaring its own
    // shimmer is what previously drifted the timings apart across components.
    for (const block of readStyleBlocks(path))
      expect(block).not.toMatch(/@keyframes/)
  })

  it('routes every skeleton through the one shared shimmer definition', () => {
    for (const [, path] of SKELETON_COMPONENTS) {
      const css = compileStyles(path)
      const declared = css.match(/@keyframes\s+([\w-]+)/g) ?? []
      expect(declared).toEqual(['@keyframes tx-skeleton-shimmer'])
    }
  })
})
