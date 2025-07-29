# The `Preload.js` Script (Plugins)

> **Warning**: We have moved `InjectionCode` into the official standard library. Plugins must now use our standard library for proper integration.

## What is Preload.js?

The `preload.js` script is a special file that runs before your plugin's main HTML content is loaded. It provides a secure way to expose specific APIs and functionality to your plugin while maintaining the security boundaries of the application.

You can use `preload.js` to perform necessary tasks before loading the extension plugin, such as:

- Starting background services or servers
- Pre-processing data
- Setting up event listeners
- Initializing plugin-specific configurations

**Important**: Starting from version 2.0.0, your pre-processing operations require explicit user permissions and proper file declarations. This includes, but is not limited to, network services, storage access, and launching external programs.

## Creating a Preload Script

To create a preload script for your plugin:

1. Open your `Plugin Folder`
2. Create a `preload.js` file in the root directory
3. Start coding your initialization logic

## Installing the Standard Library

`Polyglot Toolbox` provides an official standard library to create a secure bridge between plugins and the main application.

::: code-group

```bash [Ni (Recommended)]
ni @talex-touch/utils
```

```bash [pnpm (Official)]
pnpm install @talex-touch/utils
```

```bash [npm]
npm install @talex-touch/utils
```

:::

## Basic Preload Script Example

Here's a basic example of a `preload.js` script:

```javascript
// preload.js
const { ipcRenderer } = require('electron');
const { init } = require('@talex-touch/utils');
const path = require('path');
const child_process = require('child_process');

// Initialize the bridge between plugin and app
init(window);

// Listen for the plugin loaded event
ipcRenderer.once('@plugin-loaded', () => {
  setTimeout(async () => {
    // Access plugin information
    const { $plugin: plugin } = global;
    console.log("Plugin loaded!", plugin);

    // Example: Start a background API server
    try {
      const apiServer = window.$server = child_process.fork(
        path.resolve(plugin.path.relative, "api", "app.js"),
        {
          cwd: path.join(plugin.path.relative, "api"),
        }
      );
      console.log("API server started!");
    } catch (error) {
      console.error("Failed to start API server:", error);
    }

    // Example: Set up event listeners
    ipcRenderer.on('@plugin-resumed', () => {
      console.log("Plugin resumed");
    });

    ipcRenderer.on('@plugin-paused', () => {
      console.log("Plugin paused");
    });
  }, 100); // Small delay to ensure everything is ready
});
```

## Advanced Preload Script Example

Here's a more advanced example that demonstrates additional capabilities:

```javascript
// preload.js
const { ipcRenderer } = require('electron');
const { init } = require('@talex-touch/utils');
const path = require('path');

// Initialize the bridge
init(window);

// Create a custom API for the plugin
window.myPluginAPI = {
  // Example: Get plugin information
  getPluginInfo: () => {
    const { $plugin: plugin } = global;
    return {
      name: plugin.name,
      version: plugin.version,
      path: plugin.path.relative
    };
  },

  // Example: Send a message to the main process
  sendMessage: (channel, data) => {
    ipcRenderer.send(channel, data);
  },

  // Example: Listen for messages from the main process
  onMessage: (channel, callback) => {
    ipcRenderer.on(channel, (event, data) => {
      callback(data);
    });
  }
};

// Listen for the plugin loaded event
ipcRenderer.once('@plugin-loaded', () => {
  console.log("Plugin loaded and preload script executed");
  
  // Example: Load plugin configuration
  const pluginConfig = window.myPluginAPI.getPluginInfo();
  console.log("Plugin configuration:", pluginConfig);
  
  // Example: Set up a periodic task
  const interval = setInterval(() => {
    console.log("Plugin heartbeat");
  }, 60000); // Every minute
  
  // Store the interval ID for cleanup
  window.pluginHeartbeatInterval = interval;
});

// Listen for plugin unload event for cleanup
ipcRenderer.once('@plugin-unloaded', () => {
  console.log("Plugin unloading, cleaning up resources");
  
  // Clean up periodic tasks
  if (window.pluginHeartbeatInterval) {
    clearInterval(window.pluginHeartbeatInterval);
  }
  
  // Clean up event listeners
  ipcRenderer.removeAllListeners('@plugin-resumed');
  ipcRenderer.removeAllListeners('@plugin-paused');
});
```

## Preload Script Lifecycle

Understanding the lifecycle of a preload script is crucial for proper plugin development:

1. **Initialization**: The `preload.js` script is loaded and executed when the plugin is initialized.
2. **@plugin-loaded Event**: This event fires when the plugin is loaded but before the UI is displayed.
3. **Execution**: Your initialization code runs during this phase.
4. **@plugin-unloaded Event**: This event fires when the plugin is being unloaded, allowing for cleanup.

## Available Events

The preload script can listen for various events to respond to plugin lifecycle changes:

- `@plugin-loaded`: Fired when the plugin is loaded
- `@plugin-unloaded`: Fired when the plugin is being unloaded
- `@plugin-resumed`: Fired when the plugin is resumed (e.g., when the window is focused)
- `@plugin-paused`: Fired when the plugin is paused (e.g., when the window loses focus)

For a complete list of available events and their usage, see the [Events documentation](/docs/plugins/api/event).

## Security Considerations

When writing preload scripts, keep the following security considerations in mind:

1. **Limited Access**: Preload scripts have limited access to Node.js APIs for security reasons.
2. **Permission Requirements**: Certain operations require explicit user permissions.
3. **Context Isolation**: Preload scripts run in a separate context from the main renderer process.
4. **Data Validation**: Always validate data received from the main process.

## Available Node.js Modules

You can use a subset of Node.js modules in your preload script. Commonly available modules include:

- `path`: For working with file paths
- `fs`: For file system operations (with proper permissions)
- `child_process`: For spawning child processes (with proper permissions)
- `os`: For operating system-related utility methods
- `crypto`: For cryptographic functionality
- `buffer`: For working with binary data

For a complete list of available modules and their usage, refer to the project's `package.json` file.

## Best Practices

When developing preload scripts, consider the following best practices:

1. **Keep It Lightweight**: Preload scripts should execute quickly to avoid delaying plugin loading.
2. **Handle Errors Gracefully**: Use try-catch blocks to handle potential errors.
3. **Clean Up Resources**: Always clean up event listeners and intervals in the `@plugin-unloaded` event.
4. **Use Asynchronous Operations**: Prefer asynchronous operations to avoid blocking the main thread.
5. **Document Your API**: Clearly document any functions you expose to the main plugin code.
6. **Test Thoroughly**: Test your preload script under various conditions and edge cases.

## Next Steps

Now that you understand how to use preload scripts, you can:

- Explore the [Plugin API documentation](/docs/plugins/api/event) for available APIs
- Learn about [Plugin Events](/docs/plugins/events) to handle various plugin lifecycle events
- Check out the [Plugin Storage](/docs/plugins/storage) documentation to persist data
- Review the [Plugin Permissions](/docs/plugins/permission) guide to understand how to request and use permissions
