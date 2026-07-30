# CoreBox candidate ledger

| ID     | Candidate                                                         | Classification                      | Evidence / reason                                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CB-001 | Canonical CoreBox transport events are registered twice           | **Confirmed, new, P1**              | 21 duplicate event names; real transport and real `IpcManager` side-effect probes; two pre-onboarding runtime reproductions and one admitted runtime reproduction; no matching open/closed GitHub Issue.       |
| CB-002 | Programmatic input causes unhandled `Search stream superseded`    | **Confirmed consequence of CB-001** | Exact `1 + 3 + 1` error cardinality for set, two rapid sets, and clear; ordinary keyboard input control has zero new exceptions. Include in CB-001 rather than splitting.                                      |
| CB-003 | CoreApp full Vitest suite is red                                  | **Known duplicate: #323**           | Two identical runs: 8 failed / 494 passed files, 20 failed / 3763 passed tests. Failure families match #323's packaging/security-boundary baseline.                                                            |
| CB-004 | `shortcutTriggered` is sent before and after native show          | **Rejected as defect**              | Pre-show send is intentional `bfa18626b` ordering fix; post-show send is fallback. Visibility is deduplicated, flag is consumed on show and cleared on hide. No duplicate AutoPaste/search effect established. |
| CB-005 | First isolated process crashed in `vision.ocr` with `Napi::Error` | **Inconclusive / contaminated**     | One delayed occurrence, no second-run reproduction, no temporal link to CoreBox steps, and unrelated native worktree changes were active. Do not publish.                                                      |
| CB-006 | Synthetic file-provider fixture did not appear immediately        | **Environment/timing only**         | Watcher was scoped and ready, but indexed row count remained zero during the short run. App and internal-provider result flows passed; no independent failure contract established.                            |
| CB-007 | Local unpacked build signing stalled                              | **Environment only**                | Packaging completed; distribution signing hung. `CSC_IDENTITY_AUTO_DISCOVERY=false` produced a valid unsigned diagnostic package. Not a product runtime defect.                                                |
| CB-008 | Later `build:unpack` typecheck failed in native test helper       | **Unrelated concurrent change**     | `native-transport.test-helpers.ts:40` appeared after the earlier successful CoreApp typecheck and is outside the task scope.                                                                                   |

## Deduplication searches

No open or closed GitHub Issue matched:

- `CoreBox duplicate handler`
- `"Search stream superseded"`
- `CoreBox input set query clear`

Known baseline issue retained: [#323](https://github.com/talex-touch/tuff/issues/323).
