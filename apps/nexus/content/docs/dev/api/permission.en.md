# Permission System

## Overview
The plugin permission system controls access to sensitive resources and APIs. Starting from SDK API version `251212`, all permission declarations are enforced.

## Introduction
Permissions follow a least-privilege model and pair `permissions` with `permissionReasons` to explain intent to users.

## Quick Start

**1. Declare Permissions in manifest.json**

```json
{
  "id": "com.example.plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "sdkapi": 251212,
  "permissions": {
    "required": ["clipboard.read", "network.internet"],
    "optional": ["storage.shared"]
  },
  "permissionReasons": {
    "clipboard.read": "Read clipboard to get text for translation",
    "network.internet": "Access translation API services"
  }
}
```

**2. Permission Categories**

| Category | Permission ID | Risk Level | Description |
|----------|--------------|------------|-------------|
| **Filesystem** | `fs.read` | Medium | Read user files |
| | `fs.write` | High | Write/modify files |
| | `fs.execute` | High | Execute files or scripts |
| **Clipboard** | `clipboard.read` | Medium | Read clipboard content |
| | `clipboard.write` | Low | Write to clipboard |
| **Network** | `network.local` | Low | Access local network |
| | `network.internet` | Medium | Access internet |
| | `network.download` | Medium | Download files |
| **System** | `system.shell` | High | Execute system commands |
| | `system.notification` | Low | Send system notifications |
| | `system.tray` | Medium | Operate system tray |
| **AI** | `ai.basic` | Low | Basic AI capabilities |
| | `ai.advanced` | Medium | Advanced AI models |
| | `ai.agents` | High | Agent system |
| **Storage** | `storage.plugin` | Low | Plugin private storage (auto-granted) |
| | `storage.shared` | Medium | Cross-plugin shared storage |
| **Window** | `window.create` | Low | Create windows (auto-granted) |
| | `window.capture` | High | Screen capture |

**3. Risk Level Explanation**

- **Low**: Auto-granted or single confirmation
- **Medium**: Requires explicit user authorization
- **High**: Requires double confirmation with warning

**4. Default Auto-granted Permissions**

These permissions are automatically granted:

- `storage.plugin` - Plugin private storage
- `clipboard.write` - Write to clipboard
- `window.create` - Create windows

## SDK Version and Permission Enforcement

**sdkapi Field**

The `sdkapi` field determines whether permission checking is enabled:

| sdkapi Value | Permission Check | Notes |
|--------------|------------------|-------|
| Not declared | Skipped | Shows legacy SDK warning |
| < 251212 | Skipped | Shows legacy SDK warning |
| >= 251212 | Enabled | Full permission enforcement |

**Migration Guide**

If your plugin doesn't declare `sdkapi` or has a lower version:

```json
{
  "sdkapi": 251212,
  "permissions": {
    "required": ["clipboard.read"],
    "optional": []
  }
}
```

## Technical Notes
- Permission enforcement is managed by the centralized permission center once `sdkapi` meets the threshold.
- Grants are persisted at `<appData>/config/permission/permissions.json` and synchronized to the renderer via IPC.

## API Reference

**Check Permissions in Prelude (index.js)**

```javascript
const { permission } = globalThis

// Check if permission is granted
const hasPermission = await permission.check('clipboard.read')

// Request permission (triggers user confirmation dialog)
const granted = await permission.request('clipboard.read', 'Need to read clipboard content')

if (granted) {
  // Use clipboard API
  const text = clipboard.readText()
}
```

**Use in Surface (Vue)**

```typescript
import { usePermission } from '@talex-touch/utils/plugin/sdk'

const { check, request, status } = usePermission()

// Check permission
const hasClipboard = await check('clipboard.read')

// Request permission
const granted = await request('network.internet', 'Need to access translation service')

// Get all permission status
const allStatus = await status()
```

## Best Practices

**1. Principle of Least Privilege**

Only declare permissions you actually need:

```json
// ✅ Good
"permissions": {
  "required": ["clipboard.read"],
  "optional": []
}

// ❌ Avoid
"permissions": {
  "required": ["fs.read", "fs.write", "fs.execute", "system.shell"]
}
```

**2. Provide Permission Reasons**

```json
"permissionReasons": {
  "clipboard.read": "Read text from clipboard for translation",
  "network.internet": "Connect to Google Translate API"
}
```

**3. Graceful Degradation**

```javascript
async function translateText(text) {
  const hasNetwork = await permission.check('network.internet')
  
  if (!hasNetwork) {
    // Request permission or prompt user
    const granted = await permission.request('network.internet')
    if (!granted) {
      return { error: 'Network permission required for translation' }
    }
  }
  
  // Normal translation logic
  return await http.post('...')
}
```

**4. Distinguish Required vs Optional**

```json
"permissions": {
  "required": ["clipboard.read"],  // Core functionality
  "optional": ["network.internet"] // Enhanced features
}
```

## User Interface

Users can manage plugin permissions at:

1. **Plugin Details > Permissions Tab**: View and manage single plugin permissions
2. **Runtime Dialog**: Shown when plugin first requests permission

## FAQ

**Q: Why does my plugin show "Legacy SDK" warning?**

A: Your `manifest.json` doesn't declare `sdkapi` or the version is below `251212`. Add:

```json
"sdkapi": 251212
```

**Q: How to handle permission denial?**

A: Provide degraded experience or clear error message:

```javascript
const granted = await permission.request('clipboard.read')
if (!granted) {
  // Show hint, guide user to manual input or authorize
  feature.pushItems([{
    title: 'Clipboard Permission Required',
    subtitle: 'Please grant permission in plugin settings'
  }])
}
```

**Q: Where is permission data stored?**

A: Permission grants are stored in `<appData>/config/permission/permissions.json`.
