import type { CoreBoxCanvasConfig, CoreBoxThemeConfig, LayoutAtomConfig, LayoutCanvasConfig } from './layout-atom-types'

export const VOICE_POLISH_STRENGTHS = ['natural', 'structured', 'deep'] as const
export type VoicePolishStrength = typeof VOICE_POLISH_STRENGTHS[number]
export const DEFAULT_VOICE_POLISH_STRENGTH: VoicePolishStrength = 'deep'

export function normalizeVoicePolishStrength(value: unknown): VoicePolishStrength {
  return value === 'natural' || value === 'structured' || value === 'deep'
    ? value
    : DEFAULT_VOICE_POLISH_STRENGTH
}

/** Default layout atom for 'simple' preset */
const defaultLayoutAtomSimple: LayoutAtomConfig = {
  preset: 'simple',
  header: { border: 'solid', height: 26, blur: false },
  aside: { position: 'left', width: 68, border: 'solid', collapsed: false },
  view: { radius: [0, 0, 0, 0], shadow: 'none', padding: 0, background: 'transparent' },
  nav: { style: 'icon', activeIndicator: 'dot' },
}

/** Default CoreBox theme */
const defaultCoreBoxTheme: CoreBoxThemeConfig = {
  preset: 'default',
  logo: { position: 'left', size: 24, style: 'default' },
  input: { border: 'bottom', radius: 8, background: 'transparent' },
  results: { itemRadius: 6, itemPadding: 8, divider: false, hoverStyle: 'background' },
  container: { radius: 0, shadow: 'none', border: false },
}

const defaultLayoutCanvasConfig: LayoutCanvasConfig = {
  enabled: false,
  preset: 'simple',
  columns: 12,
  rowHeight: 24,
  gap: 8,
  items: [
    { id: 'header', area: 'header', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 1 },
    { id: 'aside', area: 'aside', x: 0, y: 2, w: 2, h: 10, minW: 1, minH: 4 },
    { id: 'view', area: 'view', x: 2, y: 2, w: 10, h: 10, minW: 4, minH: 4 },
  ],
}

const defaultCoreBoxCanvasConfig: CoreBoxCanvasConfig = {
  enabled: false,
  preset: 'default',
  columns: 12,
  rowHeight: 24,
  gap: 8,
  items: [
    { id: 'logo', area: 'logo', x: 0, y: 0, w: 1, h: 1, minW: 1, minH: 1 },
    { id: 'input', area: 'input', x: 1, y: 0, w: 9, h: 1, minW: 4, minH: 1 },
    { id: 'actions', area: 'actions', x: 10, y: 0, w: 2, h: 1, minW: 1, minH: 1 },
    { id: 'tags', area: 'tags', x: 1, y: 1, w: 11, h: 1, minW: 4, minH: 1 },
    { id: 'results', area: 'results', x: 0, y: 2, w: 10, h: 8, minW: 5, minH: 4 },
    { id: 'addon', area: 'addon', x: 10, y: 2, w: 2, h: 8, minW: 2, minH: 4 },
    { id: 'footer', area: 'footer', x: 0, y: 10, w: 10, h: 1, minW: 4, minH: 1 },
  ],
}

/**
 * Default configuration object for application settings
 */
const _appSettingOriginData = {
  autoStart: false,
  defaultApp: 0,
  plugin: {
    sync: 0,
    syncLatest: false,
    dataSync: false,
  },
  sync: {
    /**
     * Whether sync is currently enabled.
     * Login flow will auto-enable this unless the user has overridden it.
     */
    enabled: false,
    /**
     * Whether user manually changed sync preference.
     * Once true, login auto-enable will no longer override this choice.
     */
    userOverridden: false,
    /**
     * Timestamp when sync was auto-enabled by login flow.
     */
    autoEnabledAt: '',
    /**
     * Timestamp of latest successful sync-related activity.
     * Used for user-facing status display (best-effort, client-side).
     */
    lastActivityAt: '',
    /**
     * Timestamp of latest successful push activity.
     */
    lastPushAt: '',
    /**
     * Timestamp of latest successful pull activity.
     */
    lastPullAt: '',
    /**
     * Runtime sync status for UI visibility.
     */
    status: 'idle' as 'idle' | 'syncing' | 'paused' | 'error',
    /**
     * Timestamp of latest successful sync task (pull or push).
     */
    lastSuccessAt: '',
    /**
     * Timestamp of latest sync error.
     */
    lastErrorAt: '',
    /**
     * Latest sync error code.
     */
    lastErrorCode: '',
    /**
     * Latest sync error message.
     */
    lastErrorMessage: '',
    /**
     * Consecutive sync failure counter.
     */
    consecutiveFailures: 0,
    /**
     * Pending sync queue depth (best-effort).
     */
    queueDepth: 0,
    /**
     * Next scheduled pull timestamp.
     */
    nextPullAt: '',
    /**
     * Latest pulled cursor for incremental sync.
     */
    cursor: 0,
    /**
     * Local op sequence for push ordering.
     */
    opSeq: 0,
    /**
     * Timestamp of latest conflict observed during push.
     */
    lastConflictAt: '',
    /**
     * Count of latest conflicts observed during push.
     */
    lastConflictCount: 0,
    /**
     * If sync is blocked by a policy/error class.
     */
    blockedReason: '' as '' | 'quota' | 'device' | 'auth',
  },
  auth: {
    deviceId: '',
    deviceName: '',
    devicePlatform: '',
    /**
     * User-chosen Nexus base URL. Empty follows the Nexus runtime server mode; only an explicit
     * build-time `TUFF_NEXUS_BASE_URL` outranks it. Changing it drops the stored account
     * credential, because a token issued by one Nexus origin is not valid at another.
     */
    nexusBaseUrl: '',
  },
  dev: {
    autoCloseDev: true,
    runtimeServer: 'production' as 'production' | 'local',
    developerMode: false,
  },
  lang: {
    followSystem: true,
    locale: 'zh-CN',
  },
  keyBind: {
    summon: 'CTRL + E',
    home: 0,
    plugins: 0,
    settings: 0,
  },
  assistant: {
    enabled: false,
  },
  omniPanel: {
    enableShortcut: false,
    enableMouseLongPress: true,
    mouseLongPressDurationMs: 600,
    autoMountFirstFeatureOnPluginInstall: true,
    featureHub: {
      items: [] as Array<Record<string, unknown>>,
    },
  },
  localAiCli: {
    enabled: false,
    defaultProvider: null as null | 'pi' | 'codex' | 'claude' | 'oh-my-pi',
    providers: {
      'pi': { enabled: false, executableOverride: '' },
      'codex': { enabled: false, executableOverride: '' },
      'claude': { enabled: false, executableOverride: '' },
      'oh-my-pi': { enabled: false, executableOverride: '' },
    },
  },
  floatingBall: {
    enabled: false,
    size: 56,
    opacity: 1,
    edgePadding: 24,
    position: {
      x: -1,
      y: -1,
    },
  },
  voiceWake: {
    enabled: false,
    wakeWords: ['阿洛', 'aler'],
    language: 'zh-CN',
    continuous: true,
    cooldownMs: 2200,
    openPanelOnWake: true,
  },
  voiceInput: {
    enabled: false,
    language: 'zh-CN',
    polishEnabled: true,
    polishStrength: DEFAULT_VOICE_POLISH_STRENGTH as VoicePolishStrength,

    /**
     * 采集时是否运行 RNNoise 谱降噪。
     *
     * 默认关闭：云端识别模型本身就是在带噪语音上训练的，降噪引入的频谱失真有可能比它
     * 去掉的噪声更伤准确率。这个取舍能测，所以做成带默认值的偏好，而不是写死在链路里。
     *
     * 与它无关的是采集链路里常开的高通与抗混叠滤波——那两个是缺陷修复，不是偏好。
     */
    noiseSuppression: false,
  },
  clipboard: {
    /**
     * 剪贴板内容分类与按类保留。
     *
     * 放在这里而不是隐私策略的类别表里：那张表同时也是数据域清单，每一项都要有自己的
     * data owner（inspect / export / preview / delete）。而「剪贴板里的验证码」不是
     * 独立数据域——它和普通剪贴板记录同表、同 owner、删除路径一样，为三个开关造两个
     * 假数据域，代价和语义都不对。
     */

    /**
     * 验证码的保留时长，毫秒。一次性码被粘贴的那一刻就作废了，留满类别的 90 天等于让
     * 一个还能用的凭据在明文表里躺三个月。
     */
    verificationCodeRetentionMs: 60 * 60 * 1000,

    /**
     * 密钥类记录是否永不被自动清理。
     *
     * 关掉它，API key、私钥、连接串就和普通文本一样按类别策略过期——这是「我不想让
     * 密钥永久留在库里」的合理选择，所以留了开关，但默认开着。
     */
    protectSecrets: true,

    /**
     * 额外的密钥前缀，用于自建网关下发的 key。
     *
     * 内置的通用规则只认「小写字母前缀 + 高熵体」的形状；自建网关（sub2api 之类）的
     * 前缀是每个部署自己配的值，硬编码任何一个都既会漏又会误报。填进来的前缀会跳过
     * 熵检查直接命中。
     */
    customKeyPrefixes: [] as string[],
  },
  beginner: {
    init: false,
  },
  security: {
    /**
     * 最近一次已上报的 machine_code_hash（用于避免重复上报）。
     * 注意：这是 hash（摘要），不含原始硬件信息。
     */
    machineCodeHash: '',
    /**
     * 最近一次上报时间（ISO 字符串，可选，仅用于调试/排查）。
     */
    machineCodeAttestedAt: '',
  },
  tools: {
    /**
     * Lets the model pull web, file, clipboard and related context on demand instead of making
     * the user pick tools per message.
     *
     * Lives here rather than on the composer because the composer switch and the settings row are
     * the same preference: a local `ref` in the composer would reset on every navigation and would
     * have nothing for 「设置 · 插件与工具」 to manage.
     */
    autoContext: true,
    /**
     * Whether the assistant may run tools (search, read, open) at all.
     *
     * Off by default and deliberately separate from `autoContext`: pulling
     * context in is passive, whereas a tool call reaches out and touches the
     * user's machine — that has to be something they turned on.
     *
     * Kept in step with `agentToolsMode` (`agentTools = mode !== 'off'`) so a
     * build that predates modes still reads the user's intent.
     */
    agentTools: false,
    /**
     * How the composer's permission pill answers tool calls: `off` closes the
     * gateway, `review` confirms every call, `full` auto-approves at the gate.
     *
     * Settings stored before this field exists hydrate without it (top-level
     * `Object.assign` replaces `tools` wholesale), so readers must treat
     * `undefined` + `agentTools: true` as `review` — the migration path.
     */
    agentToolsMode: 'off' as 'off' | 'review' | 'full',
    autoPaste: {
      enable: true,
      time: 5,
    },
    autoHide: true,
    autoClear: 300,
    clipboardPolling: {
      interval: 5,
      lowBatteryPolicy: {
        enable: true,
        interval: 10,
      },
    },
  },
  conversation: {
    /**
     * The model pinned in the home model pill, or `null` for Tuff auto-routing.
     *
     * An object, not a `providerId:model` string: local model ids carry their own colon
     * (`qwen2.5:3b`). Readers resolve it against the currently loaded options and fall back to
     * auto when it does not resolve, but never clear it — a provider that is temporarily
     * unavailable (the pi CLI not running) must not cost the user their choice.
     */
    model: null as null | { providerId: string, model: string },
    /** Starred rows of the home model menu, in the order they were starred. */
    favoriteModels: [] as Array<{ providerId: string, model: string }>,
  },
  dashboard: {
    enable: false,
  },
  searchEngine: {
    logsEnabled: false,
  },
  quickOps: {
    enabled: true,
    showRunningSessionsInCoreBox: true,
    allowStatefulTools: true,
    allowNetworkTools: true,
    allowFileTools: true,
    allowSystemTools: true,
    allowDeveloperTools: true,
    allowHighRiskTools: false,
    defaultKeepAwakeDurationMinutes: 60,
    defaultSystemAwakeDurationMinutes: 60,
    defaultTimerDurationMinutes: 25,
    defaultTimerExtendMinutes: 5,
    defaultPomodoroFocusMinutes: 25,
    defaultPomodoroBreakMinutes: 5,
    pomodoroTemplates: {
      classic: true,
      long: true,
      custom: [] as Array<{
        name: string
        aliases: string[]
        focusMinutes: number
        breakMinutes: number
        enabled: boolean
      }>,
    },
    defaultScreenCleanDurationSeconds: 60,
    defaultScreenCleanMode: 'black' as 'black' | 'white',
    allowPublicIpLookup: false,
  },
  diagnostics: {
    verboseLogs: false,
  },
  network: {
    timeout: 15000,
    retry: {
      maxRetries: 2,
      baseDelayMs: 400,
      maxDelayMs: 5000,
      backoffFactor: 2,
      retryOnNetworkError: true,
      retryOnTimeout: true,
      retryableStatusCodes: [408, 425, 429, 500, 502, 503, 504],
    },
    cooldown: {
      failureThreshold: 1,
      cooldownMs: 3000,
      autoResetOnSuccess: true,
    },
    proxy: {
      mode: 'system' as 'direct' | 'system' | 'custom',
      custom: {
        httpProxy: '',
        httpsProxy: '',
        socksProxy: '',
        pacUrl: '',
        bypass: [] as string[],
      },
      authRef: '',
    },
  },
  recommendation: {
    enabled: true,
    maxItems: 10,
    showReason: true,
    semantic: {
      localVectorEnabled: true,
      aiRerankEnabled: false,
      aiEmbeddingEnabled: false,
    },
    contextSources: {
      time: true,
      foregroundApp: true,
      clipboard: true,
      selection: true,
      network: true,
      focus: true,
      power: true,
      location: true,
    },
  },
  downloadCenter: {
    viewMode: 'detailed' as 'detailed' | 'compact',
  },
  animation: {
    listItemStagger: false,
    resultTransition: false,
    coreBoxResize: false,
    autoDisableOnLowBattery: true,
  },
  viewCache: {
    maxCachedViews: 4,
    hotCacheDurationMs: 120000,
  },
  background: {
    /** 背景图来源: 'auto' | 'none' | 'bing' | 'custom' | 'folder' | 'desktop' */
    source: 'auto' as 'auto' | 'none' | 'bing' | 'custom' | 'folder' | 'desktop',
    /** 自定义背景图路径 */
    customPath: '',
    /** 文件夹路径 */
    folderPath: '',
    /** 文件夹轮播间隔（分钟） */
    folderIntervalMinutes: 30,
    /** 文件夹轮播是否随机 */
    folderRandom: true,
    /** 背景图模糊度 0-20 */
    blur: 0,
    /** 背景图透明度 10-100 */
    opacity: 100,
    /** 背景图滤镜 */
    filter: {
      brightness: 100,
      contrast: 100,
      saturate: 100,
    },
    /** 桌面壁纸路径 */
    desktopPath: '',
    /** 壁纸库信息 */
    library: {
      enabled: false,
      folderStoredPath: '',
      fileStoredPath: '',
    },
    /** 云同步配置 */
    sync: {
      enabled: false,
    },
  },
  coreBox: {
    /** 自定义 placeholder 文本，空则使用默认 */
    customPlaceholder: '',
  },
  window: {
    closeToTray: true,
    startMinimized: false,
    startSilent: true,
  },
  shell: {
    /**
     * Sidebar width in px while expanded. Clamped on read — a hand-edited config or a
     * cross-version rollback can carry a value outside the range the UI allows.
     */
    sidebarWidth: 260,
    /** Whether the sidebar is collapsed to the icon-only rail. */
    sidebarCollapsed: false,
  },
  setup: {
    fileAccess: false,
    fileAccessRootKey: '',
    accessibility: false,
    notifications: false,
    microphone: false,
    autoStart: false,
    showTray: true,
    adminPrivileges: false,
    hideDock: true,
    runAsAdmin: false,
    customDesktop: false,
    lastPermissionAudit: {
      at: 0,
      version: '',
      appUpdate: false,
      missing: [] as string[],
    },
  },
  layout: 'simple',
  layoutAtomConfig: defaultLayoutAtomSimple,
  coreBoxThemeConfig: defaultCoreBoxTheme,
  layoutCanvasConfig: defaultLayoutCanvasConfig,
  coreBoxCanvasConfig: defaultCoreBoxCanvasConfig,
  presetState: {
    lastRemotePresetId: '',
    lastRemotePresetName: '',
    lastRemotePresetChannel: 'beta' as 'stable' | 'beta',
    lastRemotePresetAppliedAt: '',
    rollbackSnapshot: null as null | {
      layout: string
      layoutAtomConfig: LayoutAtomConfig
      coreBoxThemeConfig: CoreBoxThemeConfig
      layoutCanvasConfig: LayoutCanvasConfig
      coreBoxCanvasConfig: CoreBoxCanvasConfig
      themeStyle?: Record<string, unknown>
    },
  },
}

export const appSettingOriginData = Object.freeze(_appSettingOriginData)

/**
 * Type definition for application settings.
 *
 * Combines the default configuration with support for dynamic additional properties.
 */
export type AppSetting = typeof _appSettingOriginData & {
  [key: string]: any
}

export interface VoiceInputSetting {
  enabled: boolean
  language: string
  polishEnabled: boolean
  polishStrength: VoicePolishStrength
  historyEnabled?: boolean
  noiseSuppression?: boolean
}

function isSettingRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Adds the dedicated dictation switch exactly once. Existing voiceInput data
 * always wins, including an explicit false; only a missing field derives the
 * prior combined voice gate.
 */
export function ensureVoiceInputSetting(setting: Record<string, unknown>): boolean {
  const hasVoiceInput = Object.prototype.hasOwnProperty.call(setting, 'voiceInput')
  const legacyAssistant = isSettingRecord(setting.assistant) ? setting.assistant : {}
  const legacyVoiceWake = isSettingRecord(setting.voiceWake) ? setting.voiceWake : {}

  if (!hasVoiceInput) {
    setting.voiceInput = {
      enabled: legacyAssistant.enabled === true && legacyVoiceWake.enabled === true,
      language:
        typeof legacyVoiceWake.language === 'string' && legacyVoiceWake.language.trim()
          ? legacyVoiceWake.language
          : 'zh-CN',
      polishEnabled: true,
      polishStrength: DEFAULT_VOICE_POLISH_STRENGTH,
    }
    return true
  }

  const source = isSettingRecord(setting.voiceInput) ? setting.voiceInput : {}
  const enabled = typeof source.enabled === 'boolean' ? source.enabled : false
  const language = typeof source.language === 'string' && source.language.trim() ? source.language : 'zh-CN'
  const polishEnabled = source.polishEnabled !== false
  const polishStrength = normalizeVoicePolishStrength(source.polishStrength)
  const hasHistory = Object.prototype.hasOwnProperty.call(source, 'historyEnabled')
  const historyEnabled = source.historyEnabled === true
  const hasNoiseSuppression = Object.prototype.hasOwnProperty.call(source, 'noiseSuppression')
  // `=== true` rather than `!== false`: an unreadable value has to land on off. Turning
  // suppression on by accident changes what the recogniser hears, and the user never asked.
  const noiseSuppression = source.noiseSuppression === true
  if (
    isSettingRecord(setting.voiceInput)
    && source.enabled === enabled
    && source.language === language
    && source.polishEnabled === polishEnabled
    && source.polishStrength === polishStrength
    && (!hasHistory || source.historyEnabled === historyEnabled)
    && (!hasNoiseSuppression || source.noiseSuppression === noiseSuppression)
  ) {
    return false
  }

  setting.voiceInput = {
    ...source,
    enabled,
    language,
    polishEnabled,
    polishStrength,
    ...(hasHistory ? { historyEnabled } : {}),
    ...(hasNoiseSuppression ? { noiseSuppression } : {}),
  }
  return true
}
