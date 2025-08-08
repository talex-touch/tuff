# Plugin Storage (Plugins)

The `Tuff` provides a unified storage API that allows plugins to persist data locally. This guide explains how to use the storage system in your plugins.

## Storage Types

The plugin storage system supports different types of storage with varying scopes and persistence:

### 1. Plugin Storage

Plugin storage is isolated to each individual plugin and persists between application sessions.

::: code-group

```javascript [Plugin Storage]
// In your plugin's main file or preload script
import { storage } from '@polyglot-toolbox/plugin-sdk';

// Set a value in plugin storage
await storage.set('user-preference', 'dark-mode');

// Get a value from plugin storage
const preference = await storage.get('user-preference');
console.log(preference); // 'dark-mode'

// Remove a value from plugin storage
await storage.remove('user-preference');

// Clear all plugin storage
await storage.clear();
```

:::

### 2. Global Storage

Global storage is shared across all plugins and the core application.

::: code-group

```javascript [Global Storage]
// Set a value in global storage
await storage.setGlobal('app-theme', 'blue');

// Get a value from global storage
const theme = await storage.getGlobal('app-theme');
console.log(theme); // 'blue'

// Remove a value from global storage
await storage.removeGlobal('app-theme');

// Clear all global storage
await storage.clearGlobal();
```

:::

### 3. Session Storage

Session storage is temporary and is cleared when the application is closed.

::: code-group

```javascript [Session Storage]
// Set a value in session storage
await storage.setSession('temp-data', { temp: true });

// Get a value from session storage
const tempData = await storage.getSession('temp-data');
console.log(tempData); // { temp: true }

// Remove a value from session storage
await storage.removeSession('temp-data');

// Clear all session storage
await storage.clearSession();
```

:::

## Basic Storage Operations

### Setting Values

You can store various types of data including strings, numbers, booleans, arrays, and objects:

::: code-group

```javascript [Storing Various Data Types]
// Store a string
await storage.set('username', 'john_doe');

// Store a number
await storage.set('login-count', 5);

// Store a boolean
await storage.set('notifications-enabled', true);

// Store an array
await storage.set('recent-files', ['/file1.txt', '/file2.txt']);

// Store an object
await storage.set('user-settings', {
  theme: 'dark',
  language: 'en',
  autosave: true
});
```

:::

### Getting Values

Retrieve stored values with optional default values:

::: code-group

```javascript [Retrieving Values]
// Get a value
const username = await storage.get('username');
console.log(username); // 'john_doe'

// Get a value with a default
const language = await storage.get('language', 'en');
console.log(language); // 'en' if 'language' is not set

// Get a value and handle the case where it doesn't exist
const userSettings = await storage.get('user-settings');
if (userSettings) {
  console.log('User settings:', userSettings);
} else {
  console.log('No user settings found');
}
```

:::

### Removing Values

Remove specific values from storage:

::: code-group

```javascript [Removing Values]
// Remove a single value
await storage.remove('username');

// Remove multiple values
await storage.remove(['username', 'login-count', 'notifications-enabled']);
```

:::

### Checking for Values

Check if a key exists in storage:

::: code-group

```javascript [Checking for Values]
// Check if a key exists
const hasUsername = await storage.has('username');
console.log(hasUsername); // true or false
```

:::

### Listing Keys

Get a list of all keys in storage:

::: code-group

```javascript [Listing Keys]
// Get all keys in plugin storage
const keys = await storage.keys();
console.log(keys); // ['username', 'login-count', 'notifications-enabled', ...]

// Get all keys in global storage
const globalKeys = await storage.keysGlobal();
console.log(globalKeys); // ['app-theme', ...]
```

:::

## Advanced Storage Features

### Namespaced Storage

For better organization, you can create namespaced storage instances:

::: code-group

```javascript [Namespaced Storage]
// Create a namespaced storage instance
const userStorage = storage.namespace('user');

// Use the namespaced storage
await userStorage.set('name', 'John Doe');
await userStorage.set('email', 'john@example.com');

const name = await userStorage.get('name');
console.log(name); // 'John Doe'

// The keys are prefixed with the namespace
const userKeys = await userStorage.keys();
console.log(userKeys); // ['user:name', 'user:email']
```

:::

### Storage Events

Listen for storage changes to react when data is modified:

::: code-group

```javascript [Storage Events]
// Listen for changes to a specific key
storage.on('user-preference', (newValue, oldValue) => {
  console.log('User preference changed from', oldValue, 'to', newValue);
  // Update UI based on the new preference
});

// Listen for all storage changes
storage.onAny((key, newValue, oldValue) => {
  console.log('Storage key', key, 'changed from', oldValue, 'to', newValue);
});

// Remove a listener
storage.off('user-preference', listenerFunction);

// Remove all listeners
storage.offAll();
```

:::

### Batch Operations

Perform multiple storage operations atomically:

::: code-group

```javascript [Batch Operations]
// Batch set multiple values
await storage.batchSet({
  'username': 'jane_doe',
  'last-login': new Date().toISOString(),
  'login-count': 10
});

// Batch get multiple values
const values = await storage.batchGet(['username', 'last-login', 'login-count']);
console.log(values);
// {
//   'username': 'jane_doe',
//   'last-login': '2023-10-15T14:30:00Z',
//   'login-count': 10
// }
```

:::

## Storage Best Practices

When using storage in your plugin, consider the following best practices:

### 1. Use Appropriate Storage Types

Choose the right storage type for your data:

::: code-group

```javascript [Use Appropriate Storage Types]
// Good - Using plugin storage for plugin-specific settings
await storage.set('plugin-setting', 'value');

// Good - Using global storage for application-wide settings
await storage.setGlobal('app-theme', 'dark');

// Good - Using session storage for temporary data
await storage.setSession('clipboard-content', 'copied text');
```

:::

### 2. Handle Storage Errors Gracefully

Always handle potential storage errors:

::: code-group

```javascript [Handle Storage Errors Gracefully]
// Good - Handling errors
try {
  await storage.set('user-data', userData);
  console.log('User data saved successfully');
} catch (error) {
  console.error('Failed to save user data:', error);
  // Show user-friendly error message
  toast.error('Failed to save user data. Please try again.');
}

// Avoid - Not handling errors
await storage.set('user-data', userData); // This could fail silently
```

:::

### 3. Use Namespaces for Organization

Organize your storage keys with namespaces to avoid conflicts:

::: code-group

```javascript [Use Namespaces for Organization]
// Good - Using namespaces
const editorStorage = storage.namespace('editor');
await editorStorage.set('font-size', 14);
await editorStorage.set('line-height', 1.5);

// Avoid - Flat key structure
await storage.set('editor-font-size', 14);
await storage.set('editor-line-height', 1.5);
```

:::

### 4. Clean Up Unused Data

Remove data that is no longer needed to keep storage clean:

::: code-group

```javascript [Clean Up Unused Data]
// Good - Cleaning up temporary data
async function processFile(file) {
  // Store temporary data
  await storage.setSession('processing-file', file.path);
  
  try {
    // Process the file
    const result = await processFileContent(file.content);
    return result;
  } finally {
    // Clean up temporary data
    await storage.removeSession('processing-file');
  }
}
```

:::

### 5. Be Mindful of Storage Limits

While the storage system can handle significant amounts of data, be mindful of limits:

::: code-group

```javascript [Be Mindful of Storage Limits]
// Good - Checking storage size for large data
const largeData = generateLargeDataset();

if (JSON.stringify(largeData).length > 10 * 1024 * 1024) { // 10MB
  console.warn('Large data detected. Consider using file storage instead.');
  // Save to file instead of storage
  await saveToFile(largeData);
} else {
  await storage.set('large-data', largeData);
}
```

:::

## Example: User Preferences Plugin

Here's a complete example of a plugin that uses storage to manage user preferences:

::: code-group

```javascript [User Preferences Plugin Example]
// plugin.js
import { storage, toast } from '@polyglot-toolbox/plugin-sdk';

class UserPreferencesPlugin {
  constructor() {
    this.preferences = {};
    this.init();
  }
  
  async init() {
    // Load preferences from storage
    await this.loadPreferences();
    
    // Set up UI event listeners
    this.setupEventListeners();
    
    // Listen for preference changes
    storage.onAny((key, newValue) => {
      if (key.startsWith('user-preferences:')) {
        this.handlePreferenceChange(key, newValue);
      }
    });
  }
  
  async loadPreferences() {
    try {
      // Load preferences from storage
      this.preferences = await storage.get('user-preferences', {});
      console.log('Loaded preferences:', this.preferences);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      toast.error('Failed to load user preferences');
    }
  }
  
  setupEventListeners() {
    // Example UI elements
    const themeSelector = document.getElementById('theme-selector');
    const fontSizeInput = document.getElementById('font-size-input');
    const autosaveToggle = document.getElementById('autosave-toggle');
    
    if (themeSelector) {
      themeSelector.addEventListener('change', (event) => {
        this.setPreference('theme', event.target.value);
      });
    }
    
    if (fontSizeInput) {
      fontSizeInput.addEventListener('change', (event) => {
        this.setPreference('fontSize', parseInt(event.target.value, 10));
      });
    }
    
    if (autosaveToggle) {
      autosaveToggle.addEventListener('change', (event) => {
        this.setPreference('autosave', event.target.checked);
      });
    }
  }
  
  async setPreference(key, value) {
    try {
      // Update local preferences object
      this.preferences[key] = value;
      
      // Save to storage
      await storage.set('user-preferences', this.preferences);
      
      console.log(`Preference ${key} set to ${value}`);
      
      // Apply the preference
      this.applyPreference(key, value);
    } catch (error) {
      console.error(`Failed to set preference ${key}:`, error);
      toast.error(`Failed to save preference: ${key}`);
    }
  }
  
  handlePreferenceChange(key, newValue) {
    const preferenceKey = key.replace('user-preferences:', '');
    console.log(`Preference ${preferenceKey} changed to ${newValue}`);
    
    // Apply the preference change
    this.applyPreference(preferenceKey, newValue);
  }
  
  applyPreference(key, value) {
    switch (key) {
      case 'theme':
        document.body.className = `theme-${value}`;
        break;
      case 'fontSize':
        document.documentElement.style.fontSize = `${value}px`;
        break;
      case 'autosave':
        // Enable or disable autosave feature
        this.toggleAutosave(value);
        break;
      default:
        console.log(`Unhandled preference: ${key}`);
    }
  }
  
  toggleAutosave(enabled) {
    if (enabled) {
      console.log('Autosave enabled');
      // Implement autosave logic
    } else {
      console.log('Autosave disabled');
      // Disable autosave logic
    }
  }
  
  async resetPreferences() {
    try {
      await storage.remove('user-preferences');
      this.preferences = {};
      console.log('Preferences reset');
      toast.info('Preferences have been reset to default values');
      
      // Apply default preferences
      this.applyPreference('theme', 'light');
      this.applyPreference('fontSize', 16);
      this.applyPreference('autosave', true);
    } catch (error) {
      console.error('Failed to reset preferences:', error);
      toast.error('Failed to reset preferences');
    }
  }
}

// Initialize the plugin
new UserPreferencesPlugin();
```

:::

This plugin demonstrates proper use of the storage system by:
1. Loading preferences on initialization
2. Saving preferences when they change
3. Listening for storage changes from other parts of the application
4. Handling errors gracefully
5. Cleaning up and organizing data with namespaces
6. Applying preferences to the UI

For more information about the plugin SDK and available APIs, see the [Plugin SDK documentation](/docs/plugins/introduction).