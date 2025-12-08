# Bridge Event Cache System PRD

## Background

When a plugin's UIView is attached to CoreBox, the main process sends initial query data via `core-box:input-change` event on `dom-ready`. However, the plugin's JavaScript code may not have registered its `onCoreBoxInputChange` handler yet, causing the initial event to be lost.

### Current Flow (Problematic)

```
Timeline:
─────────────────────────────────────────────────────────────────────►

Main Process (window.ts):
    [dom-ready] ──► sendToPlugin('core-box:input-change', query)

Plugin Renderer (bridge.ts):
                              [JS executing] ──► onCoreBoxInputChange(handler)
                                                          │
                                                          └─ Too late! Event already sent.
```

### Root Cause

- `window.ts#972-978`: Sends `core-box:input-change` immediately after `dom-ready`
- `bridge.ts#26-40`: `injectBridgeEvent` only registers channel listener when first hook is added
- **Race Condition**: Event arrives before any hook is registered

## Proposed Solution

Implement an **Event Replay Cache** mechanism in `@talex-touch/utils/plugin/sdk/hooks/bridge.ts`.

### New Flow (Fixed)

```
Timeline:
─────────────────────────────────────────────────────────────────────►

Main Process:
    [dom-ready] ──► sendToPlugin('core-box:input-change', query)

Plugin Renderer (bridge.ts):
    [preload] ──► registerEarlyListener()    ──► [cache event]
                                                       │
                              [JS executing] ──► onCoreBoxInputChange(handler)
                                                       │
                                                       └─ Replay cached event to handler
```

## Technical Design

### 1. Early Event Cache

```typescript
interface CachedEvent<T = any> {
  type: BridgeEvent
  data: T
  timestamp: number
}

const __eventCache: Map<BridgeEvent, CachedEvent[]> = new Map()
const __earlyListenersRegistered = new Set<BridgeEvent>()
```

### 2. API Changes

#### 2.1 New: `initBridgeEventCache()`

Called early (ideally in preload or entry point) to start caching events before hooks are registered.

```typescript
export function initBridgeEventCache(events?: BridgeEvent[]): void
```

#### 2.2 Modified: `injectBridgeEvent<T>()`

When a hook is registered, replay any cached events to the new hook.

```typescript
export function injectBridgeEvent<T>(type: BridgeEvent, hook: BridgeHook<T>): BridgeHook<T> {
  // ... existing logic ...
  
  // NEW: Replay cached events to newly registered hook
  const cached = __eventCache.get(type)
  if (cached && cached.length > 0) {
    cached.forEach(event => {
      try {
        hook(event.data)
      } catch (e) {
        console.error(`[TouchSDK] ${type} replay error:`, e)
      }
    })
    // Clear cache after replay (optional: could keep for late subscribers)
    __eventCache.delete(type)
  }
  
  // ... rest of existing logic ...
}
```

#### 2.3 New: `clearBridgeEventCache()`

Manual cache clear if needed.

```typescript
export function clearBridgeEventCache(type?: BridgeEvent): void
```

### 3. Configuration Options

```typescript
interface BridgeEventCacheOptions {
  /** Max events to cache per event type (default: 1 for input-change, 10 for others) */
  maxCacheSize?: number
  
  /** Max age in ms before cached events expire (default: 5000) */
  maxAge?: number
  
  /** Whether to replay to all new subscribers or just the first (default: 'first') */
  replayMode?: 'first' | 'all'
  
  /** Event types to cache (default: all BridgeEventForCoreBox) */
  eventTypes?: BridgeEvent[]
}
```

### 4. Implementation Location

**File**: `packages/utils/plugin/sdk/hooks/bridge.ts`

### 5. Backward Compatibility

- Existing `onCoreBoxInputChange`, `onCoreBoxKeyEvent`, etc. remain unchanged
- Cache mechanism is opt-in via `initBridgeEventCache()`
- If not initialized, behavior is identical to current

## Implementation Steps

1. **Add event cache data structures** in `bridge.ts`
2. **Implement `initBridgeEventCache()`** to register early listeners
3. **Modify `injectBridgeEvent()`** to replay cached events
4. **Add `clearBridgeEventCache()`** utility
5. **Auto-init in SDK entry** (optional, based on config)
6. **Update documentation**

## Alternative Approaches Considered

### A. Delay Main Process Event

Pros: Simpler, no SDK changes
Cons: Arbitrary delay unreliable, different machines have different load times

### B. Ready Handshake Protocol

Plugin sends "ready" signal, main process waits before sending events.

Pros: Deterministic
Cons: More complex, requires protocol changes on both sides, latency increase

### C. Event Replay Cache (Chosen)

Pros: 
- No changes to main process
- Works immediately on SDK upgrade
- Handles variable initialization times

Cons:
- Slightly more memory usage (negligible)
- Need to manage cache lifecycle

## Success Criteria

1. Initial query is received by plugin even with slow hook registration
2. No memory leaks from unbounded cache growth
3. Backward compatible with existing plugins
4. < 5ms overhead for normal operation

## Timeline

- Implementation: 2-4 hours
- Testing: 1-2 hours
- Documentation: 30 minutes

## Open Questions

1. Should cache persist across UIView reattachments?
2. Should we provide a hook to detect "missed events" for debugging?
3. Auto-init vs explicit init?
