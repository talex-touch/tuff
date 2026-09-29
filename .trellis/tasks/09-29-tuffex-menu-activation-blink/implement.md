# Implementation Plan: TuffEx menu activation blink feedback

## 1. Shared behavior

- Add `useMenuActivationFeedback` under TuffEx shared utils.
- Implement the fixed 90 ms clear / 90 ms confirm state machine.
- Add duplicate-activation and unmount cancellation guards.
- Bypass feedback for reduced motion and non-closing activations.

## 2. Dropdown Menu integration

- Add typed menu context and `activationFeedback` props.
- Provide the root setting reactively.
- Route item activation through the shared state machine.
- Map clear/confirm phases to row classes and `TxCardItem.active`.
- Preserve submenu trigger behavior through `closeOnSelect=false`.

## 3. Context Menu integration

- Add `activationFeedback` to root, panel, item, and injected context contracts.
- Forward the root value through nested context-menu panels.
- Route item activation through the shared state machine.
- Apply the same row classes and active rendering as Dropdown Menu.

## 4. Behavioral coverage

- Add focused Dropdown Menu and Context Menu tests for:
  - delayed callback order and phase timing;
  - Enter/Space activation;
  - duplicate suppression;
  - menu-level and item-level opt-out;
  - reduced-motion bypass;
  - closeOnSelect/submenu exemption;
  - pending-cycle cancellation on unmount.

## 5. Docs and demos

- Update Dropdown Menu and Context Menu live demos to expose a closing item with feedback and an immediate opt-out item.
- Update Chinese and English Overview/Usage/API/Technologies sections in matching order.
- Keep code snippets idealized and truthful to the new props.

## 6. Verification

1. Run the focused menu component tests.
2. Run scoped TuffEx typecheck/lint and the package build.
3. Run Nexus demo-registry, MDC fence, translation-parity, and docs tests.
4. Rebuild TuffEx dist with verify-deps disabled before loading Nexus.
5. In a real browser, verify mouse, Enter, Space, duplicate activation, item opt-out, submenu exemption, and emulated reduced motion on both docs pages.
6. Confirm no runtime exceptions, no horizontal overflow, and rendered docs text includes the new contract.

## Risk and Rollback Points

- Event timing is intentionally delayed only on the closing feedback path. If a consumer cannot tolerate it, `activationFeedback=false` restores the old timing.
- Context-menu nesting is the highest-risk propagation point; verify a nested item closes the root only after its own confirmation.
- Do not change `TxCardItem` globally. Visual rollback is local to the two menu item styles.
