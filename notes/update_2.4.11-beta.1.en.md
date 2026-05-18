# Tuff v2.4.11-beta.1 Release Notes

## Highlights

- Merged PR #270 / #271 with conflicts resolved: Touch Intelligence now keeps the CoreBox session visible while rendering placeholder, sending, pending, ready, and error states.
- Added the TouchWidget beta runtime baseline: ArrowJS and WebComponent widgets are supported, the CLI precompile output records runtime / runtimeStage metadata, and the CoreApp renderer mounts each widget with the matching runtime wrapper.
- Hardened plugin shell capability diagnostics: Browser Open, System Actions, Window Manager, and Workspace Scripts expose platform, permission, unsupported reason, and audit metadata before execution, and fail closed when safe-shell is unavailable.
- Completed the Cloud Share / snippets workflow: snippet pack publish/list/install now reads the account token through the typed account event instead of adding a raw channel dependency.
- Fixed post-merge CI blockers: tuff-cli-core lint, builder widget tests, utils transport boundary checks, and touch-snippets regressions pass locally and on master CI.
- Carries forward recent CoreBox visible-experience fixes, packaged App Index evidence, Provider Registry observability, Nexus provider migration readiness, and local AI runtime visibility improvements.

## Validation

- The latest master commit has the visible GitHub checks green: Tuff CLI Package CI, OmniPanel Gate, CodeQL, Update release draft, and Cloudflare Pages.
- Local validation covered apps/core-app typecheck, focused widget / intelligence / plugin regressions, full packages/utils tests, tuff-cli-core lint/build/test, touch-snippets tests, and the macOS snapshot package.
- The local snapshot artifact `apps/core-app/dist/tuff.app.zip` was produced, and the macOS app passed `codesign --verify --deep --strict`.

## Known Limitations

- This is a `2.4.11` beta test build and does not mean the stable release gate is complete.
- Windows real-device acceptance, performance sampling, and Nexus Release Evidence sync still need to be completed; Linux remains documented best-effort.
