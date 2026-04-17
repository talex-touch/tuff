import type {
  MaybePromise,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey,
  TuffQuery
} from '@talex-touch/utils'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { IFeatureOmniTransfer, IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type {
  OmniPanelContextSource,
  OmniPanelContextPayload,
  OmniPanelFeatureExecuteErrorCode,
  OmniPanelFeatureIconPayload,
  OmniPanelFeatureInputType,
  OmniPanelFeatureItemPayload,
  OmniPanelFeatureListResponse,
  OmniPanelFeatureRefreshPayload,
  OmniPanelFeatureSource,
  OmniPanelFeatureUnavailableReason,
  OmniPanelFeatureExecuteRequest,
  OmniPanelFeatureExecuteResponse,
  OmniPanelFeatureReorderRequest,
  OmniPanelShowRequest,
  OmniPanelTransferTarget
} from '../../../shared/events/omni-panel'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { promisify } from 'node:util'
import { StorageList, TuffInputType } from '@talex-touch/utils'
import { ShortcutTriggerKind } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { OMNI_TRANSFER_DECLARATIVE_MIN_VERSION } from '@talex-touch/utils/plugin'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { app, clipboard, screen, shell } from 'electron'
import { OmniPanelWindowOption } from '../../config/default'
import { TalexEvents as MainEvents, touchEventBus } from '../../core/eventbus/touch-event'
import { ensureXdotoolAvailable } from '../system/linux-desktop-tools'
import { TouchWindow } from '../../core/touch-window'
import { getCoreBoxWindow } from '../box-tool/core-box/window'
import { getCoreBoxRendererPath } from '../../utils/renderer-url'
import { BaseModule } from '../abstract-base-module'
import { shortcutModule } from '../global-shortcon'
import { pluginModule } from '../plugin/plugin-module'
import { getMainConfig, saveMainConfig } from '../storage'
import {
  omniPanelContextEvent,
  omniPanelFeatureExecuteEvent,
  omniPanelFeatureListEvent,
  omniPanelFeatureRefreshEvent,
  omniPanelFeatureReorderEvent,
  omniPanelHideEvent,
  omniPanelShowEvent
} from '../../../shared/events/omni-panel'
import { createLogger } from '../../utils/logger'

const omniPanelLog = createLogger('OmniPanel')
const execFileAsync = promisify(execFile)
const requireFromCurrentModule = createRequire(import.meta.url)
const LONG_PRESS_MS = 600
const LONG_PRESS_MOVE_THRESHOLD = 6
const SHORTCUT_HOLD_MS = 500
const SHORTCUT_RELEASE_GRACE_MS = 220
const OMNI_PANEL_SHORTCUT_ID = 'core.omniPanel.toggle'
const OMNI_PANEL_MOUSE_TRIGGER_ID = 'core.omniPanel.mouseLongPress'
const OMNI_PANEL_SHORTCUT_OWNER = 'module.omni-panel'
const OMNI_PANEL_SETTING_KEY = StorageList.APP_SETTING

const OMNI_INPUT_TYPES = ['text', 'image', 'files', 'html'] as const
const OMNI_SOURCE_VALUES: OmniPanelContextSource[] = [
  'shortcut',
  'mouse-long-press',
  'manual',
  'command',
  'unknown'
]
const COPY_COMMAND_TIMEOUT_MS = 900
const COPY_RESULT_POLL_DELAY_MS = 120

const EXECUTE_ERROR_MESSAGES: Record<OmniPanelFeatureExecuteErrorCode, string> = {
  INVALID_PAYLOAD: 'Invalid execute payload',
  INVALID_FEATURE: 'Invalid feature id',
  FEATURE_NOT_FOUND: 'Feature not found',
  FEATURE_UNAVAILABLE: 'Feature is unavailable',
  SELECTION_REQUIRED: 'Selected text is required',
  COREBOX_UNAVAILABLE: 'CoreBox window is unavailable',
  COREBOX_TRANSFER_FAILED: 'Failed to transfer context to CoreBox',
  SYSTEM_TARGET_NOT_IMPLEMENTED: 'System transfer target is unavailable for this feature',
  PLUGIN_NOT_FOUND: 'Plugin not found',
  FEATURE_EXECUTION_FAILED: 'Failed to execute feature',
  UNKNOWN_BUILTIN: 'Unknown builtin feature',
  INTERNAL_ERROR: 'Internal error'
}

const BUILTIN_FEATURE_DEFINITIONS = [
  {
    id: 'builtin.translate',
    title: '快速翻译',
    subtitle: '将选中文本发送到翻译页面',
    icon: { type: 'class', value: 'i-ri-translate-2' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.search',
    title: '网页搜索',
    subtitle: '用浏览器搜索选中文本',
    icon: { type: 'class', value: 'i-ri-search-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  },
  {
    id: 'builtin.corebox-search',
    title: '在 CoreBox 中搜索',
    subtitle: '回到启动器继续执行动作',
    icon: { type: 'class', value: 'i-ri-command-line' } as OmniPanelFeatureIconPayload,
    target: 'corebox' as const
  },
  {
    id: 'builtin.copy',
    title: '复制文本',
    subtitle: '把当前文本写回剪贴板',
    icon: { type: 'class', value: 'i-ri-file-copy-line' } as OmniPanelFeatureIconPayload,
    target: 'system' as const
  }
] as const

const BUILTIN_FEATURE_MAP: Map<string, (typeof BUILTIN_FEATURE_DEFINITIONS)[number]> = new Map(
  BUILTIN_FEATURE_DEFINITIONS.map((item) => [item.id, item] as const)
)

interface InputHookEvent {
  button?: number
  x?: number
  y?: number
  keycode?: number
}

interface InputHookKeyMap {
  P: number
  Shift: number
  ShiftRight: number
  Ctrl: number
  CtrlRight: number
  Meta: number
  MetaRight: number
}

interface InputHookApi {
  on: (event: string, callback: (event: InputHookEvent) => void) => void
  off?: (event: string, callback: (event: InputHookEvent) => void) => void
  start: () => void
  stop: () => void
  removeAllListeners?: (event?: string) => void
}

interface OmniPanelFeatureRegistryItem {
  id: string
  source: OmniPanelFeatureSource
  target: OmniPanelTransferTarget
  title: string
  subtitle: string
  icon: OmniPanelFeatureIconPayload | null
  enabled: boolean
  order: number
  pluginName?: string
  featureId?: string
  acceptedInputTypes?: OmniPanelFeatureInputType[]
  sdkapi?: number
  autoMounted?: boolean
  declarationMode?: 'declared' | 'fallback'
  payloadTemplate?: Record<string, unknown>
  updatedAt: number
  createdAt: number
}

interface OmniPanelSettings {
  enableShortcut: boolean
  enableMouseLongPress: boolean
  autoMountFirstFeatureOnPluginInstall: boolean
  featureHubItems: OmniPanelFeatureRegistryItem[]
}

interface OmniPanelSettingRecord {
  enableShortcut?: boolean
  enableMouseLongPress?: boolean
  autoMountFirstFeatureOnPluginInstall?: boolean
  featureHub?: {
    items?: unknown[]
  }
}

interface ClipboardSnapshot {
  items: Array<{
    format: string
    data: Buffer
  }>
}

interface ExecutePayloadValidationResult {
  ok: boolean
  id?: string
  source?: OmniPanelContextSource
  contextText?: string
  response?: OmniPanelFeatureExecuteResponse
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeInputTypes(value: unknown): OmniPanelFeatureInputType[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.filter(
    (item): item is OmniPanelFeatureInputType =>
      typeof item === 'string' && OMNI_INPUT_TYPES.includes(item as OmniPanelFeatureInputType)
  )
  return result.length > 0 ? result : undefined
}

function normalizeTarget(
  value: unknown,
  fallback: OmniPanelTransferTarget
): OmniPanelTransferTarget {
  if (value === 'corebox' || value === 'plugin' || value === 'system') return value
  return fallback
}

function normalizeIcon(value: unknown): OmniPanelFeatureIconPayload | null {
  if (!isRecord(value)) return null
  if (typeof value.type !== 'string' || typeof value.value !== 'string') return null
  const iconType = value.type.trim()
  const iconValue = value.value.trim()
  if (!iconType || !iconValue) return null
  return {
    type: iconType,
    value: iconValue
  }
}

function normalizeContextSource(value: unknown): {
  source: OmniPanelContextSource
  sourceRaw?: string
} {
  if (typeof value !== 'string') {
    return { source: 'manual' }
  }

  const raw = value.trim()
  if (!raw) {
    return { source: 'manual' }
  }

  if (OMNI_SOURCE_VALUES.includes(raw as OmniPanelContextSource)) {
    return { source: raw as OmniPanelContextSource }
  }

  return {
    source: 'unknown',
    sourceRaw: raw
  }
}

function makeUnavailableReason(
  reason: OmniPanelFeatureUnavailableReason
): OmniPanelFeatureUnavailableReason {
  return {
    code: reason.code,
    message: reason.message
  }
}

function toFeatureIcon(feature: IPluginFeature): OmniPanelFeatureIconPayload | null {
  if (!feature.icon || typeof feature.icon !== 'object') return null
  const iconType = (feature.icon as { type?: unknown }).type
  const iconValue = (feature.icon as { value?: unknown }).value
  if (typeof iconType !== 'string' || typeof iconValue !== 'string') return null
  if (!iconType.trim() || !iconValue.trim()) return null
  return {
    type: iconType,
    value: iconValue
  }
}

export class OmniPanelModule extends BaseModule {
  static key: symbol = Symbol.for('OmniPanel')
  name: ModuleKey = OmniPanelModule.key

  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private eventDisposers: Array<() => void> = []
  private panelWindow: TouchWindow | null = null
  private isVisible = false
  private inputHook: InputHookApi | null = null
  private inputHookKeys: InputHookKeyMap | null = null
  private mouseLongPressEnabled = false
  private shortcutHoldEnabled = false
  private mouseDownPosition: { x: number; y: number } | null = null
  private longPressTimer: NodeJS.Timeout | null = null
  private shortcutHoldTimer: NodeJS.Timeout | null = null
  private shortcutArmExpiryTimer: NodeJS.Timeout | null = null
  private pressedShortcutKeys = new Set<number>()
  private shortcutComboActive = false
  private shortcutComboStartedAt: number | null = null
  private shortcutComboReleasedAt = 0
  private shortcutLastHoldDurationMs = 0
  private shortcutTriggerArmed = false
  private mouseHandlers: Array<{
    event: string
    callback: (event: InputHookEvent) => void
  }> = []
  private featureRegistry: OmniPanelFeatureRegistryItem[] = []
  private registryUpdatedAt = Date.now()
  private lastContext: OmniPanelContextPayload = {
    text: '',
    hasSelection: false,
    source: 'manual',
    capturedAt: Date.now()
  }
  private handlingInstallEventPlugins = new Set<string>()
  private destroying = false

  constructor() {
    super(OmniPanelModule.key, { create: false })
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    this.destroying = false
    const channel =
      ctx.runtime?.channel ?? (ctx.app as { channel?: unknown } | null | undefined)?.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)

    const settings = this.getSettingsSnapshot()
    const normalized = this.initializeFeatureRegistry(settings.featureHubItems)
    this.featureRegistry = normalized.items
    this.registryUpdatedAt = Date.now()

    if (normalized.changed) {
      this.persistFeatureRegistry()
    }

    this.registerTransportHandlers()
    this.registerInstallCompletedListener()
    this.registerPluginChangeRefreshListener()
    this.registerBeforeQuitListener()
    this.registerShortcut(settings.enableShortcut)
    this.registerMouseLongPressTrigger(settings.enableMouseLongPress)
    this.notifyFeatureRefresh('init')

    omniPanelLog.info('Module initialized', {
      meta: {
        featureCount: this.featureRegistry.length
      }
    })
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): MaybePromise<void> {
    this.performShutdownCleanup()

    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []

    for (const dispose of this.eventDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.eventDisposers = []

    this.transport = null

    if (this.panelWindow && !this.panelWindow.window.isDestroyed()) {
      this.panelWindow.window.close()
    }
    this.panelWindow = null
    this.isVisible = false
  }

  private getSettingsSnapshot(setting?: AppSetting): OmniPanelSettings {
    const appSetting = setting ?? ((getMainConfig(OMNI_PANEL_SETTING_KEY) as AppSetting) || {})
    const omniPanel = (
      isRecord(appSetting.omniPanel) ? appSetting.omniPanel : {}
    ) as OmniPanelSettingRecord
    const featureHubItems = Array.isArray(omniPanel.featureHub?.items)
      ? omniPanel.featureHub.items
          .map((item, index) => this.normalizeRegistryItem(item, index))
          .filter((item): item is OmniPanelFeatureRegistryItem => item !== null)
      : []

    return {
      enableShortcut:
        typeof omniPanel.enableShortcut === 'boolean' ? omniPanel.enableShortcut : true,
      enableMouseLongPress:
        typeof omniPanel.enableMouseLongPress === 'boolean' ? omniPanel.enableMouseLongPress : true,
      autoMountFirstFeatureOnPluginInstall:
        typeof omniPanel.autoMountFirstFeatureOnPluginInstall === 'boolean'
          ? omniPanel.autoMountFirstFeatureOnPluginInstall
          : false,
      featureHubItems
    }
  }

  private normalizeRegistryItem(
    value: unknown,
    fallbackOrder: number
  ): OmniPanelFeatureRegistryItem | null {
    if (!isRecord(value)) return null
    if (typeof value.id !== 'string' || !value.id.trim()) return null
    const source: OmniPanelFeatureSource = value.source === 'plugin' ? 'plugin' : 'builtin'
    const fallbackTarget: OmniPanelTransferTarget = source === 'plugin' ? 'plugin' : 'system'

    const title =
      typeof value.title === 'string' && value.title.trim() ? value.title.trim() : value.id
    const subtitle = typeof value.subtitle === 'string' ? value.subtitle : ''
    const enabled = typeof value.enabled === 'boolean' ? value.enabled : true
    const order =
      typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : fallbackOrder
    const createdAt =
      typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
        ? value.createdAt
        : Date.now()
    const updatedAt =
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : createdAt
    const target = normalizeTarget(value.target, fallbackTarget)
    const icon = normalizeIcon(value.icon)
    const pluginName =
      typeof value.pluginName === 'string' && value.pluginName.trim()
        ? value.pluginName.trim()
        : undefined
    const featureId =
      typeof value.featureId === 'string' && value.featureId.trim()
        ? value.featureId.trim()
        : undefined

    if (source === 'plugin' && (!pluginName || !featureId)) {
      return null
    }

    const item: OmniPanelFeatureRegistryItem = {
      id: value.id.trim(),
      source,
      target,
      title,
      subtitle,
      icon,
      enabled,
      order,
      pluginName,
      featureId,
      acceptedInputTypes: normalizeInputTypes(value.acceptedInputTypes),
      sdkapi: typeof value.sdkapi === 'number' ? value.sdkapi : undefined,
      autoMounted: value.autoMounted === true,
      declarationMode:
        value.declarationMode === 'declared' || value.declarationMode === 'fallback'
          ? value.declarationMode
          : undefined,
      payloadTemplate: isRecord(value.payloadTemplate) ? value.payloadTemplate : undefined,
      createdAt,
      updatedAt
    }

    return item
  }

  private createBuiltinRegistryItem(
    definition: (typeof BUILTIN_FEATURE_DEFINITIONS)[number],
    order: number
  ): OmniPanelFeatureRegistryItem {
    const now = Date.now()
    return {
      id: definition.id,
      source: 'builtin',
      target: definition.target,
      title: definition.title,
      subtitle: definition.subtitle,
      icon: definition.icon,
      enabled: true,
      order,
      createdAt: now,
      updatedAt: now
    }
  }

  private initializeFeatureRegistry(items: OmniPanelFeatureRegistryItem[]): {
    items: OmniPanelFeatureRegistryItem[]
    changed: boolean
  } {
    const byId = new Map<string, OmniPanelFeatureRegistryItem>()
    for (const item of items) {
      if (!item.id) continue
      byId.set(item.id, { ...item })
    }

    let changed = false
    for (let i = 0; i < BUILTIN_FEATURE_DEFINITIONS.length; i++) {
      const builtin = BUILTIN_FEATURE_DEFINITIONS[i]
      const existing = byId.get(builtin.id)
      if (!existing) {
        byId.set(builtin.id, this.createBuiltinRegistryItem(builtin, i))
        changed = true
        continue
      }
      const target = normalizeTarget(existing.target, builtin.target)
      const next: OmniPanelFeatureRegistryItem = {
        ...existing,
        source: 'builtin',
        target,
        title: existing.title || builtin.title,
        subtitle: existing.subtitle || builtin.subtitle,
        icon: existing.icon ?? builtin.icon
      }
      if (JSON.stringify(next) !== JSON.stringify(existing)) {
        byId.set(builtin.id, next)
        changed = true
      }
    }

    const normalized = Array.from(byId.values())
      .sort((a, b) => a.order - b.order)
      .map((item, index) => {
        if (item.order === index) return item
        changed = true
        return { ...item, order: index }
      })

    return { items: normalized, changed }
  }

  private persistFeatureRegistry(): void {
    try {
      const currentAppSetting = getMainConfig(OMNI_PANEL_SETTING_KEY) as AppSetting
      const omniPanelRaw = (
        isRecord(currentAppSetting.omniPanel) ? currentAppSetting.omniPanel : {}
      ) as OmniPanelSettingRecord

      const nextOmniPanel: AppSetting['omniPanel'] = {
        enableShortcut:
          typeof omniPanelRaw.enableShortcut === 'boolean' ? omniPanelRaw.enableShortcut : true,
        enableMouseLongPress:
          typeof omniPanelRaw.enableMouseLongPress === 'boolean'
            ? omniPanelRaw.enableMouseLongPress
            : true,
        autoMountFirstFeatureOnPluginInstall:
          typeof omniPanelRaw.autoMountFirstFeatureOnPluginInstall === 'boolean'
            ? omniPanelRaw.autoMountFirstFeatureOnPluginInstall
            : false,
        featureHub: {
          items: this.featureRegistry.map((item) => ({
            ...item
          }))
        }
      }
      const nextAppSetting: AppSetting = {
        ...currentAppSetting,
        omniPanel: nextOmniPanel
      }
      saveMainConfig(OMNI_PANEL_SETTING_KEY, nextAppSetting)
    } catch (error) {
      omniPanelLog.warn('Failed to persist OmniPanel feature registry', { error })
    }
  }

  private registerShortcut(enabled: boolean): void {
    this.shortcutHoldEnabled = enabled
    this.syncInputHookState()
    shortcutModule.registerMainShortcut(
      OMNI_PANEL_SHORTCUT_ID,
      'CommandOrControl+Shift+P',
      () => {
        this.handleShortcutPressed()
      },
      { enabled, owner: OMNI_PANEL_SHORTCUT_OWNER }
    )
  }

  private registerMouseLongPressTrigger(enabled: boolean): void {
    this.mouseLongPressEnabled = enabled
    this.syncInputHookState()
    shortcutModule.registerMainTrigger(
      OMNI_PANEL_MOUSE_TRIGGER_ID,
      ShortcutTriggerKind.MOUSE_RIGHT_LONG_PRESS,
      {
        enabled,
        onStateChange: (active) => {
          this.applyMouseLongPressSetting(active)
        },
        owner: OMNI_PANEL_SHORTCUT_OWNER
      }
    )
  }

  private applyMouseLongPressSetting(enabled: boolean): void {
    this.mouseLongPressEnabled = enabled
    if (!enabled) {
      this.clearLongPressTimer()
      this.mouseDownPosition = null
    }
    this.syncInputHookState()
  }

  private handleShortcutPressed(): void {
    if (this.shouldSkipInputHookSetup()) return
    if (!this.shortcutHoldEnabled) return

    if (!this.inputHookKeys) {
      void this.toggle({ captureSelection: true, source: 'shortcut' })
      return
    }

    const now = Date.now()
    if (this.shortcutComboActive) {
      this.shortcutTriggerArmed = true
      const elapsed =
        this.shortcutComboStartedAt !== null ? now - this.shortcutComboStartedAt : SHORTCUT_HOLD_MS
      if (elapsed >= SHORTCUT_HOLD_MS) {
        this.triggerArmedShortcut()
      }
      return
    }

    const releasedRecently =
      this.shortcutComboReleasedAt > 0 &&
      now - this.shortcutComboReleasedAt <= SHORTCUT_RELEASE_GRACE_MS
    if (releasedRecently && this.shortcutLastHoldDurationMs >= SHORTCUT_HOLD_MS) {
      this.shortcutTriggerArmed = true
      this.triggerArmedShortcut()
      return
    }

    this.shortcutTriggerArmed = true
    this.clearShortcutArmExpiryTimer()
    this.shortcutArmExpiryTimer = setTimeout(() => {
      this.shortcutTriggerArmed = false
      this.clearShortcutArmExpiryTimer()
    }, SHORTCUT_RELEASE_GRACE_MS)
  }

  private triggerArmedShortcut(): void {
    if (!this.shortcutTriggerArmed) return
    this.shortcutTriggerArmed = false
    this.clearShortcutArmExpiryTimer()
    void this.toggle({ captureSelection: true, source: 'shortcut' })
  }

  private syncInputHookState(): void {
    if (this.shouldSkipInputHookSetup()) {
      this.cleanupInputHook()
      return
    }
    if (!this.mouseLongPressEnabled && !this.shortcutHoldEnabled) {
      this.clearLongPressTimer()
      this.clearShortcutHoldTimer()
      this.clearShortcutArmExpiryTimer()
      this.resetShortcutHoldState()
      this.cleanupInputHook()
      return
    }
    this.setupInputHook()
  }

  private registerInstallCompletedListener(): void {
    const handler = (event: unknown) => {
      const payload = isRecord(event) ? event : {}
      const pluginName =
        typeof payload.pluginName === 'string' && payload.pluginName.trim()
          ? payload.pluginName.trim()
          : ''
      if (!pluginName) return
      void this.autoMountFeatureForPlugin(pluginName)
    }
    touchEventBus.on(MainEvents.PLUGIN_INSTALL_COMPLETED, handler)
    this.eventDisposers.push(() => {
      touchEventBus.off(MainEvents.PLUGIN_INSTALL_COMPLETED, handler)
    })
  }

  private registerPluginChangeRefreshListener(): void {
    const handler = () => {
      this.notifyFeatureRefresh('plugin-change')
    }
    touchEventBus.on(MainEvents.PLUGIN_STORAGE_UPDATED, handler)
    this.eventDisposers.push(() => {
      touchEventBus.off(MainEvents.PLUGIN_STORAGE_UPDATED, handler)
    })
  }

  private registerBeforeQuitListener(): void {
    const handler = () => {
      this.performShutdownCleanup()
    }
    touchEventBus.on(MainEvents.BEFORE_APP_QUIT, handler)
    this.eventDisposers.push(() => {
      touchEventBus.off(MainEvents.BEFORE_APP_QUIT, handler)
    })
  }

  private registerTransportHandlers(): void {
    if (!this.transport) return

    this.transportDisposers.push(
      this.transport.on(omniPanelShowEvent, async (payload) => {
        await this.show(payload)
      }),
      this.transport.on(omniPanelHideEvent, async () => {
        this.hide()
      }),
      this.transport.on(omniPanelFeatureListEvent, async () => {
        return this.buildFeatureListResponse()
      }),
      this.transport.on(omniPanelFeatureReorderEvent, async (payload) => {
        this.reorderFeature(payload)
      }),
      this.transport.on(omniPanelFeatureExecuteEvent, async (payload) => {
        return await this.executeFeature(payload)
      })
    )
  }

  private async ensureWindow(): Promise<TouchWindow> {
    if (this.panelWindow && !this.panelWindow.window.isDestroyed()) {
      return this.panelWindow
    }

    const window = new TouchWindow({ ...OmniPanelWindowOption })
    window.window.setVisibleOnAllWorkspaces(true)
    window.window.setAlwaysOnTop(true, 'floating')
    window.window.on('closed', () => {
      this.panelWindow = null
      this.isVisible = false
    })
    window.window.on('hide', () => {
      this.isVisible = false
    })
    window.window.on('show', () => {
      this.isVisible = true
    })
    window.window.on('blur', () => {
      if (!this.panelWindow || this.panelWindow.window.isDestroyed()) return
      if (!this.panelWindow.window.isVisible()) return
      this.hide()
    })

    if (app.isPackaged) {
      await window.loadFile(getCoreBoxRendererPath())
    } else {
      const rendererUrl = process.env.ELECTRON_RENDERER_URL
      if (!rendererUrl) {
        throw new Error('ELECTRON_RENDERER_URL is not set')
      }
      await window.loadURL(rendererUrl)
    }

    window.window.hide()
    this.panelWindow = window
    return window
  }

  private async toggle(options?: OmniPanelShowRequest): Promise<void> {
    if (this.isVisible) {
      this.hide()
      return
    }
    await this.show(options)
  }

  private async show(options?: OmniPanelShowRequest): Promise<void> {
    const targetWindow = await this.ensureWindow()
    const normalizedSource = normalizeContextSource(options?.source)
    let text = ''

    if (options?.captureSelection !== false) {
      text = await this.captureSelectionText()
    }

    this.positionWindowNearCursor(targetWindow)
    targetWindow.window.showInactive()
    this.isVisible = true
    await this.pushContext(text, normalizedSource.source, normalizedSource.sourceRaw)
    this.notifyFeatureRefresh('show')
  }

  private hide(): void {
    if (!this.panelWindow || this.panelWindow.window.isDestroyed()) return
    this.panelWindow.window.hide()
    this.isVisible = false
  }

  private positionWindowNearCursor(targetWindow: TouchWindow): void {
    try {
      const cursor = screen.getCursorScreenPoint()
      const display = screen.getDisplayNearestPoint(cursor)
      const workArea = display.workArea
      const bounds = targetWindow.window.getBounds()
      const offsetX = 12
      const offsetY = 18

      let x = cursor.x + offsetX
      let y = cursor.y + offsetY

      if (x + bounds.width > workArea.x + workArea.width) {
        x = cursor.x - bounds.width - offsetX
      }
      if (y + bounds.height > workArea.y + workArea.height) {
        y = cursor.y - bounds.height - offsetY
      }

      x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - bounds.width))
      y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - bounds.height))

      targetWindow.window.setPosition(Math.round(x), Math.round(y), false)
    } catch (error) {
      omniPanelLog.debug('Failed to position OmniPanel near cursor', { error })
    }
  }

  private async pushContext(
    text: string,
    source: OmniPanelContextSource,
    sourceRaw?: string
  ): Promise<void> {
    if (!this.transport) return
    if (!this.panelWindow || this.panelWindow.window.isDestroyed()) return

    const payload: OmniPanelContextPayload = {
      text,
      hasSelection: text.trim().length > 0,
      source,
      sourceRaw,
      capturedAt: Date.now()
    }
    this.lastContext = payload

    await this.transport.sendTo(this.panelWindow.window.webContents, omniPanelContextEvent, payload)
    this.notifyFeatureRefresh('context-updated')
  }

  private buildFeatureListResponse(): OmniPanelFeatureListResponse {
    const features = this.featureRegistry
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => this.resolveFeatureItemPayload(item))

    return {
      features,
      updatedAt: this.registryUpdatedAt
    }
  }

  private resolveFeatureItemPayload(
    item: OmniPanelFeatureRegistryItem
  ): OmniPanelFeatureItemPayload {
    if (item.source !== 'plugin') {
      const builtin = BUILTIN_FEATURE_MAP.get(item.id)
      return {
        ...item,
        title: builtin?.title ?? item.title,
        subtitle: builtin?.subtitle ?? item.subtitle,
        icon: builtin?.icon ?? item.icon,
        unavailable: false,
        unavailableReason: undefined
      }
    }

    const plugin = this.getPluginInstance(item.pluginName)
    if (!plugin) {
      return {
        ...item,
        unavailable: true,
        unavailableReason: makeUnavailableReason({
          code: 'PLUGIN_NOT_FOUND',
          message: `Plugin "${item.pluginName || 'unknown'}" is not loaded`
        })
      }
    }

    const feature = item.featureId ? plugin.getFeature(item.featureId) : null
    if (!feature) {
      return {
        ...item,
        unavailable: true,
        unavailableReason: makeUnavailableReason({
          code: 'FEATURE_NOT_FOUND',
          message: `Feature "${item.featureId || 'unknown'}" is not available`
        })
      }
    }

    if (!this.isFeatureExecutable(plugin, feature)) {
      return {
        ...item,
        unavailable: true,
        unavailableReason: makeUnavailableReason({
          code: 'FEATURE_NOT_EXECUTABLE',
          message: `Feature "${item.featureId || feature.id}" is not executable`
        })
      }
    }

    const declared = this.resolveDeclaredTransfer(plugin, feature)
    const icon = toFeatureIcon(feature)

    return {
      ...item,
      target: declared?.target ? normalizeTarget(declared.target, item.target) : item.target,
      title: declared?.title?.trim() || feature.name || item.title,
      subtitle: declared?.subtitle?.trim() || feature.desc || item.subtitle,
      icon: icon ?? item.icon,
      acceptedInputTypes:
        normalizeInputTypes(feature.acceptedInputTypes) ?? item.acceptedInputTypes,
      sdkapi: plugin.sdkapi,
      declarationMode: declared ? 'declared' : item.declarationMode,
      unavailable: false,
      unavailableReason: undefined
    }
  }

  private reorderFeature(payload: OmniPanelFeatureReorderRequest): void {
    if (!payload || typeof payload.id !== 'string') return
    if (payload.direction !== 'up' && payload.direction !== 'down') return

    const sorted = this.featureRegistry.slice().sort((a, b) => a.order - b.order)
    const index = sorted.findIndex((item) => item.id === payload.id)
    if (index < 0) return
    const swapIndex = payload.direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= sorted.length) return

    const current = sorted[index]
    sorted[index] = sorted[swapIndex]
    sorted[swapIndex] = current

    const now = Date.now()
    this.featureRegistry = sorted.map((item, idx) => ({
      ...item,
      order: idx,
      updatedAt: item.id === payload.id ? now : item.updatedAt
    }))
    this.registryUpdatedAt = now
    this.persistFeatureRegistry()
    this.notifyFeatureRefresh('reorder')
  }

  private async executeFeature(
    payload: OmniPanelFeatureExecuteRequest
  ): Promise<OmniPanelFeatureExecuteResponse> {
    const validated = this.validateExecutePayload(payload)
    if (!validated.ok) {
      return validated.response || this.buildExecuteError('INVALID_PAYLOAD')
    }

    const item = this.featureRegistry.find((feature) => feature.id === validated.id)
    if (!item) {
      return this.buildExecuteError('FEATURE_NOT_FOUND')
    }

    const resolvedItem = this.resolveFeatureItemPayload(item)
    if (resolvedItem.unavailable) {
      return this.buildExecuteError(
        'FEATURE_UNAVAILABLE',
        resolvedItem.unavailableReason?.message || EXECUTE_ERROR_MESSAGES.FEATURE_UNAVAILABLE
      )
    }

    const contextText = validated.contextText ?? this.lastContext.text
    const source = validated.source ?? this.lastContext.source

    let result: OmniPanelFeatureExecuteResponse
    if (resolvedItem.source === 'builtin') {
      result = await this.executeBuiltinFeature(item.id, contextText, source)
    } else if (resolvedItem.target === 'corebox') {
      result = await this.executeCoreBoxTransfer(contextText)
    } else if (resolvedItem.target === 'system') {
      result = this.buildExecuteError('SYSTEM_TARGET_NOT_IMPLEMENTED')
    } else {
      result = await this.executePluginFeature(item, contextText, source)
    }

    if (result.success) {
      this.hide()
      this.notifyFeatureRefresh('execute')
    }
    return result
  }

  private validateExecutePayload(
    payload: OmniPanelFeatureExecuteRequest
  ): ExecutePayloadValidationResult {
    if (!isRecord(payload)) {
      return {
        ok: false,
        response: this.buildExecuteError('INVALID_PAYLOAD')
      }
    }

    const id = typeof payload.id === 'string' ? payload.id.trim() : ''
    if (!id) {
      return {
        ok: false,
        response: this.buildExecuteError('INVALID_FEATURE')
      }
    }

    if (payload.context !== undefined && !isRecord(payload.context)) {
      return {
        ok: false,
        response: this.buildExecuteError('INVALID_PAYLOAD', 'Invalid execute context payload')
      }
    }

    if (payload.context?.text !== undefined && typeof payload.context.text !== 'string') {
      return {
        ok: false,
        response: this.buildExecuteError('INVALID_PAYLOAD', 'Invalid context text')
      }
    }

    if (payload.source !== undefined && typeof payload.source !== 'string') {
      return {
        ok: false,
        response: this.buildExecuteError('INVALID_PAYLOAD', 'Invalid source payload')
      }
    }

    const source = normalizeContextSource(payload.source).source
    const contextText =
      typeof payload.context?.text === 'string'
        ? payload.context.text
        : typeof payload.contextText === 'string'
          ? payload.contextText
          : undefined

    return {
      ok: true,
      id,
      source,
      contextText
    }
  }

  private buildExecuteError(
    code: OmniPanelFeatureExecuteErrorCode,
    error?: string
  ): OmniPanelFeatureExecuteResponse {
    return {
      success: false,
      code,
      error: error || EXECUTE_ERROR_MESSAGES[code]
    }
  }

  private async executeBuiltinFeature(
    featureId: string,
    contextText: string,
    _source: OmniPanelContextSource
  ): Promise<OmniPanelFeatureExecuteResponse> {
    const text = contextText.trim()

    if (featureId === 'builtin.translate') {
      if (!text) {
        return this.buildExecuteError('SELECTION_REQUIRED')
      }
      const url = `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeURIComponent(text)}&op=translate`
      await shell.openExternal(url)
      return { success: true }
    }

    if (featureId === 'builtin.search') {
      if (!text) {
        return this.buildExecuteError('SELECTION_REQUIRED')
      }
      const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`
      await shell.openExternal(url)
      return { success: true }
    }

    if (featureId === 'builtin.copy') {
      if (!text) {
        return this.buildExecuteError('SELECTION_REQUIRED')
      }
      clipboard.writeText(text)
      return { success: true }
    }

    if (featureId === 'builtin.corebox-search') {
      return await this.executeCoreBoxTransfer(text)
    }

    return this.buildExecuteError('UNKNOWN_BUILTIN')
  }

  private async executeCoreBoxTransfer(
    contextText: string
  ): Promise<OmniPanelFeatureExecuteResponse> {
    const coreBoxWindow = getCoreBoxWindow()
    if (!coreBoxWindow || coreBoxWindow.window.isDestroyed() || !this.transport) {
      return this.buildExecuteError('COREBOX_UNAVAILABLE')
    }

    try {
      await this.transport.sendToWindow(coreBoxWindow.window.id, CoreBoxEvents.ui.show, undefined)
      if (contextText.trim()) {
        await this.transport.sendToWindow(coreBoxWindow.window.id, CoreBoxEvents.input.setQuery, {
          value: contextText
        })
      }
      return { success: true }
    } catch (error) {
      return this.buildExecuteError(
        'COREBOX_TRANSFER_FAILED',
        error instanceof Error ? error.message : EXECUTE_ERROR_MESSAGES.COREBOX_TRANSFER_FAILED
      )
    }
  }

  private async executePluginFeature(
    item: OmniPanelFeatureRegistryItem,
    contextText: string,
    source: OmniPanelContextSource
  ): Promise<OmniPanelFeatureExecuteResponse> {
    const plugin = this.getPluginInstance(item.pluginName)
    if (!plugin) {
      return this.buildExecuteError('PLUGIN_NOT_FOUND')
    }

    const feature = item.featureId ? plugin.getFeature(item.featureId) : null
    if (!feature || !this.isFeatureExecutable(plugin, feature)) {
      return this.buildExecuteError('FEATURE_NOT_FOUND')
    }

    const query = this.buildFeatureQuery(contextText, item, feature, source)
    try {
      await plugin.triggerFeature(feature, query)
      return { success: true }
    } catch (error) {
      return this.buildExecuteError(
        'FEATURE_EXECUTION_FAILED',
        error instanceof Error ? error.message : EXECUTE_ERROR_MESSAGES.FEATURE_EXECUTION_FAILED
      )
    }
  }

  private buildFeatureQuery(
    contextText: string,
    item: OmniPanelFeatureRegistryItem,
    feature: IPluginFeature,
    source: OmniPanelContextSource
  ): string | TuffQuery {
    const text = contextText.trim()
    const acceptsText =
      !feature.acceptedInputTypes || feature.acceptedInputTypes.includes(TuffInputType.Text)
    if (!text) {
      return ''
    }
    if (!acceptsText) {
      return text
    }

    const query: TuffQuery = {
      text,
      type: 'text',
      inputs: [
        {
          type: TuffInputType.Text,
          content: text,
          metadata: {
            source: `omni-panel:${source}`,
            featureId: item.id
          }
        }
      ]
    }
    return query
  }

  private notifyFeatureRefresh(reason: OmniPanelFeatureRefreshPayload['reason']): void {
    if (!this.transport) return
    this.transport.broadcast(omniPanelFeatureRefreshEvent, {
      reason,
      updatedAt: this.registryUpdatedAt
    })
  }

  private getPluginInstance(pluginName: string | undefined): ITouchPlugin | undefined {
    if (!pluginName) return undefined
    const manager = pluginModule.pluginManager
    if (!manager) return undefined
    return manager.getPluginByName(pluginName)
  }

  private isFeatureExecutable(plugin: ITouchPlugin, feature: IPluginFeature): boolean {
    if (!feature || !feature.id) return false
    if (feature.experimental && !plugin.dev.enable) return false
    return Array.isArray(feature.commands) && feature.commands.length > 0
  }

  private resolveDeclaredTransfer(
    plugin: ITouchPlugin,
    feature: IPluginFeature
  ): IFeatureOmniTransfer | null {
    const declaration = feature.omniTransfer
    if (!declaration || declaration.enabled !== true) return null
    if (!plugin.sdkapi || plugin.sdkapi < OMNI_TRANSFER_DECLARATIVE_MIN_VERSION) {
      return null
    }
    return declaration
  }

  private async autoMountFeatureForPlugin(pluginName: string): Promise<void> {
    const settings = this.getSettingsSnapshot()
    if (!settings.autoMountFirstFeatureOnPluginInstall) return

    if (this.handlingInstallEventPlugins.has(pluginName)) {
      omniPanelLog.debug('Skip auto-mount, install lock exists', { meta: { pluginName } })
      return
    }

    this.handlingInstallEventPlugins.add(pluginName)
    try {
      const plugin = this.getPluginInstance(pluginName)
      if (!plugin) {
        omniPanelLog.debug('Skip auto-mount, plugin not found', { meta: { pluginName } })
        return
      }

      const executableFeatures = plugin
        .getFeatures()
        .filter((feature) => this.isFeatureExecutable(plugin, feature))

      if (executableFeatures.length === 0) {
        omniPanelLog.debug('Skip auto-mount, no executable feature', { meta: { pluginName } })
        return
      }

      let pickedFeature = executableFeatures[0]
      let declarationMode: OmniPanelFeatureRegistryItem['declarationMode'] = 'fallback'
      let declaration: IFeatureOmniTransfer | null = null

      for (const feature of executableFeatures) {
        const declared = this.resolveDeclaredTransfer(plugin, feature)
        if (!declared) continue
        pickedFeature = feature
        declarationMode = 'declared'
        declaration = declared
        break
      }

      const id = `plugin:${plugin.name}:${pickedFeature.id}`
      const now = Date.now()
      const current = this.featureRegistry.find((item) => item.id === id)
      const nextOrder =
        current?.order ??
        (this.featureRegistry.length > 0
          ? Math.max(...this.featureRegistry.map((item) => item.order)) + 1
          : 0)

      const nextItem: OmniPanelFeatureRegistryItem = {
        id,
        source: 'plugin',
        target: normalizeTarget(declaration?.target, 'plugin'),
        title: declaration?.title?.trim() || pickedFeature.name || pickedFeature.id,
        subtitle: declaration?.subtitle?.trim() || pickedFeature.desc || '',
        icon: toFeatureIcon(pickedFeature),
        enabled: current?.enabled ?? true,
        order: nextOrder,
        pluginName: plugin.name,
        featureId: pickedFeature.id,
        acceptedInputTypes: normalizeInputTypes(pickedFeature.acceptedInputTypes),
        sdkapi: plugin.sdkapi,
        autoMounted: true,
        declarationMode,
        payloadTemplate:
          declaration?.payload && Object.keys(declaration.payload).length > 0
            ? declaration.payload
            : {
                mode: 'fallback-first-feature',
                pluginName: plugin.name,
                featureId: pickedFeature.id
              },
        createdAt: current?.createdAt ?? now,
        updatedAt: now
      }

      if (
        current &&
        current.target === nextItem.target &&
        current.title === nextItem.title &&
        current.subtitle === nextItem.subtitle &&
        current.pluginName === nextItem.pluginName &&
        current.featureId === nextItem.featureId &&
        current.declarationMode === nextItem.declarationMode
      ) {
        omniPanelLog.debug('Skip auto-mount, duplicated feature payload', {
          meta: {
            pluginName: plugin.name,
            featureId: pickedFeature.id
          }
        })
        return
      }

      if (current) {
        const index = this.featureRegistry.findIndex((item) => item.id === id)
        this.featureRegistry[index] = nextItem
      } else {
        this.featureRegistry.push(nextItem)
      }

      this.featureRegistry = this.featureRegistry
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item, index) => ({
          ...item,
          order: index
        }))
      this.registryUpdatedAt = now
      this.persistFeatureRegistry()
      this.notifyFeatureRefresh('plugin-install')
      omniPanelLog.info('Auto-mounted plugin feature into OmniPanel', {
        meta: {
          pluginName: plugin.name,
          featureId: pickedFeature.id,
          declarationMode
        }
      })
    } finally {
      this.handlingInstallEventPlugins.delete(pluginName)
    }
  }

  private async captureSelectionText(): Promise<string> {
    if (process.platform === 'darwin') {
      const directSelection = await this.captureMacSelectionTextDirectly()
      if (directSelection) {
        return directSelection.trim()
      }
    }

    const clipboardSnapshot = this.snapshotClipboard()
    const start = Date.now()
    try {
      await this.withTimeout(this.simulateCopyCommand(), COPY_COMMAND_TIMEOUT_MS, 'copy-command')
      await this.delay(COPY_RESULT_POLL_DELAY_MS)
      const text = clipboard.readText().trim()
      if (!text) {
        omniPanelLog.debug('No selected text captured after copy command', {
          meta: {
            platform: process.platform
          }
        })
      }
      return text
    } catch (error) {
      omniPanelLog.warn('Failed to capture selected text, fallback to empty context', {
        error,
        meta: {
          platform: process.platform
        }
      })
      return ''
    } finally {
      if (!this.restoreClipboard(clipboardSnapshot)) {
        omniPanelLog.warn('Clipboard snapshot restore failed after capture')
      }
      omniPanelLog.debug('Selection capture completed', {
        meta: {
          costMs: Date.now() - start
        }
      })
    }
  }

  private async captureMacSelectionTextDirectly(): Promise<string | null> {
    try {
      const script = [
        'tell application "System Events"',
        '  tell (first process whose frontmost is true)',
        '    try',
        '      set focusedElement to value of attribute "AXFocusedUIElement"',
        '      set selectedText to value of attribute "AXSelectedText" of focusedElement',
        '      if selectedText is missing value then',
        '        return ""',
        '      end if',
        '      return selectedText',
        '    on error',
        '      return ""',
        '    end try',
        '  end tell',
        'end tell'
      ].join('\n')
      const { stdout } = await execFileAsync('osascript', ['-e', script])
      const selectedText = typeof stdout === 'string' ? stdout.trim() : ''
      return selectedText || null
    } catch {
      return null
    }
  }

  private snapshotClipboard(): ClipboardSnapshot {
    const formats = clipboard.availableFormats()
    const items: ClipboardSnapshot['items'] = []
    for (const format of formats) {
      try {
        items.push({
          format,
          data: clipboard.readBuffer(format)
        })
      } catch (error) {
        omniPanelLog.debug(`Skip clipboard format snapshot: ${format}`, { error })
      }
    }
    return { items }
  }

  private restoreClipboard(snapshot: ClipboardSnapshot): boolean {
    try {
      clipboard.clear()
      for (const item of snapshot.items) {
        clipboard.writeBuffer(item.format, item.data)
      }
      return true
    } catch (error) {
      omniPanelLog.warn('Failed to restore clipboard snapshot', { error })
      return false
    }
  }

  private async simulateCopyCommand(): Promise<void> {
    if (process.platform === 'darwin') {
      await execFileAsync('osascript', [
        '-e',
        'tell application "System Events" to keystroke "c" using {command down}'
      ])
      return
    }

    if (process.platform === 'win32') {
      const script =
        "$wshell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 30; $wshell.SendKeys('^c')"
      await execFileAsync('powershell', ['-NoLogo', '-NonInteractive', '-Command', script])
      return
    }

    if (process.platform === 'linux') {
      await ensureXdotoolAvailable()
      await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+c'])
      return
    }

    throw new Error(`Unsupported platform: ${process.platform}`)
  }

  private setupInputHook(): void {
    if (this.shouldSkipInputHookSetup()) {
      this.cleanupInputHook()
      return
    }
    if (this.inputHook) {
      return
    }
    try {
      const hookModule = requireFromCurrentModule('uiohook-napi') as {
        uIOhook?: InputHookApi
        UiohookKey?: Partial<InputHookKeyMap>
      }
      const hook = hookModule?.uIOhook
      if (!hook) {
        omniPanelLog.warn('uiohook-napi loaded without uIOhook export')
        return
      }

      const hookKeys = hookModule?.UiohookKey
      if (
        hookKeys?.P !== undefined &&
        hookKeys?.Shift !== undefined &&
        hookKeys?.ShiftRight !== undefined &&
        hookKeys?.Ctrl !== undefined &&
        hookKeys?.CtrlRight !== undefined &&
        hookKeys?.Meta !== undefined &&
        hookKeys?.MetaRight !== undefined
      ) {
        this.inputHookKeys = hookKeys as InputHookKeyMap
      } else {
        this.inputHookKeys = null
      }

      const onMouseDown = (event: InputHookEvent) => {
        if (!this.mouseLongPressEnabled) return
        if (!this.isRightMouseButton(event)) return
        const x = typeof event.x === 'number' ? event.x : 0
        const y = typeof event.y === 'number' ? event.y : 0
        this.mouseDownPosition = { x, y }
        this.clearLongPressTimer()
        this.longPressTimer = setTimeout(() => {
          void this.show({ captureSelection: true, source: 'mouse-long-press' })
          this.clearLongPressTimer()
          this.mouseDownPosition = null
        }, LONG_PRESS_MS)
      }

      const onMouseUp = (event: InputHookEvent) => {
        if (!this.mouseLongPressEnabled) return
        if (!this.isRightMouseButton(event)) return
        this.clearLongPressTimer()
        this.mouseDownPosition = null
      }

      const onMouseMove = (event: InputHookEvent) => {
        if (!this.mouseLongPressEnabled) return
        if (!this.mouseDownPosition || !this.longPressTimer) return
        const x = typeof event.x === 'number' ? event.x : this.mouseDownPosition.x
        const y = typeof event.y === 'number' ? event.y : this.mouseDownPosition.y
        const deltaX = Math.abs(x - this.mouseDownPosition.x)
        const deltaY = Math.abs(y - this.mouseDownPosition.y)
        if (deltaX > LONG_PRESS_MOVE_THRESHOLD || deltaY > LONG_PRESS_MOVE_THRESHOLD) {
          this.clearLongPressTimer()
          this.mouseDownPosition = null
        }
      }

      const onKeyDown = (event: InputHookEvent) => {
        this.handleGlobalKeyDown(event)
      }

      const onKeyUp = (event: InputHookEvent) => {
        this.handleGlobalKeyUp(event)
      }

      hook.on('mousedown', onMouseDown)
      hook.on('mouseup', onMouseUp)
      hook.on('mousemove', onMouseMove)
      hook.on('keydown', onKeyDown)
      hook.on('keyup', onKeyUp)
      hook.start()

      this.inputHook = hook
      this.mouseHandlers = [
        { event: 'mousedown', callback: onMouseDown },
        { event: 'mouseup', callback: onMouseUp },
        { event: 'mousemove', callback: onMouseMove },
        { event: 'keydown', callback: onKeyDown },
        { event: 'keyup', callback: onKeyUp }
      ]
      omniPanelLog.info('Global input hook enabled', {
        meta: {
          mouseLongPressEnabled: this.mouseLongPressEnabled,
          shortcutHoldTrackingReady: Boolean(this.inputHookKeys)
        }
      })
    } catch (error) {
      this.inputHookKeys = null
      omniPanelLog.warn('uiohook-napi unavailable, global input hook disabled', { error })
    }
  }

  private cleanupInputHook(): void {
    if (!this.inputHook) return

    try {
      for (const handler of this.mouseHandlers) {
        if (typeof this.inputHook.off === 'function') {
          this.inputHook.off(handler.event, handler.callback)
        } else if (typeof this.inputHook.removeAllListeners === 'function') {
          this.inputHook.removeAllListeners(handler.event)
        }
      }
      this.inputHook.stop()
    } catch (error) {
      omniPanelLog.warn('Failed to cleanup input hook', { error })
    } finally {
      this.inputHook = null
      this.inputHookKeys = null
      this.mouseHandlers = []
    }
  }

  private handleGlobalKeyDown(event: InputHookEvent): void {
    if (!this.shortcutHoldEnabled || !this.inputHookKeys) return

    const keycode = Number(event.keycode)
    if (!Number.isFinite(keycode)) return
    this.pressedShortcutKeys.add(keycode)

    if (this.shortcutComboActive || !this.isShortcutComboPressed()) return

    this.shortcutComboActive = true
    this.shortcutComboStartedAt = Date.now()
    this.shortcutComboReleasedAt = 0
    this.shortcutLastHoldDurationMs = 0
    this.clearShortcutHoldTimer()
    this.shortcutHoldTimer = setTimeout(() => {
      if (!this.shortcutComboActive || !this.isShortcutComboPressed()) return
      if (this.shortcutTriggerArmed) {
        this.triggerArmedShortcut()
      }
    }, SHORTCUT_HOLD_MS)
  }

  private handleGlobalKeyUp(event: InputHookEvent): void {
    if (!this.shortcutHoldEnabled || !this.inputHookKeys) return

    const keycode = Number(event.keycode)
    if (Number.isFinite(keycode)) {
      this.pressedShortcutKeys.delete(keycode)
    }

    if (!this.shortcutComboActive || this.isShortcutComboPressed()) return

    const now = Date.now()
    this.shortcutLastHoldDurationMs =
      this.shortcutComboStartedAt !== null ? now - this.shortcutComboStartedAt : 0
    this.shortcutComboReleasedAt = now
    this.shortcutComboActive = false
    this.shortcutComboStartedAt = null
    this.shortcutTriggerArmed = false
    this.clearShortcutArmExpiryTimer()
    this.clearShortcutHoldTimer()
  }

  private isShortcutComboPressed(): boolean {
    const keys = this.inputHookKeys
    if (!keys) return false

    const hasPrimary = this.pressedShortcutKeys.has(keys.P)
    const hasShift =
      this.pressedShortcutKeys.has(keys.Shift) || this.pressedShortcutKeys.has(keys.ShiftRight)
    const hasCommandOrCtrl =
      this.pressedShortcutKeys.has(keys.Ctrl) ||
      this.pressedShortcutKeys.has(keys.CtrlRight) ||
      this.pressedShortcutKeys.has(keys.Meta) ||
      this.pressedShortcutKeys.has(keys.MetaRight)
    return hasPrimary && hasShift && hasCommandOrCtrl
  }

  private isRightMouseButton(event: InputHookEvent): boolean {
    const button = Number(event.button)
    return button === 2 || button === 3
  }

  private clearLongPressTimer(): void {
    if (!this.longPressTimer) return
    clearTimeout(this.longPressTimer)
    this.longPressTimer = null
  }

  private clearShortcutHoldTimer(): void {
    if (!this.shortcutHoldTimer) return
    clearTimeout(this.shortcutHoldTimer)
    this.shortcutHoldTimer = null
  }

  private clearShortcutArmExpiryTimer(): void {
    if (!this.shortcutArmExpiryTimer) return
    clearTimeout(this.shortcutArmExpiryTimer)
    this.shortcutArmExpiryTimer = null
  }

  private resetShortcutHoldState(): void {
    this.pressedShortcutKeys.clear()
    this.shortcutComboActive = false
    this.shortcutComboStartedAt = null
    this.shortcutComboReleasedAt = 0
    this.shortcutLastHoldDurationMs = 0
    this.shortcutTriggerArmed = false
    this.clearShortcutArmExpiryTimer()
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms)
    })
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null
    try {
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      })
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  private performShutdownCleanup(): void {
    this.destroying = true
    this.mouseLongPressEnabled = false
    this.shortcutHoldEnabled = false
    this.clearLongPressTimer()
    this.clearShortcutHoldTimer()
    this.clearShortcutArmExpiryTimer()
    this.resetShortcutHoldState()
    this.cleanupInputHook()
    shortcutModule.unregisterMainShortcut(OMNI_PANEL_SHORTCUT_ID)
    shortcutModule.unregisterMainTrigger(OMNI_PANEL_MOUSE_TRIGGER_ID)
  }

  private shouldSkipInputHookSetup(): boolean {
    if (this.destroying) {
      return true
    }
    return (globalThis.$app as { isQuitting?: boolean } | undefined)?.isQuitting === true
  }
}

export const omniPanelModule = new OmniPanelModule()
