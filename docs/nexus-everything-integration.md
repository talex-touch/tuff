# Everything Integration - Nexus Documentation

## Overview

Everything search integration for Windows platform in Tuff application, providing ultra-fast file search capabilities through Everything CLI integration.

## Architecture

### Components

1. **Everything Provider** (`apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`)
   - Search provider implementation
   - Everything CLI detection and integration
   - Settings management
   - IPC channel handlers

2. **Settings UI** (`apps/core-app/src/renderer/src/views/base/settings/SettingEverything.vue`)
   - Windows-only settings panel
   - Enable/disable toggle
   - Status monitoring
   - Test search functionality
   - Installation guidance

3. **Storage Integration**
   - Settings stored in `everything-settings.json`
   - Uses `storageModule` for persistence
   - Default: enabled (if Everything is available)

## Settings Structure

```json
{
  "enabled": true
}
```

## IPC Channels

### `everything:status`
Get current Everything provider status.

**Response:**
```typescript
{
  enabled: boolean
  available: boolean
  version: string | null
  esPath: string | null
  error: string | null
  lastChecked: number | null
}
```

### `everything:toggle`
Enable or disable Everything search.

**Request:**
```typescript
{
  enabled: boolean
}
```

**Response:**
```typescript
{
  success: boolean
  enabled: boolean
}
```

### `everything:test`
Test Everything search functionality.

**Response:**
```typescript
{
  success: boolean
  resultCount?: number
  duration?: number
  error?: string
}
```

## User Interface

### Settings Panel (Windows Only)

Located in: Settings → Everything Search

**Features:**
- **Status Badge**: Shows current state (Enabled/Disabled/Unavailable)
- **Version Info**: Displays Everything CLI version and path
- **Enable/Disable Toggle**: Control Everything search
- **Test Search**: Verify functionality with test query
- **Installation Guide**: Links to download Everything and CLI
- **Error Display**: Shows any initialization errors
- **Last Checked**: Timestamp of last status check

### Status States

| State | Color | Description |
|-------|-------|-------------|
| Enabled | Green | Everything is available and enabled |
| Disabled | Yellow | Everything is available but disabled |
| Unavailable | Red | Everything CLI not found |
| Checking | Gray | Status check in progress |

## Installation Flow

### For End Users

1. **Check Status**
   - Open Settings → Everything Search
   - View current status

2. **Install Everything** (if unavailable)
   - Click "Download Everything" button
   - Install Everything from voidtools.com
   - Launch Everything to ensure it's running

3. **Install CLI** (if unavailable)
   - Click "Download CLI" button
   - Extract `es.exe` to Everything installation directory
   - Or place in system PATH

4. **Verify Installation**
   - Click "Check Now" to refresh status
   - Click "Test Search" to verify functionality

5. **Enable/Disable**
   - Use toggle button to control Everything search
   - Changes take effect immediately

## Integration with Nexus

### Nexus Project Structure

```
apps/nexus/
├── app/
│   └── (routes)/
│       └── docs/
│           └── everything/
│               ├── page.tsx          # Everything docs page
│               └── installation.mdx  # Installation guide
├── content/
│   └── docs/
│       └── features/
│           └── everything.mdx        # Feature documentation
└── public/
    └── images/
        └── everything/               # Screenshots
```

### Documentation Pages

#### 1. Feature Overview (`content/docs/features/everything.mdx`)

```mdx
---
title: Everything Search Integration
description: Ultra-fast file search on Windows
---

# Everything Search Integration

Tuff integrates with Everything search engine on Windows for instant file search results.

## Features

- **Instant Search**: Sub-50ms response time
- **Real-time Index**: No manual indexing required
- **Low Resource Usage**: Minimal CPU and memory footprint
- **Advanced Syntax**: Support for wildcards, regex, and filters

## Requirements

- Windows operating system
- Everything installed and running
- Everything CLI (es.exe) in PATH or installation directory

## Getting Started

1. Install Everything from [voidtools.com](https://www.voidtools.com/)
2. Download Everything CLI
3. Open Tuff Settings → Everything Search
4. Follow the installation guide
5. Enable Everything search

## Usage

Simply search for files in Tuff's CoreBox. Everything will automatically provide instant results.

Use `@file` or `@everything` prefix to search only with Everything:

```
@file document.pdf
@everything *.jpg
```

## Advanced Search

Everything supports powerful search syntax:

- `*.txt` - All text files
- `photo AND vacation` - Boolean operators
- `ext:pdf` - File type filters
- `size:>10mb` - Size filters
- `dm:today` - Date modified filters

See [Everything documentation](https://www.voidtools.com/support/everything/searching/) for full syntax reference.
```

#### 2. Installation Guide (`app/(routes)/docs/everything/installation.mdx`)

```mdx
---
title: Everything Installation Guide
description: Step-by-step guide to install and configure Everything
---

# Everything Installation Guide

## Prerequisites

- Windows 7 or later
- Administrator privileges (for installation)

## Step 1: Install Everything

1. Visit [https://www.voidtools.com/](https://www.voidtools.com/)
2. Download the latest version
3. Run the installer
4. Launch Everything to start indexing

## Step 2: Install Everything CLI

1. Visit [Everything CLI page](https://www.voidtools.com/support/everything/command_line_interface/)
2. Download `es.exe`
3. Place in one of these locations:
   - Everything installation directory (recommended)
   - Any directory in your system PATH
   - `C:\Program Files\Everything\`

## Step 3: Verify Installation

1. Open Command Prompt
2. Run: `es.exe -v`
3. You should see version information

## Step 4: Configure in Tuff

1. Open Tuff
2. Go to Settings (Cmd/Ctrl + ,)
3. Navigate to "Everything Search"
4. Click "Check Now"
5. Status should show "Available"
6. Click "Test Search" to verify

## Troubleshooting

### Everything CLI Not Found

**Solution:**
- Verify `es.exe` is in the correct location
- Add Everything directory to system PATH
- Restart Tuff after installation

### No Search Results

**Solution:**
- Ensure Everything is running
- Check if drives are indexed in Everything
- Verify Everything service is started

### Slow Performance

**Solution:**
- Update Everything to latest version
- Rebuild Everything index
- Exclude network drives if not needed

## Advanced Configuration

### Custom CLI Path

Set environment variable:
```cmd
set EVERYTHING_CLI_PATH=C:\Custom\Path\es.exe
```

### Search Syntax

Everything supports advanced search syntax. See the [search syntax guide](https://www.voidtools.com/support/everything/searching/) for details.
```

### Component Integration

#### Nexus Page Component

```typescript
// app/(routes)/docs/everything/page.tsx
import { Metadata } from 'next'
import { EverythingDocs } from '@/components/docs/everything-docs'

export const metadata: Metadata = {
  title: 'Everything Integration - Tuff Documentation',
  description: 'Learn how to use Everything search in Tuff for ultra-fast file searching on Windows',
}

export default function EverythingPage() {
  return <EverythingDocs />
}
```

#### Documentation Component

```typescript
// components/docs/everything-docs.tsx
export function EverythingDocs() {
  return (
    <div className="everything-docs">
      <h1>Everything Search Integration</h1>
      
      <section className="feature-overview">
        <h2>Overview</h2>
        <p>Ultra-fast file search for Windows using Everything engine.</p>
        
        <div className="stats-grid">
          <StatCard title="Search Speed" value="20-50ms" />
          <StatCard title="Index Time" value="Real-time" />
          <StatCard title="Memory Usage" value="~10MB" />
        </div>
      </section>

      <section className="installation">
        <h2>Installation</h2>
        <InstallationSteps />
      </section>

      <section className="usage">
        <h2>Usage</h2>
        <UsageExamples />
      </section>

      <section className="troubleshooting">
        <h2>Troubleshooting</h2>
        <TroubleshootingGuide />
      </section>
    </div>
  )
}
```

## API Reference

### Everything Provider API

```typescript
class EverythingProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'everything-provider'
  readonly name = 'Everything Search'
  readonly type = 'file'
  readonly priority = 'fast'
  readonly expectedDuration = 50

  async onLoad(context: ProviderContext): Promise<void>
  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult>
  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null>
}
```

### Settings API

```typescript
interface EverythingSettings {
  enabled: boolean
}

// Get settings
const settings = storageModule.getConfig('everything-settings.json')

// Save settings
storageModule.saveConfig('everything-settings.json', JSON.stringify({ enabled: true }))
```

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Search latency | 20-50ms | Average response time |
| Index size | ~10MB | RAM usage |
| Startup time | < 5ms | Provider initialization |
| Max results | 50 | Configurable limit |

## Best Practices

### For Developers

1. **Error Handling**: Always handle Everything unavailability gracefully
2. **Settings Persistence**: Use storageModule for settings
3. **Platform Detection**: Only load on Windows
4. **Graceful Degradation**: Fall back to file-provider if unavailable

### For Users

1. **Keep Everything Running**: Ensure Everything is always running for best performance
2. **Index Configuration**: Configure which drives to index in Everything
3. **Regular Updates**: Keep Everything updated for best performance
4. **Test Regularly**: Use "Test Search" to verify functionality

## Future Enhancements

1. **Everything SDK Integration**: Direct API integration for even faster searches
2. **Custom Filters UI**: Visual filter builder
3. **Search History**: Remember and suggest previous searches
4. **Network Drive Support**: Optional network location indexing
5. **File Icons**: Extract and cache file icons from Everything

## Support

- **Everything**: [voidtools.com/support](https://www.voidtools.com/support/)
- **Tuff Issues**: [GitHub Issues](https://github.com/talex-touch/tuff/issues)
- **Documentation**: [docs.tuff.app](https://docs.tuff.app)

## License

Everything is developed by voidtools and is free for personal and commercial use.

Tuff's Everything integration is part of the Tuff project and follows the same license.
