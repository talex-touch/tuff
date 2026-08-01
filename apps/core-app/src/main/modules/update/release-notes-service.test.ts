import type { BundledReleaseNotesCatalog } from '@talex-touch/utils'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReleaseNotesService } from './release-notes-service'

const currentVersion = '2.4.14'
const catalog: BundledReleaseNotesCatalog = {
  schemaVersion: 1,
  generatedForVersion: currentVersion,
  entries: [
    {
      version: currentVersion,
      tag: `v${currentVersion}`,
      channel: 'RELEASE',
      summary: {
        zh: ['摘要一', '摘要二', '摘要三'],
        en: ['Summary one', 'Summary two', 'Summary three']
      }
    }
  ]
}

describe('ReleaseNotesService', () => {
  let root: string
  let catalogPath: string
  let acknowledged: string | null

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tuff-release-notes-service-'))
    catalogPath = join(root, 'resources', 'release-notes', 'catalog.json')
    await mkdir(join(root, 'resources', 'release-notes'), { recursive: true })
    await writeFile(catalogPath, JSON.stringify(catalog), 'utf8')
    acknowledged = '2.4.13'
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function createService() {
    return new ReleaseNotesService({
      currentVersion,
      catalogPaths: [catalogPath],
      repository: {
        getLastAcknowledgedVersion: vi.fn(async () => acknowledged),
        acknowledge: vi.fn(async (version: string) => {
          acknowledged = version
        })
      }
    })
  }

  it('loads a version-matched bundled catalog and acknowledgement state', async () => {
    await expect(createService().getBundledState()).resolves.toEqual({
      catalog,
      lastAcknowledgedVersion: '2.4.13'
    })
  })

  it('rejects a catalog generated for another app version', async () => {
    await writeFile(
      catalogPath,
      JSON.stringify({
        ...catalog,
        generatedForVersion: '2.4.15'
      })
    )

    await expect(createService().getBundledState()).rejects.toThrow('version mismatch')
  })

  it('only acknowledges the running app version', async () => {
    const service = createService()

    await expect(service.acknowledge('2.4.13')).rejects.toThrow('current app version')
    await service.acknowledge(currentVersion)
    await expect(service.getBundledState()).resolves.toMatchObject({
      lastAcknowledgedVersion: currentVersion
    })
  })
})
