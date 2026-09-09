# Tuff v2.4.14-beta.34 Release Notes

## Summary Notes

- Consolidate voice input and VoiceDock interactions, including live transcription, waveform feedback, focused-app delivery, and cancellation.
- Strengthen voice-channel configuration and the security, billing, and failure-recovery boundaries of Nexus asynchronous transcription.
- Integrate clipboard details, application recommendations, model settings, and TuffEx component updates.

## What's Changed

- **Voice input and feedback**: unify voice sessions and native recording, with channel-bound resolution for DashScope, Doubao, and compatible configurations. Live transcripts retain incremental text and follow the newest words, using the full capsule width for centering and overflow.
- **VoiceDock interactions**: preserve the recording waveform and level feedback, refine recognition status and expandable text, and improve access to audio insights. Dedicated-key activation, combination-key avoidance, and Escape handling during recognition are also consolidated.
- **Voice settings ownership**: move the independent voice-input switch into Audio Insights. General Intelligence settings retain Assistant and floating-ball controls with concise copy and unchanged independent state.
- **Delivery and polishing**: deliver voice text to the previously focused application input. Bound polishing latency and fall back to the original transcript on failure or timeout instead of blocking delivery indefinitely.
- **Channels and model settings**: improve provider channel-type selection, persisted configuration, and capability bindings. Model selection panels gain two-sided search, internal scrolling, and clearer settings layouts.
- **Nexus transcription**: strengthen controlled WAV uploads, private media handoff, task polling, and reservation settlement. Pre-acceptance failures release consumed reservations, while failures after provider acceptance retain their separate terminal and accounting boundary.
- **Nexus pages**: consolidate role checks, refine dashboard and asset views, and improve primary sign-in actions, Passkey failure feedback, and themed authentication notices.
- **Clipboard and search**: integrate clipboard-detail and content-insight changes, add the capture-expiry schema migration, and repair refreshes for application icons, presentation data, and recommendation streams.
- **TuffEx and reliability**: integrate text morphing, Transfer, picker, and interaction improvements. Resolve circular slot-type inference and strengthen cross-platform fixtures and failure-path regressions.

- **Usage notes**: realtime recognition, file transcription, and polishing still depend on configured channels, models, credentials, and system permissions. Existing user settings and data are preserved; applicable database migrations run on the first launch.
