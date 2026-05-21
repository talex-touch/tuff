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
- `assistant-floating-ball-single-renderer-desktop-2026-05-21.png`: desktop capture after the single-flight window guard rebuild, used as follow-up evidence that only one floating ball renderer is visible.
- `assistant-voice-panel-open-single-renderer-desktop-2026-05-21.png`: desktop capture after triggering the floating ball entry through the renderer target, showing the VoicePanel beside the floating ball.

## Verified evidence

- Floating ball was visible with Assistant enabled and voice wake still treated as separate disabled-by-default capability.
- Real desktop drag was performed through macOS CGEvent mouse events, not only CDP synthetic events.
- Floating ball persisted position from `{ "x": 480, "y": 410 }` to `{ "x": 574, "y": 384 }` in the isolated app setting snapshot.
- Screenshot translation permission-denied recovery was observed in the VoicePanel as the localized screen-recording permission hint.
- The post-fix desktop capture shows a single visible floating ball after the single-flight window guard rebuild.
- Process inspection during the VoicePanel pass showed one `--assistant-type=floating-ball` renderer and one `--assistant-type=voice-panel` renderer under the same Electron dev app.
- CDP inspection identified the floating ball renderer by `.floating-ball-root` and the VoicePanel renderer by `.voice-panel-root`; triggering the floating ball click updated the panel source text to `文本输入模式 · click`.
- The VoicePanel-open desktop capture shows the floating ball and VoicePanel visible together after the single-flight window guard rebuild.

## Remaining gaps

- Need a successful provider-backed screenshot translation capture showing the image translation pin window.
- Need a Nexus/provider unavailable or logged-out capture showing the localized provider fallback.
- Need packaged Electron evidence; current captures are from the dev Electron run only.

## Risk notes

- One earlier desktop capture showed two visible Assistant floating-ball-like targets. The follow-up dev run now has process and desktop evidence for a single floating-ball renderer, but this should still be rechecked in packaged Electron before treating it as a release-grade gate.
- CDP target listing during this pass showed multiple `http://127.0.0.1:5606/#/setting` page targets on the same dev session, so duplicate-window analysis should start from stale dev windows before changing Assistant lifecycle code.
- Process inspection on the next run confirmed two `--touch-type=assistant --assistant-type=floating-ball` renderer processes under the same isolated dev app. The likely code path is concurrent `ensureFloatingBallWindow()` calls before `loadAssistantRenderer()` resolves; the follow-up patch adds a single-flight pending window guard for the floating ball and VoicePanel creation paths.
- Computer Use could inspect the default Electron window but did not enumerate the floating ball window. Desktop screenshot plus persisted config is stronger evidence for drag persistence than DOM-only inspection.
- Computer Use coordinate clicks were not reliable for the floating Electron window in front of Chrome. The VoicePanel-open evidence therefore used CDP to dispatch the floating-ball click inside the renderer, followed by a full desktop screenshot to verify the OS-level window visibility.
