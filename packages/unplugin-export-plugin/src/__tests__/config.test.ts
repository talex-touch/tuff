import path from 'node:path'
import os from 'node:os'
import fs from 'fs-extra'
import { describe, expect, it } from 'vitest'
import { resolveBuildConfig, resolveDevConfig, resolvePublishConfig } from '../core/config'

async function withTempDir(prefix: string, fn: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  try {
    await fn(root)
  }
  finally {
    await fs.remove(root)
  }
}

describe('tuff config resolution', () => {
  it('applies CLI > config > manifest > defaults', async () => {
    await withTempDir('tuff-config-', async (root) => {
      await fs.writeJson(path.join(root, 'manifest.json'), {
        name: 'demo',
        version: '1.0.0',
        dev: { address: 'http://127.0.0.1:3000' },
        build: { outDir: 'dist-manifest', minify: false },
      })

      await fs.writeFile(
        path.join(root, 'tuff.config.mjs'),
        [
          'export default {',
          '  outDir: \'dist-root\',',
          '  build: { outDir: \'dist-config\', minify: true },',
          '  dev: { host: \'0.0.0.0\', port: 4000 },',
          '  publish: { tag: \'1.2.3\', channel: \'BETA\' },',
          '}',
        ].join('\n'),
      )

      const build = await resolveBuildConfig(root, {
        outDir: 'dist-cli',
        minify: false,
      })

      expect(build.outDir).toBe('dist-cli')
      expect(build.minify).toBe(false)
      expect(build.sourcemap).toBe(false)

      const dev = await resolveDevConfig(root, { port: 5000 })
      expect(dev.port).toBe(5000)
      expect(dev.host).toBe('0.0.0.0')
      expect(dev.open).toBe(false)

      const publish = await resolvePublishConfig(root, { tag: '2.0.0' })
      expect(publish.tag).toBe('2.0.0')
      expect(publish.channel).toBe('BETA')
    })
  })
})
