import type { ProviderRegistryAdmin } from './useProviderRegistryAdmin'
import type { RegistryTranslate } from '~/utils/admin-provider-registry'
import type {
  ProviderEditPanelState,
  ProviderRegistryRecord,
  SceneEditPanelState,
  SceneRegistryRecord,
} from '~/utils/provider-registry-admin'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createProviderEditPanel, createSceneEditPanel } from '~/utils/provider-registry-admin'
import { useProviderRegistryPanel } from './useProviderRegistryPanel'
import { useToast } from './useToast'

/**
 * What the provider registry panel does when the operator acts, with a fake
 * registry that records every call: what asks first, what a cancel leaves
 * untouched, and which drawer a finished save may close.
 */

/** English fallbacks: the wording is checked with the real messages elsewhere. */
const t = ((_key: string, second: unknown, third?: unknown) => (typeof second === 'string' ? second : third as string)) as RegistryTranslate
const format = { number: (value: unknown) => new Intl.NumberFormat('en-US').format(Number(value)) }

function provider(id: string, capabilities: string[] = []): ProviderRegistryRecord {
  return {
    id,
    name: id,
    displayName: `Provider ${id}`,
    vendor: 'openai',
    status: 'enabled',
    authType: 'api_key',
    authRef: null,
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: null,
    region: null,
    metadata: null,
    capabilities: capabilities.map((name, index) => ({
      id: `${id}_cap_${index}`,
      providerId: id,
      capability: name,
      schemaRef: null,
      metering: null,
      constraints: null,
      metadata: null,
      createdAt: '',
      updatedAt: '',
    })),
    createdBy: 'admin',
    createdAt: '',
    updatedAt: '',
  }
}

function scene(id: string, bindings: Array<[string, string]> = []): SceneRegistryRecord {
  return {
    id,
    displayName: `Scene ${id}`,
    owner: 'nexus',
    ownerScope: 'system',
    ownerId: null,
    status: 'enabled',
    requiredCapabilities: [],
    strategyMode: 'priority',
    fallback: 'enabled',
    meteringPolicy: null,
    auditPolicy: null,
    metadata: null,
    bindings: bindings.map(([providerId, capability], index) => ({
      id: `${id}_b${index}`,
      sceneId: id,
      providerId,
      capability,
      model: null,
      priority: 10,
      weight: null,
      status: 'enabled',
      constraints: null,
      metadata: null,
      createdAt: '',
      updatedAt: '',
    })),
    createdBy: 'admin',
    createdAt: '',
    updatedAt: '',
  }
}

function fakeAdmin(providers: ProviderRegistryRecord[] = []) {
  const editPanels: Record<string, ProviderEditPanelState> = {}
  const sceneEditPanels: Record<string, SceneEditPanelState> = {}
  const admin = {
    providers: ref(providers),
    providerCreateError: ref<string | null>('old error'),
    lastSaveError: ref<string | null>(null),
    sceneCreateError: ref<string | null>(null),
    getProviderEditPanel: (record: ProviderRegistryRecord) => (editPanels[record.id] ??= createProviderEditPanel(record)),
    getSceneEditPanel: (record: SceneRegistryRecord) => (sceneEditPanels[record.id] ??= createSceneEditPanel(record)),
    getSceneRunPanel: vi.fn(),
    resetProviderEditPanel: vi.fn((record: ProviderRegistryRecord) => {
      delete editPanels[record.id]
    }),
    resetProviderQuotaPanel: vi.fn(),
    resetSceneEditPanel: vi.fn((record: SceneRegistryRecord) => {
      delete sceneEditPanels[record.id]
    }),
    createProvider: vi.fn(async () => true),
    saveProviderEdit: vi.fn(async (_record: ProviderRegistryRecord) => true),
    saveProviderQuota: vi.fn(async (_record: ProviderRegistryRecord) => true),
    createScene: vi.fn(async () => true),
    saveSceneEdit: vi.fn(async (_record: SceneRegistryRecord) => true),
    runScene: vi.fn(async (_record: SceneRegistryRecord, _dryRun: boolean) => {}),
    checkProvider: vi.fn(async (record: ProviderRegistryRecord) => ({ success: true, providerId: record.id, capability: '', latency: 0, endpoint: '', message: '' })),
    updateProviderStatus: vi.fn(async (_record: ProviderRegistryRecord, _status: string) => true),
    updateSceneStatus: vi.fn(async (_record: SceneRegistryRecord, _status: string) => true),
    deleteProvider: vi.fn(async (_record: ProviderRegistryRecord) => true),
    deleteScene: vi.fn(async (_record: SceneRegistryRecord) => true),
  }
  return { admin, panel: useProviderRegistryPanel(admin as unknown as ProviderRegistryAdmin, t, format) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('switching a provider or a route on or off', () => {
  it('asks in both directions, and a cancel sends nothing', async () => {
    const { admin, panel } = fakeAdmin()
    const record = provider('a')

    panel.confirmProviderStatus(record, false)
    expect(panel.confirmOpen.value).toBe(true)
    expect(panel.pendingConfirm.value).toMatchObject({ title: 'Disable provider', tone: 'danger' })
    panel.setConfirmOpen(false)
    await panel.runConfirmed()
    expect(admin.updateProviderStatus).not.toHaveBeenCalled()
    expect(panel.confirmOpen.value).toBe(false)
    // The closing dialog keeps its text while it fades out.
    expect(panel.pendingConfirm.value!.title).toBe('Disable provider')

    panel.confirmProviderStatus(record, true)
    expect(panel.pendingConfirm.value).toMatchObject({ title: 'Enable provider', tone: 'warning' })
    await panel.runConfirmed()
    expect(admin.updateProviderStatus).toHaveBeenCalledWith(record, 'enabled')
    expect(panel.confirmOpen.value).toBe(false)
  })

  it('asks before switching a route either way', async () => {
    const { admin, panel } = fakeAdmin()
    const record = scene('s')

    panel.confirmSceneStatus(record, true)
    expect(panel.pendingConfirm.value!.title).toBe('Enable route')
    await panel.runConfirmed()
    panel.confirmSceneStatus(record, false)
    expect(panel.pendingConfirm.value!.title).toBe('Disable route')
    await panel.runConfirmed()

    expect(admin.updateSceneStatus.mock.calls.map(call => call[1])).toEqual(['enabled', 'disabled'])
  })

  it('keeps the dialog up and locked while the action runs', async () => {
    const { admin, panel } = fakeAdmin()
    const pending = deferred<boolean>()
    admin.updateProviderStatus.mockReturnValueOnce(pending.promise)

    panel.confirmProviderStatus(provider('a'), false)
    const running = panel.runConfirmed()
    expect(panel.confirmLoading.value).toBe(true)
    panel.setConfirmOpen(false)
    expect(panel.confirmOpen.value).toBe(true)

    pending.resolve(true)
    await running
    expect(panel.confirmLoading.value).toBe(false)
    expect(panel.confirmOpen.value).toBe(false)
  })
})

describe('running and checking', () => {
  it('asks before a real 执行, and runs with dryRun false only once confirmed', async () => {
    const { admin, panel } = fakeAdmin()
    const record = scene('s')
    panel.openSceneDrawer('run', record)

    panel.confirmExecute()
    expect(admin.runScene).not.toHaveBeenCalled()
    expect(panel.pendingConfirm.value).toMatchObject({ title: 'Run for real', tone: 'warning' })
    await panel.runConfirmed()

    expect(admin.runScene).toHaveBeenCalledWith(record, false)
  })

  it('checks without asking, and closes the check drawer it came from', async () => {
    const { admin, panel } = fakeAdmin()
    const record = provider('a', ['text.chat', 'vision.ocr'])

    panel.openCheckDrawer(record)
    expect(panel.checkDrawer.capability).toBe('text.chat')
    panel.checkDrawer.capability = 'vision.ocr'
    await panel.submitCheck()

    expect(panel.confirmOpen.value).toBe(false)
    expect(admin.checkProvider).toHaveBeenCalledWith(record, 'vision.ocr')
    expect(panel.checkDrawer.open).toBe(false)
  })
})

describe('deleting', () => {
  it('asks before deleting a provider, with how many capabilities go with it', async () => {
    const { admin, panel } = fakeAdmin()
    const record = provider('a', ['text.chat', 'vision.ocr'])

    panel.confirmDeleteProvider(record)
    expect(panel.pendingConfirm.value!.description).toContain('2 capability declaration(s)')
    await panel.runConfirmed()

    expect(admin.deleteProvider).toHaveBeenCalledWith(record)
  })

  it('asks before deleting a route, with how many bindings go with it', async () => {
    const { admin, panel } = fakeAdmin()
    const record = scene('s', [['a', 'text.chat']])

    panel.confirmDeleteScene(record)
    expect(panel.pendingConfirm.value!.description).toContain('1 provider binding(s)')
    panel.setConfirmOpen(false)

    expect(admin.deleteScene).not.toHaveBeenCalled()
  })
})

describe('saves that delete', () => {
  it('saves a provider edit at once when nothing would be deleted', async () => {
    const { admin, panel } = fakeAdmin()
    const record = provider('a', ['text.chat'])
    panel.openProviderDrawer('edit', record)

    panel.submitProviderDrawer()
    await vi.waitFor(() => expect(admin.saveProviderEdit).toHaveBeenCalledWith(record))
    expect(panel.confirmOpen.value).toBe(false)
  })

  it('asks before a provider save that deletes capabilities, and lists them', async () => {
    const { admin, panel } = fakeAdmin()
    const record = provider('a', ['text.chat', 'vision.ocr'])
    panel.openProviderDrawer('edit', record)
    const editor = admin.getProviderEditPanel(record)
    editor.removedCapabilityIds.push(record.capabilities[1]!.id)

    panel.submitProviderDrawer()
    expect(admin.saveProviderEdit).not.toHaveBeenCalled()
    expect(panel.pendingConfirm.value!.description).toContain('vision.ocr')
    await panel.runConfirmed()

    expect(admin.saveProviderEdit).toHaveBeenCalledWith(record)
  })

  it('asks before a route save that deletes bindings, and names provider and capability', () => {
    const { admin, panel } = fakeAdmin([provider('a'), provider('b')])
    const record = scene('s', [['a', 'text.chat'], ['b', 'vision.ocr']])
    panel.openSceneDrawer('edit', record)
    admin.getSceneEditPanel(record).bindings.splice(1, 1)

    panel.submitSceneDrawer()

    expect(admin.saveSceneEdit).not.toHaveBeenCalled()
    expect(panel.pendingConfirm.value!.description).toContain('Provider b · vision.ocr')
  })
})

describe('which drawer a save closes', () => {
  it('closes the drawer a save came from', async () => {
    const { panel } = fakeAdmin()
    panel.openProviderDrawer('quota', provider('a'))

    panel.submitProviderDrawer()

    await vi.waitFor(() => expect(panel.providerDrawer.open).toBe(false))
  })

  it('leaves open a drawer opened for another record while the save ran', async () => {
    const { admin, panel } = fakeAdmin()
    const first = provider('a')
    const second = provider('b')
    const saving = deferred<boolean>()
    admin.saveProviderEdit.mockReturnValueOnce(saving.promise)

    panel.openProviderDrawer('edit', first)
    panel.submitProviderDrawer()
    panel.openProviderDrawer('edit', second)
    saving.resolve(true)
    await saving.promise
    await Promise.resolve()

    expect(panel.providerDrawer.open).toBe(true)
    expect(panel.providerDrawer.provider?.id).toBe(second.id)
  })

  it('says in a toast when a save fails after its drawer was closed', async () => {
    const { admin, panel } = fakeAdmin()
    const record = provider('a')
    const saving = deferred<boolean>()
    admin.saveProviderEdit.mockReturnValueOnce(saving.promise)
    const toasts = useToast()

    panel.openProviderDrawer('edit', record)
    panel.submitProviderDrawer()
    // Escape, × or the mask: the drawer's own `update:open`, not 取消.
    panel.setProviderDrawerOpen(false)
    expect(panel.providerDrawer.open).toBe(false)
    admin.lastSaveError.value = 'Provider name is taken.'
    saving.resolve(false)
    await vi.waitFor(() => expect(toasts.toasts.value.at(-1)).toMatchObject({ type: 'warning', title: 'Provider name is taken.' }))
  })

  it('closes the scene and check drawers the same way from their own update:open', () => {
    const { panel } = fakeAdmin()
    panel.openSceneDrawer('create', null)
    const sceneToken = panel.sceneDrawer.token
    panel.setSceneDrawerOpen(false)
    panel.openCheckDrawer(provider('a', ['text.chat']))
    const checkToken = panel.checkDrawer.token
    panel.setCheckDrawerOpen(false)

    expect([panel.sceneDrawer.open, panel.checkDrawer.open]).toEqual([false, false])
    expect([panel.sceneDrawer.token, panel.checkDrawer.token]).toEqual([sceneToken + 1, checkToken + 1])
  })

  it('keeps the drawer open when the save fails', async () => {
    const { admin, panel } = fakeAdmin()
    admin.createScene.mockResolvedValueOnce(false)
    panel.openSceneDrawer('create', null)

    panel.submitSceneDrawer()
    await vi.waitFor(() => expect(admin.createScene).toHaveBeenCalled())
    await Promise.resolve()

    expect(panel.sceneDrawer.open).toBe(true)
  })

  it('opens a fresh editor and clears the last create failure', () => {
    const { admin, panel } = fakeAdmin()
    const record = provider('a')

    panel.openProviderDrawer('edit', record)
    panel.openProviderDrawer('create', null)

    expect(admin.resetProviderEditPanel).toHaveBeenCalledWith(record)
    expect(admin.providerCreateError.value).toBeNull()
  })
})
