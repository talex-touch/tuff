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
  },
  lang: {
    followSystem: true,
    locale: 0,
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
};

export const appSettingOriginData = Object.freeze(_appSettingOriginData)

/**
 * Type definition for application settings.
 *
 * Combines the default configuration with support for dynamic additional properties.
 */
export type AppSetting = typeof _appSettingOriginData & {
  [key: string]: any;
};