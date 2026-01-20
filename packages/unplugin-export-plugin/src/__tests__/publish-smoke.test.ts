import path from 'node:path'
import os from 'node:os'
import fs from 'fs-extra'
import { describe, it } from 'vitest'
import { publish } from '../core/publish'

describe('publish smoke', () => {
  it('runs dry-run publish with minimal package', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-publish-'))
    const previousCwd = process.cwd()
    const previousToken = process.env.TUFF_AUTH_TOKEN

    try {
      process.chdir(root)
      process.env.TUFF_AUTH_TOKEN = 'test-token'

      await fs.writeJson(path.join(root, 'package.json'), {
        name: 'demo-plugin',
        version: '1.0.0',
      })
      await fs.writeJson(path.join(root, 'manifest.json'), {
        name: 'demo-plugin',
        version: '1.0.0',
      })

      const buildDir = path.join(root, 'dist', 'build')
      await fs.ensureDir(buildDir)
      await fs.writeFile(path.join(buildDir, 'demo-plugin-1.0.0.tpex'), 'dummy')

      await publish({ dryRun: true })
    }
    finally {
      process.chdir(previousCwd)
      if (previousToken === undefined)
        delete process.env.TUFF_AUTH_TOKEN
      else
        process.env.TUFF_AUTH_TOKEN = previousToken
      await fs.remove(root)
    }
  })
})
