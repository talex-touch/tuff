import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const nexusRoot = join(import.meta.dirname, '..')
const shotsRoot = join(nexusRoot, 'public/shots')

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

  it('keeps legacy GIFs excluded from Cloudflare Pages output', () => {
    const configSource = readFileSync(join(nexusRoot, 'nuxt.config.ts'), 'utf8')

    expect(configSource).toContain('publicAssetsExcludedFromDeploy')
    expect(configSource).toContain('shots/SearchApp.gif')
    expect(configSource).toContain('shots/PluginTranslate.gif')
  })
})
