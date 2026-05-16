import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const nexusRoot = join(import.meta.dirname, '..')
const shotsRoot = join(nexusRoot, 'public/shots')
const pwaConfigPath = join(nexusRoot, 'app/config/pwa.ts')
const workerBundleGuardPath = join(nexusRoot, 'build/check-worker-bundle.mjs')

describe('Nexus deploy asset budget', () => {
  it('keeps landing showcase videos small and silent', () => {
    const showcaseVideos = [
      'SearchApp.mp4',
      'SearchFileImmediately.mp4',
      'PluginTranslate.mp4',
    ]

    for (const fileName of showcaseVideos) {
      const filePath = join(shotsRoot, fileName)
      const bytes = statSync(filePath).size
      expect(bytes, `${fileName} should stay below 2 MiB`).toBeLessThan(2 * 1024 * 1024)
    }
  })

  it('keeps retired legacy GIFs out of the public source tree', () => {
    expect(existsSync(join(shotsRoot, 'SearchApp.gif'))).toBe(false)
    expect(existsSync(join(shotsRoot, 'PluginTranslate.gif'))).toBe(false)
  })

  it('keeps Nuxt Content runtime assets out of the PWA precache', () => {
    const pwaSource = readFileSync(pwaConfigPath, 'utf8')
    const guardSource = readFileSync(workerBundleGuardPath, 'utf8')

    expect(pwaSource).toContain("globPatterns: ['**/*.{js,css,html,png,ico,svg}']")
    expect(pwaSource).toContain("'**/__nuxt_content/**'")
    expect(pwaSource).toContain("'**/dump.*.sql'")
    expect(pwaSource).toContain("'**/*.wasm'")
    expect(pwaSource).toContain("'**/sqlite3*'")

    expect(guardSource).toContain('forbiddenServiceWorkerPrecachePatterns')
    expect(guardSource).toContain('__nuxt_content\\/')
    expect(guardSource).toContain('dump\\.[^"\']+\\.sql')
    expect(guardSource).toContain('sqlite3[^"\']*')
    expect(guardSource).toContain('\\.wasm')
  })
})
