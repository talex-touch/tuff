# DivisionBox API

## Overview
DivisionBox is a lightweight sub-window system based on `WebContentsView`, used for plugin UI, tools, and debug panels.

## Introduction
This document covers the currently shipped capabilities (open/close/state + lifecycle events). Advanced layouts are out of scope.

> Permission note: DivisionBox is gated by the Permission Center. Plugins must request `window.create`.

## Core Concepts
**Lifecycle states**

```
prepare → attach → active → inactive → detach → destroy
```

| State | Description |
|------|------|
| `prepare` | Preparing resources |
| `attach` | Attached to window |
| `active` | Active interaction |
| `inactive` | Inactive, can be cached |
| `detach` | Detached from window |
| `destroy` | Destroyed and released |

**DivisionBox config**

```typescript
interface DivisionBoxConfig {
  url: string
  title: string
  icon?: string
  size?: 'compact' | 'medium' | 'expanded'
  keepAlive?: boolean
  pluginId?: string
  header?: {
    show: boolean
    title?: string
    icon?: string
  }
  ui?: {
    showInput?: boolean
    inputPlaceholder?: string
    showResults?: boolean
    initialInput?: string
  }
}
```

## Shortcuts

| Shortcut | Action |
|--------|------|
| `Command/Ctrl+D` | Detach current item into DivisionBox |

## Usage
**Plugin SDK (recommended)**

```typescript
import { useDivisionBox } from '@talex-touch/utils/plugin/sdk'

const divisionBox = useDivisionBox()
const { sessionId } = await divisionBox.open({
  url: 'https://example.com/tool',
  title: 'My Tool',
  size: 'medium',
  keepAlive: true
})

const unsubscribe = divisionBox.onLifecycleChange((event) => {
  console.log(event.sessionId, event.oldState, event.newState)
})

await divisionBox.close(sessionId)
unsubscribe()
```

**Open from renderer**

```typescript
import { useTuffTransport } from '@talex-touch/utils/transport'
import { DivisionBoxEvents } from '@talex-touch/utils/transport/events'

const transport = useTuffTransport()
const response = await transport.send(DivisionBoxEvents.open, {
  url: 'plugin://my-plugin/panel.html',
  title: 'My Panel',
  icon: 'ri:dashboard-line',
  size: 'medium',
  keepAlive: true,
  pluginId: 'my-plugin'
})
```

**Close**

```typescript
await divisionBox.close(sessionId, {
  delay: 0,
  animation: false,
  force: false
})
```

**Get session state**

```typescript
const response = await transport.send(DivisionBoxEvents.getState, { sessionId })
```

**Update session state**

```typescript
await transport.send(DivisionBoxEvents.updateState, {
  sessionId,
  key: 'scrollY',
  value: 150
})
```

## API Reference
**open(config)**
Opens a new DivisionBox window.

**close(sessionId, options?)**
Closes the session; `force` ignores `keepAlive`.

**onStateChange(handler)**
Subscribes to simplified state changes.

**onLifecycleChange(handler)**
Subscribes to full lifecycle transitions.

**updateState(sessionId, key, value)**
Stores session state data.

**getState(sessionId, key)**
Reads session state data.

## URL Protocols

| Protocol | Description | Example |
|------|------|------|
| `plugin://` | Plugin assets | `plugin://my-plugin/index.html` |
| `file://` | Local files | `file:///path/to/file.html` |
| `http(s)://` | Web resources | `https://example.com` |
| `tuff://` | Built-in pages | `tuff://detached?itemId=xxx` |

## Flow Transfer Integration

```json
{
  "flowTargets": [
    {
      "id": "open-in-panel",
      "name": "Open in panel",
      "supportedTypes": ["json", "text"],
      "featureId": "open-panel"
    }
  ]
}
```

```typescript
function onFeatureTriggered(featureId: string, query: TuffQuery) {
  if (isFlowTriggered(query)) {
    const flowData = extractFlowData(query)
    divisionBox.open({
      url: `/viewer.html?sessionId=${flowData.sessionId}`,
      title: 'View Data'
    })
  }
}
```

## IPC Channels

| Channel | Direction | Description |
|------|------|------|
| `division-box:open` | Renderer → Main | Open session |
| `division-box:close` | Renderer → Main | Close session |
| `division-box:get-state` | Renderer → Main | Get state |
| `division-box:update-state` | Renderer → Main | Update state |
| `division-box:get-active-sessions` | Renderer → Main | List active sessions |
| `division-box:state-changed` | Main → Renderer | State change notice |
| `division-box:session-destroyed` | Main → Renderer | Session destroyed |

## Best Practices
- Enable `keepAlive` for frequently used panels.
- Choose `size` based on content density.
- Persist user state via `updateState/getState`.
- Release resources on `inactive` and `destroy` states.

## Technical Notes
- DivisionBox is managed by the main process using `WebContentsView`.
- The SDK wraps IPC events and normalizes lifecycle updates.

## Related Docs
- [Flow Transfer API](./flow-transfer.en.md)
- [Plugin Manifest](../reference/manifest.en.md)
