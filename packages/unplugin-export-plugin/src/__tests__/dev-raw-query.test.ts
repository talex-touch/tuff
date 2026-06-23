import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import { describe, expect, it } from 'vitest'
import TouchPluginExport from '../index'

async function createPlugin(root: string) {
  await fs.writeJson(path.join(root, 'manifest.json'), {
    id: 'com.demo.plugin',
    name: 'demo-plugin',
    version: '1.0.0',
  })
  await fs.ensureDir(path.join(root, 'widgets'))
  await fs.writeFile(
    path.join(root, 'widgets/ask-panel.vue'),
    '<template><div>ask</div></template>',
    'utf-8',
  )
}

describe('dev raw file loading', () => {
  it('loads widget source when Vite appends a raw query', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-dev-raw-'))
    const previousCwd = process.cwd()

    try {
      await createPlugin(root)
      process.chdir(root)

      const plugin = TouchPluginExport.rollup() as any
      await plugin.buildStart?.call({})

      const resolved = await plugin.resolveId?.('widgets/ask-panel.vue?raw=1')
      expect(resolved).toBe('\0virtual:tuff-raw/widgets/ask-panel.vue?raw=1')

      const loaded = await plugin.load?.(resolved)
      expect(loaded).toContain('<template><div>ask</div></template>')
      expect(loaded).not.toContain('File not found')
    }
    finally {
      process.chdir(previousCwd)
      await fs.remove(root)
    }
  })
})
