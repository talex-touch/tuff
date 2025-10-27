# Tray System Optimization

## Overview

This directory contains the new optimized tray system for Talex Touch, replacing the old remote icon download system with a local icon-based approach.

## Files

- `tray-manager.ts` - Main tray manager that handles tray icon creation and interaction
- `tray-menu-builder.ts` - Builds the context menu with all tray menu items
- `tray-icon-provider.ts` - Provides local icon resources with platform detection
- `tray-state-manager.ts` - Manages tray state (window visibility, download count, etc.)

## Features

### Tray Icon Behavior
- **Left Click**: Toggle main window visibility
- **Right Click**: Show context menu
- **Double Click** (macOS): Show main window

### Context Menu Items
1. **Window Control**: Show/Hide main window (dynamic text)
2. **Quick Actions**:
   - Open CoreBox (with keyboard shortcut)
   - Download Center (with task count badge)
3. **Tools**:
   - Clipboard History
   - Terminal
   - Settings
4. **About**:
   - Version info
   - Check for updates
   - View logs
   - Open data directory
   - Visit website
5. **App Control**:
   - Restart application
   - Quit Talex Touch

### Window Close Behavior
- **Default**: Close button minimizes to tray (configurable)
- **Setting**: "Close window to tray" toggle in settings
- **macOS**: Dock icon click shows window

### Internationalization
- All menu items support Chinese and English
- Dynamic language switching updates menu

### Dynamic State Updates
- Download task count updates in real-time
- Update availability notifications
- Window visibility state synchronization

## Migration from Old System

The old `tray-holder.ts` module has been marked as `@deprecated` but is preserved for backward compatibility. The new system:

1. Uses local icon resources instead of remote downloads
2. Provides comprehensive menu functionality
3. Supports user configuration
4. Implements proper event-driven architecture

## Testing

To test the new tray system:

1. **Icon Display**: Verify tray icon appears correctly on all platforms
2. **Click Behavior**: Test left/right click interactions
3. **Menu Functionality**: Verify all menu items work correctly
4. **Window Control**: Test show/hide window functionality
5. **Settings**: Test window behavior configuration
6. **Internationalization**: Test language switching
7. **Dynamic Updates**: Test download count and update notifications

## Configuration

Window behavior settings are available in the settings page:
- Close window to tray (default: enabled)
- Start minimized to tray (default: disabled)

Settings are stored in the application configuration and can be modified at runtime.
