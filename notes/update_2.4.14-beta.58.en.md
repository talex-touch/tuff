# Tuff v2.4.14-beta.58 Release Notes

## Summary Notes

- Home keeps a voice draft after dictation, with playback, recognition retry, and voice-message sending.
- Refine the Home conversation layout and project action menus, with motion for composer chips and mode choices.
- Fix local CLI providers disappearing from model options.
- Keep project conversations local and exclude them from cloud-sync snapshots.
- Give development builds their own single-instance lock and temporary-file directory to avoid interference with installed builds.
- Add TuffEx voice-playback and flow-light components; reduce Nexus telemetry writes and fix client-IP trust.

## What's Changed

- Keep the latest recording after dictation so it can be replayed or recognized again even if recognition fails; show explicit sending and dismissal states.
- Save voice attachments with conversation messages, with play, pause, seeking, duration, and waveform controls.
- Unify Home conversation outputs and panel layout, and fix row measurement when restoring conversation history.
- Add transitions to composer chips and mode choices, and refine project action menus.
- Preserve model options for local CLI providers so available local-model entries do not disappear after configuration loads.
- Exclude project conversations from cloud-sync snapshots and keep their conversations and attachments in local project storage.
- Switch development userData before requesting the single-instance lock so development and installed builds no longer compete for the same lock.
- Isolate development temporary files so one build's cleanup cannot remove another build's clipboard images or recordings.
- Add TxVoiceClip, TxFlowLight, and organic voice-wave motion to TuffEx, with component examples and interaction documentation.
- Align TuffEx 0.7.0 version metadata, component lifecycle, and bilingual documentation, and update size-audit baselines for new components.
- Adjust Nexus telemetry queries and indexes to reduce database writes for ordinary events while preserving aggregation and retention behavior.
- Prefer CF-Connecting-IP behind Cloudflare so forged X-Forwarded-For values cannot bypass device-authorization IP limits or corrupt audit records.

## Known Limitations

- Project conversations remain local and do not sync across devices.
- Mainland China access improvements for Nexus are still under evaluation; this release does not change DNS, add another proxy, or migrate production builds.
