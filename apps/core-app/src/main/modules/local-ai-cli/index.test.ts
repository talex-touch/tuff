import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalAiCliEvents } from '@talex-touch/utils/transport/events/local-ai-cli'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  handlers: new Map<string, (payload: unknown, context: unknown) => unknown>(),
  getMainConfig: vi.fn(),
  saveMainConfig: vi.fn(),
  resolveAllLocalAiCliProviderStatuses: vi.fn(),
  resolveLocalAiCliProviderStatus: vi.fn(),
  restoreLocalAi: vi.fn(async () => undefined),
  showLocalAi: vi.fn(),
  registerMainShortcut: vi.fn(),
  spawnSafe: vi.fn(),
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn()
  }))
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: (
      event: { toEventName: () => string },
      handler: (payload: unknown, context: unknown) => unknown
    ) => {
      mocks.handlers.set(event.toEventName(), handler)
      return vi.fn()
    },
    onStream: vi.fn(() => vi.fn())
  }))
}))
vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({ spawnSafe: mocks.spawnSafe }))
vi.mock('../app-destination/app-destination-navigation', () => ({
  getAppDestinationNavigationService: vi.fn(() => ({ open: mocks.open }))
}))
vi.mock('../../utils/logger', () => ({ createLogger: mocks.createLogger }))
vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn((ctx: { runtime?: { app?: unknown }; app?: unknown }) => ({
    app: ctx.runtime?.app ?? ctx.app
  }))
}))
vi.mock('../storage', () => ({
  getMainConfig: mocks.getMainConfig,
  saveMainConfig: mocks.saveMainConfig
}))
vi.mock('./executable-resolver', () => ({
  resolveAllLocalAiCliProviderStatuses: mocks.resolveAllLocalAiCliProviderStatuses,
  resolveLocalAiCliProviderStatus: mocks.resolveLocalAiCliProviderStatus
}))
vi.mock('../global-shortcon', () => ({
  shortcutModule: { registerMainShortcut: mocks.registerMainShortcut }
}))
vi.mock('../omni-panel', () => ({
  omniPanelModule: {
    restoreLocalAi: mocks.restoreLocalAi,
    showLocalAi: mocks.showLocalAi
  }
}))
vi.mock('../platform/capability-adapter', () => ({
  getAutoPasteCapabilityPatch: vi.fn(() => ({}))
}))
vi.mock('../system/active-app', () => ({ activeAppService: {} }))
vi.mock('../system/desktop-shortcut', () => ({ sendPlatformShortcut: vi.fn() }))
vi.mock('electron', () => ({ clipboard: {}, dialog: {} }))

import { LocalAiCliModule } from './index'

const WORKSPACE_ROOT = mkdtempSync(join(tmpdir(), 'local-ai-cli-navigation-'))
const HOST_CONTEXT = { sender: { id: 1 } } as never
const ORIGINAL_PLATFORM = process.platform

function handlerFor(event: { toEventName: () => string }) {
  const handler = mocks.handlers.get(event.toEventName())
  if (!handler) {
    throw new Error(`No handler registered for ${event.toEventName()}`)
  }
  return handler
}

async function createModule(): Promise<InstanceType<typeof LocalAiCliModule>> {
  const module = new LocalAiCliModule()
  await module.onInit({
    runtime: { app: { channel: {} } },
    app: { channel: {} },
    file: { dirPath: WORKSPACE_ROOT }
  } as never)
  return module
}

/**
 * The local-AI settings entry used to focus the window and push a legacy `/setting?section=...`
 * path over a request/response call. It delegates to the shared destination service now, and only
 * a delivered destination arms the return-to-panel deadline — an unavailable window must leave the
 * panel return path disarmed rather than promise a return the user can never take.
 */
describe('LocalAiCliModule settings navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    mocks.handlers.clear()
    process.env.TUFF_ENABLE_LOCAL_AI_CLI = '1'
    mocks.getMainConfig.mockReturnValue({
      localAiCli: { enabled: true, defaultProvider: 'pi', providers: {} }
    })
    mocks.resolveAllLocalAiCliProviderStatuses.mockResolvedValue([
      { id: 'pi', enabled: true, installed: true, capabilities: { taskRead: true } }
    ])
    mocks.open.mockReturnValue({ status: 'opened', destinationId: 'settings-intelligence' })
  })

  afterEach(() => {
    delete process.env.TUFF_ENABLE_LOCAL_AI_CLI
  })

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM, configurable: true })
    rmSync(WORKSPACE_ROOT, { recursive: true, force: true })
  })

  it('opens the intelligence destination and arms the panel return deadline', async () => {
    await createModule()

    await expect(
      handlerFor(LocalAiCliEvents.status.openSettings)(undefined, HOST_CONTEXT)
    ).resolves.toBe(true)
    expect(mocks.open).toHaveBeenCalledExactlyOnceWith('settings-intelligence')

    await expect(
      handlerFor(LocalAiCliEvents.status.returnToPanel)(undefined, HOST_CONTEXT)
    ).resolves.toBe(true)
    expect(mocks.restoreLocalAi).toHaveBeenCalledTimes(1)
  })

  it('reports false and leaves the return path disarmed when the destination is unavailable', async () => {
    mocks.open.mockReturnValue({
      status: 'unavailable',
      destinationId: 'settings-intelligence',
      reason: 'window-unavailable'
    })
    await createModule()

    await expect(
      handlerFor(LocalAiCliEvents.status.openSettings)(undefined, HOST_CONTEXT)
    ).resolves.toBe(false)

    await expect(
      handlerFor(LocalAiCliEvents.status.returnToPanel)(undefined, HOST_CONTEXT)
    ).resolves.toBe(false)
    expect(mocks.restoreLocalAi).not.toHaveBeenCalled()
  })
})
