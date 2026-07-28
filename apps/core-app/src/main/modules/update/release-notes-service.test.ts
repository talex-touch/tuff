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
  legacyThrough: {
    RELEASE: '2.4.13',
    BETA: '2.4.13-beta.23'
  },
  entries: [
    {
      version: currentVersion,
      tag: `v${currentVersion}`,
      channel: 'RELEASE',
      summary: {
        zh: ['摘要一', '摘要二', '摘要三'],
        en: ['Summary one', 'Summary two', 'Summary three']
      },
      currentNotes: {
        zh: '# 中文\n',
        en: '# English\n'
      }
    }
  ]
}

function remoteRelease(version: string) {
  return {
    tag: `v${version}`,
    version,
    name: `Release v${version}`,
    channel: 'RELEASE',
    notes: { zh: `# ${version} 中文`, en: `# ${version} English` },
    status: 'published',
    publishedAt: '2026-07-28T00:00:00.000Z',
    createdAt: '2026-07-28T00:00:00.000Z'
  }
}

describe('ReleaseNotesService', () => {
  let root: string
  let catalogPath: string
  let acknowledged: string | null
  let request: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tuff-release-notes-service-'))
    catalogPath = join(root, 'resources', 'release-notes', 'catalog.json')
    await mkdir(join(root, 'resources', 'release-notes'), { recursive: true })
    await writeFile(catalogPath, JSON.stringify(catalog), 'utf8')
    acknowledged = '2.4.13'
    request = vi.fn()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function createService() {
    return new ReleaseNotesService({
      currentVersion,
      catalogPaths: [catalogPath],
      cachePath: join(root, 'release-notes-cache.json'),
      officialBaseUrl: 'https://tuff.example.test',
      repository: {
        getLastAcknowledgedVersion: vi.fn(async () => acknowledged),
        acknowledge: vi.fn(async (version: string) => {
          acknowledged = version
        })
      },
      request
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

  it('normalizes paged Nexus history and falls back to the cached page offline', async () => {
    request.mockResolvedValueOnce({
      releases: [remoteRelease('2.4.14'), remoteRelease('2.4.13')],
      pageInfo: { hasMore: true, nextCursor: 'next' }
    })
    const service = createService()

    const online = await service.list({ channel: 'RELEASE', limit: 20 })
    expect(request).toHaveBeenCalledWith(
      'https://tuff.example.test/api/releases?channel=RELEASE&status=published&limit=20'
    )
    expect(online).toMatchObject({
      hasMore: true,
      nextCursor: 'next',
      stale: false
    })
    expect(online.entries.map((entry) => [entry.version, entry.legacy])).toEqual([
      ['2.4.14', false],
      ['2.4.13', true]
    ])

    request.mockRejectedValueOnce(new Error('offline'))
    await expect(service.list({ channel: 'RELEASE', limit: 20 })).resolves.toEqual({
      ...online,
      stale: true
    })
  })

  it('ignores structurally corrupted cached pages', async () => {
    await writeFile(
      join(root, 'release-notes-cache.json'),
      JSON.stringify({
        schemaVersion: 1,
        pages: { 'RELEASE:first:20': 'truncated' },
        details: { 'v2.4.14': { tag: 'v2.4.14' } }
      }),
      'utf8'
    )
    request.mockRejectedValueOnce(new Error('offline'))

    await expect(createService().list({ channel: 'RELEASE', limit: 20 })).rejects.toThrow('offline')
  })

  it('serves a previously fetched detail from cache while offline', async () => {
    request.mockResolvedValueOnce({ release: remoteRelease('2.4.14') })
    const service = createService()

    await expect(service.get('v2.4.14')).resolves.toMatchObject({
      tag: 'v2.4.14',
      legacy: false
    })

    request.mockRejectedValueOnce(new Error('offline'))
    await expect(service.get('v2.4.14')).resolves.toMatchObject({
      tag: 'v2.4.14',
      legacy: false
    })
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
