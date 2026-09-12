// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const componentsRoot = resolve(here, '..')

/**
 * `:deep()` only means anything to the SFC compiler when the block it sits in is
 * `scoped`. In an unscoped block Vue passes it straight through, and the browser
 * then throws the whole rule away as an unknown pseudo-class — no build warning,
 * no runtime error, the styles just never apply.
 *
 * `TxGroupBlock` shipped four of these. They carried the `--fake-radius: 0` and
 * `border-radius: 0` resets that flatten a row inside a group, so every row kept
 * the 12px radius it sets on itself and groups rendered with stray rounded
 * corners around their middle rows.
 */
describe('deep selectors in unscoped style blocks', () => {
  function collectSfcs(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory())
        collectSfcs(full, out)
      else if (entry.name.endsWith('.vue'))
        out.push(full)
    }
    return out
  }

  const files = collectSfcs(componentsRoot)

  it('finds component SFCs to check', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('never uses :deep() outside a scoped block', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const block of source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
        const [, attrs, body] = block
        if (/\bscoped\b/.test(attrs))
          continue
        // Strip comments first: a note *about* :deep() is not a use of it.
        const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        const hits = code.match(/:deep\(|::v-deep|\/deep\//g)
        if (hits)
          offenders.push(`${relative(componentsRoot, file)} (${hits.length})`)
      }
    }

    expect(offenders, 'use a plain descendant selector, or mark the block scoped').toEqual([])
  })
})
