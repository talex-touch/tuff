export enum StorageList {
  APP_SETTING = 'app-setting.ini',
  SHORTCUT_SETTING = 'shortcut-setting.ini'
}

/**
 * Defines keys for the global configuration stored in the database `config` table.
 * Using an enum prevents magic strings and ensures consistency across the application.
 */
export enum ConfigKeys {
  /**
   * Stores the timestamp of the last successful full application scan using mdfind.
   * This is used to schedule the next comprehensive scan.
   */
  APP_PROVIDER_LAST_MDFIND_SCAN = 'app_provider_last_mdfind_scan'
}