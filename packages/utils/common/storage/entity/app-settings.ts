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
  dev: {
    autoCloseDev: true,
    authServer: 'production' as 'production' | 'local',
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
  beginner: {
    init: false,
  },
  tools: {
    autoPaste: {
      enable: true,
      time: 180,
    },
    autoHide: true,
    autoClear: 600,
  },
  dashboard: {
    enable: false,
  },
  searchEngine: {
    logsEnabled: false,
  },
  diagnostics: {
    verboseLogs: false,
  },
  recommendation: {
    enabled: true,
    maxItems: 10,
    showReason: true,
  },
  animation: {
    listItemStagger: true,
    resultTransition: true,
    coreBoxResize: false,
    autoDisableOnLowBattery: true,
    lowBatteryThreshold: 20,
  },
  viewCache: {
    maxCachedViews: 4,
    hotCacheDurationMs: 120000,
  },
  background: {
    /** 背景图来源: 'bing' | 'custom' | 'none' */
    source: 'bing' as 'bing' | 'custom' | 'none',
    /** 自定义背景图路径 */
    customPath: '',
    /** 背景图模糊度 0-20 */
    blur: 0,
    /** 背景图透明度 0-100 */
    opacity: 100,
  },
  coreBox: {
    /** 自定义 placeholder 文本，空则使用默认 */
    customPlaceholder: '',
  },
  window: {
    closeToTray: true,
    startMinimized: false,
    startSilent: false,
  },
  setup: {
    accessibility: false,
    notifications: false,
    autoStart: false,
    showTray: true,
    adminPrivileges: false,
    hideDock: false,
    runAsAdmin: false,
    customDesktop: false,
  },
  layout: 'simple',
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
