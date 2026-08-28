# Official Plugin SDK Matrix

## Scope

- Date: 2026-08-28 (America/Los_Angeles)
- Mode: source inspection + existing local validation evidence
- Result: manifest safety baseline passes, but docs coverage, SDK marker modernization and cross-platform plugin smoke remain partial/blocked.

## SDK Baseline

| Marker | Meaning in this repo | Current official plugins |
| --- | --- | --- |
| `260817` | Current SDK marker; application resolution facade available. | `clipboard-history` |
| `260713` | Localization/Intelligence-era migrated baseline. | `json-formatter`, `touch-intelligence`, `touch-translation` |
| `260428` | Supported legacy permission-enforced baseline. | 19 remaining official/example plugins |

`packages/utils/plugin/sdk-version.ts` remains the version source of truth. A plugin should only move to a newer marker when its Prelude or Surface actually uses the newer SDK contract.

## Official Plugin Matrix

| Plugin | Manifest ID | SDK | Features | Permissions | Docs | Status |
| --- | --- | ---: | --- | --- | --- | --- |
| `clipboard-history` | `com.tuffex.clipboard-history` | 260817 | `clipboard-history` | `clipboard.read`, `clipboard.write`, `fs.tfile`, `search.root-results`, `system.applications` | missing | partial |
| `json-formatter` | `com.tuffex.json-formatter` | 260713 | `json-formatter-format` | `clipboard.read`, `network.internet`, `clipboard.write` | missing | partial |
| `touch-batch-rename` | `com.tuffex.batch-rename` | 260428 | `batch-rename` | `fs.read`, `fs.write`, `search.root-results`, `storage.plugin` | present | partial |
| `touch-browser-bookmarks` | `com.tuffex.browser-bookmarks` | 260428 | `browser-bookmarks` | `search.root-results`, `storage.plugin`, `clipboard.write`, `network.internet` | present | partial |
| `touch-browser-data` | `com.tuffex.browser-data` | 260428 | `browser-data` | `fs.read`, `fs.index`, `search.root-results`, `clipboard.write`, `network.internet` | missing | partial |
| `touch-browser-open` | `com.tuffex.browser-open` | 260428 | `browser-open`, `web-search` | `system.shell`, `search.root-results`, `storage.plugin`, `clipboard.write`, `network.internet` | present | partial |
| `touch-code-snippets` | `com.tuffex.code-snippets` | 260428 | none | none | present | partial |
| `touch-dev-toolbox` | `com.tuffex.dev-toolbox` | 260428 | `dev-toolbox` | `search.root-results`, `storage.plugin`, `network.internet` | present | partial |
| `touch-dev-utils` | `com.tuffex.dev-utils` | 260428 | `dev-utils` | `clipboard.write`, `search.root-results` | present | partial |
| `touch-dictation` | `com.tuffex.dictation` | 260428 | `dictate`, `speak` | `voice.dictation`, `search.root-results`, `clipboard.read`, `clipboard.write` | missing | partial |
| `touch-emoji-symbols` | `com.tuffex.emoji-symbols` | 260428 | `emoji-symbols` | `clipboard.write`, `search.root-results` | missing | partial |
| `touch-intelligence` | `com.tuffex.intelligence` | 260713 | `intelligence-ask`, `intelligence-rewrite`, `intelligence-summarize`, `intelligence-explain`, `intelligence-command-registry` | `intelligence.basic`, `search.root-results`, `storage.plugin`, `clipboard.write` | present | partial |
| `touch-quick-actions` | `com.tuffex.quick-actions` | 260428 | `quick-actions` | `system.shell`, `search.root-results` | present | partial |
| `touch-quickops` | `com.tuffex.quickops` | 260428 | `quickops` | `search.root-results`, `storage.shared` | missing | partial |
| `touch-snipaste` | `com.tuffex.snipaste` | 260428 | `snipaste-quick` | `system.shell`, `search.root-results` | missing | partial |
| `touch-snippets` | `com.tuffex.snippets` | 260428 | `snippets-search`, `snippets-save`, `snippets-manage` | `clipboard.write`, `search.root-results`, `storage.plugin`, `clipboard.read`, `network.internet` | missing | partial |
| `touch-system-actions` | `com.tuffex.system-actions` | 260428 | `system-actions` | `search.root-results`, `system.shell` | present | partial |
| `touch-text-snippets` | `com.tuffex.text-snippets` | 260428 | none | none | present | partial |
| `touch-text-tools` | `com.tuffex.text-tools` | 260428 | `text-tools-convert` | `clipboard.write`, `search.root-results` | missing | partial |
| `touch-translation` | `com.tuffex.translation` | 260713 | `touch-translate`, `multi-source-translate`, `screenshot-translate` | `network.internet`, `intelligence.basic`, `storage.plugin`, `search.root-results`, `clipboard.write` | present | partial |
| `touch-window-manager` | `com.tuffex.window-manager` | 260428 | `window-app` | `system.shell`, `search.root-results` | present | partial |
| `touch-window-presets` | `com.tuffex.window-presets` | 260428 | `window-presets` | `system.shell`, `search.root-results` | present | partial |
| `touch-workspace-scripts` | `com.tuffex.workspace-scripts` | 260428 | `workspace-scripts` | `system.shell`, `fs.read`, `search.root-results` | present | partial |

## Existing Guard Evidence

- `corepack pnpm plugins:validate` passed in the current batch.
- `corepack pnpm -C "packages/test" exec vitest run "src/plugins/manifest-boundary.test.ts"` passed with 10/10 tests after adding the docs-coverage guard.
- `corepack pnpm -C "apps/nexus" exec vitest run "app/data/search/featureIndex.test.ts"` passed with 8/8 tests after adding the SDK card docs/owner guard.
- `manifest-boundary.test.ts` verifies package-backed plugin names, supported `sdkapi`, permission reasons, Prelude ownership, root result provider policy and forceMax surface review gates.
- The docs-coverage guard locks the current 9 missing plugin docs as an explicit gap list, so adding/removing plugin docs must update the matrix instead of drifting silently.
- The SDK card guard covers all 31 `tuffSdkItems`: cards routed through `featureSearchItems` must resolve to localized zh/en docs files, and the 11 owner-only cards must point at an existing SDK owner file.

## Gaps

- Docs coverage is incomplete: 9 plugin docs are missing or not linked from the built-in plugin catalog.
- Full matrix generation is still manual today; executable guards now cover plugin docs coverage and SDK card docs/owner mapping, but per-card smoke/status remains manual evidence.
- SDK marker modernization is intentionally incomplete. Most plugins remain on supported legacy `260428`; bulk marker edits would reduce signal.
- Cross-platform plugin smoke is not complete. Current source and manifest checks do not prove Windows/Linux packaged UI behavior.
- `touch-intelligence` still has an explicit partial root-provider coverage exemption in the manifest boundary test.

## Upstream SDK Notes

- Latest registry snapshot: see `research/upstream-sdk-outdated-2026-08-28.md`.
- LangChain packages are installed on the `0.x` line while registry latest is `1.x`; migration changes import/API shape and needs a dedicated compatibility pass.
- MCP TypeScript SDK is installed at `1.29.0` while registry latest is `1.30.0`; this is a minor bump candidate, but live MCP acceptance remains opt-in.
- Electron Builder auto-update targets and signing/notarization constraints belong to the release/OTA acceptance task and should stay in that evidence chain.
