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
    listItemStagger: false,
    resultTransition: false,
    coreBoxResize: false,
    autoDisableOnLowBattery: true,
    lowBatteryThreshold: 20,
  },
  viewCache: {
    maxCachedViews: 4,
    hotCacheDurationMs: 120000,
  },
  background: {
    /** 背景图来源: 'none' | 'bing' | 'custom' | 'folder' | 'desktop' */
    source: 'none' as 'none' | 'bing' | 'custom' | 'folder' | 'desktop',
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
