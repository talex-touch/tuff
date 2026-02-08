import type { CoreBoxThemeConfig, LayoutAtomConfig } from './layout-atom-types'

/** Default layout atom for 'simple' preset */
const defaultLayoutAtomSimple: LayoutAtomConfig = {
  preset: 'simple',
  header: { border: 'solid', opacity: 1, height: 26, blur: false },
  aside: { position: 'left', width: 68, border: 'solid', opacity: 0.5, collapsed: false },
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
  security: {
    /**
     * 本地随机种子，用于生成 machine_code_hash。
     * 只存本地；用户清空应用数据后自然会重置（符合“删除数据即删除机器码”语义）。
     */
    machineSeed: '',
    /**
     * 最近一次已上报的 machine_code_hash（用于避免重复上报）。
     * 注意：这是 hash（摘要），不含原始硬件信息。
     */
    machineCodeHash: '',
    /**
     * 最近一次上报时间（ISO 字符串，可选，仅用于调试/排查）。
     */
    machineCodeAttestedAt: '',
    /**
     * 明文 seed 迁移完成时间（用于排查历史版本遗留）。
     */
    machineSeedMigratedAt: '',
    /**
     * 安全回退开关：当系统安全存储不可用时，是否允许继续使用明文 seed。
     * 默认关闭，避免退回不安全路径。
     */
    allowLegacyMachineSeedFallback: false,
  },
  tools: {
    autoPaste: {
      enable: true,
      time: 180,
    },
    autoHide: true,
    autoClear: 600,
    clipboardPolling: {
      interval: 5,
      lowBatteryPolicy: {
        enable: true,
        interval: 10,
      },
    },
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
  layoutAtomConfig: defaultLayoutAtomSimple,
  coreBoxThemeConfig: defaultCoreBoxTheme,
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
