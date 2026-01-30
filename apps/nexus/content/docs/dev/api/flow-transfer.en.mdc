# Flow Transfer API

## Overview
Flow Transfer is a cross-plugin data handoff system, similar to “share” on mobile but more flexible and structured.

## Introduction
This document covers current capabilities:
- Sender: `dispatch()` + target selector
- Target: `onFlowTransfer()` + `acknowledge()` / `reportError()`
- Native share: `nativeShare()`

> Permission note: Flow Transfer is gated by the Permission Center. Unauthorized requests return `PERMISSION_DENIED` and trigger consent UI.

## Core Concepts
**Flow payload**

```typescript
interface FlowPayload {
  type: 'text' | 'image' | 'files' | 'json' | 'html' | 'custom'
  data: string | object
  mimeType?: string
  context?: {
    sourcePluginId: string
    sourceFeatureId?: string
    originalQuery?: TuffQuery
    metadata?: Record<string, any>
  }
}
```

**Flow target**

```typescript
interface FlowTarget {
  id: string
  name: string
  description?: string
  supportedTypes: ('text' | 'image' | 'files' | 'json' | 'html' | 'custom')[]
  icon?: string
  featureId?: string
}
```

## Shortcuts

| Shortcut | Action | Notes |
|--------|------|------|
| `Command/Ctrl+D` | Detach to DivisionBox | Detach selected item |
| `Command/Ctrl+Shift+D` | Flow Transfer | Open target picker |

## Plugin Configuration
Declare Flow capabilities in `manifest.json`:

- `flowSender?: boolean`
- `flowTargets?: FlowTarget[]`

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "flowSender": true,
  "flowTargets": [
    {
      "id": "quick-note",
      "name": "Quick Note",
      "description": "Save content as a note",
      "supportedTypes": ["text", "html", "image"],
      "icon": "ri:sticky-note-line",
      "featureId": "create-note"
    }
  ]
}
```

## SDK Usage
**Send flow (sender)**

```typescript
import { createFlowSDK } from '@talex-touch/utils/plugin/sdk'

const flow = createFlowSDK(channel, 'my-plugin-id')

const result = await flow.dispatch(
  {
    type: 'text',
    data: 'Hello from my plugin!',
    context: {
      sourcePluginId: 'my-plugin-id',
      metadata: { timestamp: Date.now() }
    }
  },
  {
    title: 'Share text',
    description: 'Send to another plugin'
  }
)
```

**Get available targets**

```typescript
const allTargets = await flow.getAvailableTargets()
const textTargets = await flow.getAvailableTargets('text')
```

**Receive flow (target)**

```typescript
import { createFlowSDK } from '@talex-touch/utils/plugin/sdk'

const flow = createFlowSDK(channel, 'my-plugin-id')

flow.onFlowTransfer(async (payload, ctx) => {
  try {
    await handlePayload(payload)
    ctx.acknowledge({ success: true })
  } catch (error) {
    ctx.reportError({ message: 'Failed to handle payload' })
  }
})
```

**Native share**

```typescript
await flow.nativeShare({
  type: 'text',
  data: 'Share via system dialog'
})
```

## Best Practices
- Register `onFlowTransfer` to avoid being marked “not supported”.
- Provide clear `supportedTypes` and `description` for better target ranking.
- Use `requireAck` for critical workflows and handle fallback actions.

## Technical Notes
- Target list is maintained by the main process and merged with native share targets.
- Plugins are registered via `flow:register-targets`; missing registration means targets won’t appear.

## Related Docs
- [DivisionBox API](./division-box.en.md)
- [Plugin Manifest](../reference/manifest.en.md)
