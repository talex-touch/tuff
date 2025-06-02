import { TouchStorage } from '.';
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
    super(StorageList.APP_SETTING, JSON.parse(JSON.stringify(appSettingOriginData)));
    this.setAutoSave(true);
  }
}

/**
 * Global instance of the application settings
 */
export const appSettings = new AppSettingsStorage();
