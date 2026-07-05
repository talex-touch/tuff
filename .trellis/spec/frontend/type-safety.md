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

## CoreBox Icon Payload Contracts

Recommendation and search-result icons cross main-process providers, rebuilders, and Vue renderers. Normalize icon inputs at the producer boundary instead of making renderer components infer filesystem semantics.

### 1. Scope / Trigger

- Trigger: app/plugin recommendation items that carry icon payloads into CoreBox renderers.
- Producer examples: app scanner/search processing, plugin recommendation rebuilding.
- Consumer examples: `TxIcon`-backed CoreBox list and grid item renderers.

### 2. Signatures

Icon payloads use the existing Tuff icon shape:

```ts
type CoreBoxIconPayload = {
  type: 'class' | 'url' | 'file' | 'emoji' | 'svg'
  value: string
  color?: string
  colorful?: boolean
  status?: string
  error?: string
}
```

Recommendation badges use class icon names, not emoji text:

```ts
type RecommendationBadge = {
  label: string
  icon: `i-${string}`
}
```

### 3. Contracts

- `data:` image URLs remain URL icons and must set `colorful: true`.
- `file://` local file URLs are decoded with shared file-path helpers, checked as filesystem paths, then emitted as `tfile://` URL icons with `colorful: true`.
- Existing `tfile://` values are preserved as URL icons with `colorful: true`.
- Existing local filesystem paths are checked, converted to `tfile://`, and marked `colorful: true`.
- Empty, missing, or nonexistent app icon inputs fall back to `{ type: 'class', value: 'i-ri-apps-line' }`.
- Plugin recommendation rebuilding must preserve supported icon metadata fields: `type`, `value`, `color`, `colorful`, `status`, and `error`.
- Renderer badge components should only render class badge icons that start with `i-`; stale cached emoji badge values are ignored.

### 4. Validation & Error Matrix

- Empty icon input -> app fallback class icon.
- Missing local path -> app fallback class icon.
- Invalid or malformed local file URL -> app fallback class icon.
- Valid `data:` / `file://` / `tfile://` / local path -> URL icon with source colors preserved.
- Plugin icon with unsupported `type` or empty `value` -> recommendation fallback class icon.
- Badge icon not starting with `i-` -> omit the visual badge icon and keep the label.

### 5. Good/Base/Bad Cases

- Good: `file:///Applications/Foo.app/.../icon.icns` becomes a checked `tfile://...` URL icon with `colorful: true`.
- Base: no icon value becomes `i-ri-apps-line`.
- Bad: passing `file://...` directly to `fs.existsSync()` or rendering badge emojis as text.

### 6. Tests Required

- App icon normalization tests for `data:`, `file://`, `tfile://`, local path, empty input, and missing path.
- Drift handling tests comparing local paths with equivalent `file://` values.
- Plugin recommendation rebuild tests that assert optional icon metadata is preserved.
- Renderer tests that assert list and grid badges use class icons and image icons keep color forwarding.

### 7. Wrong vs Correct

#### Wrong

```ts
if (existsSync(rawIconValue)) {
  return { type: 'file', value: rawIconValue }
}
return { type: 'file', value: '' }
```

#### Correct

```ts
const localPath = resolveLocalFilePath(rawIconValue)

if (localPath && existsSync(localPath)) {
  return { type: 'url', value: toTfileUrl(localPath), colorful: true }
}

return { type: 'class', value: 'i-ri-apps-line' }
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
