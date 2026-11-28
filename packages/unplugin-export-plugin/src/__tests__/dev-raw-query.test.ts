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

  it('blocks path traversal in resolveId, load, and the Vite ?raw HTTP middleware with 403', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-dev-traversal-'))
    const root = path.join(parent, 'plugin')
    const secretFile = path.join(parent, 'secret.txt')
    const previousCwd = process.cwd()

    try {
      await fs.ensureDir(root)
      await createPlugin(root)
      await fs.writeFile(secretFile, 'TOP_SECRET_DATA', 'utf-8')
      process.chdir(root)

      const plugin = TouchPluginExport.vite() as any
      await plugin.buildStart?.call({})

      // resolveId must reject traversal instead of mapping to a virtual raw module
      expect(plugin.resolveId?.('/widgets/../../secret.txt?raw')).toBeNull()
      expect(plugin.resolveId?.('widgets/../../secret.txt?raw')).toBeNull()

      // Direct load() with a forged virtual traversal id must also fail closed
      expect(await plugin.load?.('\0virtual:tuff-raw/widgets/../../secret.txt?raw')).toBeNull()

      // Vite HTTP middleware must answer 403 (never fall through via next()) on traversal
      const middlewares: Array<(req: any, res: any, next: () => void) => Promise<void> | void> = []
      const fakeServer = {
        watcher: { add() {}, on() {} },
        moduleGraph: { getModuleById() { return null }, invalidateModule() {} },
        ws: { send() {} },
        middlewares: {
          use(fnOrPath: any, maybeFn?: any) {
            if (typeof fnOrPath === 'function')
              middlewares.push(fnOrPath)
            else if (typeof maybeFn === 'function')
              middlewares.push(maybeFn)
          },
        },
      }
      plugin.configureServer?.(fakeServer)
      const rawMiddleware = middlewares[0]!
      expect(rawMiddleware).toBeTypeOf('function')

      for (const badUrl of [
        '/widgets/../../secret.txt?raw',
        '/widgets/..%2F..%2Fsecret.txt?raw',
        '/../../secret.txt?raw',
      ]) {
        let statusCode = 0
        let body = ''
        let nextCalled = false
        await rawMiddleware(
          { url: badUrl },
          {
            set statusCode(code: number) { statusCode = code },
            get statusCode() { return statusCode },
            setHeader() {},
            end(chunk?: string) { body = String(chunk ?? '') },
          },
          () => { nextCalled = true },
        )
        expect(statusCode, badUrl).toBe(403)
        expect(nextCalled, badUrl).toBe(false)
        expect(body, badUrl).not.toContain('TOP_SECRET_DATA')
      }
    }
    finally {
      process.chdir(previousCwd)
      await fs.remove(parent)
    }
  })
})
