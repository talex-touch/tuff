# Tuff v2.4.14-beta.53 Release Notes

## Summary Notes

- AI provider capabilities now converge on Provider Registry and Scene, removing the legacy provider table and duplicate configuration paths.
- The Nexus admin console reorganizes navigation and rebuilds analytics on TuffEx for consistent density and interaction hierarchy.
- TuffEx is upgraded to 0.6.2 with bot avatars, image-generation reveals, liquid metal effects, and audio-reactive voice beams.
- A lifecycle ledger, bilingual changelog, and automated release gate now cover all 165 exported TuffEx components.
- Newly disclosed fast-uri high-severity issues are fixed, and Nexus production builds receive additional memory headroom.

## What's Changed

- Provider Registry and Scene are now the sole AI runtime authority; CoreApp removes the legacy intelligence-provider configuration UI and migration branch.
- Nexus admin navigation is consolidated into five groups with a 44px header and clearer analytics, content, users, AI, and governance entry points.
- All nine analytics panels now use TxCard, TxProgressBar, TxStatusBadge, TxEmptyState, and related primitives, with routing and empty-state fixes.
- TuffEx 0.6.2 adds TxBotAvatar, TxImageGeneration, TxMetalFx, and TxVoiceBeam while improving segmented progress and admin containers.
- Accurate Since versions are recorded for all 165 exports, with bilingual component history and CI/publish gates for incomplete releases.
- fast-uri is pinned to 3.1.7, clearing two newly disclosed high-severity advisories and removing obsolete temporary exceptions.
- The Nexus production-build heap ceiling increases from 8 GiB to 12 GiB to prevent late-stage documentation and admin-console build exhaustion.
