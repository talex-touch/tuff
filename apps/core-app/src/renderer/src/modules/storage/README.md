# AISDK Storage Documentation

## Overview

The AISDK storage module provides persistent storage for AI SDK provider configurations and global settings. It uses the `TouchStorage` system for automatic synchronization with the backend and debounced auto-save functionality.

## Architecture

### Storage Structure

```typescript
interface AISDKStorageData {
  providers: AiProviderConfig[] // Array of AI provider configurations
  globalConfig: AISDKGlobalConfig // Global AISDK settings
  version: number // Schema version for migrations
}
```

### Key Features

1. **Automatic Persistence**: Changes are automatically saved to backend storage with 300ms debouncing
2. **Migration Support**: Built-in version tracking and migration system
3. **Reactive Updates**: All changes trigger Vue reactivity and auto-save
4. **Backend Sync**: Integrates with Electron IPC for cross-process storage

## Usage

### Basic Usage

```typescript
import { aisdkStorage } from '~/modules/storage/aisdk-storage'

// Read providers
const providers = aisdkStorage.data.providers

// Update a provider (automatically saved)
const provider = aisdkStorage.data.providers[0]
provider.apiKey = 'sk-...'

// Update global config (automatically saved)
aisdkStorage.data.globalConfig.enableCache = true
```

### Using with useAISDKManagement Composable

The recommended way to interact with AISDK storage is through the `useAISDKManagement` composable:

```typescript
import { useAISDKManagement } from '~/modules/hooks/useAISDKManagement'

const {
  providers,
  globalConfig,
  updateProvider,
  updateGlobalConfig
} = useAISDKManagement()

// Update provider (automatically persisted)
updateProvider('openai-default', { apiKey: 'sk-...' })

// Update global config (automatically persisted)
updateGlobalConfig({ enableCache: false })
```

## Auto-Save Behavior

### Debouncing

All changes are debounced with a 300ms delay to prevent excessive writes:

- Multiple rapid changes within 300ms are batched into a single save
- The save operation is triggered 300ms after the last change
- This improves performance when making multiple updates

### Example Timeline

```
Time 0ms:    User changes provider.apiKey
Time 50ms:   User changes provider.baseUrl
Time 100ms:  User changes provider.timeout
Time 400ms:  Save operation executes (300ms after last change)
```

## Migration System

### Version Tracking

The storage includes a `version` field to track schema changes:

```typescript
{
  providers: [...],
  globalConfig: {...},
  version: 1  // Current version
}
```

### Migration Process

Migrations run automatically on component mount:

```typescript
import { migrateAISDKSettings } from '~/modules/storage/aisdk-storage'

// Called automatically in useAISDKManagement
await migrateAISDKSettings()
```

### Adding New Migrations

To add a new migration for version 2:

```typescript
export async function migrateAISDKSettings(): Promise<void> {
  const currentData = aisdkStorage.data

  if (!currentData.version || currentData.version < 1) {
    // Version 1 migration
    // ...
  }

  if (currentData.version < 2) {
    // Version 2 migration
    console.log('[AISDK Storage] Migrating settings to version 2')

    // Perform migration logic
    // ...

    aisdkStorage.applyData({
      // Updated data
      version: 2
    })

    await aisdkStorage.saveToRemote({ force: true })
  }
}
```

## Storage Backend

### IPC Communication

The storage system communicates with the Electron main process via IPC:

- `storage:get` - Synchronously retrieve data
- `storage:save` - Asynchronously save data
- `storage:reload` - Reload data from disk
- `storage:update` - Notify of external updates

### Storage Location

Data is stored in the application's user data directory:

```
macOS: ~/Library/Application Support/YourApp/storage/aisdk-config
Windows: %APPDATA%/YourApp/storage/aisdk-config
Linux: ~/.config/YourApp/storage/aisdk-config
```

## Utility Functions

### Reset Configuration

Reset all settings to defaults:

```typescript
import { resetAISDKConfig } from '~/modules/storage/aisdk-storage'

await resetAISDKConfig()
```

### Manual Save

Force an immediate save (bypasses debouncing):

```typescript
await aisdkStorage.saveToRemote({ force: true })
```

### Reload from Backend

Reload data from storage (useful after external changes):

```typescript
await aisdkStorage.reloadFromRemote()
```

## Best Practices

### 1. Use the Composable

Always use `useAISDKManagement` instead of directly accessing storage:

```typescript
// ✅ Good
const { updateProvider } = useAISDKManagement()
updateProvider('openai-default', { apiKey: 'sk-...' })

// ❌ Avoid
aisdkStorage.data.providers[0].apiKey = 'sk-...'
```

### 2. Batch Updates

When making multiple changes, batch them together:

```typescript
// ✅ Good - Single update
updateProvider('openai-default', {
  apiKey: 'sk-...',
  baseUrl: 'https://api.openai.com',
  timeout: 30000
})

// ❌ Avoid - Multiple updates
updateProvider('openai-default', { apiKey: 'sk-...' })
updateProvider('openai-default', { baseUrl: 'https://api.openai.com' })
updateProvider('openai-default', { timeout: 30000 })
```

### 3. Handle Migration Errors

Always handle migration errors gracefully:

```typescript
onMounted(async () => {
  try {
    await migrateAISDKSettings()
  }
  catch (error) {
    console.error('[AISDK] Migration failed:', error)
    // Show user notification or fallback to defaults
  }
})
```

### 4. Avoid Direct Mutations

Don't directly mutate nested objects without triggering reactivity:

```typescript
// ✅ Good
updateProvider('openai-default', {
  rateLimit: { ...provider.rateLimit, requestsPerMinute: 100 }
})

// ❌ Avoid - May not trigger auto-save
provider.rateLimit.requestsPerMinute = 100
```

## Troubleshooting

### Changes Not Persisting

1. Check that auto-save is enabled (it's enabled by default)
2. Verify the TouchStorage channel is initialized
3. Check browser console for storage errors
4. Ensure you're using the composable methods

### Migration Issues

1. Check the current version: `aisdkStorage.data.version`
2. Review migration logs in the console
3. Try resetting to defaults: `await resetAISDKConfig()`

### Performance Issues

1. Reduce update frequency (debouncing helps automatically)
2. Batch multiple updates together
3. Avoid unnecessary deep watches on storage data

## Testing

### Unit Tests

Test storage operations:

```typescript
import { aisdkStorage, migrateAISDKSettings } from '~/modules/storage/aisdk-storage'

describe('AISDK Storage', () => {
  it('should initialize with default providers', () => {
    expect(aisdkStorage.data.providers).toHaveLength(4)
  })

  it('should migrate from version 0 to 1', async () => {
    aisdkStorage.data.version = 0
    await migrateAISDKSettings()
    expect(aisdkStorage.data.version).toBe(1)
  })
})
```

### Integration Tests

Test with the composable:

```typescript
import { useAISDKManagement } from '~/modules/hooks/useAISDKManagement'

describe('useAISDKManagement', () => {
  it('should persist provider updates', async () => {
    const { updateProvider, getProvider } = useAISDKManagement()

    updateProvider('openai-default', { apiKey: 'test-key' })

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 400))

    const provider = getProvider('openai-default')
    expect(provider?.apiKey).toBe('test-key')
  })
})
```

## Related Files

- `apps/core-app/src/renderer/src/modules/storage/aisdk-storage.ts` - Storage implementation
- `apps/core-app/src/renderer/src/modules/hooks/useAISDKManagement.ts` - Composable
- `apps/core-app/src/renderer/src/types/aisdk.ts` - Type definitions
- `packages/utils/renderer/storage/base-storage.ts` - TouchStorage base class
