import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'vue'
import type { ProviderRegistryRecord, SceneRegistryRecord } from '~/utils/provider-registry-admin'
import { useProviderRegistryAdmin } from './useProviderRegistryAdmin'

const fetchMock = vi.hoisted(() => vi.fn())

const lifecycle = vi.hoisted(() => ({
  mountedCallbacks: [] as Array<() => void>,
}))

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ...vue,
    onMounted(callback: () => void) {
      lifecycle.mountedCallbacks.push(callback)
    },
  }
})

vi.mock('ofetch', () => ({
  $fetch: fetchMock,
}))

interface Request {
  url: string
  options?: {
    body?: unknown
    method?: string
    query?: Record<string, unknown>
  }
}

interface RegistryMutationFacade {
  providers: Ref<ProviderRegistryRecord[]>
  scenes: Ref<SceneRegistryRecord[]>
  createProvider: () => Promise<void>
  updateProviderStatus: (provider: ProviderRegistryRecord, status: 'disabled') => Promise<void>
  deleteProvider: (provider: ProviderRegistryRecord) => Promise<void>
  createScene: () => Promise<void>
  updateSceneStatus: (scene: SceneRegistryRecord, status: 'disabled') => Promise<void>
  deleteScene: (scene: SceneRegistryRecord) => Promise<void>
}

function providerRecord(id: string): ProviderRegistryRecord {
  return {
    id,
    name: id,
    displayName: `Provider ${id}`,
    vendor: 'openai',
    status: 'enabled',
    authType: 'api_key',
    authRef: `secure://providers/${id}`,
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: 'https://provider.example.test',
    region: null,
    metadata: null,
    capabilities: [],
    createdBy: 'admin-1',
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  }
}

function sceneRecord(id: string): SceneRegistryRecord {
  return {
    id,
    displayName: `Scene ${id}`,
    owner: 'nexus',
    ownerScope: 'system',
    ownerId: null,
    status: 'enabled',
    requiredCapabilities: ['chat.completion'],
    strategyMode: 'priority',
    fallback: 'enabled',
    meteringPolicy: null,
    auditPolicy: null,
    metadata: null,
    bindings: [],
    createdBy: 'admin-1',
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  }
}

function installComposableRuntime(role: 'admin' | 'member' = 'admin') {
  const user = ref({ role })
  const navigateTo = vi.fn()
  const toast = {
    success: vi.fn(),
    warning: vi.fn(),
  }
  lifecycle.mountedCallbacks.splice(0)
  vi.stubGlobal('navigateTo', navigateTo)
  vi.stubGlobal('useAuthUser', () => ({ user }))
  vi.stubGlobal('useI18n', () => ({
    t: (key: string, ...args: unknown[]) => {
      const fallback = args.at(-1)
      return typeof fallback === 'string' ? fallback : key
    },
  }))
  vi.stubGlobal('useToast', () => toast)

  return { mountedCallbacks: lifecycle.mountedCallbacks, navigateTo, toast }
}

function installRegistryApi(requests: Request[], state = { revision: 0 }) {
  fetchMock.mockImplementation(async (url: string, options?: Request['options']) => {
    requests.push({ url, options })

    if (url === '/api/dashboard/provider-registry/seed')
      return {}

    if (url === '/api/dashboard/provider-registry/providers' && options?.method === 'POST') {
      state.revision += 1
      return {}
    }

    if (url === '/api/dashboard/provider-registry/scenes' && options?.method === 'POST') {
      state.revision += 1
      return {}
    }

    if (
      (url.startsWith('/api/dashboard/provider-registry/providers/')
        || url.startsWith('/api/dashboard/provider-registry/scenes/'))
      && ['PATCH', 'DELETE'].includes(options?.method ?? '')
    ) {
      state.revision += 1
      return {}
    }

    if (url === '/api/dashboard/provider-registry/providers')
      return { providers: [providerRecord(`provider-${state.revision}`)] }
    if (url === '/api/dashboard/provider-registry/capabilities')
      return { capabilities: [] }
    if (url === '/api/dashboard/provider-registry/scenes')
      return { scenes: [sceneRecord(`scene-${state.revision}`)] }
    if (url === '/api/dashboard/provider-registry/usage')
      return { entries: [] }
    if (url === '/api/dashboard/provider-registry/health')
      return { entries: [] }
    if (url.endsWith('/quota'))
      return { quota: null, quotas: [] }

    throw new Error(`Unexpected provider registry request: ${url}`)
  })
}

afterEach(() => {
  fetchMock.mockReset()
  lifecycle.mountedCallbacks.splice(0)
  vi.unstubAllGlobals()
})

describe('useProviderRegistryAdmin', () => {
  it('redirects an authenticated non-admin away from provider registry administration', () => {
    const runtime = installComposableRuntime('member')
    const requests: Request[] = []
    installRegistryApi(requests)

    const registry = useProviderRegistryAdmin()

    expect(registry.isAdmin.value).toBe(false)
    expect(runtime.navigateTo).toHaveBeenCalledWith('/dashboard/overview')
    expect(requests).toEqual([])
  })

  it('starts the registry seed and collection load when mounted', async () => {
    const runtime = installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)

    useProviderRegistryAdmin()
    expect(runtime.mountedCallbacks).toHaveLength(1)

    runtime.mountedCallbacks[0]!()
    await Promise.resolve()

    expect(requests).toContainEqual({
      url: '/api/dashboard/provider-registry/seed',
      options: { method: 'POST' },
    })
  })

  it('hydrates provider, scene, capability, usage, health, and quota state through its public fetch API', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()

    await registry.fetchRegistry()

    expect(registry.providers.value.map(provider => provider.id)).toEqual(['provider-0'])
    expect(registry.scenes.value.map(scene => scene.id)).toEqual(['scene-0'])
    expect(registry.capabilities.value).toEqual([])
    expect(registry.usageEntries.value).toEqual([])
    expect(registry.healthEntries.value).toEqual([])
    expect(registry.getProviderQuotaList('provider-0')).toEqual([])
  })

  it.each([
    {
      name: 'creates a provider',
      entity: 'provider',
      execute: (registry: RegistryMutationFacade) => registry.createProvider(),
    },
    {
      name: 'updates provider status',
      entity: 'provider',
      execute: (registry: RegistryMutationFacade) => registry.updateProviderStatus(registry.providers.value[0]!, 'disabled'),
    },
    {
      name: 'deletes a provider',
      entity: 'provider',
      execute: (registry: RegistryMutationFacade) => registry.deleteProvider(registry.providers.value[0]!),
    },
    {
      name: 'creates a scene',
      entity: 'scene',
      execute: (registry: RegistryMutationFacade) => registry.createScene(),
    },
    {
      name: 'updates scene status',
      entity: 'scene',
      execute: (registry: RegistryMutationFacade) => registry.updateSceneStatus(registry.scenes.value[0]!, 'disabled'),
    },
    {
      name: 'deletes a scene',
      entity: 'scene',
      execute: (registry: RegistryMutationFacade) => registry.deleteScene(registry.scenes.value[0]!),
    },
  ])('$name refreshes the facade registry after the mutation succeeds', async ({ entity, execute }) => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()
    await registry.fetchRegistry()

    await execute(registry)

    if (entity === 'provider')
      expect(registry.providers.value.map(provider => provider.id)).toEqual(['provider-1'])
    else
      expect(registry.scenes.value.map(scene => scene.id)).toEqual(['scene-1'])
  })

  it('clears the action pending key and retains a provider-scoped failure result when a health check fails', async () => {
    installComposableRuntime()
    const provider = providerRecord('provider-unavailable')
    const requests: Request[] = []
    fetchMock.mockImplementation(async (url: string, options?: Request['options']) => {
      requests.push({ url, options })
      if (url.endsWith('/check'))
        throw new Error('Probe unavailable')
      throw new Error(`Unexpected provider registry request: ${url}`)
    })
    const registry = useProviderRegistryAdmin()

    const checking = registry.checkProvider(provider)
    expect(registry.actionPending.value).toBe('provider:provider-unavailable:check')

    await checking
    expect(requests).toEqual([{
      url: '/api/dashboard/provider-registry/providers/provider-unavailable/check',
      options: { method: 'POST', body: { capability: 'text.translate' } },
    }])

    expect(registry.actionPending.value).toBeNull()
    expect(registry.error.value).toBe('Probe unavailable')
    expect(registry.getProviderCheckResult(provider.id)).toMatchObject({
      success: false,
      providerId: provider.id,
      message: 'Probe unavailable',
      error: { message: 'Probe unavailable' },
    })
  })

  it('stores an API key through the credential boundary before enabling the requested provider', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    const credentialProvider = providerRecord('provider-credential')
    credentialProvider.authRef = 'secure://providers/credential-boundary'
    fetchMock.mockImplementation(async (url: string, options?: Request['options']) => {
      requests.push({ url, options })

      if (url === '/api/dashboard/provider-registry/providers' && options?.method === 'POST')
        return {}
      if (url === '/api/dashboard/provider-registry/credentials' && options?.method === 'POST')
        return {}
      if (url === '/api/dashboard/provider-registry/providers' && options?.query?.vendor)
        return { providers: [credentialProvider] }
      if (url.startsWith('/api/dashboard/provider-registry/providers/provider-credential') && options?.method === 'PATCH')
        return {}
      if (url === '/api/dashboard/provider-registry/seed')
        return {}
      if (url === '/api/dashboard/provider-registry/providers')
        return { providers: [credentialProvider] }
      if (url === '/api/dashboard/provider-registry/capabilities')
        return { capabilities: [] }
      if (url === '/api/dashboard/provider-registry/scenes')
        return { scenes: [] }
      if (url === '/api/dashboard/provider-registry/usage' || url === '/api/dashboard/provider-registry/health')
        return { entries: [] }
      if (url.endsWith('/quota'))
        return { quota: null, quotas: [] }

      throw new Error(`Unexpected provider registry request: ${url}`)
    })
    const registry = useProviderRegistryAdmin()
    registry.providerForm.name = 'credential-boundary'
    registry.providerForm.displayName = 'Credential Boundary'
    registry.providerForm.status = 'enabled'
    registry.providerForm.authType = 'api_key'
    registry.providerForm.apiKey = 'secret-api-key'

    await registry.createProvider()

    const providerCreateIndex = requests.findIndex(request => (
      request.url === '/api/dashboard/provider-registry/providers'
      && request.options?.method === 'POST'
    ))
    const credentialCreateIndex = requests.findIndex(request => (
      request.url === '/api/dashboard/provider-registry/credentials'
      && request.options?.method === 'POST'
    ))
    const enableIndex = requests.findIndex(request => (
      request.url === '/api/dashboard/provider-registry/providers/provider-credential'
      && request.options?.method === 'PATCH'
    ))
    const providerCreate = requests[providerCreateIndex]!
    const credentialCreate = requests[credentialCreateIndex]!
    const enable = requests[enableIndex]!

    expect(providerCreateIndex).toBeGreaterThanOrEqual(0)
    expect(credentialCreateIndex).toBeGreaterThan(providerCreateIndex)
    expect(enableIndex).toBeGreaterThan(credentialCreateIndex)
    expect(providerCreate.options?.body).toEqual(expect.objectContaining({
      name: 'credential-boundary',
      authRef: 'secure://providers/credential-boundary',
      authType: 'api_key',
      status: 'disabled',
    }))
    expect(providerCreate.options?.body).not.toHaveProperty('apiKey')
    expect(credentialCreate.options?.body).toEqual({
      authRef: 'secure://providers/credential-boundary',
      authType: 'api_key',
      credentials: { apiKey: 'secret-api-key' },
    })
    expect(enable.options?.body).toEqual({ status: 'enabled' })
    expect(registry.providerForm.apiKey).toBe('')
  })
})
