import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  coreBoxTrigger: vi.fn(),
  windowCurrent: {
    window: {
      isDestroyed: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      webContents: { id: 42 }
    }
  },
  getAttachedPlugin: vi.fn(() => ({ name: 'attached-plugin', _uniqueChannelKey: 'k1' })),
  shouldForwardClipboardChange: vi.fn(() => true),
  resolveAppSemanticAliases: vi.fn(() => ['wechat', 'wx']),
  resolvePreviousAppContext: vi.fn(async () => ({ prevApp: 'com.apple.Terminal' })),
  resolveExecuteEventId: vi.fn((id?: string | null) => id ?? 'minted-id'),
  recordAcceptedExecute: vi.fn(async () => undefined),
  ocrSetTransportChannel: vi.fn(),
  ocrStart: vi.fn(async () => undefined),
  ocrRegisterClipboardMetaListener: vi.fn(),
  ocrEnqueueFromClipboard: vi.fn(async () => undefined),
  ocrGetDashboardSnapshot: vi.fn(async () => ({ jobs: [{ id: 9 }] })),
  getPluginByName: vi.fn(() => ({ sdkapi: 260713 })),
  resolvePluginNameByWebContents: vi.fn(() => 'view-plugin'),
  fileGetIndexingStatus: vi.fn(() => ({ isInitializing: false })),
  fileGetIndexStats: vi.fn(async () => ({ totalFiles: 12 })),
  fileOnSearch: vi.fn(async (query) => ({ items: [], query, duration: 1, sources: [] })),
  fileRebuildIndex: vi.fn(async () => ({ success: true })),
  fileAddWatchPath: vi.fn(async () => ({ success: true, status: 'added', path: '/tmp' })),
  fileRegisterProgressStream: vi.fn(),
  fileGetIndexingProgress: vi.fn(async () => ({ summary: { ok: 1 }, entries: [] })),
  fileGetWatchedPaths: vi.fn(() => ['/tmp/watch']),
  fileGetWorkerStatusSnapshot: vi.fn(async () => ({
    summary: { total: 1, busy: 0, idle: 1, offline: 0 },
    workers: []
  })),
  everythingGetStatusSnapshot: vi.fn(() => ({
    enabled: true,
    available: true,
    backend: 'sdk-napi',
    health: 'healthy',
    healthReason: null,
    error: null,
    errorCode: null
  })),
  everythingIsSearchReady: vi.fn(() => true),
  everythingOnSearch: vi.fn(async (query) => ({ items: [], query, duration: 1, sources: [] })),
  getVideoThumbnailSupport: vi.fn(() => ({ available: true, ffmpegPath: '/usr/bin/ffmpeg' })),
  thumbnailWorkerCtor: vi.fn(),
  thumbnailGenerate: vi.fn(async () => ({
    status: 'generated',
    kind: 'image',
    path: '/tmp/thumb.png',
    mimeType: 'image/png',
    sizeBytes: 10,
    durationMs: 2
  })),
  resolveScanProgressSchemaShape: vi.fn(async () => ({ sourceScoped: true })),
  flowRegisterTarget: vi.fn(() => true),
  flowUnregisterTarget: vi.fn(() => true),
  flowRegisterDeliveryHandler: vi.fn(() => vi.fn()),
  flowAcknowledge: vi.fn(() => true),
  findCommandInSearchRoots: vi.fn(async () => '/opt/bin/zsh'),
  withExecutableDirOnPath: vi.fn((env: Record<string, string | undefined>, executable: string) => ({
    ...env,
    PATH: `${executable}:${env.PATH ?? ''}`
  }))
}))

vi.mock('../../modules/ai/pi-agent-runtime-protocol', () => ({
  PI_RUNTIME_SERVICE_NAME: 'Tuff Pi Agent Runtime'
}))

vi.mock('../../modules/ai/providers/cli/cli-executable', () => ({
  findCommandInSearchRoots: mocks.findCommandInSearchRoots,
  withExecutableDirOnPath: mocks.withExecutableDirOnPath
}))

vi.mock('../../modules/box-tool/addon/apps/app-semantic-catalog', () => ({
  resolveAppSemanticAliases: mocks.resolveAppSemanticAliases
}))

vi.mock('../../modules/box-tool/addon/files/everything-provider', () => ({
  everythingProvider: {
    getStatusSnapshot: mocks.everythingGetStatusSnapshot,
    isSearchReady: mocks.everythingIsSearchReady,
    onSearch: mocks.everythingOnSearch
  }
}))

vi.mock('../../modules/box-tool/addon/files/file-provider', () => ({
  fileProvider: {
    getIndexingStatus: mocks.fileGetIndexingStatus,
    getIndexStats: mocks.fileGetIndexStats,
    onSearch: mocks.fileOnSearch,
    rebuildIndex: mocks.fileRebuildIndex,
    addWatchPath: mocks.fileAddWatchPath,
    registerProgressStream: mocks.fileRegisterProgressStream,
    getIndexingProgress: mocks.fileGetIndexingProgress,
    getWatchedPaths: mocks.fileGetWatchedPaths,
    getWorkerStatusSnapshot: mocks.fileGetWorkerStatusSnapshot
  }
}))

vi.mock('../../modules/box-tool/addon/files/thumbnail-service', () => ({
  getVideoThumbnailSupport: mocks.getVideoThumbnailSupport
}))

vi.mock('../../modules/box-tool/addon/files/workers/thumbnail-worker-client', () => ({
  ThumbnailWorkerClient: class {
    constructor() {
      mocks.thumbnailWorkerCtor()
    }
    generate = mocks.thumbnailGenerate
  }
}))

vi.mock('../../modules/box-tool/core-box/manager', () => ({
  coreBoxManager: {
    trigger: mocks.coreBoxTrigger
  }
}))

vi.mock('../../modules/box-tool/core-box/window', () => ({
  windowManager: {
    get current() {
      return mocks.windowCurrent
    },
    getAttachedPlugin: mocks.getAttachedPlugin,
    shouldForwardClipboardChange: mocks.shouldForwardClipboardChange
  },
  getCoreBoxWindow: () => mocks.windowCurrent
}))

vi.mock('../../modules/box-tool/search-engine/app-launch-recorder', () => ({
  resolvePreviousAppContext: mocks.resolvePreviousAppContext
}))

vi.mock('../../modules/box-tool/search-engine/execute-recorder', () => ({
  recordAcceptedExecute: mocks.recordAcceptedExecute,
  resolveExecuteEventId: mocks.resolveExecuteEventId
}))

vi.mock('../../modules/box-tool/search-engine/scan-progress-schema', () => ({
  resolveScanProgressSchemaShape: mocks.resolveScanProgressSchemaShape
}))

vi.mock('../../modules/flow-bus/flow-bus', () => ({
  flowBus: {
    registerDeliveryHandler: mocks.flowRegisterDeliveryHandler,
    acknowledge: mocks.flowAcknowledge
  }
}))

vi.mock('../../modules/flow-bus/target-registry', () => ({
  flowTargetRegistry: {
    registerTarget: mocks.flowRegisterTarget,
    unregisterTarget: mocks.flowUnregisterTarget
  }
}))

vi.mock('../../modules/ocr/ocr-process-client', () => ({
  OCR_PROCESS_SERVICE_NAME: 'Tuff OCR Runtime'
}))

vi.mock('../../modules/ocr/ocr-service', () => ({
  ocrService: {
    setTransportChannel: mocks.ocrSetTransportChannel,
    start: mocks.ocrStart,
    registerClipboardMetaListener: mocks.ocrRegisterClipboardMetaListener,
    enqueueFromClipboard: mocks.ocrEnqueueFromClipboard,
    getDashboardSnapshot: mocks.ocrGetDashboardSnapshot
  }
}))

vi.mock('../../modules/plugin/host/plugin-runtime-electron-process', () => ({
  PLUGIN_RUNTIME_SERVICE_NAME: 'tuff-plugin-host'
}))

vi.mock('../../modules/plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: mocks.getPluginByName
    }
  }
}))

vi.mock('../../modules/plugin/runtime/plugin-view-registry', () => ({
  resolvePluginNameByWebContents: mocks.resolvePluginNameByWebContents
}))

import { getClipboardPorts } from '../../modules/clipboard/clipboard-ports'
import { getNativeCapabilitiesPorts } from '../../modules/native-capabilities/native-capabilities-ports'
import { getPlatformPorts } from '../../modules/platform/platform-ports'
import { getQuickOpsFlowBusPort } from '../../modules/quick-ops/quick-ops-ports'
import { getSystemPorts } from '../../modules/system/system-ports'
import { getTerminalPorts } from '../../modules/terminal/terminal-ports'
import { registerDp3Ports, resetDp3PortsForTests } from './register-dp3-ports'

describe('registerDp3Ports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDp3PortsForTests()
  })

  afterEach(() => {
    resetDp3PortsForTests()
  })

  it('wires all DP3 ports idempotently and restores defaults on reset', async () => {
    expect(getQuickOpsFlowBusPort()).toBeNull()
    expect(getNativeCapabilitiesPorts().fileIndex).toBeNull()

    registerDp3Ports()
    // Calling a second time is an idempotent no-op.
    registerDp3Ports()

    // Thumbnail worker is constructed lazily only on generate().
    expect(mocks.thumbnailWorkerCtor).not.toHaveBeenCalled()

    // Clipboard ports
    const clipboardPorts = getClipboardPorts()
    clipboardPorts.coreBox.hideCoreBox()
    expect(mocks.coreBoxTrigger).toHaveBeenCalledWith(false)
    expect(clipboardPorts.coreBox.isCoreBoxWindowVisible()).toBe(true)
    expect(clipboardPorts.coreBox.getAttachedPlugin()).toEqual({
      name: 'attached-plugin',
      _uniqueChannelKey: 'k1'
    })
    expect(clipboardPorts.coreBox.shouldForwardClipboardChange('text')).toBe(true)
    expect(clipboardPorts.search.resolveAppSemanticAliases({ name: 'WeChat' })).toEqual([
      'wechat',
      'wx'
    ])
    await expect(clipboardPorts.search.resolvePreviousAppContext()).resolves.toEqual({
      prevApp: 'com.apple.Terminal'
    })
    expect(clipboardPorts.search.resolveExecuteEventId('evt-1')).toBe('evt-1')
    expect(clipboardPorts.plugin.getPluginSdkApi('demo')).toBe(260713)
    await clipboardPorts.ocr.start()
    expect(mocks.ocrStart).toHaveBeenCalledOnce()

    // Native capabilities ports
    const nativePorts = getNativeCapabilitiesPorts()
    expect(nativePorts.fileIndex).not.toBeNull()
    expect(nativePorts.everything.isSearchReady()).toBe(true)
    expect(nativePorts.thumbnail.getVideoThumbnailSupport()).toEqual({
      available: true,
      ffmpegPath: '/usr/bin/ffmpeg'
    })
    await nativePorts.thumbnail.generate('/tmp/a.png', { extension: 'png', sizeBytes: 100 })
    expect(mocks.thumbnailWorkerCtor).toHaveBeenCalledTimes(1)
    expect(mocks.thumbnailGenerate).toHaveBeenCalledWith('/tmp/a.png', {
      extension: 'png',
      sizeBytes: 100
    })

    // Platform ports
    expect(getPlatformPorts().everything.getStatusSnapshot()).toMatchObject({
      enabled: true,
      available: true
    })

    // QuickOps flow-bus port
    const flowPort = getQuickOpsFlowBusPort()
    expect(flowPort).not.toBeNull()
    expect(flowPort?.acknowledge('sess-1', { ok: true })).toBe(true)
    expect(mocks.flowAcknowledge).toHaveBeenCalledWith('sess-1', { ok: true })

    // System ports
    const systemPorts = getSystemPorts()
    expect(
      systemPorts.performance.resolveUtilityProcessRole({ name: 'tuff-plugin-host' })
    ).toBe('plugin-runtime')
    expect(
      systemPorts.performance.resolveUtilityProcessRole({ name: 'Tuff Pi Agent Runtime' })
    ).toBe('pi-agent-runtime')
    expect(
      systemPorts.performance.resolveUtilityProcessRole({ name: 'Tuff OCR Runtime' })
    ).toBe('ocr-runtime')
    expect(systemPorts.performance.resolveUtilityProcessRole({ name: 'unknown' })).toBeNull()
    expect(systemPorts.performance.getCoreBoxWindow()).toBe(mocks.windowCurrent.window)
    expect(systemPorts.performance.resolvePluginNameByWebContents(99)).toBe('view-plugin')
    expect(systemPorts.dashboard.getWatchedPaths()).toEqual(['/tmp/watch'])
    await expect(systemPorts.dashboard.getOcrDashboardSnapshot(5)).resolves.toEqual({
      jobs: [{ id: 9 }]
    })

    // Terminal ports
    const terminalPorts = getTerminalPorts()
    await expect(terminalPorts.executable.findCommandInSearchRoots('zsh')).resolves.toBe(
      '/opt/bin/zsh'
    )
    expect(terminalPorts.executable.withExecutableDirOnPath({ PATH: '/usr/bin' }, '/opt/bin/zsh')).toEqual({
      PATH: '/opt/bin/zsh:/usr/bin'
    })

    // Reset restores safe defaults cleanly
    resetDp3PortsForTests()
    expect(getQuickOpsFlowBusPort()).toBeNull()
    expect(getNativeCapabilitiesPorts().fileIndex).toBeNull()
    expect(getClipboardPorts().coreBox.isCoreBoxWindowVisible()).toBe(false)
    expect(getSystemPorts().performance.resolveUtilityProcessRole({ name: 'tuff-plugin-host' })).toBeNull()
  })
})
