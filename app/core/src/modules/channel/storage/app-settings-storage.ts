import { TouchStorage } from '@talex-touch/utils/renderer';

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

/**
 * Type definition for application settings.
 *
 * Combines the default configuration with support for dynamic additional properties.
 */
export type AppSetting = typeof _appSettingOriginData & {
  [key: string]: any;
};

/**
 * Application settings storage manager
 *
 * Manages application configuration using `TouchStorage`, providing reactive data
 * and automatic persistence.
 *
 * @example
 * ```ts
 * import { appSettings } from './app-settings-storage';
 *
 * // Read a setting
 * const isAutoStart = appSettings.data.autoStart;
 *
 * // Modify a setting (auto-saved)
 * appSettings.data.autoStart = true;
 * ```
 */
class AppSettingsStorage extends TouchStorage<AppSetting> {
  /**
   * Initializes a new instance of the AppSettingsStorage class
   */
  constructor() {
    super('app-setting.ini', _appSettingOriginData);
    this.setAutoSave(true);
  }
}

/**
 * Global instance of the application settings
 */
export const appSettings = new AppSettingsStorage();
