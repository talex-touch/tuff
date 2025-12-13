---
title: Tuff CLI
description: Command-line tools for building and publishing Tuff plugins
---

# Tuff CLI

The `@talex-touch/unplugin-export-plugin` package provides a CLI tool called `tuff` for building and publishing Tuff plugins.

## Installation

```bash
# Global installation
pnpm add -g @talex-touch/unplugin-export-plugin

# Or use via npx
npx tuff <command>
```

## Commands

### `tuff builder`

Build your plugin project into a distributable `.tpex` package.

```bash
tuff builder
```

**Options:**
- Scans your project for plugin assets
- Generates manifest and bundles resources
- Outputs a `.tpex` file ready for distribution

### `tuff publish`

Publish your plugin to the Tuff Nexus server.

```bash
tuff publish --tag v1.0.0 --channel RELEASE
```

**Options:**
- `--tag, -t` - Version tag for the release (e.g., v1.0.0)
- `--channel, -c` - Release channel: `RELEASE`, `BETA`, or `SNAPSHOT` (default: `SNAPSHOT`)
- `--notes, -n` - Release notes (Markdown supported)
- `--dry-run` - Preview without actually publishing
- `--api-url` - Custom API endpoint

**Example:**
```bash
tuff publish \
  --tag v1.2.0 \
  --channel RELEASE \
  --notes "### New Features\n- Added dark mode support\n- Performance improvements"
```

### `tuff login`

Save your authentication token for publishing.

```bash
tuff login <token>
```

The token is stored in `~/.tuff/auth.json`.

### `tuff logout`

Remove saved authentication credentials.

```bash
tuff logout
```

## Vite Plugin Integration

You can also use the unplugin as a Vite plugin for automatic plugin building:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import TuffExport from '@talex-touch/unplugin-export-plugin/vite'

export default defineConfig({
  plugins: [
    TuffExport({
      // Plugin options
    })
  ]
})
```

## Publishing Workflow

1. **Build your plugin:**
   ```bash
   pnpm build
   ```

2. **Login to Nexus:**
   ```bash
   tuff login YOUR_API_TOKEN
   ```

3. **Publish:**
   ```bash
   tuff publish --tag v1.0.0 --channel RELEASE
   ```

The CLI will:
- Scan the `dist/` directory for release assets
- Calculate SHA256 checksums
- Create the release on Nexus
- Link assets to the release
- Publish the release

## Asset Detection

The CLI automatically detects assets with these extensions:
- `.dmg` - macOS disk images
- `.exe` - Windows executables
- `.AppImage` - Linux AppImage
- `.deb` - Debian packages
- `.rpm` - RPM packages
- `.zip` - ZIP archives
- `.tar.gz` - Gzipped tarballs
