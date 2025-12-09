# Box SDK

The Box SDK provides plugins with the ability to control CoreBox window behavior, including show/hide, resizing, and input field control.

## Quick Start

```typescript
import { useBox } from '@talex-touch/utils/plugin/sdk'

const box = useBox()

// Hide CoreBox
box.hide()

// Expand CoreBox to show 10 results
await box.expand({ length: 10 })

// Get current input
const input = await box.getInput()
```

---

## API Reference

### useBox()

Get Box SDK instance.

```typescript
import { useBox } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
```

> **Note**: Must be called within plugin renderer context.

---

## Window Control

### `hide()`

Hide the CoreBox window.

```typescript
box.hide()
```

### `show()`

Show the CoreBox window.

```typescript
box.show()
```

### `expand(options?)`

Expand the CoreBox window to show more results.

```typescript
// Expand to show 10 items
await box.expand({ length: 10 })

// Force maximum expansion
await box.expand({ forceMax: true })

// Default expansion
await box.expand()
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `length` | `number` | Number of items to show |
| `forceMax` | `boolean` | Force maximum expansion |

### `shrink()`

Shrink the CoreBox window to compact mode.

```typescript
await box.shrink()
```

---

## Input Field Control

### `hideInput()`

Hide the search input field.

```typescript
await box.hideInput()
```

### `showInput()`

Show the search input field.

```typescript
await box.showInput()
```

### `getInput()`

Get current input field value.

```typescript
const input = await box.getInput()
console.log('Current input:', input)
```

### `setInput(value)`

Set input field value.

```typescript
await box.setInput('hello world')
```

### `clearInput()`

Clear the input field.

```typescript
await box.clearInput()
```

---

## Monitoring Features

### `allowInput()`

Enable input monitoring, allowing plugin to receive input change events.

```typescript
import { useBox, useChannel } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
const channel = useChannel()

// Enable input monitoring
await box.allowInput()

// Listen to input changes
channel.regChannel('core-box:input-change', ({ data }) => {
  console.log('Input changed:', data.input)
})
```

### `allowClipboard(types)`

Enable clipboard monitoring, allowing plugin to receive clipboard change events.

```typescript
import { useBox, ClipboardType, ClipboardTypePresets } from '@talex-touch/utils/plugin/sdk'

const box = useBox()

// Monitor text and images
await box.allowClipboard(ClipboardType.TEXT | ClipboardType.IMAGE)

// Or use presets
await box.allowClipboard(ClipboardTypePresets.ALL)
```

#### ClipboardType Enum

| Value | Binary | Description |
|-------|--------|-------------|
| `TEXT` | `0b0001` | Text |
| `IMAGE` | `0b0010` | Image |
| `FILE` | `0b0100` | File |

#### Preset Combinations

```typescript
import { ClipboardTypePresets } from '@talex-touch/utils/plugin/sdk'

// Text only
ClipboardTypePresets.TEXT_ONLY

// Text and images
ClipboardTypePresets.TEXT_AND_IMAGE

// All types
ClipboardTypePresets.ALL
```

---

## Type Definitions

```typescript
interface BoxSDK {
  hide(): void
  show(): void
  expand(options?: BoxExpandOptions): Promise<void>
  shrink(): Promise<void>
  hideInput(): Promise<void>
  showInput(): Promise<void>
  getInput(): Promise<string>
  setInput(value: string): Promise<void>
  clearInput(): Promise<void>
  allowInput(): Promise<void>
  allowClipboard(types: number): Promise<void>
}

interface BoxExpandOptions {
  length?: number
  forceMax?: boolean
}

enum ClipboardType {
  TEXT = 0b0001,
  IMAGE = 0b0010,
  FILE = 0b0100,
}
```
