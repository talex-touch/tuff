# Plugin Permissions (Plugins)

The `Polyglot Toolbox` implements a permission system to ensure that plugins can only access the resources and features they need, enhancing security and user control. This guide explains how plugin permissions work and how to request and manage them.

## Permission Model

The permission system is based on a declarative model where plugins must declare the permissions they require in their manifest file. Users can then grant or deny these permissions when installing or configuring the plugin.

## Requesting Permissions

Plugins must declare their required permissions in the `manifest.json` file. Here's an example of how to request permissions:

::: code-group

```json [Permission Request Example]
{
  "name": "File Access Plugin",
  "version": "1.0.0",
  "permissions": [
    "file-system.read",
    "file-system.write",
    "network.access"
  ]
}
```

:::

### Common Permission Types

1. **File System Permissions**
   - `file-system.read`: Read access to files and directories
   - `file-system.write`: Write access to files and directories
   - `file-system.delete`: Delete files and directories

2. **Network Permissions**
   - `network.access`: Access to the internet and external APIs
   - `network.local`: Access to local network resources

3. **System Permissions**
   - `system.clipboard`: Access to the system clipboard
   - `system.notifications`: Ability to show system notifications
   - `system.storage`: Access to application storage

4. **User Data Permissions**
   - `user-data.read`: Read access to user data
   - `user-data.write`: Write access to user data

## Checking Permissions at Runtime

Plugins can check if they have been granted specific permissions at runtime:

::: code-group

```javascript [Checking Permissions at Runtime]
// In your plugin's main file or preload script
import { permissions } from '@polyglot-toolbox/plugin-sdk';

// Check if a permission is granted
if (permissions.has('file-system.read')) {
  // Perform file read operations
  readFile('/path/to/file.txt');
} else {
  // Request the permission or handle the lack of permission gracefully
  console.log('Permission to read files is not granted');
}
```

:::

## Requesting Permissions Dynamically

In some cases, a plugin may need to request permissions dynamically during runtime:

::: code-group

```javascript [Requesting Permissions Dynamically]
// In your plugin's main file or preload script
import { permissions } from '@polyglot-toolbox/plugin-sdk';

async function requestFileAccess() {
  try {
    const granted = await permissions.request('file-system.read');
    if (granted) {
      console.log('File read permission granted');
      // Proceed with file operations
    } else {
      console.log('File read permission denied');
      // Handle the denial gracefully
    }
  } catch (error) {
    console.error('Error requesting permission:', error);
  }
}
```

:::

## Permission Best Practices

When working with permissions in your plugin, consider the following best practices:

### 1. Request Only Necessary Permissions

Only request the permissions that your plugin actually needs to function. Avoid requesting broad permissions if specific ones will suffice.

::: code-group

```json [Good Example]
// Good - Requesting specific permissions
{
  "permissions": [
    "file-system.read"
  ]
}
```

```json [Avoid Example]
// Avoid - Requesting broad permissions
{
  "permissions": [
    "file-system.read",
    "file-system.write",
    "file-system.delete"
  ]
}
```

:::

### 2. Explain Why Permissions Are Needed

Provide clear explanations in your plugin's documentation about why certain permissions are required. This helps users understand and trust your plugin.

### 3. Handle Permission Denials Gracefully

Always check for permissions before using protected features and handle cases where permissions are denied.

::: code-group

```javascript [Good Example]
// Good - Checking permissions and handling denials
if (permissions.has('network.access')) {
  fetchDataFromAPI();
} else {
  showUserMessage('This feature requires internet access. Please grant network permission in settings.');
}
```

```javascript [Avoid Example]
// Avoid - Not checking permissions
fetchDataFromAPI(); // This might fail if permission is not granted
```

:::

### 4. Request Permissions at the Right Time

Request permissions when the user is about to use a feature that requires them, not during plugin initialization.

::: code-group

```javascript [Good Example]
// Good - Requesting permission when needed
document.getElementById('sync-button').addEventListener('click', async () => {
  if (!permissions.has('network.access')) {
    const granted = await permissions.request('network.access');
    if (!granted) return;
  }
  syncData();
});
```

```javascript [Avoid Example]
// Avoid - Requesting permission immediately
permissions.request('network.access'); // Requested as soon as the plugin loads
```

:::

## Permission Manifest Structure

The `permissions` field in the manifest file supports both simple string declarations and more detailed object declarations for complex permission requirements.

### Simple Permission Declaration

::: code-group

```json [Simple Permission Declaration]
{
  "permissions": [
    "file-system.read",
    "network.access"
  ]
}
```

:::

### Detailed Permission Declaration

::: code-group

```json [Detailed Permission Declaration]
{
  "permissions": [
    {
      "name": "file-system.read",
      "description": "Read access to user documents",
      "required": true
    },
    {
      "name": "network.access",
      "description": "Access to cloud storage API",
      "required": false
    }
  ]
}
```

:::

In the detailed declaration:
- `name`: The permission identifier
- `description`: A user-friendly description of what the permission is for
- `required`: Whether the permission is essential for the plugin to function

## User Permission Management

Users can manage plugin permissions through the application's settings interface:

1. Go to Settings > Plugins
2. Select the plugin you want to manage
3. Click on "Permissions" or "Manage Permissions"
4. Grant or revoke specific permissions

Users will also be prompted to grant permissions when installing a plugin that requests them.

## Example: Secure File Access Plugin

Here's a complete example of a plugin that properly handles file system permissions:

::: code-group

```javascript [Secure File Access Plugin]
// plugin.js
import { permissions } from '@polyglot-toolbox/plugin-sdk';

class SecureFileAccessPlugin {
  constructor() {
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    document.getElementById('open-file-btn').addEventListener('click', () => {
      this.openFile();
    });
    
    document.getElementById('save-file-btn').addEventListener('click', () => {
      this.saveFile();
    });
  }
  
  async openFile() {
    // Check if we have read permission
    if (!permissions.has('file-system.read')) {
      // Request the permission
      const granted = await permissions.request('file-system.read');
      if (!granted) {
        alert('File read permission is required to open files.');
        return;
      }
    }
    
    // Proceed with file opening
    try {
      const fileContent = await this.readFile('/path/to/file.txt');
      console.log('File content:', fileContent);
    } catch (error) {
      console.error('Error reading file:', error);
    }
  }
  
  async saveFile() {
    // Check if we have write permission
    if (!permissions.has('file-system.write')) {
      // Request the permission
      const granted = await permissions.request('file-system.write');
      if (!granted) {
        alert('File write permission is required to save files.');
        return;
      }
    }
    
    // Proceed with file saving
    try {
      await this.writeFile('/path/to/file.txt', 'Hello, world!');
      console.log('File saved successfully');
    } catch (error) {
      console.error('Error saving file:', error);
    }
  }
  
  readFile(path) {
    // Implementation for reading a file
    // This would use the plugin SDK's file system APIs
    return new Promise((resolve, reject) => {
      // Simulated file read
      setTimeout(() => {
        resolve('File content');
      }, 100);
    });
  }
  
  writeFile(path, content) {
    // Implementation for writing a file
    // This would use the plugin SDK's file system APIs
    return new Promise((resolve, reject) => {
      // Simulated file write
      setTimeout(() => {
        resolve();
      }, 100);
    });
  }
}

// Initialize the plugin
new SecureFileAccessPlugin();
```

:::

This plugin demonstrates proper permission handling by:
1. Declaring required permissions in the manifest
2. Checking for permissions before using protected features
3. Requesting permissions dynamically when needed
4. Handling permission denials gracefully

For more information about the plugin SDK and available APIs, see the [Plugin SDK documentation](/docs/plugins/introduction).