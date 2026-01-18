# Platform Capabilities SDK

<div style="height: 160px; border-radius: 16px; background: linear-gradient(135deg, #06b6d4, #3b82f6);"></div>

## Introduction

The Platform Capabilities SDK provides a catalog of platform-level capabilities and their status.

## Technical Overview

- A main-process registry maintains capability definitions.
- Capabilities are queried via `platform.capabilities.list` (TuffTransport).
- Supports scope/status filters.

## Implementation Notes

- The SDK is a thin wrapper over transport events.
- Capabilities are statically registered and can be extended over time.

## Usage

```typescript
import { usePlatformSdk } from '@talex-touch/utils/renderer'

const platform = usePlatformSdk()

// List all capabilities
const all = await platform.listCapabilities()

// Filter by scope
const systemCaps = await platform.listCapabilities({ scope: 'system' })
```

## Examples

1. Filter beta capabilities: `{ status: 'beta' }`
2. Render a platform capability list in Settings

## FAQ

**Q: Where does the list come from?**  
A: The main-process registry registers capabilities and expands over time.
