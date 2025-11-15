# Update System

This module implements the application update system that integrates with the DownloadCenter for managing update downloads.

## Components

### UpdateSystem (`update-system.ts`)

The core UpdateSystem class that handles:

- **Version Detection**: Checks for new versions from GitHub Releases API
- **Channel Support**: Supports RELEASE, BETA, and SNAPSHOT channels
- **Version Comparison**: Implements semantic version comparison algorithm
- **Auto Download**: Integrates with DownloadCenter to download updates with high priority
- **SHA256 Verification**: Verifies downloaded update packages using checksums
- **Platform Detection**: Automatically selects the correct installer for the current platform

### UpdateService (`UpdateService.ts`)

The existing UpdateService module that provides:

- Polling service for periodic update checks
- IPC channel registration for renderer communication
- Settings management and persistence
- Cache management for update check results

## Integration

The UpdateSystem integrates with the DownloadCenter module to leverage its:

- Download queue management
- Progress tracking
- Retry mechanisms
- Chunk-based downloading
- Network monitoring

## Usage

### Check for Updates

```typescript
const updateSystem = new UpdateSystem(downloadCenterModule)
const result = await updateSystem.checkForUpdates()

if (result.hasUpdate && result.release) {
  console.log('New version available:', result.release.tag_name)
}
```

### Download Update

```typescript
if (result.hasUpdate && result.release) {
  const taskId = await updateSystem.downloadUpdate(result.release)
  console.log('Download started with task ID:', taskId)
}
```

### Install Update

```typescript
await updateSystem.installUpdate(taskId)
```

### Configuration

```typescript
updateSystem.setAutoDownload(true)
updateSystem.setAutoCheck(true)
updateSystem.setCheckFrequency('daily')
updateSystem.ignoreVersion('v2.0.0-BETA')
```

## IPC Channels

The UpdateService registers the following IPC channels:

- `update:check` - Check for updates
- `update:download` - Download an update
- `update:install` - Install a downloaded update
- `update:ignore-version` - Ignore a specific version
- `update:set-auto-download` - Enable/disable auto download
- `update:set-auto-check` - Enable/disable auto check
- `update:get-settings` - Get current settings
- `update:update-settings` - Update settings
- `update:get-status` - Get update status
- `update:clear-cache` - Clear update cache

## Version Format

Versions follow the format: `vMAJOR.MINOR.PATCH-CHANNEL`

Examples:
- `v2.0.0` or `v2.0.0-MASTER` - Release channel
- `v2.0.0-BETA` - Beta channel
- `v2.0.0-SNAPSHOT` - Snapshot channel

## Requirements Implemented

This implementation satisfies the following requirements from the spec:

- **4.1**: Auto-download updates based on user settings
- **4.2**: High-priority download queue integration
- **4.3**: Update completion notifications
- **4.4**: SHA256 checksum verification
- **4.5**: Manual download trigger option
