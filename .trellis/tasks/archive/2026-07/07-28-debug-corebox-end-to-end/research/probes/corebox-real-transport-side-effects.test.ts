import type { HandlerContext } from '../../../../../packages/utils/transport/main'
import { CoreBoxEvents } from '../../../../../packages/utils/transport/events'
import { getTuffTransportMain } from '../../../../../packages/utils/transport/main'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  trigger: vi.fn(),
  deactivateProvider: vi.fn(),
  enableClipboardMonitoring: vi.fn(),
  getBoxItemManager: vi.fn(() => ({ clear: vi.fn() })),
  currentWindow: {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    focus: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 640, height: 56 })),
  },
}))

const harness = vi.hoisted(() => {
  const keyManager = {
    requestKey: vi.fn(),
    revokeKey: vi.fn(),
    resolveKey: vi.fn(),
    isValidKey: vi.fn(() => false),
    resolveIdentity: vi.fn(),
    resolveCurrentIdentity: vi.fn(),
    resolveSenderIdentity: vi.fn(),
  }
  const channel = {
    keyManager,
    regChannel: vi.fn(() => vi.fn()),
    sendTo: vi.fn(),
    sendPlugin: vi.fn(),
    broadcast: vi.fn(),
    broadcastTo: vi.fn(),
    broadcastPlugin: vi.fn(),
  }
  return { channel, keyManager }
})

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.ipcHandle, on: vi.fn() },
  MessageChannelMain: class {},
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
    fromId: vi.fn(() => null),
  },
}))

vi.mock('../../../../../apps/core-app/src/main/core/runtime-accessor', () => ({
  getRegisteredMainRuntime: vi.fn(() => ({ app: { channel: harness.channel } })),
}))

vi.mock('../../../../../apps/core-app/src/main/utils/logger', () => ({
  createLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  })),
}))

vi.mock('../../../../../apps/core-app/src/main/modules/plugin/plugin-module', () => ({
  pluginModule: { pluginManager: { plugins: new Map() } },
}))

vi.mock('../../../../../apps/core-app/src/main/modules/storage', () => ({
  OnboardingGateError: class extends Error {},
}))

vi.mock('../../../../../apps/core-app/src/main/modules/box-tool/item-sdk', () => ({
  getBoxItemManager: mocks.getBoxItemManager,
}))

vi.mock('../../../../../apps/core-app/src/main/modules/box-tool/search-engine/search-core', () => ({
  default: {
    getActivationState: vi.fn(() => []),
    startSearch: vi.fn(),
    cancelSearchFromSender: vi.fn(),
    deactivateProvider: mocks.deactivateProvider,
    deactivateProviders: vi.fn(),
    getProvidersByIds: vi.fn(() => []),
    registerIndexCommitStream: vi.fn(),
  },
}))

vi.mock('../../../../../apps/core-app/src/main/modules/box-tool/search-engine/search-logger', () => ({
  searchLogger: { isEnabled: vi.fn(() => false), logSearchPhase: vi.fn() },
}))

vi.mock('../../../../../apps/core-app/src/main/modules/box-tool/core-box/input-transport', () => ({
  coreBoxInputTransport: { register: vi.fn() },
}))

vi.mock('../../../../../apps/core-app/src/main/modules/box-tool/core-box/key-transport', () => ({
  coreBoxKeyTransport: { register: vi.fn() },
}))

vi.mock('../../../../../apps/core-app/src/main/modules/box-tool/core-box/image-translate', () => ({
  translateCoreBoxImageItem: vi.fn(),
}))

vi.mock('../../../../../apps/core-app/src/main/modules/box-tool/core-box/manager', () => ({
  coreBoxManager: {
    trigger: mocks.trigger,
    shrink: vi.fn(),
    expand: vi.fn(),
    search: vi.fn(),
    routeAdmissionFailure: vi.fn(),
    markExpanded: vi.fn(),
    exitUIMode: vi.fn(),
    get isUIMode() {
      return false
    },
    get isCollapsed() {
      return false
    },
  },
}))

vi.mock('../../../../../apps/core-app/src/main/modules/box-tool/core-box/meta-overlay', () => ({
  metaOverlayManager: {
    getPluginActions: vi.fn(() => []),
    show: vi.fn(),
    hide: vi.fn(),
    getVisible: vi.fn(() => false),
    executeAction: vi.fn(),
    registerPluginAction: vi.fn(),
    unregisterPluginAction: vi.fn(),
    unregisterPluginActions: vi.fn(),
  },
}))

vi.mock('../../../../../apps/core-app/src/main/modules/box-tool/core-box/window', () => ({
  COREBOX_MIN_HEIGHT: 56,
  getCoreBoxWindow: vi.fn(() => ({
    window: {
      ...mocks.currentWindow,
      webContents: { id: 701, isDestroyed: vi.fn(() => false) },
    },
  })),
  windowManager: {
    current: { window: mocks.currentWindow },
    enableClipboardMonitoring: mocks.enableClipboardMonitoring,
    enableInputMonitoring: vi.fn(),
    setPinned: vi.fn(),
    isPinned: vi.fn(() => false),
    setHeight: vi.fn(),
    setPositionOffset: vi.fn(),
  },
}))

import { ipcManager } from '../../../../../apps/core-app/src/main/modules/box-tool/core-box/ipc'

describe('CoreBox real transport side-effect cardinality diagnostics', () => {
  afterEach(() => {
    ipcManager.unregister()
    vi.clearAllMocks()
  })

  it('executes duplicated canonical handlers twice for one local request', async () => {
    ipcManager.register()
    const transport = getTuffTransportMain(harness.channel, harness.keyManager)
    const sender = { id: 701 } as HandlerContext['sender']

    await transport.invoke(CoreBoxEvents.ui.show, undefined, { sender })
    expect(mocks.trigger).toHaveBeenCalledTimes(2)
    expect(mocks.trigger).toHaveBeenNthCalledWith(1, true)
    expect(mocks.trigger).toHaveBeenNthCalledWith(2, true)

    await transport.invoke(CoreBoxEvents.provider.deactivate, { id: 'file-provider' }, { sender })
    expect(mocks.deactivateProvider).toHaveBeenCalledTimes(2)

    await transport.invoke(CoreBoxEvents.clipboard.allow, { types: 7 }, { sender })
    expect(mocks.enableClipboardMonitoring).toHaveBeenCalledTimes(2)
  })
})
