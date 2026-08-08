import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Where a plugin's Prelude may come from (#809, #810, #811).
 *
 * loadPreludeScript took the remote branch whenever `dev.enable && dev.source && dev.address`,
 * with no reference to whether the app was packaged. Three shipped manifests carried exactly
 * that, so an installed app issued GET http://127.0.0.1:<port>/index.js and executed the
 * response as the plugin's Prelude. Usually nothing listens and the plugin fails to load;
 * if anything does, it owns the plugin.
 *
 * Two separate fixes, and both are needed: the manifests are corrected so today's builds are
 * right, and the guard makes the next manifest with the same mistake harmless.
 */

const PLUGINS_WITH_DEV_BLOCKS = ['clipboard-history', 'touch-intelligence', 'touch-translation']

describe('shipped plugin manifests', () => {
  it.each(PLUGINS_WITH_DEV_BLOCKS)('%s does not ship with dev mode enabled', (name) => {
    const manifest = JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../../../../../plugins/${name}/manifest.json`, import.meta.url)),
        'utf8'
      )
    )
    expect(manifest.dev?.enable).not.toBe(true)
  })

  it('finds no other plugin shipping an enabled dev block', () => {
    // The three above were the whole set when this was written. A new one appearing should
    // fail here rather than ship — which is the only way this stays true.
    const pluginsDir = fileURLToPath(new URL('../../../../../../plugins/', import.meta.url))
    const { readdirSync, existsSync } = require('node:fs') as typeof import('node:fs')

    const enabled = readdirSync(pluginsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${pluginsDir}${entry.name}/manifest.json`)
      .filter(existsSync)
      .filter((file) => {
        const manifest = JSON.parse(readFileSync(file, 'utf8'))
        return manifest.dev?.enable === true
      })

    expect(enabled).toEqual([])
  })
})

describe('remote prelude guard', () => {
  const source = readFileSync(fileURLToPath(new URL('./plugin.ts', import.meta.url)), 'utf8')

  it('takes the remote branch only when the app is not packaged', () => {
    expect(source).toContain(
      'if (!app.isPackaged && this.dev.enable && this.dev.source && this.dev.address)'
    )
  })

  it('no longer has an unguarded remote branch', () => {
    // The exact shape it had. Asserting its absence is what catches a revert.
    expect(source).not.toContain('if (this.dev.enable && this.dev.source && this.dev.address) {')
  })

  it('says why it refused rather than failing silently', () => {
    // A packaged build with a dev manifest now loads the bundled Prelude. Without a log the
    // difference between "dev source ignored" and "dev source used" is invisible.
    expect(source).toContain('Ignoring dev.source in a packaged build')
  })
})
