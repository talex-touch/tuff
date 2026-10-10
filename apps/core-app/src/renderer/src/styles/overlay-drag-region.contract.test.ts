import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

/**
 * Layers teleported out of #app must never sit in a window drag region (`index.scss`): the shell
 * sidebar is `-webkit-app-region: drag`, and a menu row over it — the project menu's 「重命名」 on
 * the 「对话」 heading — looked clickable while the OS took every press as a window drag. Only an
 * Electron window has drag regions, so the rule itself is what this pins, read from the compiled
 * stylesheet.
 */
const DIR = dirname(fileURLToPath(import.meta.url))

function compiledRules(): Array<{ selectors: string[]; body: string }> {
  // KaTeX is a package stylesheet the app bundler resolves; it holds no rule this test reads.
  const source = readFileSync(resolve(DIR, 'index.scss'), 'utf8').replace(
    /^@use 'katex[^\n]*\n/m,
    ''
  )
  const css = sass.compileString(source, { style: 'expanded' }).css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1]!.split(',').map((selector) => selector.trim()),
    body: match[2]!
  }))
}

describe('teleported layers and window drag regions', () => {
  it('opts everything outside #app, and every descendant, out of the drag region', () => {
    const rule = compiledRules().find((candidate) =>
      candidate.selectors.includes('body > :not(#app)')
    )

    expect(rule?.selectors).toEqual(['body > :not(#app)', 'body > :not(#app) *'])
    expect(rule?.body).toMatch(/^\s*-webkit-app-region:\s*no-drag;\s*$/m)
  })
})
