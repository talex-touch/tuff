/**
 * Unified Tuff destination catalog.
 *
 * Pure, host-owned source of truth for "reveal Tuff" and "go to a known Tuff surface" destinations.
 * It carries no Electron, renderer, filesystem, or runtime-storage dependency so main-process
 * providers, main-process services, and cross-layer tests can all consume the same definitions.
 *
 * Routes must agree with the renderer settings route source of truth
 * (`renderer/src/modules/settings/categories.ts`); a cross-layer test enforces that.
 */

export type AppDestinationId =
  | 'main-window'
  | 'home'
  | 'settings-overview'
  | 'settings-general'
  | 'settings-appearance'
  | 'settings-intelligence'
  | 'settings-channels'
  | 'settings-voice'
  | 'settings-plugins'
  | 'settings-applications'
  | 'settings-file-index'
  | 'settings-network'
  | 'settings-update'
  | 'settings-about'

export interface AppDestinationDefinition {
  readonly id: AppDestinationId
  /** Allowlisted renderer route, or `null` for reveal-only destinations. */
  readonly route: string | null
  readonly titleKey: string
  readonly subtitleKey: string
  readonly icon: `i-${string}`
  readonly aliases: Readonly<{
    en: readonly string[]
    zh: readonly string[]
    pinyin: readonly string[]
  }>
  readonly searchable: boolean
  readonly advanced: boolean
  readonly commonSetting: boolean
}

/**
 * Query normalization: case-insensitive, separator-insensitive.
 *
 * Whitespace, `_`, and `-` are removed rather than collapsed so `main window`, `main-window`,
 * and `Main_Window` all address the same alias.
 */
export function normalizeAppDestinationQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

/**
 * Alias policy: exact phrases only.
 *
 * Bare generic verbs/nouns (`打开`, `open`, `show`, `window`, `窗口`) and ambiguous
 * AI/category words (`AI`, `模型`, `proxy`, `theme`, and their bare translations) are
 * intentionally absent: they must not steal ordinary app search. Canonical setting titles,
 * their Chinese/English forms, and static full/initial pinyin aliases remain exact matches.
 * Adding a broader alias later requires fresh collision coverage.
 */
const APP_DESTINATION_LIST: readonly AppDestinationDefinition[] = [
  {
    id: 'main-window',
    route: null,
    titleKey: 'tray.showWindow',
    subtitleKey: 'corebox.destinations.mainWindowSubtitle',
    icon: 'i-ri-window-line',
    aliases: {
      en: [
        'show main window',
        'main window',
        'tuff window',
        'open main window',
        'open tuff',
        'show tuff',
        'focus tuff'
      ],
      zh: [
        '主窗口',
        '主界面',
        '主页面',
        '显示主窗口',
        '打开主窗口',
        '回到主窗口',
        '打开 tuff',
        '显示 tuff'
      ],
      pinyin: ['zhuchuangkou', 'zck', 'zhujiemian', 'zjm']
    },
    searchable: true,
    advanced: false,
    commonSetting: false
  },
  {
    id: 'home',
    route: '/home',
    titleKey: 'router.home',
    subtitleKey: 'corebox.destinations.homeSubtitle',
    icon: 'i-ri-home-line',
    aliases: {
      en: ['home', 'home page', 'dashboard', 'go home', 'open home'],
      zh: ['首页', '主页', '回到首页', '打开首页'],
      pinyin: ['shouye', 'sy', 'zhuye', 'zy']
    },
    searchable: true,
    advanced: false,
    commonSetting: false
  },
  {
    id: 'settings-overview',
    route: '/setting/overview',
    titleKey: 'corebox.destinations.settingsTitle',
    subtitleKey: 'corebox.destinations.overviewSubtitle',
    icon: 'i-ri-dashboard-3-line',
    aliases: {
      en: [
        'settings',
        'preferences',
        'settings overview',
        'options',
        'config',
        'configuration',
        'open settings'
      ],
      zh: ['设置', '偏好设置', '设置总览', '应用设置', '选项', '配置', '打开设置'],
      pinyin: ['shezhi', 'sz', 'pianhaoshezhi', 'phsz']
    },
    searchable: true,
    advanced: false,
    commonSetting: false
  },
  {
    id: 'settings-general',
    route: '/setting/general',
    titleKey: 'settingsNav.category.general',
    subtitleKey: 'corebox.destinations.generalSubtitle',
    icon: 'i-ri-settings-3-line',
    aliases: {
      en: ['general', 'general settings', 'settings general'],
      zh: ['通用设置', '常规设置', '通用', '常规'],
      pinyin: ['tongyong', 'ty', 'changgui', 'cg']
    },
    searchable: true,
    advanced: false,
    commonSetting: true
  },
  {
    id: 'settings-appearance',
    route: '/setting/appearance',
    titleKey: 'settingsNav.category.appearance',
    subtitleKey: 'corebox.destinations.appearanceSubtitle',
    icon: 'i-ri-palette-line',
    aliases: {
      en: ['appearance', 'appearance settings', 'theme settings', 'look and feel'],
      zh: ['外观', '外观设置', '主题设置', '皮肤设置'],
      pinyin: ['waiguan', 'wg', 'zhutishezhi', 'ztsz']
    },
    searchable: true,
    advanced: false,
    commonSetting: true
  },
  {
    id: 'settings-intelligence',
    route: '/setting/intelligence',
    titleKey: 'settingsNav.category.intelligence',
    subtitleKey: 'corebox.destinations.intelligenceSubtitle',
    icon: 'i-ri-sparkling-2-line',
    aliases: {
      en: [
        'intelligence',
        'intelligence settings',
        'tuff intelligence',
        'ai settings',
        'model settings'
      ],
      zh: ['智能', '智能设置', '塔芙智能', 'ai 设置', '模型设置'],
      pinyin: ['zhineng', 'zn', 'tafuzhineng', 'tfzn', 'moxingshezhi', 'mxsz']
    },
    searchable: true,
    advanced: false,
    commonSetting: false
  },
  {
    id: 'settings-channels',
    route: '/setting/intelligence/channels',
    titleKey: 'settingsIntelligenceHub.channels',
    subtitleKey: 'settingsIntelligenceHub.channelsDesc',
    icon: 'i-ri-links-line',
    aliases: {
      en: ['model channels', 'model channel settings', 'model providers', 'provider settings'],
      zh: ['模型渠道', '模型渠道设置', '渠道设置', '模型服务商'],
      pinyin: ['moxingqudao', 'mxqd', 'qudaoshezhi', 'qdsz']
    },
    searchable: true,
    advanced: false,
    commonSetting: true
  },
  {
    id: 'settings-voice',
    route: '/setting/intelligence/voice',
    titleKey: 'settingsIntelligenceHub.voice',
    subtitleKey: 'settingsIntelligenceHub.voiceDesc',
    icon: 'i-ri-mic-line',
    aliases: {
      en: ['voice input', 'voice settings', 'speech recognition', 'dictation settings'],
      zh: ['语音输入', '语音设置', '语音识别', '听写设置'],
      pinyin: ['yuyinshuru', 'yysr', 'yuyinshezhi', 'yysz', 'tingxieshezhi', 'txsz']
    },
    searchable: true,
    advanced: false,
    commonSetting: true
  },
  {
    id: 'settings-plugins',
    route: '/setting/plugins',
    titleKey: 'settingsNav.category.plugins',
    subtitleKey: 'corebox.destinations.pluginsSubtitle',
    icon: 'i-ri-puzzle-line',
    aliases: {
      en: ['plugins', 'plugin settings', 'plugins and tools', 'plugins & tools', 'extensions'],
      zh: ['插件', '插件设置', '插件与工具', '扩展', '扩展设置'],
      pinyin: ['chajian', 'cj', 'kuozhan', 'kz', 'chajianyugongju', 'cjygj']
    },
    searchable: true,
    advanced: false,
    commonSetting: true
  },
  {
    id: 'settings-applications',
    route: '/setting/applications',
    titleKey: 'settingsNav.category.applications',
    subtitleKey: 'corebox.destinations.applicationsSubtitle',
    icon: 'i-ri-apps-2-line',
    aliases: {
      en: ['applications', 'application settings', 'installed applications', 'app index'],
      zh: ['应用', '应用管理', '已安装应用', '应用索引'],
      pinyin: ['yingyong', 'yy', 'yingyongshezhi', 'yingyongsuoyin', 'yysy']
    },
    searchable: true,
    advanced: false,
    commonSetting: true
  },
  {
    id: 'settings-file-index',
    route: '/setting/file-index',
    titleKey: 'settingsNav.category.fileIndex',
    subtitleKey: 'corebox.destinations.fileIndexSubtitle',
    icon: 'i-ri-file-search-line',
    aliases: {
      en: ['file index', 'file indexing', 'indexing settings', 'search index', 'file search'],
      zh: ['文件索引', '文件索引设置', '索引设置', '文件搜索'],
      pinyin: ['wenjiansuoyin', 'wjsy', 'wenjiansousuo', 'wjss']
    },
    searchable: true,
    advanced: false,
    commonSetting: true
  },
  {
    id: 'settings-network',
    route: '/setting/network',
    titleKey: 'settingsNav.category.network',
    subtitleKey: 'corebox.destinations.networkSubtitle',
    icon: 'i-ri-global-line',
    aliases: {
      en: ['network', 'network settings', 'network configuration', 'proxy settings'],
      zh: ['网络', '网络设置', '网络配置', '代理设置'],
      pinyin: ['wangluo', 'wl', 'wangluoshezhi', 'wlsz', 'dailishezhi', 'dlsz']
    },
    searchable: true,
    advanced: false,
    commonSetting: true
  },
  {
    id: 'settings-update',
    route: '/setting/update',
    titleKey: 'settingsNav.category.update',
    subtitleKey: 'corebox.destinations.updateSubtitle',
    icon: 'i-ri-refresh-line',
    aliases: {
      en: ['update', 'check for updates', 'check updates', 'update settings'],
      zh: ['更新', '检查更新', '更新设置', '软件更新'],
      pinyin: ['gengxin', 'gx', 'jianchagengxin', 'jcgx', 'ruanjiangengxin', 'rjgx']
    },
    searchable: true,
    advanced: false,
    commonSetting: true
  },
  {
    id: 'settings-about',
    route: '/setting/about',
    titleKey: 'settingsNav.category.about',
    subtitleKey: 'corebox.destinations.aboutSubtitle',
    icon: 'i-ri-information-line',
    aliases: {
      en: ['about tuff', 'about', 'about this app', 'version info'],
      zh: ['关于 tuff', '关于', '版本信息'],
      pinyin: ['guanyu', 'gy', 'banbenxinxi', 'bbxx']
    },
    searchable: true,
    advanced: false,
    commonSetting: false
  }
]

/** Visible action order for the grouped common-settings panel. */
export const COMMON_SETTING_DESTINATION_IDS: readonly AppDestinationId[] = [
  'settings-general',
  'settings-appearance',
  'settings-channels',
  'settings-voice',
  'settings-plugins',
  'settings-applications',
  'settings-file-index',
  'settings-network',
  'settings-update'
]

export const APP_DESTINATIONS: readonly AppDestinationDefinition[] = Object.freeze(
  APP_DESTINATION_LIST.map((definition) =>
    Object.freeze({
      ...definition,
      aliases: Object.freeze({
        en: Object.freeze([...definition.aliases.en]),
        zh: Object.freeze([...definition.aliases.zh]),
        pinyin: Object.freeze([...definition.aliases.pinyin])
      })
    })
  )
)

const DESTINATION_BY_ID = Object.freeze(
  Object.fromEntries(APP_DESTINATIONS.map((definition) => [definition.id, definition]))
) as Readonly<Record<AppDestinationId, AppDestinationDefinition>>

/**
 * Every icon class the catalog names, deduplicated.
 *
 * UnoCSS extracts classes from `.vue`/`.jsx`/templates, not from `.ts` tables, so these are
 * safelisted from `uno.config.ts`. Derived rather than literal-copied so the two cannot drift.
 */
export const APP_DESTINATION_ICON_CLASSES: readonly string[] = Object.freeze(
  Array.from(new Set(APP_DESTINATIONS.map((definition) => definition.icon)))
)

/**
 * Normalized alias -> destination index, built once at module evaluation.
 *
 * Duplicate normalized aliases fail construction instead of silently resolving to the last
 * writer, so a copy/paste alias cannot shadow another destination.
 */
const DESTINATION_BY_ALIAS: ReadonlyMap<string, AppDestinationDefinition> = (() => {
  const index = new Map<string, AppDestinationDefinition>()

  for (const definition of APP_DESTINATIONS) {
    for (const alias of [
      ...definition.aliases.en,
      ...definition.aliases.zh,
      ...definition.aliases.pinyin
    ]) {
      const key = normalizeAppDestinationQuery(alias)
      if (!key) {
        throw new Error(`App destination "${definition.id}" declares an empty alias`)
      }

      const existing = index.get(key)
      if (existing && existing.id !== definition.id) {
        throw new Error(
          `Duplicate app destination alias "${alias}" normalizes to "${key}", already owned by "${existing.id}"`
        )
      }

      index.set(key, definition)
    }
  }

  return index
})()

export function isAppDestinationId(value: unknown): value is AppDestinationId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DESTINATION_BY_ID, value)
}

export function getAppDestination(id: AppDestinationId): AppDestinationDefinition {
  if (!isAppDestinationId(id)) {
    throw new Error(`Unknown app destination id: ${String(id)}`)
  }

  return DESTINATION_BY_ID[id]
}

export function resolveAppDestinationQuery(value: string): AppDestinationDefinition | null {
  const key = normalizeAppDestinationQuery(value)
  if (!key) {
    return null
  }

  return DESTINATION_BY_ALIAS.get(key) ?? null
}
