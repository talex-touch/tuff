import { TouchStorage, createStorageProxy } from '.';
import { appSettingOriginData, StorageList, type AppSetting } from '../..';

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
 * // Access after initStorageChannel()
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
    super(StorageList.APP_SETTING, JSON.parse(JSON.stringify(appSettingOriginData)));
    this.setAutoSave(true);
  }
}

/**
 * Global instance of the application settings
 */
const APP_SETTINGS_SINGLETON_KEY = `storage:${StorageList.APP_SETTING}`;

/**
 * Lazy-initialized application settings.
 * The actual instance is created only when first accessed AND after initStorageChannel() is called.
 */
export const appSettings = createStorageProxy<AppSettingsStorage>(
  APP_SETTINGS_SINGLETON_KEY,
  () => new AppSettingsStorage()
);
