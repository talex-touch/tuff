import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageList } from '@talex-touch/utils'

const { getMainConfigMock, isMainStorageReadyMock, networkRequestMock, saveMainConfigMock } =
  vi.hoisted(() => ({
    getMainConfigMock: vi.fn<(key: string) => unknown>(),
    isMainStorageReadyMock: vi.fn<() => boolean>(),
    networkRequestMock: vi.fn(),
    saveMainConfigMock: vi.fn<(key: string, value: unknown) => void>()
  }))

vi.mock('../modules/storage', () => ({
  getMainConfig: getMainConfigMock,
  isMainStorageReady: isMainStorageReadyMock,
  saveMainConfig: saveMainConfigMock
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    getTpexApiBase: () => 'https://agent-store.test'
  }
})

vi.mock('../modules/network', () => ({
  getNetworkService: () => ({
    request: networkRequestMock
  })
}))

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

function mockNetworkJson(payload: unknown): void {
  networkRequestMock.mockResolvedValue({
    data: payload,
    status: 200,
    statusText: 'OK',
    headers: {},
    url: 'https://agent-store.test/api/v1/agents/catalog'
  })
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
    getMainConfigMock.mockReset().mockReturnValue({ installed: {} })
    isMainStorageReadyMock.mockReset().mockReturnValue(true)
    networkRequestMock.mockReset()
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
    mockNetworkJson(createCatalogPayload('1.2.0'))

    const updates = await agentStoreService.checkUpdates()

    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe('community.smart-agent')
    expect(updates[0]?.version).toBe('1.2.0')
    expect(updates[0]?.installedVersion).toBe('1.0.0')
    expect(updates[0]?.hasUpdate).toBe(true)
  })

  it('returns explicit install failure when install chain throws', async () => {
    mockNetworkJson(createCatalogPayload('1.2.0'))
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
    networkRequestMock.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(agentStoreService.checkUpdates()).rejects.toThrow(/catalog unavailable/i)
  })

  it('reads installed agents only from the canonical storage key', async () => {
    const service = resetServiceState()
    service.storageLoaded = false
    getMainConfigMock.mockImplementation((key) => {
      if (key === StorageList.AGENT_STORE) {
        return {
          installed: {
            'community.smart-agent': '1.0.0'
          }
        }
      }
      return { installed: {} }
    })

    await agentStoreService.getInstalledAgents()

    expect(getMainConfigMock).toHaveBeenCalledWith(StorageList.AGENT_STORE)
    expect(saveMainConfigMock).not.toHaveBeenCalled()
  })
})
