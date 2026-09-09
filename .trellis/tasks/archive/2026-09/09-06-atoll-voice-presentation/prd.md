# Optional Atoll Voice Presentation

## Goal

Offer an optional macOS notch presentation for Tuff's voice assistant when the user has Atoll installed, while Tuff remains the sole owner of voice capture, ASR providers, credentials, session state, AI execution, and target-app writeback.

## Confirmed Facts

- Atoll is a native macOS SwiftUI notch command surface. Its app lifecycle creates borderless, nonactivating notch windows per display and owns their geometry and animation.
- Atoll exposes third-party `presentNotchExperience`, `updateNotchExperience`, and `dismissNotchExperience` operations through a loopback-only JSON-RPC WebSocket server on port `9020`.
- Atoll has no microphone/ASR implementation; its audio bridge processes waveform magnitudes for visualization only.
- The Atoll repository is GPL-3.0. Tuff must not copy, link, vendor, or bundle Atoll source or frameworks without a separately approved licensing decision.
- The reviewed RPC authorization flow currently identifies clients by a caller-supplied `bundleIdentifier` and auto-authorizes it. This is not a sufficient trust boundary for a Tuff integration.

Source evidence:

- https://github.com/Ebullioscopic/Atoll/blob/dev/DynamicIsland/DynamicIslandApp.swift
- https://github.com/Ebullioscopic/Atoll/blob/dev/DynamicIsland/services/Extensions/ExtensionRPCServer.swift
- https://github.com/Ebullioscopic/Atoll/blob/dev/DynamicIsland/services/Extensions/ExtensionRPCService.swift
- https://github.com/Ebullioscopic/Atoll/blob/dev/DynamicIsland/audio/AudioBridge.h
- https://github.com/Ebullioscopic/Atoll/blob/dev/LICENSE

## Requirements

1. Tuff voice remains functional and visually coherent when Atoll is absent, disabled, unavailable, closed, or terminates during an active voice session.
2. The integration is macOS-only, opt-in, and available only after Atoll presence detection plus an explicit user grant.
3. Tuff's main process owns the Atoll transport. Renderers, plugins, and ASR providers cannot connect to Atoll directly.
4. The transport projects only a session-scoped presentation state: `idle`, `listening(level)`, `processing`, bounded partial/final display text, and concise error state.
5. No audio frames, voice-provider credentials, raw provider URLs, durable transcript history, conversation content, or privileged action payloads cross into Atoll.
6. Atoll occupies a secondary `VoicePresentationPort` implementation; the existing Tuff VoiceDock HUD remains the default presentation port.
7. Do not ship against the reviewed Atoll RPC authorization model. Proceed only after an authenticated client-identity design is accepted upstream or an equally strong documented boundary exists.

## Intended Experience

- Short Command/Ctrl press: compact listening orb/waveform in the notch.
- Hold Command/Ctrl: push-to-talk waveform.
- Stop/release: processing ring.
- Partial transcription: at most two transient lines.
- Final transcription or error: short confirmation/error pulse, then collapse.
- Configuration, history, recovery, model/provider choice, and AI tool results remain in Tuff.

## Acceptance Criteria

- [ ] A future implementation has a `VoicePresentationPort` contract whose default implementation is existing Tuff VoiceDock and whose optional macOS implementation is Atoll.
- [ ] Only the Tuff main process may instantiate the Atoll adapter; it sends a single session projection over a localhost transport and supports idempotent dismiss/cleanup.
- [ ] The Atoll adapter never carries prohibited voice/audio/credential/conversation data and logs no transcript contents.
- [ ] Tuff behavior is unchanged when Atoll is unavailable or integration is disabled; provider audio capture remains singular.
- [ ] The integration is gated on an upstream-reviewed authenticated extension boundary and explicit user authorization.
- [ ] Validation covers Atoll absence, quit/restart mid-session, multiple displays, fullscreen, lock/unlock, competing notch experience, cancellation, and provider failure.

## Out of Scope

- Porting Tuff's ASR, Rust audio/VAD, provider adapters, global modifier handling, or AI execution into Atoll.
- Copying or embedding Atoll implementation/UI code.
- Making Atoll a required Tuff dependency or offering this feature on Windows/Linux.
- Live implementation before the voice-session/Rust consolidation and an Atoll authentication decision.

## Status

Archived planning record. No implementation is authorized or scheduled by this task.
