# UpdatePromptDialog Component

## Overview

The `UpdatePromptDialog` component provides a comprehensive UI for displaying application update information, managing update downloads, and installing updates. It supports version comparison, markdown-formatted release notes, download progress tracking, and various user actions.

## Features

- ✅ Version comparison display (current vs. new)
- ✅ Markdown-formatted release notes rendering
- ✅ Download progress tracking with speed and remaining time
- ✅ Multiple action buttons (Download, Install, Remind Later, Ignore Version)
- ✅ Download cancellation support
- ✅ Responsive design with mobile support
- ✅ Internationalization (i18n) support
- ✅ Elegant animations and transitions

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `modelValue` | `boolean` | Yes | - | Controls dialog visibility (v-model) |
| `release` | `GitHubRelease \| null` | Yes | - | Release information object |
| `currentVersion` | `string` | Yes | - | Current application version |
| `downloadTaskId` | `string` | No | `undefined` | Download task ID when downloading |
| `downloadProgress` | `DownloadProgress` | No | `undefined` | Download progress information |
| `downloadStatus` | `DownloadStatus` | No | `PENDING` | Current download status |

### Type Definitions

```typescript
interface GitHubRelease {
  tag_name: string
  name: string
  published_at: string
  body: string
  assets: DownloadAsset[]
}

interface DownloadProgress {
  percentage: number
  speed: number
  downloadedSize: number
  totalSize: number
  remainingTime?: number
}

enum DownloadStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled'
}
```

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `update:modelValue` | `boolean` | Emitted when dialog visibility changes |
| `download` | `GitHubRelease` | Emitted when user clicks "Download Now" |
| `install` | `string` (taskId) | Emitted when user clicks "Install Now" |
| `ignore-version` | `string` (version) | Emitted when user ignores a version |
| `remind-later` | - | Emitted when user chooses to be reminded later |
| `cancel-download` | `string` (taskId) | Emitted when user cancels download |

## Usage Example

### Basic Usage

```vue
<template>
  <UpdatePromptDialog
    v-model="showUpdateDialog"
    :release="updateRelease"
    :current-version="currentVersion"
    @download="handleDownload"
    @install="handleInstall"
    @ignore-version="handleIgnoreVersion"
    @remind-later="handleRemindLater"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import UpdatePromptDialog from '@/components/download/UpdatePromptDialog.vue'
import { GitHubRelease } from '@talex-touch/utils'

const showUpdateDialog = ref(false)
const currentVersion = ref('v2.4.6')

const updateRelease = ref<GitHubRelease>({
  tag_name: 'v2.5.0',
  name: 'Tuff v2.5.0',
  published_at: '2024-01-15T10:00:00Z',
  body: '## New Features\n- Feature 1\n- Feature 2',
  assets: [
    {
      name: 'app-v2.5.0.dmg',
      url: 'https://example.com/app-v2.5.0.dmg',
      size: 262144000,
      platform: 'darwin',
      arch: 'x64'
    }
  ]
})

const handleDownload = (release: GitHubRelease) => {
  console.log('Downloading:', release.tag_name)
  // Start download logic
}

const handleInstall = (taskId: string) => {
  console.log('Installing:', taskId)
  // Install update logic
}

const handleIgnoreVersion = (version: string) => {
  console.log('Ignoring version:', version)
  // Save ignored version
}

const handleRemindLater = () => {
  console.log('Remind later')
  // Schedule reminder
}
</script>
```

### With Download Progress

```vue
<template>
  <UpdatePromptDialog
    v-model="showUpdateDialog"
    :release="updateRelease"
    :current-version="currentVersion"
    :download-task-id="downloadTaskId"
    :download-progress="downloadProgress"
    :download-status="downloadStatus"
    @download="handleDownload"
    @install="handleInstall"
    @cancel-download="handleCancelDownload"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import UpdatePromptDialog from '@/components/download/UpdatePromptDialog.vue'
import { DownloadStatus } from '@talex-touch/utils'

const showUpdateDialog = ref(false)
const currentVersion = ref('v2.4.6')
const downloadTaskId = ref<string>()
const downloadStatus = ref<DownloadStatus>(DownloadStatus.PENDING)

const downloadProgress = ref({
  percentage: 45.2,
  speed: 2097152, // 2 MB/s in bytes
  downloadedSize: 118489088, // ~113 MB
  totalSize: 262144000, // 250 MB
  remainingTime: 68 // seconds
})

const handleDownload = (release) => {
  downloadTaskId.value = 'task-123'
  downloadStatus.value = DownloadStatus.DOWNLOADING
  // Start actual download
}

const handleCancelDownload = (taskId: string) => {
  downloadStatus.value = DownloadStatus.CANCELLED
  downloadTaskId.value = undefined
}
</script>
```

## Markdown Support

The component includes a built-in markdown renderer that supports:

- Headers (H1, H2, H3)
- Bold text (`**bold**` or `__bold__`)
- Italic text (`*italic*` or `_italic_`)
- Links (`[text](url)`)
- Unordered lists (`-` or `*`)
- Line breaks and paragraphs

Example markdown in release notes:

```markdown
## 🎉 New Features

- **Unified Download Center**: Manage all downloads
- **Auto Update**: Automatic updates with progress

## 🔧 Improvements

- Optimized performance
- Fixed known issues

## 🐛 Bug Fixes

- Fixed crash on startup
- Resolved memory leak
```

## Internationalization

The component uses Vue I18n for translations. Required translation keys:

```json
{
  "update": {
    "new_version_available": "New Version Available",
    "current_version": "Current Version",
    "new_version": "New Version",
    "release_notes": "Release Notes",
    "downloading": "Downloading",
    "download_complete": "Download Complete",
    "ready_to_install": "Ready to install",
    "download_now": "Download Now",
    "install_now": "Install Now",
    "remind_later": "Remind Later",
    "ignore_version": "Ignore Version",
    "cancel_download": "Cancel Download"
  }
}
```

## Styling

The component uses CSS custom properties for theming:

- `--el-color-primary`: Primary color
- `--el-color-success`: Success color
- `--el-bg-color-page`: Page background
- `--el-text-color-primary`: Primary text color
- `--el-text-color-secondary`: Secondary text color
- `--el-border-color`: Border color

## Accessibility

- Keyboard navigation support
- ARIA labels for screen readers
- Focus management
- Semantic HTML structure

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Electron environment
- Responsive design for different screen sizes

## Dependencies

- Vue 3
- Element Plus
- @talex-touch/utils (for types)
- Vue I18n (for translations)

## Notes

- The dialog cannot be closed while downloading (close button disabled)
- Download progress updates should be throttled to avoid performance issues
- Release notes are sanitized before rendering
- The component handles all download states automatically

## Related Components

- `ProgressBar.vue`: Used for displaying download progress
- `DownloadCenter.vue`: Main download management interface
- `TaskCard.vue`: Individual download task display

## Requirements Fulfilled

This component fulfills the following requirements from the spec:

- **4.1**: Auto-download updates based on user settings
- **4.2**: Display update notifications with version comparison
- **4.3**: Show markdown-formatted release notes
- **4.5**: Track and display download progress with install functionality
