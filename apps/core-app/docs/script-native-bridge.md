# Script/Native Bridge Design Notes

## Scope
- Define a main-process bridge module for script and native execution.
- Document provider abstraction, IPC contract, timeout/cancel behavior, and configuration.

## Summary
- A ScriptBridgeModule runs in the main process and routes requests to providers.
- IPC uses TuffTransport events (`script:bridge:*`, `native:bridge:*`) with explicit timeout and cancel paths.
- Config lives in `config/script-bridge.json` and controls enablement, concurrency, and provider allowlist.

## References
- docs/INDEX.md
- apps/core-app/src/main/core/channel-core.ts
- apps/core-app/src/main/modules/terminal/terminal.manager.ts
- apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts
- packages/utils/transport/event/builder.ts
- packages/utils/transport/types.ts
- packages/utils/transport/errors.ts

---

## 1) Module Responsibilities

ScriptBridgeModule (main process):
- Register and manage providers (script/native).
- Validate requests (allowlist, platform support, path policy).
- Execute requests with timeout/cancel semantics.
- Stream stdout/stderr for long-running tasks when requested.
- Expose capability metadata for UI and plugins.

Non-goals:
- No UI rendering or direct renderer-side execution.
- No new permission model (reuse existing permission gate if/when added).

---

## 2) Provider Interfaces

```ts
export type BridgeKind = 'script' | 'native'
export type BridgePlatform = 'win32' | 'darwin' | 'linux'

export interface BridgeRequest {
  providerId: string
  kind: BridgeKind
  action: string
  args?: Record<string, unknown>
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  stream?: boolean
}

export interface BridgeResponse {
  runId: string
  status: 'ok' | 'error' | 'cancelled' | 'timeout'
  exitCode?: number | null
  stdout?: string
  stderr?: string
  error?: string
  meta?: Record<string, unknown>
}

export interface BridgeProviderContext {
  platform: BridgePlatform
  logger: { info: Function; warn: Function; error: Function }
  config: ScriptBridgeConfig
}

export interface BridgeInvokeContext {
  timeoutMs: number
  abortSignal: AbortSignal
  workingDir: string
}

export interface BridgeProvider {
  id: string
  kind: BridgeKind
  platforms: BridgePlatform[]
  init?(ctx: BridgeProviderContext): Promise<void>
  validate?(request: BridgeRequest): Promise<{ ok: boolean; reason?: string }>
  invoke(request: BridgeRequest, ctx: BridgeInvokeContext): Promise<BridgeResponse>
  cancel?(runId: string, reason?: string): Promise<boolean>
  dispose?(): Promise<void>
}
```

Notes:
- Script providers handle Python/shell/AppleScript by spawning processes.
- Native providers handle DLL/so/dylib via sidecar or bridge layer (no direct UI access).

---

## 3) IPC Contract

Events should be defined with `defineEvent('script').module('bridge').event('invoke')`
and `defineEvent('native').module('bridge').event('invoke')` for new code.

| Event | Direction | Request | Response | Notes |
| --- | --- | --- | --- | --- |
| `script:bridge:invoke` | R/P -> M | `BridgeRequest` | `BridgeResponse` | Short tasks or stream setup |
| `script:bridge:cancel` | R/P -> M | `{ runId, reason? }` | `{ cancelled: boolean }` | Best-effort cancel |
| `script:bridge:status` | R/P -> M | `{ runId }` | `BridgeResponse` | Poll status |
| `script:bridge:capabilities` | R/P -> M | `void` | `{ providers: ProviderMeta[] }` | List supported providers |
| `native:bridge:invoke` | R/P -> M | `BridgeRequest` | `BridgeResponse` | Native entrypoint |
| `native:bridge:cancel` | R/P -> M | `{ runId, reason? }` | `{ cancelled: boolean }` | Best-effort cancel |
| `native:bridge:capabilities` | R/P -> M | `void` | `{ providers: ProviderMeta[] }` | List supported providers |

Streaming:
- If `BridgeRequest.stream === true`, use TuffTransport stream ports.
- Stream events follow the `:stream:*` suffixes from `STREAM_SUFFIXES`.
- Output chunks include `{ runId, streamId, type, chunk }`.

Provider metadata:
```ts
export interface ProviderMeta {
  id: string
  kind: BridgeKind
  platforms: BridgePlatform[]
  actions: string[]
}
```

---

## 4) Timeout and Cancellation

- Default timeout: `DEFAULT_TIMEOUT` (10_000ms) unless overridden per request.
- Long-running tasks must set `timeoutMs` or opt into streams.
- The bridge tracks in-flight runs by `runId` and attaches an `AbortController`.
- On cancel:
  - Signal the provider and allow a short grace period for cleanup.
  - If still running, terminate the process/sidecar and return `cancelled`.
- On timeout:
  - Treat as `status = 'timeout'` and emit a sanitized error message.

---

## 5) Configuration

Config file (main process):
`config/script-bridge.json`

```json
{
  "enabled": true,
  "defaultTimeoutMs": 10000,
  "maxConcurrent": 4,
  "providerAllowlist": ["python", "native-sidecar"],
  "providerDenylist": [],
  "workingDirPolicy": "module",
  "logLevel": "info",
  "providers": {
    "python": {
      "enabled": true,
      "runtime": "system",
      "allowUserSite": false
    }
  }
}
```

---

## 6) Logging and Error Handling

- Use `getLogger('script-bridge')` with structured metadata.
- Do not log raw scripts, environment secrets, or full file paths by default.
- Map transport errors to `TuffTransportErrorCode` (TIMEOUT, UNKNOWN_EVENT, IPC_ERROR).
