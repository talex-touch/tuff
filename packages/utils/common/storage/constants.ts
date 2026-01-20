export enum StorageList {
  APP_SETTING = 'app-setting.ini',
  SHORTCUT_SETTING = 'shortcut-setting.ini',
  OPENERS = 'openers.json',
  FILE_INDEX_SETTINGS = 'file-index-settings.json',
  APP_INDEX_SETTINGS = 'app-index-settings.json',
  DEVICE_IDLE_SETTINGS = 'device-idle-settings.json',
  IntelligenceConfig = 'aisdk-config',
  MARKET_SOURCES = 'market-sources.json',
  THEME_STYLE = 'theme-style.ini',
  SEARCH_ENGINE_LOGS_ENABLED = 'search-engine-logs-enabled',
  EVERYTHING_SETTINGS = 'everything-settings.json',
  FLOW_CONSENT = 'flow-consent.json',
  SENTRY_CONFIG = 'sentry-config.json',
  NOTIFICATION_CENTER = 'notification-center.json',
  STARTUP_ANALYTICS = 'startup-analytics.json',
  STARTUP_ANALYTICS_REPORT_QUEUE = 'startup-analytics-report-queue.json',
  TELEMETRY_CLIENT = 'telemetry-client.json',
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
  APP_PROVIDER_LAST_MDFIND_SCAN = 'app_provider_last_mdfind_scan',
}
