# Plugins

## What are Plugins?

Tuff is a flexible framework that can be extended through plugins. Plugins allow you to customize and enhance your experience.

When the program is running, it automatically creates a `tuff` directory for plugin storage. To create a new plugin, simply click `Plugins` in the application interface and then click `+ Create One`. The application will automatically set up the development environment for you.

To ensure your plugin is loaded correctly, you need to provide at least an `index.html` file and an `init.json` file (which will be exported as `manifest.json`).

> **Important**: Your plugin name must match the `name` field in `init.json` and must not contain the words "talex" or "touch", or it will be disabled.

## Plugin Architecture

Plugins in `Tuff` follow a specific architecture that allows them to integrate seamlessly with the main application:

1. **Manifest File** (`init.json`): Contains metadata about the plugin, including its name, version, description, and icon.
2. **Main Entry Point** (`index.html`): The primary HTML file that defines the plugin's user interface.
2. **Preload Script** (`preload.js`): Optional script that runs before the main plugin code, providing access to secure APIs.
3. **Assets**: Additional files such as CSS, images, and other resources.

## Creating Your First Plugin

Here's a step-by-step guide to creating a simple plugin:

### 1. Set Up the Plugin Structure

When you create a new plugin through the application interface, it will automatically generate a basic structure for you:

```
my-plugin/
  init.json
  index.html
  preload.js (optional)
  README.md
```

### 2. Configure the Manifest File

The `init.json` file contains essential information about your plugin:

::: code-group

```json [init.json]
{
  "name": "my-first-plugin",
  "version": "1.0.0",
  "icon": {
    "type": "remix",
    "value": "star"
  },
  "description": "My first plugin for Tuff",
  "author": "Your Name",
  "repository": "https://github.com/yourusername/my-first-plugin"
}
```

:::

### 3. Create the Main Interface

The `index.html` file defines your plugin's user interface:

::: code-group

```html [index.html]
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline';" />
    <title>My First Plugin</title>
    <style>
      body {
        font-family: var(--theme-font-family, Arial, sans-serif);
        background-color: var(--theme-background, #ffffff);
        color: var(--theme-text, #000000);
        padding: 20px;
      }

      .container {
        max-width: 600px;
        margin: 0 auto;
      }

      .header {
        text-align: center;
        margin-bottom: 30px;
      }

      .feature-list {
        background-color: var(--theme-surface, #f5f5f5);
        padding: 20px;
        border-radius: 8px;
      }

      .feature-list h3 {
        margin-top: 0;
      }

      .feature-list ul {
        padding-left: 20px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Welcome to My First Plugin</h1>
        <p>This is a simple demonstration of a Tuff plugin.</p>
      </div>

      <div class="feature-list">
        <h3>Plugin Features</h3>
        <ul>
          <li>Simple HTML interface</li>
          <li>Theming support</li>
          <li>Responsive design</li>
        </ul>
      </div>
    </div>
  </body>
</html>
```

:::

### 4. Add Functionality with Preload Script

The `preload.js` file allows you to add functionality to your plugin by accessing secure APIs:

::: code-group

```javascript [preload.js]
// preload.js

// Example: Accessing plugin storage
const pluginStorage = window.pluginAPI.storage;

// Example: Listening to application events
window.pluginAPI.events.on('app-resumed', () => {
  console.log('Application resumed');
});

// Example: Adding a custom function
window.myPlugin = {
  greet: (name) => {
    return `Hello, ${name}! Welcome to my plugin.`;
  }
};
```

:::

## Plugin Development Workflow

The plugin development workflow in `Tuff` is designed to be efficient and developer-friendly:

1. **Automatic Reloading**: When you modify any plugin file (`init.json`, `index.html`, `preload.js`, or `README.md`) and save it, the plugin will automatically reload to reflect your changes.

2. **Live Preview**: You can see your changes in real-time without restarting the application.

3. **Error Handling**: The application provides clear error messages to help you debug issues with your plugin.

## Plugin Launch Contexts

Your plugin can be launched from different contexts within the application:

- **Main Page**: Launched from the main application interface
- **Core-box Page**: Launched from the core-box interface

You can determine the launch context through parameters passed to your plugin (this is a beta feature that will be fully implemented in future versions).

## Plugin Activation and Lifecycle

### Activation Requirements

**Important**: Your plugin page can only be opened when the plugin is enabled. If the plugin is disabled, access will be denied.

However, the `preload.js` script executes regardless of the plugin's enabled state, allowing you to perform background tasks.

### Loading Behavior

**Note**: Plugins are only loaded when the user manually starts them, which helps optimize application performance by loading only the necessary components.

## Plugin Best Practices

When developing plugins for `Tuff`, consider the following best practices:

1. **Follow Security Guidelines**: Only request the permissions your plugin actually needs.
2. **Optimize Performance**: Keep your plugin lightweight and responsive.
3. **Respect User Privacy**: Handle user data responsibly and transparently.
4. **Provide Clear Documentation**: Include a comprehensive README file with usage instructions.
5. **Test Across Platforms**: Ensure your plugin works well on all supported platforms.
6. **Use Theming Variables**: Leverage CSS variables for consistent styling with the application theme.

## Next Steps

You've now completed this introduction to plugins. Click `Next Section` to learn more about advanced plugin development topics, including:

- Working with the Plugin SDK
- Creating custom UI components
- Handling user data and storage
- Implementing internationalization
- Publishing your plugin to the Plugin Market
