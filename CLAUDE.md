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

### Documentation
- `pnpm docs:dev` - Start documentation development server
- `pnpm docs:build` - Build documentation

### Code Quality
- `pnpm lint` - Run ESLint on all code
- `pnpm lint:fix` - Run ESLint with auto-fix
- `pnpm utils:test` - Run tests for utility packages

### Publishing
- `pnpm utils:publish` - Publish utility packages

## Architecture Overview

### Monorepo Structure
This is a pnpm workspace monorepo with the main application in `apps/core-app/`, utility packages in `packages/`, plugin examples in `plugins/`, and documentation in `apps/docs/`.

### Core Application Architecture (apps/core-app/)

**Main Process (src/main/):**
- **TouchApp**: Core application class managing window, modules, and configuration
- **TouchWindow**: Wrapper around Electron BrowserWindow with platform-specific enhancements (Vibrancy on macOS, Mica on Windows)
- **ModuleManager**: Manages lifecycle of application modules with hot-reloading support
- **TouchCore**: Entry point that initializes the application and loads all modules

**Key Modules:**
- **CoreBox** (`modules/box-tool/core-box.ts`): Main search/launcher interface with global shortcut (Cmd/Ctrl+E)
- **PluginManager** (`plugins/plugin-core.ts`): Handles plugin loading, lifecycle, and feature registration
- **Storage** (`core/storage/`): Configuration and data persistence
- **Channel System** (`core/channel-core.ts`): IPC communication between main/renderer processes

**Renderer Process (src/renderer/):**
- Vue 3 application with TypeScript
- Component-based architecture in `src/components/`
- View layouts in `src/views/`
- State management via composables in `src/modules/hooks/`

### Plugin System
- Plugins are loaded from the user data directory at runtime
- Each plugin has a `manifest.json` defining features, metadata, and permissions
- Features can be triggered via CoreBox search interface
- Plugins can register search results dynamically via `pushItems()` API
- Hot-reloading supported during development

### Channel Communication
The application uses a custom channel system for IPC:
- `ChannelType.MAIN`: Main process to renderer communication
- `ChannelType.PLUGIN`: Plugin-specific communication
- Channels are registered with `regChannel()` and messages sent with `send()/sendTo()`

### Window Management
- **Main Window**: Primary application interface
- **CoreBox Windows**: Popup search/launcher windows positioned based on cursor screen
- **Plugin Windows**: Created dynamically by plugins with injection of plugin APIs

## Development Notes

- Node.js version: 22.16.0+ (enforced by pnpm preinstall hook)
- Uses Electron 37.2.4+ with Vue 3.5.18+
- Development uses hot-reloading with process cleanup via DevProcessManager
- Plugin development supports live reloading when manifest.json or main files change
- CoreBox positioning is screen-aware and adapts to multi-monitor setups

## Key File Locations

- Main entry: `apps/core-app/src/main/index.ts`
- Core app logic: `apps/core-app/src/main/core/touch-core.ts`
- Plugin system: `apps/core-app/src/main/plugins/plugin-core.ts`
- CoreBox launcher: `apps/core-app/src/main/modules/box-tool/core-box.ts`
- Renderer entry: `apps/core-app/src/renderer/src/main.ts`