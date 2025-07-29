# Plugin Setup

This guide will walk you through the process of setting up and configuring plugins in the `Polyglot Toolbox`. Plugins are a powerful way to extend the functionality of the application.

## Installing a Plugin

There are several ways to install a plugin:

### From the Plugin Market

1. Open the Plugin Market from the main menu or by pressing `Ctrl+Shift+P`.
2. Browse or search for the plugin you want to install.
3. Click the "Install" button next to the plugin.
4. The plugin will be downloaded and installed automatically.

### From a Local File

1. Download the plugin package (usually a `.zip` file).
2. Open the Plugin Manager from the settings menu.
3. Click "Install from File".
4. Select the downloaded plugin package.
5. Follow the prompts to complete the installation.

### From a URL

1. Obtain the direct download URL for the plugin.
2. Open the Plugin Manager.
3. Click "Install from URL".
4. Paste the URL and click "Install".

## Enabling and Disabling Plugins

After installing a plugin, you may need to enable it:

1. Go to the "Plugins" section in Settings.
2. Find the plugin in the list.
3. Toggle the switch next to the plugin name to enable or disable it.

Disabled plugins will not load or run, but their configurations are preserved.

## Plugin Configuration

Many plugins offer configuration options to customize their behavior.

1. In the "Plugins" settings, find the plugin you want to configure.
2. Click on the plugin name or the "Configure" button.
3. Adjust the settings according to your preferences.
4. Click "Save" to apply the changes.

Example plugin configuration:
```json
{
  "pluginId": "example-plugin",
  "settings": {
    "apiKey": "your-api-key",
    "syncFrequency": "hourly",
    "notifications": true
  }
}
```

## Plugin Permissions

Plugins may request permissions to access certain features or data. You can manage these permissions:

1. Go to the "Plugins" section in Settings.
2. Click on "Permissions" or "Manage Permissions".
3. Review the permissions requested by each plugin.
4. Grant or deny permissions as needed.

Common permissions include:
- Access to files and folders
- Internet access
- Access to clipboard
- Access to system notifications

## Updating Plugins

Plugins can be updated to fix bugs or add new features.

### Automatic Updates

1. By default, plugins will automatically check for updates.
2. When an update is available, you'll receive a notification.
3. Click "Update" to install the latest version.

### Manual Updates

1. Open the Plugin Manager.
2. Click "Check for Updates".
3. If updates are available, they will be listed.
4. Select the plugins to update and click "Update Selected".

## Removing Plugins

To remove a plugin:

1. Go to the "Plugins" section in Settings.
2. Find the plugin you want to remove.
3. Click the "Remove" or "Uninstall" button.
4. Confirm the removal when prompted.

Note: Removing a plugin will delete its configuration and data.

## Troubleshooting Plugin Issues

If you encounter problems with a plugin, try these steps:

1. Check if the plugin is enabled.
2. Review the plugin's configuration settings.
3. Check the application logs for error messages related to the plugin.
4. Try disabling and re-enabling the plugin.
5. Ensure the plugin is up to date.
6. If the issue persists, consider removing and reinstalling the plugin.

For more detailed information about specific plugins, refer to their individual documentation pages.