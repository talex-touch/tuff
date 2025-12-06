# Keyboard API

## Overview

When a plugin's UI View is attached to CoreBox, the system provides automatic keyboard event handling and forwarding, allowing plugins to respond to user keyboard interactions.

## ESC Key Auto-Exit

Pressing ESC in the UI View will **automatically exit UI mode** (deactivate providers), without requiring manual handling by the plugin.

### Behavior
- User presses ESC in the plugin UI View
- System automatically calls `exitUIMode()` to exit UI mode
- Plugin UI View is unmounted, CoreBox returns to search state
- This is consistent with ESC behavior in the main CoreBox interface

### Technical Implementation
The system captures ESC key by listening to WebContents' `before-input-event`:

```typescript
// Handled automatically by main process (plugins don't need to care)
uiView.webContents.on('before-input-event', (event, input) => {
  if (input.key === 'Escape' && input.type === 'keyDown') {
    coreBoxManager.exitUIMode()
    event.preventDefault()
  }
})
```

## Keyboard Event Forwarding

When focus is on the CoreBox main input, specific keys are forwarded to the plugin UI View.

### Forwarded Keys
| Key | Description |
| --- | --- |
| `Enter` | Confirm/Submit action |
| `ArrowUp` | Navigate up |
| `ArrowDown` | Navigate down |
| `Meta/Ctrl + *` | Shortcut combinations (except Cmd+V) |

> **Note**: `ArrowLeft` and `ArrowRight` are NOT forwarded as they are used for text editing in the input field. If you need left/right navigation, use `Meta/Ctrl + ArrowLeft/ArrowRight`.

### Listening to Keyboard Events

#### Method 1: Using Feature SDK

```typescript
import { useFeature } from '@talex-touch/utils/plugin/sdk'

const feature = useFeature()

const unsubscribe = feature.onKeyEvent((event) => {
  if (event.key === 'Enter') {
    // Handle enter key
    submitSelection()
  } else if (event.key === 'ArrowDown') {
    // Navigate down
    selectNext()
  } else if (event.key === 'ArrowUp') {
    // Navigate up
    selectPrev()
  } else if (event.metaKey && event.key === 'k') {
    // Handle Cmd+K
    openSearch()
  }
})

// Cleanup on unmount
onUnmounted(() => {
  unsubscribe()
})
```

#### Method 2: Using Bridge Hook

```typescript
import { onCoreBoxKeyEvent } from '@talex-touch/utils/plugin/sdk/hooks/bridge'

onCoreBoxKeyEvent((event) => {
  console.log('Key pressed:', event.key)
  
  if (event.key === 'Enter' && !event.repeat) {
    handleSubmit()
  }
})
```

#### Method 3: Direct Channel Listening

```typescript
// In plugin renderer
window.$channel.on('core-box:key-event', (event) => {
  const { key, metaKey, ctrlKey } = event
  // Handle key
})
```

## Event Data Structure

```typescript
interface ForwardedKeyEvent {
  key: string       // Key name, e.g., 'Enter', 'ArrowDown'
  code: string      // Key code, e.g., 'Enter', 'ArrowDown'
  metaKey: boolean  // Whether Cmd/Win key is pressed
  ctrlKey: boolean  // Whether Ctrl key is pressed
  altKey: boolean   // Whether Alt key is pressed
  shiftKey: boolean // Whether Shift key is pressed
  repeat: boolean   // Whether this is a repeat event (key held down)
}
```

## IPC Channels

| Channel Name | Direction | Description |
| --- | --- | --- |
| `core-box:key-event` | Main → Plugin | Keyboard event forwarding |
| `core-box:forward-key-event` | Renderer → Main | Request key forwarding |
| `core-box:get-ui-view-state` | Renderer → Main | Query UI View state |
| `core-box:ui-mode-exited` | Main → Renderer | UI mode exited notification |

## Best Practices

### 1. Avoid Duplicate Handling
ESC key is already handled by the system. Plugins should not listen for ESC to exit UI mode.

### 2. Check repeat Flag
For single-trigger actions (like submit), check the `repeat` flag:

```typescript
feature.onKeyEvent((event) => {
  if (event.key === 'Enter' && !event.repeat) {
    // Only trigger on first press
    submitForm()
  }
})
```

### 3. Modifier Key Handling
When handling modifier keys, be aware of platform differences:

```typescript
feature.onKeyEvent((event) => {
  // macOS uses metaKey (Cmd), Windows/Linux uses ctrlKey
  const modifier = event.metaKey || event.ctrlKey
  
  if (modifier && event.key === 's') {
    // Cmd+S or Ctrl+S to save
    saveDocument()
  }
})
```

### 4. Cleanup Listeners
Unsubscribe when component unmounts to avoid memory leaks:

```typescript
const unsubscribe = feature.onKeyEvent(handler)

onUnmounted(() => {
  unsubscribe()
})
```

## Debugging

With DevTools open, you can see keyboard event logs in the console:

```
[CoreBox] Forwarding key event to UI view: Enter
[CoreBox] ESC pressed in UI view, exiting UI mode
```
