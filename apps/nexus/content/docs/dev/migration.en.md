---
title: Legacy Plugin Migration Guide
description: Upgrade legacy plugins to sdkapi 251212+, adopt permissions and the new input model (acceptedInputTypes / TuffQuery / allowInput)
---

# Legacy Plugin Migration Guide

This guide targets legacy plugins that:

- Don’t declare `sdkapi` (or use a lower version)
- Treat `query` as a plain string only
- Don’t receive clipboard image/files/html inputs
- Listen to CoreBox input changes but get nothing

Goal: **upgrade to `sdkapi: 251212`, declare permissions properly, and adopt the new input model (`acceptedInputTypes` + `TuffQuery`). Enable `allowInput()` only when you really need real-time input events.**

## Migration Checklist

1. `manifest.json`: add `sdkapi`
2. `manifest.json`: migrate `permissions` + add `permissionReasons`
3. `manifest.json`: add `acceptedInputTypes` on relevant Features
4. Lifecycle code: handle `query: string | TuffQuery`
5. UI/listening: call `box.allowInput()` explicitly

## 1) Declare sdkapi (permission enforcement gate)

`sdkapi` is the SDK API compatibility version (`YYMMDD`). Starting from `251212`, permission enforcement is enabled.

```json
{
  "sdkapi": 251212
}
```

## 2) Permissions: migrate to the new format

Legacy (still accepted, not recommended):

```json
{
  "permissions": ["clipboard.read", "network.internet"]
}
```

Recommended:

```json
{
  "permissions": {
    "required": ["clipboard.read", "network.internet"],
    "optional": ["storage.shared"]
  },
  "permissionReasons": {
    "clipboard.read": "Read clipboard content for input processing",
    "network.internet": "Call external service APIs",
    "storage.shared": "Cross-plugin/shared storage (optional)"
  }
}
```

See: [`Permission System`](./api/permission.en.md).

## 3) Inputs: declare acceptedInputTypes on Features

`acceptedInputTypes` belongs to **`features[].acceptedInputTypes`**.

Supported types: `text`, `image`, `files`, `html`.

```json
{
  "features": [
    {
      "id": "image-ocr",
      "name": "Image OCR",
      "acceptedInputTypes": ["image"]
    }
  ]
}
```

See: [`Search API`](./api/search.en.md).

## 4) Code: handle query as string or TuffQuery

```js
async onFeatureTriggered(featureId, query, feature) {
  const queryText = typeof query === 'string' ? query : (query?.text ?? '')
  const inputs = typeof query === 'string' ? [] : (query?.inputs ?? [])

  const imageInput = inputs.find(i => i.type === 'image')
  const filesInput = inputs.find(i => i.type === 'files')
  const htmlInput = inputs.find(i => i.type === 'html')
  const textInput = inputs.find(i => i.type === 'text')

  if (filesInput) {
    let paths = []
    try { paths = JSON.parse(filesInput.content) } catch {}
  }
}
```

## 5) allowInput: enable input monitoring explicitly

```ts
import { useBox, useChannel } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
const channel = useChannel()

await box.allowInput()
channel.regChannel('core-box:input-change', ({ data }) => {
  console.log('input:', data.input)
})
```

For clipboard monitoring events (not “trigger-time inputs”), use `box.allowClipboard()`. See: [`Box SDK`](./api/box.en.md).

