# Tuff v2.4.14-beta.46 Release Notes

## Summary Notes

- Channels: local CLIs no longer take routing by default — Nexus goes first — and the channels page now guides you through discovered CLIs and enabling one by hand.
- Voice input: the on-device recognition channel is owned by the main process, so it left the editable channel list and needs no configuration.
- CoreBox: a plugin's "bind shortcut" row opens the applications page, and an application's launch shortcut is a toggle.
- Fixed: a channel error reply is no longer resolved as data, so a failure like `network:read-text` cannot be handed to a caller as file content.
- Fixed: the permission card can no longer show raw keys — the last-resort translator reads the loaded locale bundles and logs a key no bundle carries.
- Fixed: a failed app-index load no longer reports the requested app as missing, and a successful retry honours the pending selection.

## What's Changed

- The channels page gained a local CLI discovery guide, manual enable controls, and Nexus-first route ordering.
- The on-device ASR channel is seeded and bound by the main process from the installed speech models: capability counts still include it, the channel list no longer edits or deletes it.
- Added instrumentation for intelligence config writes: a renderer commit that drops bindings reports them split by live and leftover entries in the log.
- Removed the unreferenced capability details panel and its test dialog, plus the i18n keys that lost their last reader (both locales keep an identical key set).
- Fixed the duplicated `license` key in `packages/tuffex/package.json`.

## Breaking Changes

- A channel error reply now reaches the caller as a rejection: it used to `resolve(res.data)`, which handed the error payload back as data, so callers that relied on "a failure also resolves" have to handle the rejection.
