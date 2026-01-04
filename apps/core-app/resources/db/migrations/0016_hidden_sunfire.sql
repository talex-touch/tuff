ALTER TABLE `plugin_analytics` ADD COLUMN `plugin_version` text;
CREATE INDEX `idx_plugin_analytics_plugin_version_time` ON `plugin_analytics` (`plugin_name`, `plugin_version`, `timestamp`);
