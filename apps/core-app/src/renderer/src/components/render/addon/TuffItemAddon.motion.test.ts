import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

/**
 * The preview pane slides in on the compositor as it opens. Its content is ready by then, so the
 * slide must not fade it in from transparent, and reduced motion drops the slide altogether (low
 * battery drops it through the global `html[data-low-battery-motion]` rule).
 *
 * Read from the compiled stylesheet: jsdom runs no CSS animations, and vitest leaves SFC styles
 * uncompiled.
 */
const here = dirname(fileURLToPath(import.meta.url))
const sfcPath = resolve(here, 'TuffItemAddon.vue')

function compiledStyles(): string {
  const block = /<style[^>]*>([\s\S]*?)<\/style>/.exec(readFileSync(sfcPath, 'utf8'))?.[1]
  expect(block, 'TuffItemAddon.vue <style>').toBeTruthy()
  return sass.compileString(block ?? '', { url: pathToFileURL(sfcPath), syntax: 'scss' }).css
}

/** The body of the first `{ … }` block that follows `prefix`, nested blocks included. */
function blockAfter(css: string, prefix: string): string {
  const start = css.indexOf(prefix)
  expect(start, prefix).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    else if (css[index] === '}' && --depth === 0) return css.slice(open + 1, index)
  }
  throw new Error(`Unterminated block after ${prefix}`)
}

describe('TuffItemAddon slide-in', () => {
  const css = compiledStyles()

  it('slides the pane in with a transform alone, never from transparent', () => {
    const keyframes = blockAfter(css, '@keyframes addon-slide-in')
    const properties = new Set([...keyframes.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]))

    expect([...properties]).toEqual(['transform'])
  })

  it('plays as the pane opens, and not at all under reduced motion', () => {
    expect(css).toMatch(/\.TuffItemAddon\.show\s*\{[^}]*animation:\s*addon-slide-in\b/)

    const reducedMotion = blockAfter(css, '@media (prefers-reduced-motion: reduce)')
    expect(reducedMotion).toMatch(/\.TuffItemAddon\.show\s*\{\s*animation:\s*none;?\s*\}/)
  })
})
