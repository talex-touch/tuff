import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getConfigMock,
  getMainConfigMock,
  isMainStorageReadyMock,
  saveConfigMock,
  saveMainConfigMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn<(key: string) => unknown>(),
  getMainConfigMock: vi.fn<(key: string) => unknown>(),
  isMainStorageReadyMock: vi.fn<() => boolean>(),
  saveConfigMock: vi.fn<(key: string, value: unknown) => void>(),
  saveMainConfigMock: vi.fn<(key: string, value: unknown) => void>()
}))

vi.mock('../modules/storage', () => ({
  getConfig: getConfigMock,
  getMainConfig: getMainConfigMock,
  isMainStorageReady: isMainStorageReadyMock,
  saveConfig: saveConfigMock,
  saveMainConfig: saveMainConfigMock
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    getTpexApiBase: () => 'https://agent-store.test'
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/tuff-agent-store-test'
  }
}))

import { agentStoreService } from './agent-store.service'

type MutableAgentStoreService = {
  installedAgentIds: Set<string>
  installedAgentVersions: Map<string, string>
  storageLoaded: boolean
  pendingPersist: boolean
  remoteCatalog: unknown
  installWithRollback: (
    agentId: string,
    targetVersion: string,
    pkg: { version: string; downloadUrl: string; checksum?: string }
  ) => Promise<string>
}

const serviceRef = agentStoreService as unknown as MutableAgentStoreService
const baseInstalledIds = new Set(serviceRef.installedAgentIds)
const baseInstalledVersions = new Map(serviceRef.installedAgentVersions)

function resetServiceState(): MutableAgentStoreService {
  const service = agentStoreService as unknown as MutableAgentStoreService
  service.installedAgentIds = new Set(baseInstalledIds)
  service.installedAgentVersions = new Map(baseInstalledVersions)
  service.storageLoaded = true
  service.pendingPersist = false
  service.remoteCatalog = null
  return service
}

function mockFetchJson(payload: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload
    }))
  )
}

function createCatalogPayload(version = '1.2.0') {
  return {
    agents: [
      {
        id: 'community.smart-agent',
        name: 'Smart Agent',
        description: 'Smart workflow assistant',
        version,
        latestVersion: version,
        author: 'Community',
        category: 'automation',
        capabilities: ['workflow.run'],
        tags: ['automation'],
        source: 'community',
        versions: [
          {
            version,
            downloadUrl: `https://cdn.agent-store.test/smart-agent-${version}.zip`,
            sha256: 'abc123'
          }
        ]
      }
    ]
  }
}

describe('agentStoreService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    getConfigMock.mockReset().mockReturnValue(undefined)
    getMainConfigMock.mockReset().mockReturnValue({ installed: {} })
    isMainStorageReadyMock.mockReset().mockReturnValue(true)
    saveConfigMock.mockReset()
    saveMainConfigMock.mockReset()
    resetServiceState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('checks remote updates with real version comparison', async () => {
    const service = resetServiceState()
    service.installedAgentIds.add('community.smart-agent')
    service.installedAgentVersions.set('community.smart-agent', '1.0.0')
    mockFetchJson(createCatalogPayload('1.2.0'))

    const updates = await agentStoreService.checkUpdates()

    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe('community.smart-agent')
    expect(updates[0]?.version).toBe('1.2.0')
    expect(updates[0]?.installedVersion).toBe('1.0.0')
    expect(updates[0]?.hasUpdate).toBe(true)
  })

  it('returns explicit install failure when install chain throws', async () => {
    mockFetchJson(createCatalogPayload('1.2.0'))
    const service = resetServiceState()
    const installSpy = vi
      .spyOn(service, 'installWithRollback')
      .mockRejectedValue(new Error('download failed'))

    const result = await agentStoreService.installAgent({ agentId: 'community.smart-agent' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('download failed')
    expect(service.installedAgentIds.has('community.smart-agent')).toBe(false)
    expect(saveMainConfigMock).not.toHaveBeenCalled()

    installSpy.mockRestore()
  })

  it('throws explicit unavailable error when catalog backend is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
    )

    await expect(agentStoreService.checkUpdates()).rejects.toThrow(/catalog unavailable/i)
  })
})
