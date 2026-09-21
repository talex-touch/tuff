# Implementation: Voice dictation polish mode

## Ordered changes

1. Extend the existing `voiceInput` settings type/default/normalizer with `polishEnabled`, preserving explicit false and normalizing absent or malformed values to true.
2. Add the localized toggle and description to the existing speech-recognition settings surface; retain its current save/hydration mechanism.
3. Project `polishEnabled` through Assistant runtime configuration and make VoicePanel select live/final timing from that snapshot.
4. Remove gesture-derived delivery-policy selection from VoiceDock while retaining its start/stop lifecycle semantics.
5. Refine the existing polish prompt with a clear correction-versus-enumeration rule.
6. Update focused regressions for config migration, settings persistence/UI, VoiceDock/VoicePanel timing, live no-polish delivery, and final correction delivery.
7. Extend the existing settings normalizer, typed runtime projection, and Voice SDK requests with natural/structured/deep strength (deep default).
8. Add the localized strength selector using existing settings primitives; preserve hidden selection while polish is disabled.
9. Compose one fidelity prompt with three editing directives; freeze strength before asynchronous capture and reuse it for final delivery and recovery. Keep the existing timeout and cloud routing unchanged.
10. Extend existing behavior regressions for strength persistence, session isolation, cancelled/timeout delivery, and live/no-cleanup bypass. Do not assert prompt wording or mocked model echoes as semantic proof.
11. Repair real-run live suffix replay by keeping the successful native-write history monotonic and reconciling punctuation before appending; reject ambiguous committed lexical revisions without editing the user's buffer.
12. Propagate host-only cancellation through the shared LangChain model call boundary. Verify the actual installed client on loopback HTTP, including cancellation after SSE headers and a four-second post-abort retry observation.
13. Replay the fixed synthetic Chinese revision through the actual Rust native input addon from an isolated Electron sender into a separate Electron receiver; wait for the downstream value and verify repeated final delivery is inert.

## Validation

- Run the focused configuration/settings, VoicePanel, VoiceDock, VoiceService/live-delivery, and prompt tests touched by the change.
- Run `pnpm -C apps/core-app run typecheck:node` and `pnpm -C apps/core-app run typecheck:web`.
- Run `git diff --check`.
- Start the existing CoreApp voice surface if the local runtime is available; toggle both states and verify the outgoing stream timing in the actual UI. If real ASR credentials are unavailable, report the surface check and focused mocked coverage separately.

## Risk gates

- Do not add direct IPC, a renderer delivery route, a provider setting, or a second polish implementation.
- Verify that a setting change during recording does not alter the active session’s timing.
- Verify live mode never duplicates a final result and final mode never types partial text.
