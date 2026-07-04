# Type Safety

> TypeScript and runtime safety patterns in this project.

---

## Overview

Frontend code is TypeScript-first. Keep type ownership close to the contract:

- Component-only props/emits can live beside the component.
- Reusable component contracts live in TuffEx component-local `types.ts`.
- Cross-layer SDK, transport, plugin, permission, i18n, and domain payload types live in `packages/utils` or the existing owning package.
- Intelligence mirror types live in `packages/tuff-intelligence` when the SDK is mirrored there.

---

## Type Organization

Use type-only imports for types:

```ts
import type { FileUploaderEmits, FileUploaderProps } from './types'
```

Use local interfaces for component-local props:

```ts
interface Props {
  title?: string
  disabled?: boolean
}
```

Use shared package types for cross-layer data. Examples:

- `packages/utils/types/intelligence.ts`
- `packages/utils/transport/events/assistant.ts`
- `packages/utils/transport/sdk/domains/intelligence.ts`
- `packages/utils/i18n/localized.ts`

---

## Typed Transport And SDKs

Do not add raw event names or untyped payload casts where a typed event/domain SDK exists.

The event builder in `packages/utils/transport/event/builder.ts` is the current type-safe pattern:

```ts
const queryEvent = defineEvent('core-box')
  .module('search')
  .event('query')
  .define<{ text: string }, SearchResult[]>()
```

When adding a new event kind, SDK method, JSONL record, or RPC payload:

1. Define the shared type in the owning package.
2. Add the typed event/domain SDK mapping.
3. Normalize runtime input at the boundary.
4. Update focused tests in both producer and consumer packages when the payload crosses packages.

---

## Runtime Validation

This codebase uses explicit guards and normalizers more often than a single global validation library.

Examples:

- `packages/utils/i18n/localized.ts` uses `isLocalizedText`, `isLocalizedList`, `resolveLocalizedText`, and `resolveLocalizedList`.
- Nexus engagement tracking normalizes action payloads before sending.
- Plugin permission boundaries return explicit reason strings such as `permission-denied`, `permission-sdk-unavailable`, and `clipboard-write-failed`.

Prefer this pattern for untrusted or cross-layer inputs:

```ts
function normalizeSource(value: unknown): DocEngagementSource {
  return value === 'doc_comments_admin' ? 'doc_comments_admin' : 'docs_page'
}
```

---

## Common Patterns

- Use `unknown` at untrusted boundaries, then narrow with type guards or normalizers.
- Use `Partial<Record<AppLocale, string>>` style maps for localized values.
- Use discriminated unions for event/payload kinds.
- Use readonly or cloned outputs for data that leaves a store/helper.
- Keep payload field names stable once they appear in SDKs, manifests, evidence, or stored data.

---

## Forbidden Patterns

- Do not add `any` for convenience. If a boundary is unknown, use `unknown` and normalize.
- Do not cast raw payload fields repeatedly in UI code.
- Do not define cross-layer types inside a page component.
- Do not bypass typed transport with raw IPC/channel strings.
- Do not silently swallow schema/payload mismatches. Return explicit degraded or blocked reasons.
- Do not store provider secrets, tokens, prompts, responses, or sensitive paths in ordinary typed UI objects that can later be logged or synced.

---

## Common Mistakes

- Treating bundled internal manifests as untrusted external data without checking the actual source.
- Treating user config, plugin manifests, browser APIs, or network responses as trusted because they already have TypeScript types.
- Changing a shared payload shape without updating both SDK tests and renderer/domain consumer tests.
- Letting evidence JSON or migration reports claim a stronger source than they actually represent.
