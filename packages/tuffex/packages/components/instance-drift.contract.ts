// Centralized compile-time contract for *instance expose-surface DRIFT*.
//
// WHAT THIS GUARDS — and how it differs from `missing-export.contract.ts`:
//   `missing-export.contract.ts` guards REACHABILITY: public types the docs
//   advertise that could become unreachable from a component's package entry.
//   This file guards a different, orthogonal failure: DRIFT between a
//   hand-written `*Instance` interface and the methods the SFC actually exposes
//   via `defineExpose`. Reachability ≠ drift, so the two live apart on purpose —
//   co-locating them would erode the sibling's deliberately single-purpose
//   charter (which team-lead endorsed) and let this mechanism creep into it.
//
// WHY A HAND-WRITTEN `*Instance` INTERFACE EXISTS AT ALL:
//   `TxVirtualList` is a generic SFC (`<script setup generic="T">`). vue-tsc
//   compiles a generic SFC to a *function*, not a constructor, so the usual
//   `InstanceType<typeof TxVirtualList>` fails with TS2344 and consumers cannot
//   name the ref surface that way. The package therefore ships a hand-written
//   `TxVirtualListInstance` (see `src/virtual-list/index.ts`) as the public
//   `ref()` type. Being hand-written, it can silently drift from the SFC's real
//   `defineExpose` — add/rename/remove a method in the `.vue` and the interface
//   keeps lying. This file makes that drift a compile error.
//
// WHY IT LIVES OUTSIDE `src/` AND OUTSIDE `__tests__/` (same three properties
// the sibling relies on — see its header for the full argument):
//   - vue-tsc type-checks every `packages/**/*.ts` that is not under
//     `**/__tests__/**` (tsconfig `include`/`exclude`), so a sibling-of-`src/`
//     module is actually checked by `vue-tsc --noEmit -p tsconfig.json`.
//     Empirically verified: a temporary probe in this same directory reported
//     `error TS2344`, i.e. the directory is covered despite the `include` glob
//     reading indirect.
//   - `package.json` `files` is `["dist"]`, so a source-tree `.contract.ts`
//     never ships.
//   - A `__tests__/` file would be excluded from vue-tsc, and both vitest
//     (`import type` erased) and `expectTypeOf` (runtime no-op) leave a type
//     file permanently green — no discriminating power.
//
// HOW THE EXPOSED SHAPE IS DERIVED WITHOUT A DEPENDENCY:
//   `vue-component-type-helpers` (`ComponentExposed`) is NOT installed — adding
//   it would be a phantom dependency. Instead `ExposedOf<T>` reads the exposed
//   type straight out of vue-tsc's own generated shape: a generic SFC is typed
//   as `(...) => VNode & { __ctx?: { expose(exposed: E): void, ... } }`, so the
//   argument of that `expose` method is the exact `defineExpose` payload.

import type { TxVirtualList, TxVirtualListInstance } from './src/virtual-list/index'

// Pull the `defineExpose` payload type out of a component's vue-tsc signature.
// Works for generic SFCs (where `InstanceType` is unusable) because it matches
// the component's function form and its return's `__ctx.expose` parameter.
type ExposedOf<T> = T extends (...args: any[]) => infer R
  ? R extends { __ctx?: infer Ctx }
    ? NonNullable<Ctx> extends { expose: (exposed: infer E) => void }
      ? E
      : never
    : never
  : never

// Compile-time assertion helpers.
type Assert<T extends true> = T
type Extends<A, B> = [A] extends [B] ? true : false
// `1 & any` is `any`, so `0 extends (1 & T)` is only true when `T` is `any`.
type IsAny<T> = 0 extends 1 & T ? true : false
type Not<T extends boolean> = T extends true ? false : true

// The SFC's real exposed surface, as vue-tsc sees it.
type VirtualListExposed = ExposedOf<typeof TxVirtualList>

// DISCRIMINATING GUARD: if `ExposedOf` ever silently degrades to `any` (e.g. a
// future vue-tsc changes the generated shape and the matcher stops matching),
// the two assignability checks below would pass VACUOUSLY. This makes that
// degradation a hard failure instead — green here means `VirtualListExposed` is
// a real object type, so the drift checks have teeth.
type _ExposeIsNotAny = Assert<Not<IsAny<VirtualListExposed>>>

// Drift check, both directions:
//   - `VirtualListExposed extends TxVirtualListInstance` fails if the SFC STOPS
//     exposing a method the interface still promises (removal / rename).
type _NoStaleMethodInInterface = Assert<Extends<VirtualListExposed, TxVirtualListInstance>>
//   - `TxVirtualListInstance extends VirtualListExposed` fails if the SFC STARTS
//     exposing a method the interface never documented (addition / rename).
type _NoUndocumentedExpose = Assert<Extends<TxVirtualListInstance, VirtualListExposed>>

// NEGATIVE CONTROL — proves the machinery above is not vacuously green. A type
// that lacks the interface's methods must NOT satisfy `Extends<_, Instance>`,
// so `Assert` must raise TS2344 here; `@ts-expect-error` consumes exactly that
// error. If a future edit makes `Assert`/`Extends`/`ExposedOf` stop rejecting a
// mismatch, this error disappears and TS2578 (unused @ts-expect-error) fires —
// so the guard cannot rot into a no-op unnoticed.
// @ts-expect-error — a bogus shape is deliberately not assignable to the interface
type _NegativeControl = Assert<Extends<{ __drift_probe__: () => void }, TxVirtualListInstance>>

// Referencing the positive assertions in an exported tuple forces their
// evaluation and documents the contract's surface in one place.
export type VirtualListInstanceDriftContract = [
  _ExposeIsNotAny,
  _NoStaleMethodInInterface,
  _NoUndocumentedExpose,
]
