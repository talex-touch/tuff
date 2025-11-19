# Internationalization (i18n) Implementation Guide

## Overview

The unified download and update system now has complete internationalization support for both the renderer process (UI) and main process (error messages, notifications).

## Supported Languages

- **Chinese (Simplified)**: `zh-CN`
- **English**: `en-US`

## Architecture

### Renderer Process (UI)

The renderer process uses Vue I18n for translations:

```typescript
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const message = t('download.title') // "下载中心" or "Download Center"
```

### Main Process (Backend)

The main process uses a custom i18n helper:

```typescript
import { t } from '../../utils/i18n-helper'

const errorMessage = t('downloadErrors.network_error')
// "网络连接失败，请检查网络设置后重试" or "Network connection failed..."
```

## Language Synchronization

Language changes in the renderer process are automatically synchronized to the main process via IPC:

1. User changes language in settings
2. `useLanguage().switchLanguage()` is called
3. IPC message `app:set-locale` is sent to main process
4. Main process updates its locale via `setLocale()`

## Translation Keys

### Download Errors

Located in `downloadErrors` namespace:

- `network_error`: Network connection failures
- `timeout_error`: Download timeouts
- `disk_space_error`: Insufficient disk space
- `permission_error`: File permission issues
- `checksum_error`: File verification failures
- `file_not_found`: Missing files
- `invalid_url`: Invalid download URLs
- `cancelled`: User-cancelled downloads
- `unknown_error`: Generic errors

### Notifications

Located in `notifications` namespace:

- `downloadComplete`: Download completion title
- `downloadCompleteBody`: Download completion message with parameters
- `downloadFailed`: Download failure title
- `downloadFailedBody`: Download failure message with parameters
- `updateAvailable`: Update available title
- `updateAvailableBody`: Update available message with version
- `updateReady`: Update ready title
- `updateReadyBody`: Update ready message with version

### Time Units

Located in `timeUnits` namespace:

- `seconds`, `minutes`, `hours`, `days`: Time unit labels
- `justNow`: "Just now" label
- `minutesAgo`, `hoursAgo`, `daysAgo`: Relative time with count parameter

## Adding New Translations

### 1. Add to Language Files

**Chinese (`zh-CN.json`):**
```json
{
  "myFeature": {
    "title": "我的功能",
    "description": "这是一个新功能"
  }
}
```

**English (`en-US.json`):**
```json
{
  "myFeature": {
    "title": "My Feature",
    "description": "This is a new feature"
  }
}
```

### 2. Use in Renderer Process

```vue
<template>
  <div>
    <h1>{{ $t('myFeature.title') }}</h1>
    <p>{{ $t('myFeature.description') }}</p>
  </div>
</template>
```

### 3. Use in Main Process

```typescript
import { t } from '../../utils/i18n-helper'

const title = t('myFeature.title')
const description = t('myFeature.description')
```

## Parameter Interpolation

### Renderer Process

```vue
<template>
  <p>
    {{ $t('download.downloadCompleteBody', {
      filename: 'file.zip',
      size: '10MB',
      duration: '2分钟',
    }) }}
  </p>
</template>
```

### Main Process

```typescript
import { t } from '../../utils/i18n-helper'

const message = t('notifications.downloadCompleteBody', {
  filename: 'file.zip',
  size: '10MB',
  duration: '2分钟'
})
```

## Helper Functions

### Main Process Helpers

The i18n helper provides utility functions for common formatting needs:

```typescript
import {
  formatDuration,
  formatFileSize,
  formatRelativeTime
} from '../../utils/i18n-helper'

// Format duration in seconds
const duration = formatDuration(125) // "2分5秒" or "2min5s"

// Format file size
const size = formatFileSize(1048576) // "1.0 MB"

// Format relative time
const time = formatRelativeTime(new Date(Date.now() - 3600000))
// "1 小时前" or "1 hours ago"
```

## Language Switching

### Programmatic Switching

```typescript
import { useLanguage } from '~/modules/lang'

const { switchLanguage } = useLanguage()

// Switch to English
await switchLanguage('en-US')

// Switch to Chinese
await switchLanguage('zh-CN')
```

### Follow System Language

```typescript
import { useLanguage } from '~/modules/lang'

const { setFollowSystemLanguage } = useLanguage()

// Enable following system language
await setFollowSystemLanguage(true)

// Disable following system language
await setFollowSystemLanguage(false)
```

## Best Practices

### 1. Never Hardcode Text

❌ **Bad:**
```typescript
const title = '下载中心'
```

✅ **Good:**
```typescript
const title = t('download.title')
```

### 2. Use Descriptive Keys

❌ **Bad:**
```json
{
  "msg1": "Error occurred",
  "btn1": "OK"
}
```

✅ **Good:**
```json
{
  "downloadErrors": {
    "network_error": "Network connection failed"
  },
  "common": {
    "confirm": "OK"
  }
}
```

### 3. Group Related Keys

```json
{
  "download": {
    "title": "Download Center",
    "pause": "Pause",
    "resume": "Resume",
    "cancel": "Cancel"
  }
}
```

### 4. Use Parameters for Dynamic Content

❌ **Bad:**
```typescript
const message = `Downloaded ${filename} successfully`
```

✅ **Good:**
```typescript
const message = t('download.successMessage', { filename })
```

## Testing i18n

### 1. Test Language Switching

```typescript
// Switch to English
await switchLanguage('en-US')
expect(t('download.title')).toBe('Download Center')

// Switch to Chinese
await switchLanguage('zh-CN')
expect(t('download.title')).toBe('下载中心')
```

### 2. Test Parameter Interpolation

```typescript
const message = t('notifications.downloadCompleteBody', {
  filename: 'test.zip',
  size: '10MB',
  duration: '2min'
})

expect(message).toContain('test.zip')
expect(message).toContain('10MB')
expect(message).toContain('2min')
```

### 3. Test Missing Keys

```typescript
const result = t('nonexistent.key')
// Should return the key itself as fallback
expect(result).toBe('nonexistent.key')
```

## Troubleshooting

### Issue: Translations not updating in main process

**Solution:** Ensure the IPC handler is registered by calling `initI18n()` during app initialization.

### Issue: Missing translation keys

**Solution:** Check that the key exists in both `zh-CN.json` and `en-US.json` files.

### Issue: Parameters not interpolating

**Solution:** Verify parameter names match exactly between the translation string and the parameters object:

```json
{
  "message": "Hello {name}!"
}
```

```typescript
t('message', { name: 'World' }) // ✅ Correct
t('message', { username: 'World' }) // ❌ Wrong parameter name
```

## File Structure

```
apps/core-app/src/
├── main/
│   └── utils/
│       └── i18n-helper.ts          # Main process i18n helper
└── renderer/src/
    └── modules/
        └── lang/
            ├── i18n.ts              # Vue I18n setup
            ├── useLanguage.ts       # Language management composable
            ├── useLanguageSync.ts   # IPC synchronization
            ├── zh-CN.json           # Chinese translations
            ├── en-US.json           # English translations
            └── index.ts             # Module exports
```

## Future Enhancements

1. **Add more languages**: Extend support to other languages (e.g., Japanese, Korean, Spanish)
2. **Lazy loading**: Load translation files on demand to reduce initial bundle size
3. **Translation management**: Integrate with translation management platforms
4. **Pluralization**: Add support for plural forms
5. **Date/Time formatting**: Use locale-specific date and time formats
6. **Number formatting**: Use locale-specific number formats (e.g., 1,000 vs 1.000)
