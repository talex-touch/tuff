# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Application Development
- `pnpm core:dev` - Start development server for the main Electron app
- `pnpm core:build` - Build the main application for production
- `pnpm core:build:beta` - Build beta version
- `pnpm core:build:snapshot` - Build snapshot version
- `pnpm core:build:release` - Build release version

### Platform-Specific Builds
- `pnpm core:build:snapshot:win` - Build Windows snapshot
- `pnpm core:build:snapshot:mac` - Build macOS snapshot
- `pnpm core:build:snapshot:linux` - Build Linux snapshot

### Type Checking (within apps/core-app/)
- `npm run typecheck` - TypeScript validation for both main and renderer processes
- `npm run typecheck:node` - Main process type checking only
- `npm run typecheck:web` - Renderer process type checking only

### Database Operations (within apps/core-app/)
- `npm run db:generate` - Generate Drizzle ORM migrations
- `npm run db:migrate` - Run database migrations

### Documentation
- `pnpm docs:dev` - Start documentation development server
- `pnpm docs:build` - Build documentation

### Code Quality
- `pnpm lint` - Run ESLint on all code
- `pnpm lint:fix` - Run ESLint with auto-fix
- `pnpm utils:test` - Run tests for utility packages

### Publishing
- `pnpm utils:publish` - Publish @talex-touch/utils package to npm

## Architecture Overview

### Monorepo Structure
This is a pnpm workspace monorepo with the main application in `apps/core-app/`, utility packages in `packages/`, plugin examples in `plugins/`, and documentation in `apps/docs/`.

### Technology Stack
- **Electron**: 37.2.4+ with Node.js 22.16.0+
- **Vue**: 3.5.18+ with Vue Router 4.5.1 and Pinia 3.0.3
- **TypeScript**: 5.8.3
- **Build Tools**: Electron-Vite 4.0.0, Vite 7.0.6, Electron-Builder 25.1.8
- **UI**: Element Plus 2.10.4, UnoCSS 66.3.3, SASS 1.89.2
- **Database**: Drizzle ORM 0.44.4 with LibSQL 0.15.10
- **Utilities**: VueUse 13.6.0, Dayjs 1.11.13, Tesseract.js 5.0.6 (OCR), XTerm 5.3.0
- **Logging**: log4js 6.9.1

### Core Application Architecture (apps/core-app/)

**Main Process (src/main/):**
- **TouchApp**: Core application class managing window, modules, and configuration
- **TouchWindow**: Wrapper around Electron BrowserWindow with platform-specific enhancements (Vibrancy on macOS, Mica on Windows)
- **ModuleManager**: Manages lifecycle of application modules with hot-reloading support
- **TouchCore**: Entry point that initializes the application and loads all modules

**Key Modules:**
- **CoreBox** ([modules/box-tool/core-box.ts](apps/core-app/src/main/modules/box-tool/core-box.ts)): Main search/launcher interface with global shortcut (Cmd/Ctrl+E)
- **PluginManager** ([modules/plugin/plugin-provider.ts](apps/core-app/src/main/modules/plugin/plugin-provider.ts)): Handles plugin loading, lifecycle, and feature registration
- **Storage** ([modules/storage/](apps/core-app/src/main/modules/storage/)): Configuration and data persistence with 10MB per-plugin limits
- **Channel System** ([core/channel-core.ts](apps/core-app/src/main/core/channel-core.ts)): IPC communication between main/renderer/plugin processes
- **Database** ([modules/database/](apps/core-app/src/main/modules/database/)): Drizzle ORM with LibSQL for structured data storage
- **Terminal** ([modules/terminal/](apps/core-app/src/main/modules/terminal/)): XTerm.js-based terminal emulator
- **OCR** ([modules/ocr/](apps/core-app/src/main/modules/ocr/)): Tesseract.js wrapper for optical character recognition
- **Clipboard** ([modules/clipboard/](apps/core-app/src/main/modules/clipboard/)): System clipboard operations

**Module Loading Order** (sequential after Electron ready):
1. DatabaseModule → 2. StorageModule → 3. ShortcutModule → 4. ExtensionLoaderModule → 5. CommonChannelModule → 6. PluginModule → 7. PluginLogModule → 8. CoreBoxModule → 9. TrayHolderModule → 10. AddonOpenerModule → 11. ClipboardModule → 12. TuffDashboardModule → 13. FileSystemWatcher → 14. FileProtocolModule → 15. TerminalModule

**Renderer Process (src/renderer/):**
- Vue 3 application with TypeScript
- Component-based architecture in [src/components/](apps/core-app/src/renderer/src/components/)
- View layouts in [src/views/](apps/core-app/src/renderer/src/views/)
- State management via Pinia stores and composables in [src/modules/hooks/](apps/core-app/src/renderer/src/modules/hooks/)

### Module System Architecture

**Module Lifecycle Phases:**
1. **Create**: Module instantiation with directory setup
2. **Init**: Initialization (required) - module directory is now available
3. **Start**: Module activation (optional)
4. **Stop**: Module deactivation (optional)
5. **Destroy**: Cleanup and resource release (required)

**Base Module Interface:**
```typescript
abstract class BaseModule {
  abstract onInit(ctx: ModuleInitContext): MaybePromise<void>
  abstract onDestroy(ctx: ModuleDestroyContext): MaybePromise<void>
  created?(ctx: ModuleCreateContext): MaybePromise<void>
  start?(ctx: ModuleStartContext): MaybePromise<void>
  stop?(ctx: ModuleStopContext): MaybePromise<void>
}
```

- Modules loaded sequentially after Electron ready event
- Each module gets an isolated storage directory
- Modules maintained as singletons via symbol keys
- Supports module-specific event subscriptions via TouchEventBus

### Plugin System
Plugins are loaded from the user data directory at runtime, not bundled with the application.

**Plugin Three-Layer Architecture**:

| Layer | English Name | Chinese Name | File | Description |
|-------|--------------|--------------|------|-------------|
| Declaration | **Manifest** | **清单文件** | `manifest.json` | Plugin metadata, feature declarations, permission config |
| Script | **Prelude** | **先导脚本** | `index.js` | Lightweight entry, capability registration, callback handling |
| Display | **Surface** | **展面** | `attachUIView` | Heavy UI rendering (WebContents) |

**Loading Flow**: Manifest → Prelude → (on-demand) Surface

**Plugin Architecture:**
- Manifest-driven: Each plugin has `manifest.json` defining features, metadata, and permissions
- Features can be triggered via CoreBox search interface
- Plugins register search results dynamically via `pushItems()` API
- Hot-reloading supported during development via file system watchers
- Isolated storage (10MB limit per plugin)

**Plugin Manifest Example:**
```json
{
  "id": "com.example.plugin",
  "name": "plugin-name",
  "version": "1.0.0",
  "features": [
    {
      "id": "feature-id",
      "name": "Feature Name",
      "commands": [
        { "type": "over", "value": ["keyword", "关键词"] }
      ],
      "interaction": {
        "type": "webcontent",
        "path": "/route-path"
      }
    }
  ],
  "dev": {
    "enable": true,
    "address": "http://localhost:3333/",
    "source": "/absolute/plugin/path"
  }
}
```

**Development Mode:** Set `dev.enable: true` to load plugin from local dev server with hot-reloading.

**Clipboard Support:**

Plugins can receive clipboard data (images, files, rich text) automatically when a feature is triggered. The system detects clipboard content and passes it via the `query` parameter.

**Declaring Input Type Support:**

Features can declare which input types they accept via `acceptedInputTypes`:

```json
{
  "id": "image-processor",
  "name": "Image Processor",
  "acceptedInputTypes": ["text", "image"],
  "commands": [{ "type": "over", "value": ["process"] }]
}
```

Supported types (TuffInputType enum): `text`, `image`, `files`, `html`

**Handling Clipboard Data in Plugins:**

```typescript
import { TuffInputType } from '@talex-touch/utils'

onFeatureTriggered(featureId, query, feature) {
  // Backward compatible: handle string query
  if (typeof query === 'string') {
    console.log('Text query:', query)
    return
  }

  // New: query is TuffQuery object with inputs
  const textQuery = query.text
  const inputs = query.inputs || []

  // Find image input from clipboard
  const imageInput = inputs.find(i => i.type === TuffInputType.Image)
  if (imageInput) {
    // imageInput.content is a data URL
    console.log('Processing image:', imageInput.content)
    console.log('Thumbnail:', imageInput.thumbnail)
  }

  // Find files input
  const filesInput = inputs.find(i => i.type === TuffInputType.Files)
  if (filesInput) {
    // filesInput.content is JSON string of file paths
    const files = JSON.parse(filesInput.content)
    console.log('Processing files:', files)
  }

  // Find HTML input (rich text)
  const htmlInput = inputs.find(i => i.type === TuffInputType.Html)
  if (htmlInput) {
    console.log('Plain text:', htmlInput.content)
    console.log('HTML:', htmlInput.rawContent)
  }
}
```

**Smart Routing:**

When clipboard contains non-text data (images/files), the search engine automatically:
- Filters out providers that don't support those input types
- Only shows features that declare support via `acceptedInputTypes`
- Passes complete query object with inputs to the plugin

If `acceptedInputTypes` is not declared, the feature only receives text-only queries (default behavior).

### Channel Communication

The application uses a custom channel system abstracting Electron IPC:

**Channel Types:**
- `ChannelType.MAIN`: Main process ↔ renderer communication
- `ChannelType.PLUGIN`: Plugin-specific isolated communication

**Key APIs:**
```typescript
// Register handlers
regChannel(type: ChannelType, eventName: string, callback): () => void

// Send messages
send(eventName: string, arg?: any): Promise<any>
sendTo(window: BrowserWindow, eventName: string, arg?: any): Promise<any>
sendPlugin(pluginName: string, eventName: string, arg?: any): Promise<any>

// Key management (encryption for plugin isolation)
requestKey(name: string): string
revokeKey(key: string): boolean
```

**Implementation Notes:**
- Uses IPC listeners on `@main-process-message` and `@plugin-process-message`
- Supports both sync and async request-response patterns
- Plugin channels use encrypted keys for additional security

### Window Management
- **Main Window**: Primary application interface with Vibrancy (macOS) or Mica (Windows) effects
- **CoreBox Windows**: Popup search/launcher windows positioned based on cursor screen for multi-monitor support
- **Plugin Windows**: Created dynamically by plugins with injection of plugin APIs
- **TouchWindow**: Wrapper providing platform-specific enhancements and two-phase setup (creation vs rendering)

### Event System

**TouchEventBus** provides application-wide event dispatching:

```typescript
enum TalexEvents {
  APP_READY,
  APP_START,
  APP_SECONDARY_LAUNCH,
  ALL_MODULES_LOADED,
  BEFORE_APP_QUIT,
  WILL_QUIT,
  WINDOW_ALL_CLOSED,
  PLUGIN_STORAGE_UPDATED
}
```

Modules subscribe to events: `touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, () => { ... })`

### Storage Architecture

**StorageModule** provides persistent configuration:

**Application Config:**
- JSON file persistence under `<root>/config/`
- CRUDL operations via IPC channels

**Plugin Config:**
- Isolated per-plugin storage under `<root>/config/plugins/`
- 10MB size limit per plugin
- Safe filename sanitization (prevents path traversal)
- Update broadcast system for reactive UI updates across windows

**Channel Integration:**
- Main process: `storage:get`, `storage:save`, `storage:delete`
- Plugin process: `plugin:storage:get-item`, `plugin:storage:set-item`

### Shared Utilities Package

**`@talex-touch/utils`** (npm package v1.0.23) provides shared types and utilities:

```
packages/utils/
├── base/              # Base types and enums
├── channel/           # IPC channel interfaces
├── core-box/          # CoreBox SDK (result builder, search format)
├── eventbus/          # Event system interfaces
├── plugin/            # Plugin SDK & interfaces
│   ├── log/           # Plugin logging
│   ├── providers/     # Plugin discovery providers
│   └── sdk/           # Plugin runtime SDK
├── renderer/          # Renderer process composables
│   ├── hooks/         # Vue composables
│   └── storage/       # Storage client
└── types/             # TypeScript definitions
```

This package is shared between the main app, plugins, and published to npm for external plugin developers.

## Development Notes

- Node.js version: 22.16.0+ (enforced by pnpm preinstall hook and Volta)
- Uses Electron 37.2.4+ with Vue 3.5.18+
- Development uses hot-reloading with process cleanup via DevProcessManager
- Plugin development supports live reloading when Manifest (`manifest.json`) or Prelude (`index.js`) files change
- CoreBox positioning is screen-aware and adapts to multi-monitor setups
- Database uses Drizzle ORM with LibSQL for type-safe queries
- Logging via log4js with structured namespaces, timestamps, and colored output

## Important Architectural Concepts

### Concepts Not Obvious from File Names

1. **Module Directory Pattern**: Each module requests an isolated directory for persistent storage without knowing the root path

2. **Encryption for Plugin Isolation**: Plugin channels use encrypted keys instead of direct names for additional security

3. **Broadcast Storage Updates**: Storage module broadcasts updates to all windows to keep UI in sync across multiple renderer instances

4. **Safe Plugin Configuration Naming**: Plugin config files use sanitized names to prevent path traversal attacks

5. **Screen-Aware Window Positioning**: CoreBox remembers which screen it was opened on and repositions accordingly

6. **Two-Phase Window Setup**: TouchWindow wrapper separates creation from rendering (autoShow option)

7. **Graceful Development Shutdown**: DevProcessManager prevents app quit events in development, allowing custom cleanup

8. **Structured Logging with Namespaces**: Logger provides colored namespaces, timestamps, and metadata for better debugging

## Key File Locations

- Main entry: [apps/core-app/src/main/index.ts](apps/core-app/src/main/index.ts)
- Core app logic: [apps/core-app/src/main/core/touch-core.ts](apps/core-app/src/main/core/touch-core.ts)
- Module manager: [apps/core-app/src/main/core/module-manager.ts](apps/core-app/src/main/core/module-manager.ts)
- Plugin system: [apps/core-app/src/main/modules/plugin/plugin-provider.ts](apps/core-app/src/main/modules/plugin/plugin-provider.ts)
- CoreBox launcher: [apps/core-app/src/main/modules/box-tool/core-box.ts](apps/core-app/src/main/modules/box-tool/core-box.ts)
- Channel system: [apps/core-app/src/main/core/channel-core.ts](apps/core-app/src/main/core/channel-core.ts)
- Storage module: [apps/core-app/src/main/modules/storage/storage-provider.ts](apps/core-app/src/main/modules/storage/storage-provider.ts)
- Renderer entry: [apps/core-app/src/renderer/src/main.ts](apps/core-app/src/renderer/src/main.ts)
- Shared utilities: [packages/utils/](packages/utils/)
