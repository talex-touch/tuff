# Widget Sandbox Completion — Design

## Boundary

The existing renderer evaluates compiled widgets in the CoreApp renderer realm. This task hardens host-API containment in that realm; it does not claim process, origin, or intrinsic isolation. The evidence contract exposes that limitation.

## Runtime policy

Add one policy context per registered widget. It owns:

- a fixed-window call budget for security-sensitive operations;
- a bounded audit ring containing timestamp, widget/plugin identifiers, operation, decision, and reason only;
- isolated history state and an isolated `message` EventTarget;
- fail-closed facades for clipboard, navigation mutation, workers, service workers, direct network constructors, and dynamic execution.

The sandbox window/document/navigator proxies return these facades before delegating safe display APIs. Direct globals are injected into the widget factory so lexical lookup cannot bypass the proxies. WidgetFrame capture guards block anchor/form navigation from both light DOM and shadow DOM.

## Dynamic execution

`new Function` remains the single component-loading boundary because current Vue/Arrow component objects are not serializable across Worker/iframe boundaries. Before evaluation, a lexical preflight rejects direct `eval`, `Function`, dynamic import, `importScripts`, WebAssembly compilation/instantiation, and constructor/prototype escape markers. The factory receives fail-closed bindings for these APIs and for browser capability globals.

Evidence reports `guarded-new-function`, `same-realm`, and `host-api-containment`; it must not report a secure realm.

## Expression evaluator

Replace generic mathjs evaluation with a deterministic parser in `@talex-touch/utils/core-box`. The grammar supports finite numeric literals, parentheses, unary/binary arithmetic, power, allowlisted constants, and allowlisted one/two-argument math functions. Both CoreApp calculation and PreviewSDK advanced expressions consume this parser.

## Lifecycle

Registration creates/replaces the policy context. Update replaces it. Unregister disposes live listeners/state while bounded audit entries remain available for diagnostics. Failed registration records the policy denial and failure evidence.

## Failure behavior

- Blocked capability: throw/reject `NotAllowedError` (or a stable sandbox error where DOMException is unavailable).
- Quota exhausted: throw/reject a stable `WIDGET_SANDBOX_QUOTA_EXCEEDED` error.
- Unsafe source: reject registration before invoking the factory.
- Invalid expression: return the existing null/unsuccessful result path.

## Verification

Focused tests must observe host spies staying untouched, local messaging/history behavior, navigation prevention, quota exhaustion, bounded/payload-free audit entries, preflight rejection, allowed widget runtimes, and parser allow/deny behavior. A focused typecheck/test command and an executable registration/mount scenario provide final proof.
