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
  recommendation: {
    enabled: true,
    maxItems: 10,
    showReason: true,
  },
  animation: {
    /** CoreBox 列表项入场动画 */
    listItemStagger: true,
    /** 结果切换过渡动画 */
    resultTransition: true,
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
