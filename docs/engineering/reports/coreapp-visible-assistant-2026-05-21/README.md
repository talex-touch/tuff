# CoreApp Assistant visible evidence 2026-05-21

This folder stores manual visual evidence for Assistant surfaces that cannot be treated as complete from contract tests alone.

## Run context

- App run: Electron dev build with `TUFF_DEV_SERVER_PORT=5606` and remote debugging on `127.0.0.1:9336`.
- Isolated userData: `/private/tmp/tuff-assistant-visible-user-data`.
- Scope: Assistant floating ball and screenshot translation visible-experience gate.
- Git scope: no commit or branch operation was performed for this evidence pass.

## Artifacts

- `assistant-floating-ball-cdp.png`: CDP capture of the Assistant floating ball entry.
- `assistant-floating-ball-before-drag-desktop-2026-05-21.png`: desktop capture before dragging the floating ball.
- `assistant-floating-ball-after-drag-desktop-2026-05-21.png`: desktop capture after dragging the floating ball, used to verify drag visibility and position persistence evidence.

## Verified evidence

- Floating ball was visible with Assistant enabled and voice wake still treated as separate disabled-by-default capability.
- Real desktop drag was performed through macOS CGEvent mouse events, not only CDP synthetic events.
- Floating ball persisted position from `{ "x": 480, "y": 410 }` to `{ "x": 574, "y": 384 }` in the isolated app setting snapshot.
- Screenshot translation permission-denied recovery was observed in the VoicePanel as the localized screen-recording permission hint.

## Remaining gaps

- Need a clean VoicePanel-open capture beside the floating ball after rebuilding and rerunning with the single-flight floating ball and VoicePanel window fix.
- Need a successful provider-backed screenshot translation capture showing the image translation pin window.
- Need a Nexus/provider unavailable or logged-out capture showing the localized provider fallback.
- Need packaged Electron evidence; current captures are from the dev Electron run only.

## Risk notes

- One desktop capture showed two visible Assistant floating-ball-like targets. Treat this as unresolved until the next pass confirms whether it was a stale dev window, duplicate renderer target, or window lifecycle issue.
- CDP target listing during this pass showed multiple `http://127.0.0.1:5606/#/setting` page targets on the same dev session, so duplicate-window analysis should start from stale dev windows before changing Assistant lifecycle code.
- Process inspection on the next run confirmed two `--touch-type=assistant --assistant-type=floating-ball` renderer processes under the same isolated dev app. The likely code path is concurrent `ensureFloatingBallWindow()` calls before `loadAssistantRenderer()` resolves; the follow-up patch adds a single-flight pending window guard for the floating ball and VoicePanel creation paths.
- Computer Use could inspect the default Electron window but did not enumerate the floating ball window. Desktop screenshot plus persisted config is stronger evidence for drag persistence than DOM-only inspection.
