import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getRepositoriesPath, listRepositories, trackRepository } from '../repositories'

async function writePluginManifest(root: string): Promise<void> {
  await fs.ensureDir(root)
  await fs.writeJson(path.join(root, 'manifest.json'), {
    id: 'com.tuffex.clipboard-history',
    name: 'clipboard-history',
    version: '1.1.1',
  })
  await fs.writeJson(path.join(root, 'package.json'), {
    name: 'clipboard-history',
    version: '1.1.1',
  })
}

describe('repositories', () => {
  const previousCliHome = process.env.TUFF_CLI_HOME
  let testRoot = ''

  beforeEach(async () => {
    testRoot = path.join(process.cwd(), '.tmp-repositories-test')
    await fs.remove(testRoot)
    await fs.ensureDir(testRoot)
    process.env.TUFF_CLI_HOME = path.join(testRoot, 'config')
  })

  afterEach(async () => {
    if (previousCliHome === undefined)
      delete process.env.TUFF_CLI_HOME
    else
      process.env.TUFF_CLI_HOME = previousCliHome
    await fs.remove(testRoot)
  })

  it('does not track repositories from the system temp directory', async () => {
    const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-clipboard-history-publish-'))
    try {
      await writePluginManifest(tempRepo)
      await trackRepository('publish', tempRepo)

      expect(await listRepositories()).toEqual([])
      expect(await fs.pathExists(getRepositoriesPath())).toBe(false)
    }
    finally {
      await fs.remove(tempRepo)
    }
  })

  it('filters existing temp repositories from the local repository list', async () => {
    const realRepo = await fs.mkdtemp(path.join(testRoot, 'repo-'))
    const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-clipboard-history-publish-'))
    try {
      await writePluginManifest(realRepo)
      await writePluginManifest(tempRepo)

      await fs.ensureDir(path.dirname(getRepositoriesPath()))
      await fs.writeJson(getRepositoriesPath(), [
        {
          path: tempRepo,
          name: 'clipboard-history',
          version: '1.1.1',
          lastAction: 'publish',
          lastOpenedAt: '2026-04-20T12:45:56.439Z',
        },
        {
          path: realRepo,
          name: 'clipboard-history',
          version: '1.1.1',
          lastAction: 'publish',
          lastOpenedAt: '2026-03-08T08:54:02.277Z',
        },
      ])

      expect(await listRepositories()).toEqual([
        {
          path: realRepo,
          name: 'clipboard-history',
          version: '1.1.1',
          lastAction: 'publish',
          lastOpenedAt: '2026-03-08T08:54:02.277Z',
        },
      ])
    }
    finally {
      await fs.remove(tempRepo)
    }
  })
})
