# Design: TuffEx menu activation blink feedback

## Boundary

The change stays inside the existing menu-item activation path:

- shared timing and lifecycle logic: `packages/tuffex/packages/utils/menu-activation-feedback.ts`;
- dropdown inheritance and rendering: `dropdown-menu/src/{types.ts,TxDropdownMenu.vue,TxDropdownItem.vue}`;
- context-menu inheritance and rendering: `context-menu/src/{types.ts,TxContextMenu.vue,TxContextMenuPanel.vue,TxContextMenuItem.vue,TxContextMenuSubmenu.vue}`.

`TxPopover`, anchor motion, focus navigation, and `TxCardItem` remain structurally unchanged.

## Public Contract

Add `activationFeedback?: boolean` to:

- `DropdownMenuProps` and `DropdownItemProps`;
- `ContextMenuProps`, `ContextMenuPanelProps`, and `ContextMenuItemProps`.

Defaults:

- root menu/panel: `true`;
- item: `undefined`, so it inherits the nearest menu context;
- item value wins over inherited value.

No duration prop is exposed. The 90 ms clear + 90 ms confirm rhythm is one design-system behavior, not host-configurable animation plumbing.

## Shared Activation State Machine

`useMenuActivationFeedback` owns one timer and one phase ref per item:

```text
idle
  ├─ immediate path ──> select ──> optional close
  └─ feedback path ──> clear (90 ms) ──> confirm (90 ms)
                                      ──> select ──> close ──> idle
```

The immediate path is selected when any of these is true:

- the item will not close its parent;
- feedback is disabled after item-over-menu precedence;
- no parent menu context exists;
- the browser reports `prefers-reduced-motion: reduce`.

While phase is not `idle`, later activations are ignored. `onBeforeUnmount` clears the timer and invalidates the pending cycle, so a removed menu item cannot emit a stale action.

The callback order remains `select` before `close`, matching current behavior; only the feedback-enabled closing path delays both callbacks until the confirmation frame has been visible.

## Rendering

Each item maps shared phases to existing `TxCardItem` primitives:

- `clear`: a high-specificity item class forces transparent border/background and removes the focus/pressed shadow;
- `confirm`: `TxCardItem.active=true`, reusing its existing primary active border/fill;
- both phases: transitions are disabled on the row so the two beats are crisp rather than eased.

No new semantic color or component token is introduced. The class exists only during the feedback cycle, so ordinary hover colors remain immediate.

## Context Propagation

### Dropdown Menu

Replace the anonymous injection shape with a typed `DropdownMenuContext` containing:

- `close()`;
- reactive getter `closeOnSelect`;
- reactive getter `activationFeedback`.

Nested dropdown items already inherit the root provider through the Vue component tree; no submenu re-provider is needed.

### Context Menu

Extend `ContextMenuContext` with `activationFeedback`. `TxContextMenu` passes the prop to `TxContextMenuPanel`, and the panel provides both inherited values.

`TxContextMenuSubmenu` currently re-provides root close behavior through its nested panel. It also forwards the root activation-feedback value so nested actions use the root menu contract.

## Compatibility

- Existing call sites need no changes because feedback defaults on.
- `closeOnSelect=false` retains synchronous `select` semantics; submenu opening remains immediate.
- Hosts that require the previous synchronous closing path can set `activationFeedback=false` at menu or item scope.
- SSR is unaffected: motion preference is read only inside an activation handler.
- Reduced motion removes both the blink and its delay.

## Verification Strategy

- Component tests assert callback order/timing, keyboard convergence, duplicate suppression, inheritance/override, reduced motion, submenu exemption, and unmount cancellation.
- Type checks cover the new public props and injection contracts.
- TuffEx build proves the shared utility is included in package output.
- Nexus docs gates prove registry/fence/translation parity.
- Real browser validation records visible class/active-state transitions and close timing for mouse, keyboard, and emulated reduced motion.

## Rollback

The feature is isolated behind `activationFeedback`. A runtime rollback is `:activation-feedback="false"`; a code rollback removes the shared composable calls and new props without changing menu positioning, keyboard navigation, or popover lifecycle.
