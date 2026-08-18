# Anchor Overlay Chain (nested menus)

> How tuffex anchored overlays (tooltip/popover/dropdown/context-menu) nest, and the contracts a
> nested-panel feature must go through. Established 2026-08-18 with `TxDropdownSubmenu` /
> `TxContextMenuSubmenu`.

---

## The chain model

- Every anchored overlay registers with the app-scoped anchor-delay service
  (`packages/tuffex/packages/utils/anchor-delay.ts`) via `useAnchorDelay` in **TxTooltip** —
  the tooltip is the family's single registrant; TxBaseAnchor does not register.
- Parent/child links come from the **component tree** (`TX_ANCHOR_NODE_KEY` provide/inject),
  never the DOM: panels teleport to `<body>` (TxBaseAnchor), so DOM containment is severed by
  the time anything could ask. A popover rendered inside another panel's slot content links
  automatically — no wiring needed in the nesting component.
- Chain invariants, all service-enforced:
  - **Never close upwards**: preemption and suppression exempt ancestors (`isDescendantOf`).
  - **Close cascades downwards**, deepest first: closing a panel closes its open descendants,
    so `keepAliveContent` cannot leave phantom-open entries that preempt/suppress others.
  - **Hover travel**: floating-enter calls `cancelChain()` (voids pending closes on self +
    ancestors); floating-leave calls `requestCloseChain()` (schedules self + hover-closeable
    ancestors). Ancestors opt in via `hoverCloseable: () => trigger === 'hover'` — a
    click-opened menu is never closed by a hover child leaving.
  - **Outside-click exemption**: TxBaseAnchor publishes its floating element under its chain
    node (`delayNode` prop, wired by TxTooltip — deliberately a prop, not inject: a bare anchor
    inside someone else's panel would inject the wrong node and clobber the registration).
    `handleOutside` asks `isEventInsideChain(node, event)` before closing, so clicks in open
    descendant panels don't count as outside.

## Building on it

- Nested menu rows: use `TxDropdownSubmenu` / `TxContextMenuSubmenu` (family barrels + nexus
  plugin registry both list them). Their internal popover is `trigger="hover"`,
  `placement="right-start"`, `reference-full-width`, `match-reference-width: false`.
- Selection closes the whole chain by **root-context passthrough**: dropdown submenus let
  nested items inject the root `txDropdownMenu` context straight through; context-menu
  submenus re-provide the root `close`/`closeOnSelect` into their nested `TxContextMenuPanel`.
  Never provide a submenu-local close as the item context — that closes one level only.
- Escape closes every open level at once (each anchor listens on document); this is accepted
  behavior, not a bug to fix per-level.

## referenceFullWidth chain

The reference wrapper stack is `.tx-base-anchor__reference` > `.tx-tooltip__reference` >
`.tx-popover__reference`, all shrink-to-fit by default. `referenceFullWidth` must reach ALL
three layers: TxPopover applies it to its own wrapper, forwards it to TxTooltip as a prop
(fixed 2026-08-18 — it used to skip the middle layer, breaking the width chain), and pushes an
`is-full-width` class to the anchor layer via `referenceClass`. If a trigger row inside a
panel won't stretch, check this chain before adding `:global` width hacks — HeaderUserMenu
accumulated ~40 lines of dead/misaimed overrides against exactly this bug.

## Verification commands

- `cd packages/tuffex && npx vitest run packages/utils/__tests__/anchor-delay.test.ts` —
  chain semantics (cascade, cancelChain, hoverCloseable skip, isEventInsideChain).
- `npx vitest run packages/components/src/dropdown-menu packages/components/src/context-menu`
  — submenu open/close, whole-chain select close, keyboard traversal.
- Hover-chain visual check needs a real pointer path (CDP `Input.dispatchMouseEvent` works;
  see `apps/nexus/scripts/audit-cdp-client.mjs`); jsdom cannot cover panel-to-panel travel.
