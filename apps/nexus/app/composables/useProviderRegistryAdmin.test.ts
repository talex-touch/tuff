import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'vue'
import { computed, effect, isReactive } from 'vue'
import type { BindingEditRow, ProviderRegistryRecord, SceneRegistryRecord } from '~/utils/provider-registry-admin'
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
  providers: Readonly<Ref<ProviderRegistryRecord[]>>
  scenes: Readonly<Ref<SceneRegistryRecord[]>>
  createProvider: () => Promise<boolean>
  updateProviderStatus: (provider: ProviderRegistryRecord, status: 'disabled') => Promise<boolean>
  deleteProvider: (provider: ProviderRegistryRecord) => Promise<boolean>
  createScene: () => Promise<boolean>
  updateSceneStatus: (scene: SceneRegistryRecord, status: 'disabled') => Promise<boolean>
  deleteScene: (scene: SceneRegistryRecord) => Promise<boolean>
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

function installComposableRuntime() {
  const navigateTo = vi.fn()
  const toast = {
    success: vi.fn(),
    warning: vi.fn(),
  }
  lifecycle.mountedCallbacks.splice(0)
  // No `useAuthUser` / `useAccountRole` stubs: the administrator gate is the
  // layout's, and calling either here would throw.
  vi.stubGlobal('navigateTo', navigateTo)
  vi.stubGlobal('useI18n', () => ({
    t: (key: string, ...args: unknown[]) => {
      const fallback = args.at(-1)
      return typeof fallback === 'string' ? fallback : key
    },
  }))
  vi.stubGlobal('useToast', () => toast)

  return { mountedCallbacks: lifecycle.mountedCallbacks, navigateTo, toast }
}

/** Let the registry load (seed, then the collections, then the quotas) finish. */
function settle() {
  return new Promise(resolve => setTimeout(resolve, 0))
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

    if (url.endsWith('/check') && options?.method === 'POST')
      return { success: false, providerId: 'provider-0', capability: 'text.translate', latency: 0, endpoint: '', message: 'Provider check is not supported for this adapter.' }

    if (url === '/api/dashboard/provider-registry/providers')
      return { providers: [providerRecord(`provider-${state.revision}`)] }
    if (url === '/api/dashboard/provider-registry/capabilities')
      return { capabilities: [] }
    if (url === '/api/dashboard/provider-registry/scenes')
      return { scenes: [sceneRecord(`scene-${state.revision}`)] }
    if (url === '/api/dashboard/provider-registry/usage')
      return { entries: [], total: 1234 }
    if (url === '/api/dashboard/provider-registry/health')
      return options?.query?.status === 'degraded,unhealthy' ? { entries: [], total: 7 } : { entries: [], total: 40 }
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
  it('leaves the administrator gate to the layout: no role lookup, no redirect', async () => {
    const runtime = installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)

    const registry = useProviderRegistryAdmin()
    await settle()

    expect(runtime.navigateTo).not.toHaveBeenCalled()
    expect(registry).not.toHaveProperty('isAdmin')
  })

  it('starts the registry seed and collection load as soon as it is created outside a component', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)

    const registry = useProviderRegistryAdmin()
    expect(registry.registry.loading.value).toBe(true)
    await settle()

    expect(requests[0]).toEqual({
      url: '/api/dashboard/provider-registry/seed',
      options: { method: 'POST' },
    })
    expect(registry.registry.loading.value).toBe(false)
  })

  it('hydrates provider, scene, capability, usage, health, and quota state through its public fetch API', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()

    await registry.refresh()

    expect(registry.providers.value.map(provider => provider.id)).toEqual(['provider-0'])
    expect(registry.scenes.value.map(scene => scene.id)).toEqual(['scene-0'])
    expect(registry.capabilities.value).toEqual([])
    expect(registry.usageEntries.value).toEqual([])
    expect(registry.healthEntries.value).toEqual([])
    expect(registry.getProviderQuotaList('provider-0')).toEqual([])
  })

  it('reads the usage card from the ledger total and the health card from the failed checks total', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()

    await registry.refresh()

    expect(registry.usageTotal.value).toBe(1234)
    expect(registry.unhealthyTotal.value).toBe(7)
    expect(requests).toContainEqual({
      url: '/api/dashboard/provider-registry/health',
      options: { query: { status: 'degraded,unhealthy', limit: 1 } },
    })
  })

  it('reports a failed registry load in a localized line, never the request line', async () => {
    installComposableRuntime()
    fetchMock.mockImplementation(async (url: string) => {
      throw Object.assign(new Error(`[POST] "${url}": 500 Internal Server Error`), { data: null })
    })
    const registry = useProviderRegistryAdmin()

    await registry.refresh()

    expect(registry.registry.error.value).toBe('Failed to load provider registry.')
    expect(registry.registry.error.value).not.toContain('/api/')
    expect(registry.registryLoadError.value).toBe('Failed to load provider registry.')
    expect(registry.registryRefreshError.value).toBeNull()
  })

  it('settles the wait for the first load once it has rows, and at once after that', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()
    let settled = false
    const waiting = registry.whenRegistryLoaded().then(() => {
      settled = true
    })
    expect(settled).toBe(false)

    await registry.refresh()
    await waiting

    expect(settled).toBe(true)
    await expect(registry.whenRegistryLoaded()).resolves.toBeUndefined()
  })

  it('rejects the wait for the first load when that load fails', async () => {
    installComposableRuntime()
    fetchMock.mockImplementation(async (url: string) => {
      throw Object.assign(new Error(`[GET] "${url}": 500`), { data: null })
    })
    const registry = useProviderRegistryAdmin()
    const waiting = registry.whenRegistryLoaded()

    await registry.refresh()

    await expect(waiting).rejects.toThrow('Failed to load provider registry.')
  })

  it('keeps the last load through a failed refresh and reports it as a refresh failure', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()
    await registry.refresh()
    fetchMock.mockImplementation(async (url: string) => {
      throw Object.assign(new Error(`[GET] "${url}": 503 Service Unavailable`), { data: { message: 'Registry store unavailable.' } })
    })

    await registry.refresh()

    expect(registry.providers.value.map(provider => provider.id)).toEqual(['provider-0'])
    expect(registry.registryLoadError.value).toBeNull()
    expect(registry.registryRefreshError.value).toBe('Registry store unavailable.')
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
    await registry.refresh()

    await expect(execute(registry)).resolves.toBe(true)

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
    // The registry starts loading on creation too; only the check matters here.
    expect(requests.filter(request => request.url.endsWith('/check'))).toEqual([{
      url: '/api/dashboard/provider-registry/providers/provider-unavailable/check',
      options: { method: 'POST', body: { capability: 'text.translate' } },
    }])

    expect(registry.actionPending.value).toBeNull()
    // A thrown Error carries no server message: the line is the localized
    // fallback, not the transport's own text.
    expect(registry.getProviderCheckResult(provider.id)).toMatchObject({
      success: false,
      providerId: provider.id,
      message: 'Failed to check provider.',
      error: { message: 'Failed to check provider.' },
    })
  })

  it('reloads the registry after a check it got an answer to, so the health badge and card show the outcome', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()
    await registry.refresh()
    const windowLoads = () => requests.filter(request => request.url === '/api/dashboard/provider-registry/health' && !request.options?.query?.status).length
    const before = windowLoads()

    await registry.checkProvider(registry.providers.value[0]!)

    expect(windowLoads()).toBe(before + 1)
  })

  it('hands out every panel reactive from the first call, so a drawer computed over it sees the save fail', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()
    await registry.refresh()
    const provider = registry.providers.value[0]!
    const scene = registry.scenes.value[0]!

    // What the provider drawer does: opening resets the editor, then its render
    // reads a computed over the panel before the panel exists again.
    registry.resetProviderEditPanel(provider)
    const panel = computed(() => registry.getProviderEditPanel(provider))
    const shownError = computed(() => panel.value.error)
    let rendered: string | null = 'not rendered'
    const render = effect(() => {
      rendered = shownError.value
    })
    expect(rendered).toBeNull()
    panel.value.metadataText = '{ not json'
    await registry.saveProviderEdit(provider)

    expect(rendered).toBe('Metadata JSON is not valid JSON.')
    render.effect.stop()
    registry.resetProviderQuotaPanel(provider)
    registry.resetSceneEditPanel(scene)
    expect([
      registry.getProviderQuotaPanel(provider),
      registry.getSceneEditPanel(scene),
      registry.getSceneRunPanel(scene),
    ].every(item => isReactive(item))).toBe(true)
  })

  it('keeps an editor reopened while the earlier save ran, instead of resetting it when that save lands', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()
    await registry.refresh()
    const provider = registry.providers.value[0]!
    const scene = registry.scenes.value[0]!

    const providerSave = registry.saveProviderEdit(provider)
    registry.resetProviderEditPanel(provider)
    registry.getProviderEditPanel(provider).displayName = 'typed after reopening'
    const sceneSave = registry.saveSceneEdit(scene)
    registry.resetSceneEditPanel(scene)
    registry.getSceneEditPanel(scene).displayName = 'typed after reopening'
    await Promise.all([providerSave, sceneSave])

    expect(registry.getProviderEditPanel(provider).displayName).toBe('typed after reopening')
    expect(registry.getSceneEditPanel(scene).displayName).toBe('typed after reopening')
  })

  it('names the row on screen in a validation error, counting the rows left blank', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()
    await registry.refresh()
    const provider = registry.providers.value[0]!
    const scene = registry.scenes.value[0]!
    const blankCapability = { capability: ' ', schemaRef: '', meteringUnit: 'token', maxImageBytes: '', providerModel: '', meteringText: '', constraintsText: '', metadataText: '' }
    const providerPanel = registry.getProviderEditPanel(provider)
    providerPanel.capabilities.splice(0, providerPanel.capabilities.length, blankCapability, { ...blankCapability, capability: 'text.chat', constraintsText: '{ not json' })
    const blankBinding: BindingEditRow = { providerId: '', capability: '', model: '', priority: 10, weightText: '', status: 'enabled', constraintsText: '', metadataText: '' }
    const scenePanel = registry.getSceneEditPanel(scene)
    scenePanel.bindings.splice(0, scenePanel.bindings.length, blankBinding, { ...blankBinding, providerId: provider.id, capability: 'text.chat', metadataText: '[1]' })

    await registry.saveProviderEdit(provider)
    await registry.saveSceneEdit(scene)

    expect(providerPanel.error).toBe('Constraints JSON, row 2 is not valid JSON.')
    expect(scenePanel.error).toBe('Metadata JSON, row 2 must be a JSON object.')
  })

  it('keeps a failed provider edit in its panel, with the localized line, and answers false', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const registry = useProviderRegistryAdmin()
    await registry.refresh()
    const provider = registry.providers.value[0]!
    const panel = registry.getProviderEditPanel(provider)
    panel.metadataText = '{ not json'

    await expect(registry.saveProviderEdit(provider)).resolves.toBe(false)

    expect(panel.error).toBe('Metadata JSON is not valid JSON.')
    expect(requests.some(request => request.options?.method === 'PATCH')).toBe(false)
  })

  it('keeps a failed create in the create drawer and answers false', async () => {
    installComposableRuntime()
    fetchMock.mockImplementation(async (url: string, options?: Request['options']) => {
      if (url === '/api/dashboard/provider-registry/providers' && options?.method === 'POST')
        throw Object.assign(new Error('[POST] "/api/dashboard/provider-registry/providers": 409'), { data: { message: 'Provider name is taken.' } })
      return { providers: [], scenes: [], capabilities: [], entries: [], total: 0, quota: null, quotas: [] }
    })
    const registry = useProviderRegistryAdmin()
    registry.providerForm.defaultModel = ''

    await expect(registry.createProvider()).resolves.toBe(false)

    expect(registry.providerCreateError.value).toBe('Provider name is taken.')
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

  it('fills a capability row from the built-in catalogue: unit and schema come with the capability', () => {
    installComposableRuntime()
    fetchMock.mockImplementation(async () => ({}))
    const registry = useProviderRegistryAdmin()
    const catalogue = registry.providerCapabilityTemplateOptions.value
    const target = catalogue.find(item => item.capability === 'vision.ocr') ?? catalogue[0]!
    const row = { capability: '', schemaRef: '', meteringUnit: '' }

    registry.applyProviderCapabilityTemplate(row, target.capability)

    expect(row).toEqual({ capability: target.capability, schemaRef: target.schemaRef, meteringUnit: target.meteringUnit })
    expect(catalogue.length).toBeGreaterThan(10)
    registry.applyProviderCapabilityTemplate(row, 'not.in.catalogue')
    expect(row.capability).toBe(target.capability)
  })

  it('re-seeds the create form from the first preset of a service category, and offers the server\'s adapters', async () => {
    installComposableRuntime()
    const requests: Request[] = []
    installRegistryApi(requests)
    const adapters = [{ key: 'openai-compatible', label: 'OpenAI compatible' }, { key: 'tencent-tmt', label: 'Tencent TMT' }]
    const listProviders = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, options?: Request['options']) => (
      url === '/api/dashboard/provider-registry/providers' && !options?.method
        ? { providers: [], adapters }
        : listProviders(url, options)
    ))
    const registry = useProviderRegistryAdmin()
    await registry.refresh()
    registry.providerForm.name = 'typed by hand'

    registry.applyProviderServiceCategory('translation')

    const template = registry.providerTemplateOptions.value[0]!
    expect(registry.providerServiceCategoryId.value).toBe('translation')
    expect(registry.providerTemplateId.value).toBe(template.value)
    expect(registry.providerForm.name).not.toBe('typed by hand')
    expect(registry.capabilityRows.value.length).toBeGreaterThan(0)
    expect(registry.providerAdapterOptions.value).toEqual([
      { value: 'openai-compatible', label: 'OpenAI compatible' },
      { value: 'tencent-tmt', label: 'Tencent TMT' },
    ])
  })

  it('re-seeds the run input per capability and clears the last result, and keeps a failed run\'s error', async () => {
    installComposableRuntime()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/run'))
        throw Object.assign(new Error('[POST] "/run": 502'), { data: { message: 'Upstream refused the call.' } })
      return {}
    })
    const registry = useProviderRegistryAdmin()
    const record = { ...sceneRecord('scene-run'), requiredCapabilities: ['text.summarize', 'chat.completion'] }
    const panel = registry.getSceneRunPanel(record)
    panel.result = { status: 'completed' } as never
    panel.error = 'old'

    registry.applySceneRunCapabilitySample(record, 'text.summarize')
    expect(JSON.parse(panel.inputText)).toMatchObject({ style: 'concise' })
    expect(panel.result).toBeNull()
    expect(panel.error).toBeNull()

    await registry.runScene(record, true)
    expect(panel.error).toBe('Upstream refused the call.')
  })
})
