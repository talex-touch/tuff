# Peripheral Product Documentation Broken-Link Inventory

<!-- markdownlint-disable MD013 -->

This is the immutable before-repair inventory for Batch C. It was generated from Git-tracked product documentation at commit `46914ee9622652330cfe1c98ac6cad7dc00c2d16`; findings are sorted by source path, line, column, URL, and node kind.

## Source scope

- Enumerate with `git ls-files -z`, then select only tracked `*.md` and `*.mdc` sources under `.github/docs/**`, `apps/**`, `docs/**`, `packages/**`, and `plugins/**`.
- Exclude `.agents/**`, `.opencode/**`, `.trellis/**`, `notes/**`, `docs/engineering/reports/**`, and `docs/plan-prd/report/**`.
- Exclude path segments `.nuxt`, `.output`, `archive`, `coverage`, `dist`, `generated`, `node_modules`, `raw`, and `vendor`.
- Exclude instruction files named `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, and `GEMINI.md`; non-Markdown assets such as `*.pen` are never source documents.
- Exclude sibling-owned `README.md`, `README.zh-CN.md`, `docs/plan-prd/TODO.md`, `docs/plan-prd/01-project/CHANGES.md`, `docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md`, `docs/plan-prd/04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`, and `docs/plan-prd/04-implementation/Evidence-Matrix-Release-Integrity-2026-06-21.md`.
- The concurrent bilingual What's Changed task owns `notes/**`; its Trellis directory and `.trellis/tasks/07-17-unify-ota-update-flow/task.json` are also immutable and outside the source set.

## Resolution contract

- Parse with `unified@11.0.5`, `remark-parse@11.0.0`, and `remark-mdc@3.11.1`; inspect `link`, `image`, `linkReference`, and `imageReference` AST nodes.
- Skip external schemes, absolute/root URLs, fragment-only links, and query-only links.
- Strip query and fragment components, percent-decode the pathname, resolve it from the source document, and reject repository escapes.
- Accept an exact Git-tracked file or a directory containing Git-tracked content. Filesystem-only and untracked targets fail.

## Reproduce the audit

The repository tracks the reviewed one-off helper at
`docs/plan-prd/docs/peripheral-docs-link-audit.mjs`. It is evidence for Batch D,
not a permanent local/CI entrypoint. Run it from a temporary parser environment
so repository dependencies and lockfiles remain unchanged:

```bash
audit_env=$(mktemp -d "${TMPDIR:-/tmp}/tuff-peripheral-doc-audit.XXXXXX")
pnpm --dir "$audit_env" add --save-exact \
  unified@11.0.5 remark-parse@11.0.0 remark-mdc@3.11.1
cp docs/plan-prd/docs/peripheral-docs-link-audit.mjs "$audit_env/audit.mjs"
node "$audit_env/audit.mjs" "$PWD" > "$audit_env/after.json"
jq '.counts, .findings' "$audit_env/after.json"
```

To reproduce the immutable before result, run the same copied helper against a
worktree at commit `46914ee9622652330cfe1c98ac6cad7dc00c2d16`.

## Before counts

- Tracked Markdown/MDC documents: 1054
- In-scope source documents: 583
- Inspected relative links/images: 806
- Skipped external/absolute/fragment/query-only links: 130
- Broken in-scope targets: 663
- Existing `.mdc` targets referenced with stale `.md` extensions: 636
- Other missing targets requiring an evidence-backed decision: 27
- Repository-escape targets: 0

## Findings

The TSV block is the stable machine-readable inventory. `resolved_target` is repository-relative.

<!-- markdownlint-disable MD010 -->

```tsv
source	line	column	kind	url	resolved_target	reason
apps/core-app/README.md	61	9	link	src/main/modules/update/README.md	apps/core-app/src/main/modules/update/README.md	missing-tracked-target
apps/core-app/README.md	86	3	link	src/main/modules/update/README.md	apps/core-app/src/main/modules/update/README.md	missing-tracked-target
apps/core-app/src/main/modules/box-tool/search-engine/README.md	8	5	link	../../../../../../../docs/plan-prd/03-features/search/quick-launch-and-search-optimization-prd.md	docs/plan-prd/03-features/search/quick-launch-and-search-optimization-prd.md	missing-tracked-target
apps/core-app/src/main/modules/box-tool/search-engine/README.md	9	5	link	../../../../../../../docs/plan-prd/03-features/search/SEARCH-DSL-PRD.md	docs/plan-prd/03-features/search/SEARCH-DSL-PRD.md	missing-tracked-target
apps/core-app/src/main/modules/box-tool/search-engine/README.md	10	5	link	../../../../../../../docs/plan-prd/03-features/search/intelligent-recommendation-system-prd.md	docs/plan-prd/03-features/search/intelligent-recommendation-system-prd.md	missing-tracked-target
apps/core-app/src/main/modules/box-tool/search-engine/README.md	11	5	link	../../../../../../../docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.md	docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.md	missing-tracked-target
apps/core-app/src/main/modules/download/API.md	721	3	link	../update/README.md	apps/core-app/src/main/modules/update/README.md	missing-tracked-target
apps/nexus/content/docs/dev/api/account.en.mdc	767	3	link	./intelligence.en.md	apps/nexus/content/docs/dev/api/intelligence.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/account.en.mdc	768	3	link	./storage.en.md	apps/nexus/content/docs/dev/api/storage.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/account.en.mdc	769	3	link	./plugin-context.en.md	apps/nexus/content/docs/dev/api/plugin-context.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/account.zh.mdc	767	3	link	./intelligence.zh.md	apps/nexus/content/docs/dev/api/intelligence.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/account.zh.mdc	768	3	link	./storage.zh.md	apps/nexus/content/docs/dev/api/storage.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/account.zh.mdc	769	3	link	./plugin-context.zh.md	apps/nexus/content/docs/dev/api/plugin-context.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/channel.en.mdc	4	128	link	./transport.en.md	apps/nexus/content/docs/dev/api/transport.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/channel.en.mdc	4	187	link	./box.en.md	apps/nexus/content/docs/dev/api/box.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/channel.en.mdc	4	211	link	./clipboard.en.md	apps/nexus/content/docs/dev/api/clipboard.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/channel.en.mdc	4	251	link	./bridge-hooks.en.md	apps/nexus/content/docs/dev/api/bridge-hooks.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/channel.zh.mdc	4	45	link	./transport.zh.md	apps/nexus/content/docs/dev/api/transport.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/channel.zh.mdc	4	83	link	./box.zh.md	apps/nexus/content/docs/dev/api/box.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/channel.zh.mdc	4	106	link	./clipboard.zh.md	apps/nexus/content/docs/dev/api/clipboard.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/channel.zh.mdc	4	141	link	./bridge-hooks.zh.md	apps/nexus/content/docs/dev/api/bridge-hooks.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/division-box.en.mdc	227	3	link	./flow-transfer.en.md	apps/nexus/content/docs/dev/api/flow-transfer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/division-box.en.mdc	228	3	link	../reference/manifest.en.md	apps/nexus/content/docs/dev/reference/manifest.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/division-box.zh.mdc	542	3	link	./flow-transfer.zh.md	apps/nexus/content/docs/dev/api/flow-transfer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/division-box.zh.mdc	543	3	link	../reference/manifest.zh.md	apps/nexus/content/docs/dev/reference/manifest.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/flow-transfer.en.mdc	143	141	link	./quick-actions.en.md	apps/nexus/content/docs/dev/api/quick-actions.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/flow-transfer.en.mdc	179	3	link	./quick-actions.en.md	apps/nexus/content/docs/dev/api/quick-actions.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/flow-transfer.en.mdc	180	3	link	./division-box.en.md	apps/nexus/content/docs/dev/api/division-box.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/flow-transfer.en.mdc	181	3	link	../reference/manifest.en.md	apps/nexus/content/docs/dev/reference/manifest.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/flow-transfer.zh.mdc	333	102	link	./quick-actions.zh.md	apps/nexus/content/docs/dev/api/quick-actions.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/flow-transfer.zh.mdc	437	3	link	./division-box.zh.md	apps/nexus/content/docs/dev/api/division-box.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/flow-transfer.zh.mdc	438	3	link	../reference/manifest.zh.md	apps/nexus/content/docs/dev/reference/manifest.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/i18n.en.mdc	195	3	link	./plugin-context.en.md	apps/nexus/content/docs/dev/api/plugin-context.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/i18n.en.mdc	196	3	link	./permission.en.md	apps/nexus/content/docs/dev/api/permission.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/i18n.en.mdc	197	3	link	../reference/manifest.en.md	apps/nexus/content/docs/dev/reference/manifest.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/i18n.en.mdc	198	3	link	./intelligence.en.md	apps/nexus/content/docs/dev/api/intelligence.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/i18n.zh.mdc	195	3	link	./plugin-context.zh.md	apps/nexus/content/docs/dev/api/plugin-context.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/i18n.zh.mdc	196	3	link	./permission.zh.md	apps/nexus/content/docs/dev/api/permission.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/i18n.zh.mdc	197	3	link	../reference/manifest.zh.md	apps/nexus/content/docs/dev/reference/manifest.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/i18n.zh.mdc	198	3	link	./intelligence.zh.md	apps/nexus/content/docs/dev/api/intelligence.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	24	3	link	./plugin-context.en.md	apps/nexus/content/docs/dev/api/plugin-context.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	25	3	link	./box.en.md	apps/nexus/content/docs/dev/api/box.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	26	3	link	./clipboard.en.md	apps/nexus/content/docs/dev/api/clipboard.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	27	3	link	./temp-file.en.md	apps/nexus/content/docs/dev/api/temp-file.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	28	3	link	./storage.en.md	apps/nexus/content/docs/dev/api/storage.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	29	3	link	./download.en.md	apps/nexus/content/docs/dev/api/download.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	30	3	link	./platform-capabilities.en.md	apps/nexus/content/docs/dev/api/platform-capabilities.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	31	3	link	./screenshot.en.md	apps/nexus/content/docs/dev/api/screenshot.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	32	3	link	./power.en.md	apps/nexus/content/docs/dev/api/power.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	33	3	link	./recommend.en.md	apps/nexus/content/docs/dev/api/recommend.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	34	3	link	./account.en.md	apps/nexus/content/docs/dev/api/account.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	35	3	link	./transport.en.md	apps/nexus/content/docs/dev/api/transport.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	36	3	link	./feature.en.md	apps/nexus/content/docs/dev/api/feature.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	37	3	link	./search.en.md	apps/nexus/content/docs/dev/api/search.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	38	3	link	./quick-actions.en.md	apps/nexus/content/docs/dev/api/quick-actions.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	39	3	link	./quickops.en.md	apps/nexus/content/docs/dev/api/quickops.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	40	3	link	./division-box.en.md	apps/nexus/content/docs/dev/api/division-box.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	41	3	link	./flow-transfer.en.md	apps/nexus/content/docs/dev/api/flow-transfer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	42	3	link	./intelligence.en.md	apps/nexus/content/docs/dev/api/intelligence.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	43	3	link	./i18n.en.md	apps/nexus/content/docs/dev/api/i18n.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	46	10	link	./transport.en.md	apps/nexus/content/docs/dev/api/transport.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	46	171	link	./transport-internals.en.md	apps/nexus/content/docs/dev/api/transport-internals.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	191	3	link	../getting-started/quickstart.en.md	apps/nexus/content/docs/dev/getting-started/quickstart.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	192	3	link	../reference/manifest.en.md	apps/nexus/content/docs/dev/reference/manifest.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.en.mdc	193	3	link	../extensions/unplugin-export-plugin.en.md	apps/nexus/content/docs/dev/extensions/unplugin-export-plugin.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	24	3	link	./plugin-context.zh.md	apps/nexus/content/docs/dev/api/plugin-context.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	25	3	link	./box.zh.md	apps/nexus/content/docs/dev/api/box.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	26	3	link	./clipboard.zh.md	apps/nexus/content/docs/dev/api/clipboard.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	27	3	link	./temp-file.zh.md	apps/nexus/content/docs/dev/api/temp-file.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	28	3	link	./storage.zh.md	apps/nexus/content/docs/dev/api/storage.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	29	3	link	./download.zh.md	apps/nexus/content/docs/dev/api/download.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	30	3	link	./platform-capabilities.zh.md	apps/nexus/content/docs/dev/api/platform-capabilities.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	31	3	link	./screenshot.zh.md	apps/nexus/content/docs/dev/api/screenshot.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	32	3	link	./power.zh.md	apps/nexus/content/docs/dev/api/power.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	33	3	link	./recommend.zh.md	apps/nexus/content/docs/dev/api/recommend.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	34	3	link	./account.zh.md	apps/nexus/content/docs/dev/api/account.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	35	3	link	./transport.zh.md	apps/nexus/content/docs/dev/api/transport.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	36	3	link	./feature.zh.md	apps/nexus/content/docs/dev/api/feature.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	37	3	link	./search.zh.md	apps/nexus/content/docs/dev/api/search.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	38	3	link	./quick-actions.zh.md	apps/nexus/content/docs/dev/api/quick-actions.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	39	3	link	./quickops.zh.md	apps/nexus/content/docs/dev/api/quickops.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	40	3	link	./division-box.zh.md	apps/nexus/content/docs/dev/api/division-box.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	41	3	link	./flow-transfer.zh.md	apps/nexus/content/docs/dev/api/flow-transfer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	42	3	link	./intelligence.zh.md	apps/nexus/content/docs/dev/api/intelligence.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	43	3	link	./i18n.zh.md	apps/nexus/content/docs/dev/api/i18n.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	46	10	link	./transport.zh.md	apps/nexus/content/docs/dev/api/transport.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	46	91	link	./transport-internals.zh.md	apps/nexus/content/docs/dev/api/transport-internals.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	191	3	link	../getting-started/quickstart.zh.md	apps/nexus/content/docs/dev/getting-started/quickstart.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	192	3	link	../reference/manifest.zh.md	apps/nexus/content/docs/dev/reference/manifest.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/index.zh.mdc	193	3	link	../extensions/unplugin-export-plugin.zh.md	apps/nexus/content/docs/dev/extensions/unplugin-export-plugin.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	82	93	link	./box.en.md	apps/nexus/content/docs/dev/api/box.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	82	113	link	./feature.en.md	apps/nexus/content/docs/dev/api/feature.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	83	93	link	./clipboard.en.md	apps/nexus/content/docs/dev/api/clipboard.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	83	125	link	./storage.en.md	apps/nexus/content/docs/dev/api/storage.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	84	93	link	./intelligence.en.md	apps/nexus/content/docs/dev/api/intelligence.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	85	93	link	./screenshot.en.md	apps/nexus/content/docs/dev/api/screenshot.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	86	93	link	./clipboard.en.md	apps/nexus/content/docs/dev/api/clipboard.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	87	93	link	./i18n.en.md	apps/nexus/content/docs/dev/api/i18n.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	88	93	link	./quick-actions.en.md	apps/nexus/content/docs/dev/api/quick-actions.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	88	133	link	./quickops.en.md	apps/nexus/content/docs/dev/api/quickops.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	89	93	link	./division-box.en.md	apps/nexus/content/docs/dev/api/division-box.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	89	130	link	./channel.en.md	apps/nexus/content/docs/dev/api/channel.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	90	93	link	./power.en.md	apps/nexus/content/docs/dev/api/power.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	90	117	link	./recommend.en.md	apps/nexus/content/docs/dev/api/recommend.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	253	7	link	./recommend.en.md	apps/nexus/content/docs/dev/api/recommend.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	381	7	link	./quick-actions.en.md	apps/nexus/content/docs/dev/api/quick-actions.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	694	3	link	./feature-sdk.en.md	apps/nexus/content/docs/dev/api/feature-sdk.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	695	3	link	./division-box.en.md	apps/nexus/content/docs/dev/api/division-box.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	696	3	link	./quick-actions.en.md	apps/nexus/content/docs/dev/api/quick-actions.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	697	3	link	./power.en.md	apps/nexus/content/docs/dev/api/power.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	698	3	link	./recommend.en.md	apps/nexus/content/docs/dev/api/recommend.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.en.mdc	699	3	link	./flow-transfer.en.md	apps/nexus/content/docs/dev/api/flow-transfer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	82	79	link	./box.zh.md	apps/nexus/content/docs/dev/api/box.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	82	98	link	./feature.zh.md	apps/nexus/content/docs/dev/api/feature.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	83	68	link	./clipboard.zh.md	apps/nexus/content/docs/dev/api/clipboard.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	83	99	link	./storage.zh.md	apps/nexus/content/docs/dev/api/storage.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	84	80	link	./intelligence.zh.md	apps/nexus/content/docs/dev/api/intelligence.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	85	63	link	./screenshot.zh.md	apps/nexus/content/docs/dev/api/screenshot.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	86	75	link	./clipboard.zh.md	apps/nexus/content/docs/dev/api/clipboard.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	87	73	link	./i18n.zh.md	apps/nexus/content/docs/dev/api/i18n.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	88	77	link	./quick-actions.zh.md	apps/nexus/content/docs/dev/api/quick-actions.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	88	116	link	./quickops.zh.md	apps/nexus/content/docs/dev/api/quickops.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	89	75	link	./division-box.zh.md	apps/nexus/content/docs/dev/api/division-box.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	89	111	link	./channel.zh.md	apps/nexus/content/docs/dev/api/channel.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	90	76	link	./power.zh.md	apps/nexus/content/docs/dev/api/power.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	90	99	link	./recommend.zh.md	apps/nexus/content/docs/dev/api/recommend.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	253	6	link	./recommend.zh.md	apps/nexus/content/docs/dev/api/recommend.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	381	6	link	./quick-actions.zh.md	apps/nexus/content/docs/dev/api/quick-actions.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	694	3	link	./feature-sdk.zh.md	apps/nexus/content/docs/dev/api/feature-sdk.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	695	3	link	./division-box.zh.md	apps/nexus/content/docs/dev/api/division-box.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	696	3	link	./quick-actions.zh.md	apps/nexus/content/docs/dev/api/quick-actions.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	697	3	link	./power.zh.md	apps/nexus/content/docs/dev/api/power.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	698	3	link	./recommend.zh.md	apps/nexus/content/docs/dev/api/recommend.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/plugin-context.zh.mdc	699	3	link	./flow-transfer.zh.md	apps/nexus/content/docs/dev/api/flow-transfer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quick-actions.en.mdc	209	3	link	./plugin-context.en.md	apps/nexus/content/docs/dev/api/plugin-context.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quick-actions.en.mdc	210	3	link	./flow-transfer.en.md	apps/nexus/content/docs/dev/api/flow-transfer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quick-actions.en.mdc	211	3	link	./platform-capabilities.en.md	apps/nexus/content/docs/dev/api/platform-capabilities.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quick-actions.zh.mdc	209	3	link	./plugin-context.zh.md	apps/nexus/content/docs/dev/api/plugin-context.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quick-actions.zh.mdc	210	3	link	./flow-transfer.zh.md	apps/nexus/content/docs/dev/api/flow-transfer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quick-actions.zh.mdc	211	3	link	./platform-capabilities.zh.md	apps/nexus/content/docs/dev/api/platform-capabilities.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quickops.en.mdc	324	3	link	./transport.en.md	apps/nexus/content/docs/dev/api/transport.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quickops.en.mdc	325	3	link	./flow-transfer.en.md	apps/nexus/content/docs/dev/api/flow-transfer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quickops.en.mdc	326	3	link	./permission.en.md	apps/nexus/content/docs/dev/api/permission.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quickops.en.mdc	327	3	link	../../guide/features/quickops.en.md	apps/nexus/content/docs/guide/features/quickops.en.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quickops.zh.mdc	324	3	link	./transport.zh.md	apps/nexus/content/docs/dev/api/transport.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quickops.zh.mdc	325	3	link	./flow-transfer.zh.md	apps/nexus/content/docs/dev/api/flow-transfer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quickops.zh.mdc	326	3	link	./permission.zh.md	apps/nexus/content/docs/dev/api/permission.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/api/quickops.zh.mdc	327	3	link	../../guide/features/quickops.zh.md	apps/nexus/content/docs/guide/features/quickops.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/architecture/ipc-events-detail.en.mdc	595	5	link	./ipc-events-handlers.en.md	apps/nexus/content/docs/dev/architecture/ipc-events-handlers.en.md	missing-tracked-target
apps/nexus/content/docs/dev/architecture/ipc-events-detail.en.mdc	596	5	link	./ipc-events-sdk-map.en.md	apps/nexus/content/docs/dev/architecture/ipc-events-sdk-map.en.md	missing-tracked-target
apps/nexus/content/docs/dev/architecture/ipc-events-detail.zh.mdc	595	5	link	./ipc-events-handlers.zh.md	apps/nexus/content/docs/dev/architecture/ipc-events-handlers.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/architecture/ipc-events-detail.zh.mdc	596	5	link	./ipc-events-sdk-map.zh.md	apps/nexus/content/docs/dev/architecture/ipc-events-sdk-map.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/chat.en.mdc	128	88	link	./chat-composer.en.md	apps/nexus/content/docs/dev/components/chat-composer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/chat.en.mdc	129	60	link	./typing-indicator.en.md	apps/nexus/content/docs/dev/components/typing-indicator.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/chat.en.mdc	130	90	link	./ai-elements.en.md	apps/nexus/content/docs/dev/components/ai-elements.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/chat.zh.mdc	128	43	link	./chat-composer.zh.md	apps/nexus/content/docs/dev/components/chat-composer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/chat.zh.mdc	129	35	link	./typing-indicator.zh.md	apps/nexus/content/docs/dev/components/typing-indicator.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/chat.zh.mdc	130	45	link	./ai-elements.zh.md	apps/nexus/content/docs/dev/components/ai-elements.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/empty-state.en.mdc	117	47	link	./error-state.en.md	apps/nexus/content/docs/dev/components/error-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/empty-state.en.mdc	118	59	link	./guide-state.en.md	apps/nexus/content/docs/dev/components/guide-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/empty-state.zh.mdc	117	38	link	./error-state.zh.md	apps/nexus/content/docs/dev/components/error-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/empty-state.zh.mdc	118	38	link	./guide-state.zh.md	apps/nexus/content/docs/dev/components/guide-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/error-state.en.mdc	72	112	link	./empty-state.en.md	apps/nexus/content/docs/dev/components/empty-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/error-state.zh.mdc	72	92	link	./empty-state.zh.md	apps/nexus/content/docs/dev/components/empty-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/guide-state.en.mdc	52	199	link	./empty-state.en.md	apps/nexus/content/docs/dev/components/empty-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/guide-state.zh.mdc	52	141	link	./empty-state.zh.md	apps/nexus/content/docs/dev/components/empty-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	276	14	link	../getting-started/tuffex-composition.en.md	apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	313	3	link	./foundations.en.md	apps/nexus/content/docs/dev/components/foundations.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	314	3	link	./base-surface.en.md	apps/nexus/content/docs/dev/components/base-surface.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	315	3	link	./glass-surface.en.md	apps/nexus/content/docs/dev/components/glass-surface.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	316	3	link	./gradient-border.en.md	apps/nexus/content/docs/dev/components/gradient-border.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	317	3	link	./outline-border.en.md	apps/nexus/content/docs/dev/components/outline-border.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	318	3	link	./corner-overlay.en.md	apps/nexus/content/docs/dev/components/corner-overlay.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	319	3	link	./gradual-blur.en.md	apps/nexus/content/docs/dev/components/gradual-blur.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	320	3	link	./edge-fade-mask.en.md	apps/nexus/content/docs/dev/components/edge-fade-mask.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	321	3	link	./glow-text.en.md	apps/nexus/content/docs/dev/components/glow-text.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	322	3	link	./keyframe-stroke-text.en.md	apps/nexus/content/docs/dev/components/keyframe-stroke-text.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	323	3	link	./tuff-logo-stroke.en.md	apps/nexus/content/docs/dev/components/tuff-logo-stroke.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	324	3	link	./text-transformer.en.md	apps/nexus/content/docs/dev/components/text-transformer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	325	3	link	./transition.en.md	apps/nexus/content/docs/dev/components/transition.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	326	3	link	./stagger.en.md	apps/nexus/content/docs/dev/components/stagger.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	327	3	link	./floating.en.md	apps/nexus/content/docs/dev/components/floating.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	328	3	link	./fusion.en.md	apps/nexus/content/docs/dev/components/fusion.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	329	3	link	./avatar-variants.en.md	apps/nexus/content/docs/dev/components/avatar-variants.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	333	3	link	./agents.en.md	apps/nexus/content/docs/dev/components/agents.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	334	3	link	./chat.en.md	apps/nexus/content/docs/dev/components/chat.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	335	3	link	./ai-elements.en.md	apps/nexus/content/docs/dev/components/ai-elements.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	336	3	link	./chat-composer.en.md	apps/nexus/content/docs/dev/components/chat-composer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	337	3	link	./markdown-view.en.md	apps/nexus/content/docs/dev/components/markdown-view.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	338	3	link	./image-gallery.en.md	apps/nexus/content/docs/dev/components/image-gallery.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	339	3	link	./group-block.en.md	apps/nexus/content/docs/dev/components/group-block.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	340	3	link	./card.en.md	apps/nexus/content/docs/dev/components/card.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	344	3	link	./foundations.en.md	apps/nexus/content/docs/dev/components/foundations.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	345	3	link	./status-badge.en.md	apps/nexus/content/docs/dev/components/status-badge.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	346	3	link	./empty-state.en.md	apps/nexus/content/docs/dev/components/empty-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	347	3	link	./error-state.en.md	apps/nexus/content/docs/dev/components/error-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	348	3	link	./guide-state.en.md	apps/nexus/content/docs/dev/components/guide-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	352	3	link	./button.en.md	apps/nexus/content/docs/dev/components/button.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	353	3	link	./flat-button.en.md	apps/nexus/content/docs/dev/components/flat-button.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	354	3	link	./icon.en.md	apps/nexus/content/docs/dev/components/icon.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	355	3	link	./avatar.en.md	apps/nexus/content/docs/dev/components/avatar.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	356	3	link	./tag.en.md	apps/nexus/content/docs/dev/components/tag.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	357	3	link	./divider.en.md	apps/nexus/content/docs/dev/components/divider.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	358	3	link	./stat-card.en.md	apps/nexus/content/docs/dev/components/stat-card.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	359	3	link	./icon-button.en.md	apps/nexus/content/docs/dev/components/icon-button.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	360	3	link	./copy-button.en.md	apps/nexus/content/docs/dev/components/copy-button.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	361	3	link	./kbd.en.md	apps/nexus/content/docs/dev/components/kbd.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	362	3	link	./os-icon.en.md	apps/nexus/content/docs/dev/components/os-icon.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	363	3	link	./badge.en.md	apps/nexus/content/docs/dev/components/badge.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	367	3	link	./input.en.md	apps/nexus/content/docs/dev/components/input.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	368	3	link	./code-editor.en.md	apps/nexus/content/docs/dev/components/code-editor.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	369	3	link	./textarea.en.md	apps/nexus/content/docs/dev/components/textarea.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	370	3	link	./number-input.en.md	apps/nexus/content/docs/dev/components/number-input.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	371	3	link	./flat-input.en.md	apps/nexus/content/docs/dev/components/flat-input.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	372	3	link	./select.en.md	apps/nexus/content/docs/dev/components/select.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	373	3	link	./markdown-editor.en.md	apps/nexus/content/docs/dev/components/markdown-editor.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	374	3	link	./flat-radio.en.md	apps/nexus/content/docs/dev/components/flat-radio.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	375	3	link	./flat-select.en.md	apps/nexus/content/docs/dev/components/flat-select.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	376	3	link	./search-input.en.md	apps/nexus/content/docs/dev/components/search-input.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	377	3	link	./search-select.en.md	apps/nexus/content/docs/dev/components/search-select.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	378	3	link	./checkbox.en.md	apps/nexus/content/docs/dev/components/checkbox.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	379	3	link	./radio.en.md	apps/nexus/content/docs/dev/components/radio.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	380	3	link	./switch.en.md	apps/nexus/content/docs/dev/components/switch.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	381	3	link	./slider.en.md	apps/nexus/content/docs/dev/components/slider.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	382	3	link	./segmented-slider.en.md	apps/nexus/content/docs/dev/components/segmented-slider.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	383	3	link	./date-picker.en.md	apps/nexus/content/docs/dev/components/date-picker.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	384	3	link	./picker.en.md	apps/nexus/content/docs/dev/components/picker.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	385	3	link	./cascader.en.md	apps/nexus/content/docs/dev/components/cascader.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	386	3	link	./tag-input.en.md	apps/nexus/content/docs/dev/components/tag-input.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	387	3	link	./form.en.md	apps/nexus/content/docs/dev/components/form.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	388	3	link	./file-uploader.en.md	apps/nexus/content/docs/dev/components/file-uploader.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	389	3	link	./image-uploader.en.md	apps/nexus/content/docs/dev/components/image-uploader.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	393	3	link	./dialog.en.md	apps/nexus/content/docs/dev/components/dialog.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	394	3	link	./alert.en.md	apps/nexus/content/docs/dev/components/alert.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	395	3	link	./drawer.en.md	apps/nexus/content/docs/dev/components/drawer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	396	3	link	./flip-overlay.en.md	apps/nexus/content/docs/dev/components/flip-overlay.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	397	3	link	./modal.en.md	apps/nexus/content/docs/dev/components/modal.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	398	3	link	./toast.en.md	apps/nexus/content/docs/dev/components/toast.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	399	3	link	./tooltip.en.md	apps/nexus/content/docs/dev/components/tooltip.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	400	3	link	./popover.en.md	apps/nexus/content/docs/dev/components/popover.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	401	3	link	./base-anchor.en.md	apps/nexus/content/docs/dev/components/base-anchor.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	402	3	link	./loading-state.en.md	apps/nexus/content/docs/dev/components/loading-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	403	3	link	./loading-overlay.en.md	apps/nexus/content/docs/dev/components/loading-overlay.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	404	3	link	./progress.en.md	apps/nexus/content/docs/dev/components/progress.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	405	3	link	./progress-bar.en.md	apps/nexus/content/docs/dev/components/progress-bar.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	406	3	link	./spinner.en.md	apps/nexus/content/docs/dev/components/spinner.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	407	3	link	./empty.en.md	apps/nexus/content/docs/dev/components/empty.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	408	3	link	./empty-state.en.md	apps/nexus/content/docs/dev/components/empty-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	409	3	link	./offline-state.en.md	apps/nexus/content/docs/dev/components/offline-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	410	3	link	./permission-state.en.md	apps/nexus/content/docs/dev/components/permission-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	411	3	link	./search-empty.en.md	apps/nexus/content/docs/dev/components/search-empty.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	412	3	link	./skeleton.en.md	apps/nexus/content/docs/dev/components/skeleton.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	413	3	link	./collapse.en.md	apps/nexus/content/docs/dev/components/collapse.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	414	3	link	./layout-skeleton.en.md	apps/nexus/content/docs/dev/components/layout-skeleton.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	415	3	link	./no-data.en.md	apps/nexus/content/docs/dev/components/no-data.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	416	3	link	./no-selection.en.md	apps/nexus/content/docs/dev/components/no-selection.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	417	3	link	./blank-slate.en.md	apps/nexus/content/docs/dev/components/blank-slate.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	421	3	link	./grid.en.md	apps/nexus/content/docs/dev/components/grid.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	422	3	link	./card-item.en.md	apps/nexus/content/docs/dev/components/card-item.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	423	3	link	./grid-layout.en.md	apps/nexus/content/docs/dev/components/grid-layout.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	424	3	link	./flex.en.md	apps/nexus/content/docs/dev/components/flex.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	425	3	link	./stack.en.md	apps/nexus/content/docs/dev/components/stack.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	426	3	link	./container.en.md	apps/nexus/content/docs/dev/components/container.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	427	3	link	./splitter.en.md	apps/nexus/content/docs/dev/components/splitter.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	428	3	link	./scroll.en.md	apps/nexus/content/docs/dev/components/scroll.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	429	3	link	./auto-sizer.en.md	apps/nexus/content/docs/dev/components/auto-sizer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	430	3	link	./nav-bar.en.md	apps/nexus/content/docs/dev/components/nav-bar.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	431	3	link	./tab-bar.en.md	apps/nexus/content/docs/dev/components/tab-bar.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	432	3	link	./tabs.en.md	apps/nexus/content/docs/dev/components/tabs.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	433	3	link	./breadcrumb.en.md	apps/nexus/content/docs/dev/components/breadcrumb.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	434	3	link	./dropdown-menu.en.md	apps/nexus/content/docs/dev/components/dropdown-menu.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	435	3	link	./command-palette.en.md	apps/nexus/content/docs/dev/components/command-palette.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	436	3	link	./context-menu.en.md	apps/nexus/content/docs/dev/components/context-menu.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	437	3	link	./version-capsule.en.md	apps/nexus/content/docs/dev/components/version-capsule.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	441	3	link	./data-table.en.md	apps/nexus/content/docs/dev/components/data-table.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	442	3	link	./pagination.en.md	apps/nexus/content/docs/dev/components/pagination.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	443	3	link	./tree.en.md	apps/nexus/content/docs/dev/components/tree.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	444	3	link	./tree-select.en.md	apps/nexus/content/docs/dev/components/tree-select.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	445	3	link	./sortable-list.en.md	apps/nexus/content/docs/dev/components/sortable-list.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	446	3	link	./virtual-list.en.md	apps/nexus/content/docs/dev/components/virtual-list.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	447	3	link	./steps.en.md	apps/nexus/content/docs/dev/components/steps.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	448	3	link	./rating.en.md	apps/nexus/content/docs/dev/components/rating.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	449	3	link	./timeline.en.md	apps/nexus/content/docs/dev/components/timeline.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	450	3	link	./transfer.en.md	apps/nexus/content/docs/dev/components/transfer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	454	3	link	./chat.en.md	apps/nexus/content/docs/dev/components/chat.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	455	3	link	./chat-composer.en.md	apps/nexus/content/docs/dev/components/chat-composer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	456	3	link	./typing-indicator.en.md	apps/nexus/content/docs/dev/components/typing-indicator.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	457	3	link	./markdown-view.en.md	apps/nexus/content/docs/dev/components/markdown-view.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.en.mdc	458	3	link	./image-gallery.en.md	apps/nexus/content/docs/dev/components/image-gallery.en.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	276	8	link	../getting-started/tuffex-composition.zh.md	apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	313	3	link	./foundations.zh.md	apps/nexus/content/docs/dev/components/foundations.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	314	3	link	./base-surface.zh.md	apps/nexus/content/docs/dev/components/base-surface.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	315	3	link	./glass-surface.zh.md	apps/nexus/content/docs/dev/components/glass-surface.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	316	3	link	./gradient-border.zh.md	apps/nexus/content/docs/dev/components/gradient-border.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	317	3	link	./outline-border.zh.md	apps/nexus/content/docs/dev/components/outline-border.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	318	3	link	./corner-overlay.zh.md	apps/nexus/content/docs/dev/components/corner-overlay.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	319	3	link	./gradual-blur.zh.md	apps/nexus/content/docs/dev/components/gradual-blur.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	320	3	link	./edge-fade-mask.zh.md	apps/nexus/content/docs/dev/components/edge-fade-mask.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	321	3	link	./glow-text.zh.md	apps/nexus/content/docs/dev/components/glow-text.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	322	3	link	./keyframe-stroke-text.zh.md	apps/nexus/content/docs/dev/components/keyframe-stroke-text.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	323	3	link	./tuff-logo-stroke.zh.md	apps/nexus/content/docs/dev/components/tuff-logo-stroke.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	324	3	link	./text-transformer.zh.md	apps/nexus/content/docs/dev/components/text-transformer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	325	3	link	./transition.zh.md	apps/nexus/content/docs/dev/components/transition.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	326	3	link	./stagger.zh.md	apps/nexus/content/docs/dev/components/stagger.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	327	3	link	./floating.zh.md	apps/nexus/content/docs/dev/components/floating.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	328	3	link	./fusion.zh.md	apps/nexus/content/docs/dev/components/fusion.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	329	3	link	./avatar-variants.zh.md	apps/nexus/content/docs/dev/components/avatar-variants.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	333	3	link	./agents.zh.md	apps/nexus/content/docs/dev/components/agents.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	334	3	link	./chat.zh.md	apps/nexus/content/docs/dev/components/chat.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	335	3	link	./ai-elements.zh.md	apps/nexus/content/docs/dev/components/ai-elements.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	336	3	link	./chat-composer.zh.md	apps/nexus/content/docs/dev/components/chat-composer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	337	3	link	./markdown-view.zh.md	apps/nexus/content/docs/dev/components/markdown-view.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	338	3	link	./image-gallery.zh.md	apps/nexus/content/docs/dev/components/image-gallery.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	339	3	link	./group-block.zh.md	apps/nexus/content/docs/dev/components/group-block.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	340	3	link	./card.zh.md	apps/nexus/content/docs/dev/components/card.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	344	3	link	./foundations.zh.md	apps/nexus/content/docs/dev/components/foundations.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	345	3	link	./status-badge.zh.md	apps/nexus/content/docs/dev/components/status-badge.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	346	3	link	./empty-state.zh.md	apps/nexus/content/docs/dev/components/empty-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	347	3	link	./error-state.zh.md	apps/nexus/content/docs/dev/components/error-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	348	3	link	./guide-state.zh.md	apps/nexus/content/docs/dev/components/guide-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	352	3	link	./button.zh.md	apps/nexus/content/docs/dev/components/button.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	353	3	link	./flat-button.zh.md	apps/nexus/content/docs/dev/components/flat-button.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	354	3	link	./icon.zh.md	apps/nexus/content/docs/dev/components/icon.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	355	3	link	./avatar.zh.md	apps/nexus/content/docs/dev/components/avatar.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	356	3	link	./tag.zh.md	apps/nexus/content/docs/dev/components/tag.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	357	3	link	./divider.zh.md	apps/nexus/content/docs/dev/components/divider.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	358	3	link	./stat-card.zh.md	apps/nexus/content/docs/dev/components/stat-card.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	359	3	link	./icon-button.zh.md	apps/nexus/content/docs/dev/components/icon-button.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	360	3	link	./copy-button.zh.md	apps/nexus/content/docs/dev/components/copy-button.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	361	3	link	./kbd.zh.md	apps/nexus/content/docs/dev/components/kbd.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	362	3	link	./os-icon.zh.md	apps/nexus/content/docs/dev/components/os-icon.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	363	3	link	./badge.zh.md	apps/nexus/content/docs/dev/components/badge.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	367	3	link	./input.zh.md	apps/nexus/content/docs/dev/components/input.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	368	3	link	./code-editor.zh.md	apps/nexus/content/docs/dev/components/code-editor.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	369	3	link	./textarea.zh.md	apps/nexus/content/docs/dev/components/textarea.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	370	3	link	./number-input.zh.md	apps/nexus/content/docs/dev/components/number-input.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	371	3	link	./flat-input.zh.md	apps/nexus/content/docs/dev/components/flat-input.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	372	3	link	./select.zh.md	apps/nexus/content/docs/dev/components/select.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	373	3	link	./markdown-editor.zh.md	apps/nexus/content/docs/dev/components/markdown-editor.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	374	3	link	./flat-radio.zh.md	apps/nexus/content/docs/dev/components/flat-radio.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	375	3	link	./flat-select.zh.md	apps/nexus/content/docs/dev/components/flat-select.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	376	3	link	./search-input.zh.md	apps/nexus/content/docs/dev/components/search-input.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	377	3	link	./search-select.zh.md	apps/nexus/content/docs/dev/components/search-select.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	378	3	link	./checkbox.zh.md	apps/nexus/content/docs/dev/components/checkbox.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	379	3	link	./radio.zh.md	apps/nexus/content/docs/dev/components/radio.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	380	3	link	./switch.zh.md	apps/nexus/content/docs/dev/components/switch.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	381	3	link	./slider.zh.md	apps/nexus/content/docs/dev/components/slider.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	382	3	link	./segmented-slider.zh.md	apps/nexus/content/docs/dev/components/segmented-slider.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	383	3	link	./date-picker.zh.md	apps/nexus/content/docs/dev/components/date-picker.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	384	3	link	./picker.zh.md	apps/nexus/content/docs/dev/components/picker.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	385	3	link	./cascader.zh.md	apps/nexus/content/docs/dev/components/cascader.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	386	3	link	./tag-input.zh.md	apps/nexus/content/docs/dev/components/tag-input.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	387	3	link	./form.zh.md	apps/nexus/content/docs/dev/components/form.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	388	3	link	./file-uploader.zh.md	apps/nexus/content/docs/dev/components/file-uploader.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	389	3	link	./image-uploader.zh.md	apps/nexus/content/docs/dev/components/image-uploader.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	393	3	link	./dialog.zh.md	apps/nexus/content/docs/dev/components/dialog.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	394	3	link	./alert.zh.md	apps/nexus/content/docs/dev/components/alert.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	395	3	link	./drawer.zh.md	apps/nexus/content/docs/dev/components/drawer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	396	3	link	./flip-overlay.zh.md	apps/nexus/content/docs/dev/components/flip-overlay.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	397	3	link	./modal.zh.md	apps/nexus/content/docs/dev/components/modal.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	398	3	link	./toast.zh.md	apps/nexus/content/docs/dev/components/toast.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	399	3	link	./tooltip.zh.md	apps/nexus/content/docs/dev/components/tooltip.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	400	3	link	./popover.zh.md	apps/nexus/content/docs/dev/components/popover.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	401	3	link	./base-anchor.zh.md	apps/nexus/content/docs/dev/components/base-anchor.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	402	3	link	./loading-state.zh.md	apps/nexus/content/docs/dev/components/loading-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	403	3	link	./loading-overlay.zh.md	apps/nexus/content/docs/dev/components/loading-overlay.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	404	3	link	./progress.zh.md	apps/nexus/content/docs/dev/components/progress.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	405	3	link	./progress-bar.zh.md	apps/nexus/content/docs/dev/components/progress-bar.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	406	3	link	./spinner.zh.md	apps/nexus/content/docs/dev/components/spinner.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	407	3	link	./empty.zh.md	apps/nexus/content/docs/dev/components/empty.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	408	3	link	./empty-state.zh.md	apps/nexus/content/docs/dev/components/empty-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	409	3	link	./offline-state.zh.md	apps/nexus/content/docs/dev/components/offline-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	410	3	link	./permission-state.zh.md	apps/nexus/content/docs/dev/components/permission-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	411	3	link	./search-empty.zh.md	apps/nexus/content/docs/dev/components/search-empty.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	412	3	link	./skeleton.zh.md	apps/nexus/content/docs/dev/components/skeleton.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	413	3	link	./collapse.zh.md	apps/nexus/content/docs/dev/components/collapse.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	414	3	link	./layout-skeleton.zh.md	apps/nexus/content/docs/dev/components/layout-skeleton.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	415	3	link	./no-data.zh.md	apps/nexus/content/docs/dev/components/no-data.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	416	3	link	./no-selection.zh.md	apps/nexus/content/docs/dev/components/no-selection.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	417	3	link	./blank-slate.zh.md	apps/nexus/content/docs/dev/components/blank-slate.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	421	3	link	./grid.zh.md	apps/nexus/content/docs/dev/components/grid.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	422	3	link	./card-item.zh.md	apps/nexus/content/docs/dev/components/card-item.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	423	3	link	./grid-layout.zh.md	apps/nexus/content/docs/dev/components/grid-layout.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	424	3	link	./flex.zh.md	apps/nexus/content/docs/dev/components/flex.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	425	3	link	./stack.zh.md	apps/nexus/content/docs/dev/components/stack.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	426	3	link	./container.zh.md	apps/nexus/content/docs/dev/components/container.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	427	3	link	./splitter.zh.md	apps/nexus/content/docs/dev/components/splitter.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	428	3	link	./scroll.zh.md	apps/nexus/content/docs/dev/components/scroll.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	429	3	link	./auto-sizer.zh.md	apps/nexus/content/docs/dev/components/auto-sizer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	430	3	link	./nav-bar.zh.md	apps/nexus/content/docs/dev/components/nav-bar.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	431	3	link	./tab-bar.zh.md	apps/nexus/content/docs/dev/components/tab-bar.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	432	3	link	./tabs.zh.md	apps/nexus/content/docs/dev/components/tabs.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	433	3	link	./breadcrumb.zh.md	apps/nexus/content/docs/dev/components/breadcrumb.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	434	3	link	./dropdown-menu.zh.md	apps/nexus/content/docs/dev/components/dropdown-menu.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	435	3	link	./command-palette.zh.md	apps/nexus/content/docs/dev/components/command-palette.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	436	3	link	./context-menu.zh.md	apps/nexus/content/docs/dev/components/context-menu.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	437	3	link	./version-capsule.zh.md	apps/nexus/content/docs/dev/components/version-capsule.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	441	3	link	./data-table.zh.md	apps/nexus/content/docs/dev/components/data-table.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	442	3	link	./pagination.zh.md	apps/nexus/content/docs/dev/components/pagination.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	443	3	link	./tree.zh.md	apps/nexus/content/docs/dev/components/tree.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	444	3	link	./tree-select.zh.md	apps/nexus/content/docs/dev/components/tree-select.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	445	3	link	./sortable-list.zh.md	apps/nexus/content/docs/dev/components/sortable-list.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	446	3	link	./virtual-list.zh.md	apps/nexus/content/docs/dev/components/virtual-list.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	447	3	link	./steps.zh.md	apps/nexus/content/docs/dev/components/steps.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	448	3	link	./rating.zh.md	apps/nexus/content/docs/dev/components/rating.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	449	3	link	./timeline.zh.md	apps/nexus/content/docs/dev/components/timeline.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	450	3	link	./transfer.zh.md	apps/nexus/content/docs/dev/components/transfer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	454	3	link	./chat.zh.md	apps/nexus/content/docs/dev/components/chat.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	455	3	link	./chat-composer.zh.md	apps/nexus/content/docs/dev/components/chat-composer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	456	3	link	./typing-indicator.zh.md	apps/nexus/content/docs/dev/components/typing-indicator.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	457	3	link	./markdown-view.zh.md	apps/nexus/content/docs/dev/components/markdown-view.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/components/index.zh.mdc	458	3	link	./image-gallery.zh.md	apps/nexus/content/docs/dev/components/image-gallery.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/index.en.mdc	7	3	link	./overview.en.md	apps/nexus/content/docs/dev/getting-started/overview.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/index.en.mdc	8	3	link	./quickstart.en.md	apps/nexus/content/docs/dev/getting-started/quickstart.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/index.en.mdc	9	3	link	./tuffex-composition.en.md	apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/index.en.mdc	10	3	link	./plugin-workflow.en.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/index.zh.mdc	7	3	link	./overview.zh.md	apps/nexus/content/docs/dev/getting-started/overview.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/index.zh.mdc	8	3	link	./quickstart.zh.md	apps/nexus/content/docs/dev/getting-started/quickstart.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/index.zh.mdc	9	3	link	./tuffex-composition.zh.md	apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/index.zh.mdc	10	3	link	./plugin-workflow.zh.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.mdc	155	98	link	../api/intelligence.en.md	apps/nexus/content/docs/dev/api/intelligence.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.mdc	207	3	link	./quickstart.en.md	apps/nexus/content/docs/dev/getting-started/quickstart.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.mdc	208	3	link	../reference/manifest.en.md	apps/nexus/content/docs/dev/reference/manifest.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.mdc	209	3	link	../api/plugin-context.en.md	apps/nexus/content/docs/dev/api/plugin-context.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.mdc	210	3	link	../api/storage.en.md	apps/nexus/content/docs/dev/api/storage.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.mdc	211	3	link	../extensions/cloud-sync.en.md	apps/nexus/content/docs/dev/extensions/cloud-sync.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.mdc	212	3	link	../release/publish.en.md	apps/nexus/content/docs/dev/release/publish.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc	155	71	link	../api/intelligence.zh.md	apps/nexus/content/docs/dev/api/intelligence.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc	207	3	link	./quickstart.zh.md	apps/nexus/content/docs/dev/getting-started/quickstart.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc	208	3	link	../reference/manifest.zh.md	apps/nexus/content/docs/dev/reference/manifest.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc	209	3	link	../api/plugin-context.zh.md	apps/nexus/content/docs/dev/api/plugin-context.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc	210	3	link	../api/storage.zh.md	apps/nexus/content/docs/dev/api/storage.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc	211	3	link	../extensions/cloud-sync.zh.md	apps/nexus/content/docs/dev/extensions/cloud-sync.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.mdc	212	3	link	../release/publish.zh.md	apps/nexus/content/docs/dev/release/publish.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/quickstart.en.mdc	116	15	link	./plugin-workflow.en.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/quickstart.zh.mdc	116	6	link	./plugin-workflow.zh.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	336	3	link	../components/index.en.md	apps/nexus/content/docs/dev/components/index.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	337	3	link	../components/search-input.en.md	apps/nexus/content/docs/dev/components/search-input.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	338	3	link	../components/search-select.en.md	apps/nexus/content/docs/dev/components/search-select.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	339	3	link	../components/search-empty.en.md	apps/nexus/content/docs/dev/components/search-empty.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	340	3	link	../components/stat-card.en.md	apps/nexus/content/docs/dev/components/stat-card.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	341	3	link	../components/data-table.en.md	apps/nexus/content/docs/dev/components/data-table.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	342	3	link	../components/pagination.en.md	apps/nexus/content/docs/dev/components/pagination.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	343	3	link	../components/skeleton.en.md	apps/nexus/content/docs/dev/components/skeleton.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	344	3	link	../components/cascader.en.md	apps/nexus/content/docs/dev/components/cascader.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	345	3	link	../components/flat-select.en.md	apps/nexus/content/docs/dev/components/flat-select.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	346	3	link	../components/segmented-slider.en.md	apps/nexus/content/docs/dev/components/segmented-slider.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	347	3	link	../components/slider.en.md	apps/nexus/content/docs/dev/components/slider.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	348	3	link	../components/tag-input.en.md	apps/nexus/content/docs/dev/components/tag-input.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	349	3	link	../components/tree.en.md	apps/nexus/content/docs/dev/components/tree.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	350	3	link	../components/tree-select.en.md	apps/nexus/content/docs/dev/components/tree-select.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	351	3	link	../components/transfer.en.md	apps/nexus/content/docs/dev/components/transfer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	352	3	link	../components/timeline.en.md	apps/nexus/content/docs/dev/components/timeline.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	353	3	link	../components/layout-skeleton.en.md	apps/nexus/content/docs/dev/components/layout-skeleton.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	354	3	link	../components/tabs.en.md	apps/nexus/content/docs/dev/components/tabs.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	355	3	link	../components/dropdown-menu.en.md	apps/nexus/content/docs/dev/components/dropdown-menu.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	356	3	link	../components/popover.en.md	apps/nexus/content/docs/dev/components/popover.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	357	3	link	../components/drawer.en.md	apps/nexus/content/docs/dev/components/drawer.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	358	3	link	../components/status-badge.en.md	apps/nexus/content/docs/dev/components/status-badge.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	359	3	link	../components/progress-bar.en.md	apps/nexus/content/docs/dev/components/progress-bar.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	360	3	link	../components/empty-state.en.md	apps/nexus/content/docs/dev/components/empty-state.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	361	3	link	../components/toast.en.md	apps/nexus/content/docs/dev/components/toast.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	362	3	link	../components/tooltip.en.md	apps/nexus/content/docs/dev/components/tooltip.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	363	3	link	../components/loading-overlay.en.md	apps/nexus/content/docs/dev/components/loading-overlay.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.en.mdc	364	3	link	../components/spinner.en.md	apps/nexus/content/docs/dev/components/spinner.en.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	336	3	link	../components/index.zh.md	apps/nexus/content/docs/dev/components/index.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	337	3	link	../components/search-input.zh.md	apps/nexus/content/docs/dev/components/search-input.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	338	3	link	../components/search-select.zh.md	apps/nexus/content/docs/dev/components/search-select.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	339	3	link	../components/search-empty.zh.md	apps/nexus/content/docs/dev/components/search-empty.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	340	3	link	../components/stat-card.zh.md	apps/nexus/content/docs/dev/components/stat-card.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	341	3	link	../components/data-table.zh.md	apps/nexus/content/docs/dev/components/data-table.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	342	3	link	../components/pagination.zh.md	apps/nexus/content/docs/dev/components/pagination.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	343	3	link	../components/skeleton.zh.md	apps/nexus/content/docs/dev/components/skeleton.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	344	3	link	../components/cascader.zh.md	apps/nexus/content/docs/dev/components/cascader.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	345	3	link	../components/flat-select.zh.md	apps/nexus/content/docs/dev/components/flat-select.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	346	3	link	../components/segmented-slider.zh.md	apps/nexus/content/docs/dev/components/segmented-slider.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	347	3	link	../components/slider.zh.md	apps/nexus/content/docs/dev/components/slider.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	348	3	link	../components/tag-input.zh.md	apps/nexus/content/docs/dev/components/tag-input.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	349	3	link	../components/tree.zh.md	apps/nexus/content/docs/dev/components/tree.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	350	3	link	../components/tree-select.zh.md	apps/nexus/content/docs/dev/components/tree-select.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	351	3	link	../components/transfer.zh.md	apps/nexus/content/docs/dev/components/transfer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	352	3	link	../components/timeline.zh.md	apps/nexus/content/docs/dev/components/timeline.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	353	3	link	../components/layout-skeleton.zh.md	apps/nexus/content/docs/dev/components/layout-skeleton.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	354	3	link	../components/tabs.zh.md	apps/nexus/content/docs/dev/components/tabs.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	355	3	link	../components/dropdown-menu.zh.md	apps/nexus/content/docs/dev/components/dropdown-menu.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	356	3	link	../components/popover.zh.md	apps/nexus/content/docs/dev/components/popover.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	357	3	link	../components/drawer.zh.md	apps/nexus/content/docs/dev/components/drawer.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	358	3	link	../components/status-badge.zh.md	apps/nexus/content/docs/dev/components/status-badge.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	359	3	link	../components/progress-bar.zh.md	apps/nexus/content/docs/dev/components/progress-bar.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	360	3	link	../components/empty-state.zh.md	apps/nexus/content/docs/dev/components/empty-state.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	361	3	link	../components/toast.zh.md	apps/nexus/content/docs/dev/components/toast.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	362	3	link	../components/tooltip.zh.md	apps/nexus/content/docs/dev/components/tooltip.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	363	3	link	../components/loading-overlay.zh.md	apps/nexus/content/docs/dev/components/loading-overlay.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/getting-started/tuffex-composition.zh.mdc	364	3	link	../components/spinner.zh.md	apps/nexus/content/docs/dev/components/spinner.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	6	6	link	./getting-started/overview.en.md	apps/nexus/content/docs/dev/getting-started/overview.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	7	6	link	./getting-started/quickstart.en.md	apps/nexus/content/docs/dev/getting-started/quickstart.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	8	6	link	./getting-started/plugin-workflow.en.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	9	6	link	./reference/manifest.en.md	apps/nexus/content/docs/dev/reference/manifest.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	10	6	link	./release/migration.en.md	apps/nexus/content/docs/dev/release/migration.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	14	5	link	./api/search.en.md	apps/nexus/content/docs/dev/api/search.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	15	5	link	./api/quickops.en.md	apps/nexus/content/docs/dev/api/quickops.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	17	5	link	./getting-started/plugin-workflow.en.md#plugin-packages-vs-content-packages	apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	18	5	link	./reference/runtime-startup-env.en.md	apps/nexus/content/docs/dev/reference/runtime-startup-env.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	19	5	link	./reference/examples.en.md	apps/nexus/content/docs/dev/reference/examples.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	20	5	link	./reference/snippets.en.md	apps/nexus/content/docs/dev/reference/snippets.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	23	5	link	./architecture/corebox-and-views.en.md	apps/nexus/content/docs/dev/architecture/corebox-and-views.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	24	5	link	./architecture/corebox-system.en.md	apps/nexus/content/docs/dev/architecture/corebox-system.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	25	5	link	./architecture/device-idle-service.en.md	apps/nexus/content/docs/dev/architecture/device-idle-service.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	26	5	link	./architecture/app-tech-principles.en.md	apps/nexus/content/docs/dev/architecture/app-tech-principles.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	27	5	link	./architecture/module-map.en.md	apps/nexus/content/docs/dev/architecture/module-map.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	28	5	link	./architecture/search-engine.en.md	apps/nexus/content/docs/dev/architecture/search-engine.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	29	5	link	./architecture/plugin-system.en.md	apps/nexus/content/docs/dev/architecture/plugin-system.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	30	5	link	./architecture/transport-events.en.md	apps/nexus/content/docs/dev/architecture/transport-events.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	31	5	link	./architecture/ipc-events-detail.en.md	apps/nexus/content/docs/dev/architecture/ipc-events-detail.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	32	5	link	./architecture/ipc-events-handlers.en.md	apps/nexus/content/docs/dev/architecture/ipc-events-handlers.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	33	5	link	./architecture/ipc-events-sdk-map.en.md	apps/nexus/content/docs/dev/architecture/ipc-events-sdk-map.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	34	5	link	./architecture/division-box.en.md	apps/nexus/content/docs/dev/architecture/division-box.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	35	5	link	./architecture/intelligence-module.en.md	apps/nexus/content/docs/dev/architecture/intelligence-module.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	36	5	link	./architecture/storage-and-db.en.md	apps/nexus/content/docs/dev/architecture/storage-and-db.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	39	5	link	./tools/tuff-cli.en.md	apps/nexus/content/docs/dev/tools/tuff-cli.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	40	5	link	./tools/tuffex.en.md	apps/nexus/content/docs/dev/tools/tuffex.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	41	5	link	./components/index.en.md	apps/nexus/content/docs/dev/components/index.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.en.mdc	44	5	link	./release/publish.en.md	apps/nexus/content/docs/dev/release/publish.en.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	6	6	link	./getting-started/overview.zh.md	apps/nexus/content/docs/dev/getting-started/overview.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	7	6	link	./getting-started/quickstart.zh.md	apps/nexus/content/docs/dev/getting-started/quickstart.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	8	6	link	./getting-started/plugin-workflow.zh.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	9	6	link	./reference/manifest.zh.md	apps/nexus/content/docs/dev/reference/manifest.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	10	6	link	./release/migration.zh.md	apps/nexus/content/docs/dev/release/migration.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	14	5	link	./api/search.zh.md	apps/nexus/content/docs/dev/api/search.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	15	5	link	./api/quickops.zh.md	apps/nexus/content/docs/dev/api/quickops.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	17	5	link	./getting-started/plugin-workflow.zh.md#插件包与内容包边界	apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	18	5	link	./reference/runtime-startup-env.zh.md	apps/nexus/content/docs/dev/reference/runtime-startup-env.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	19	5	link	./reference/examples.zh.md	apps/nexus/content/docs/dev/reference/examples.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	20	5	link	./reference/snippets.zh.md	apps/nexus/content/docs/dev/reference/snippets.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	23	5	link	./architecture/corebox-and-views.zh.md	apps/nexus/content/docs/dev/architecture/corebox-and-views.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	24	5	link	./architecture/corebox-system.zh.md	apps/nexus/content/docs/dev/architecture/corebox-system.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	25	5	link	./architecture/device-idle-service.zh.md	apps/nexus/content/docs/dev/architecture/device-idle-service.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	26	5	link	./architecture/app-tech-principles.zh.md	apps/nexus/content/docs/dev/architecture/app-tech-principles.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	27	5	link	./architecture/module-map.zh.md	apps/nexus/content/docs/dev/architecture/module-map.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	28	5	link	./architecture/search-engine.zh.md	apps/nexus/content/docs/dev/architecture/search-engine.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	29	5	link	./architecture/plugin-system.zh.md	apps/nexus/content/docs/dev/architecture/plugin-system.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	30	5	link	./architecture/transport-events.zh.md	apps/nexus/content/docs/dev/architecture/transport-events.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	31	5	link	./architecture/ipc-events-detail.zh.md	apps/nexus/content/docs/dev/architecture/ipc-events-detail.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	32	5	link	./architecture/ipc-events-handlers.zh.md	apps/nexus/content/docs/dev/architecture/ipc-events-handlers.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	33	5	link	./architecture/ipc-events-sdk-map.zh.md	apps/nexus/content/docs/dev/architecture/ipc-events-sdk-map.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	34	5	link	./architecture/division-box.zh.md	apps/nexus/content/docs/dev/architecture/division-box.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	35	5	link	./architecture/intelligence-module.zh.md	apps/nexus/content/docs/dev/architecture/intelligence-module.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	36	5	link	./architecture/storage-and-db.zh.md	apps/nexus/content/docs/dev/architecture/storage-and-db.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	39	5	link	./tools/tuff-cli.zh.md	apps/nexus/content/docs/dev/tools/tuff-cli.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	40	5	link	./tools/tuffex.zh.md	apps/nexus/content/docs/dev/tools/tuffex.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	41	5	link	./components/index.zh.md	apps/nexus/content/docs/dev/components/index.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/index.zh.mdc	44	5	link	./release/publish.zh.md	apps/nexus/content/docs/dev/release/publish.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.en.mdc	4	3	link	./manifest.en.md	apps/nexus/content/docs/dev/reference/manifest.en.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.en.mdc	5	3	link	../getting-started/plugin-workflow.en.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.en.mdc	6	3	link	./runtime-startup-env.en.md	apps/nexus/content/docs/dev/reference/runtime-startup-env.en.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.en.mdc	7	3	link	./examples.en.md	apps/nexus/content/docs/dev/reference/examples.en.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.en.mdc	8	3	link	./snippets.en.md	apps/nexus/content/docs/dev/reference/snippets.en.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.zh.mdc	4	3	link	./manifest.zh.md	apps/nexus/content/docs/dev/reference/manifest.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.zh.mdc	5	3	link	../getting-started/plugin-workflow.zh.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.zh.mdc	6	3	link	./runtime-startup-env.zh.md	apps/nexus/content/docs/dev/reference/runtime-startup-env.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.zh.mdc	7	3	link	./examples.zh.md	apps/nexus/content/docs/dev/reference/examples.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/index.zh.mdc	8	3	link	./snippets.zh.md	apps/nexus/content/docs/dev/reference/snippets.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/manifest.en.mdc	170	76	link	../getting-started/plugin-workflow.en.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/dev/reference/manifest.zh.mdc	172	34	link	../getting-started/plugin-workflow.zh.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/release/index.en.md	4	3	link	./publish.en.md	apps/nexus/content/docs/dev/release/publish.en.md	missing-tracked-target
apps/nexus/content/docs/dev/release/index.en.md	5	3	link	../getting-started/plugin-workflow.en.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/dev/release/index.en.md	7	3	link	./migration.en.md	apps/nexus/content/docs/dev/release/migration.en.md	missing-tracked-target
apps/nexus/content/docs/dev/release/index.zh.md	4	3	link	./publish.zh.md	apps/nexus/content/docs/dev/release/publish.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/release/index.zh.md	5	3	link	../getting-started/plugin-workflow.zh.md	apps/nexus/content/docs/dev/getting-started/plugin-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/release/index.zh.md	7	3	link	./migration.zh.md	apps/nexus/content/docs/dev/release/migration.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/tools/index.en.mdc	4	3	link	./tuff-cli.en.md	apps/nexus/content/docs/dev/tools/tuff-cli.en.md	missing-tracked-target
apps/nexus/content/docs/dev/tools/index.en.mdc	5	3	link	./tuffex.en.md	apps/nexus/content/docs/dev/tools/tuffex.en.md	missing-tracked-target
apps/nexus/content/docs/dev/tools/index.zh.mdc	4	3	link	./tuff-cli.zh.md	apps/nexus/content/docs/dev/tools/tuff-cli.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/tools/index.zh.mdc	5	3	link	./tuffex.zh.md	apps/nexus/content/docs/dev/tools/tuffex.zh.md	missing-tracked-target
apps/nexus/content/docs/dev/tools/tuffex.en.mdc	13	5	link	../components/index.en.md	apps/nexus/content/docs/dev/components/index.en.md	missing-tracked-target
apps/nexus/content/docs/dev/tools/tuffex.zh.mdc	13	5	link	../components/index.zh.md	apps/nexus/content/docs/dev/components/index.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugin-ecosystem.en.mdc	31	22	link	./recommended-plugins.en.md	apps/nexus/content/docs/guide/features/recommended-plugins.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugin-ecosystem.en.mdc	32	17	link	./plugins/index.en.md	apps/nexus/content/docs/guide/features/plugins/index.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugin-ecosystem.zh.mdc	31	9	link	./recommended-plugins.zh.md	apps/nexus/content/docs/guide/features/recommended-plugins.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugin-ecosystem.zh.mdc	32	9	link	./plugins/index.zh.md	apps/nexus/content/docs/guide/features/plugins/index.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	8	35	link	./browser-open.en.md	apps/nexus/content/docs/guide/features/plugins/browser-open.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	9	45	link	./browser-bookmarks.en.md	apps/nexus/content/docs/guide/features/plugins/browser-bookmarks.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	10	43	link	./intelligence.en.md	apps/nexus/content/docs/guide/features/plugins/intelligence.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	11	37	link	./translation.en.md	apps/nexus/content/docs/guide/features/plugins/translation.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	12	44	link	./code-snippets.en.md	apps/nexus/content/docs/guide/features/plugins/code-snippets.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	13	44	link	./text-snippets.en.md	apps/nexus/content/docs/guide/features/plugins/text-snippets.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	14	35	link	./batch-rename.en.md	apps/nexus/content/docs/guide/features/plugins/batch-rename.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	15	45	link	./workspace-scripts.en.md	apps/nexus/content/docs/guide/features/plugins/workspace-scripts.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	16	33	link	./dev-toolbox.en.md	apps/nexus/content/docs/guide/features/plugins/dev-toolbox.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	17	29	link	./dev-utils.en.md	apps/nexus/content/docs/guide/features/plugins/dev-utils.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	18	35	link	./window-manager.en.md	apps/nexus/content/docs/guide/features/plugins/window-manager.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	19	39	link	./window-presets.en.md	apps/nexus/content/docs/guide/features/plugins/window-presets.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	20	39	link	./system-actions.en.md	apps/nexus/content/docs/guide/features/plugins/system-actions.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	21	37	link	./quick-actions.en.md	apps/nexus/content/docs/guide/features/plugins/quick-actions.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.en.mdc	24	14	link	../recommended-plugins.en.md	apps/nexus/content/docs/guide/features/recommended-plugins.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	8	28	link	./browser-open.zh.md	apps/nexus/content/docs/guide/features/plugins/browser-open.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	9	33	link	./browser-bookmarks.zh.md	apps/nexus/content/docs/guide/features/plugins/browser-bookmarks.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	10	31	link	./intelligence.zh.md	apps/nexus/content/docs/guide/features/plugins/intelligence.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	11	28	link	./translation.zh.md	apps/nexus/content/docs/guide/features/plugins/translation.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	12	36	link	./code-snippets.zh.md	apps/nexus/content/docs/guide/features/plugins/code-snippets.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	13	36	link	./text-snippets.zh.md	apps/nexus/content/docs/guide/features/plugins/text-snippets.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	14	28	link	./batch-rename.zh.md	apps/nexus/content/docs/guide/features/plugins/batch-rename.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	15	33	link	./workspace-scripts.zh.md	apps/nexus/content/docs/guide/features/plugins/workspace-scripts.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	16	27	link	./dev-toolbox.zh.md	apps/nexus/content/docs/guide/features/plugins/dev-toolbox.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	17	25	link	./dev-utils.zh.md	apps/nexus/content/docs/guide/features/plugins/dev-utils.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	18	25	link	./window-manager.zh.md	apps/nexus/content/docs/guide/features/plugins/window-manager.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	19	29	link	./window-presets.zh.md	apps/nexus/content/docs/guide/features/plugins/window-presets.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	20	29	link	./system-actions.zh.md	apps/nexus/content/docs/guide/features/plugins/system-actions.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	21	30	link	./quick-actions.zh.md	apps/nexus/content/docs/guide/features/plugins/quick-actions.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/plugins/index.zh.mdc	24	6	link	../recommended-plugins.zh.md	apps/nexus/content/docs/guide/features/recommended-plugins.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/quickops.en.mdc	84	5	link	../../dev/api/quickops.en.md	apps/nexus/content/docs/dev/api/quickops.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/quickops.en.mdc	105	3	link	./preview.en.md	apps/nexus/content/docs/guide/features/preview.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/quickops.en.mdc	106	3	link	./corebox-workflow.en.md	apps/nexus/content/docs/guide/features/corebox-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/quickops.en.mdc	107	3	link	../../dev/api/quickops.en.md	apps/nexus/content/docs/dev/api/quickops.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/quickops.zh.mdc	84	8	link	../../dev/api/quickops.zh.md	apps/nexus/content/docs/dev/api/quickops.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/quickops.zh.mdc	105	3	link	./preview.zh.md	apps/nexus/content/docs/guide/features/preview.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/quickops.zh.mdc	106	3	link	./corebox-workflow.zh.md	apps/nexus/content/docs/guide/features/corebox-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/quickops.zh.mdc	107	3	link	../../dev/api/quickops.zh.md	apps/nexus/content/docs/dev/api/quickops.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/features/recommended-plugins.en.mdc	25	12	link	./plugins/index.en.md	apps/nexus/content/docs/guide/features/plugins/index.en.md	missing-tracked-target
apps/nexus/content/docs/guide/features/recommended-plugins.zh.mdc	25	6	link	./plugins/index.zh.md	apps/nexus/content/docs/guide/features/plugins/index.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/index.en.mdc	20	13	link	./start.en.md	apps/nexus/content/docs/guide/start.en.md	missing-tracked-target
apps/nexus/content/docs/guide/index.en.mdc	21	15	link	./features/preview.en.md	apps/nexus/content/docs/guide/features/preview.en.md	missing-tracked-target
apps/nexus/content/docs/guide/index.en.mdc	22	11	link	./features/quickops.en.md	apps/nexus/content/docs/guide/features/quickops.en.md	missing-tracked-target
apps/nexus/content/docs/guide/index.en.mdc	23	11	link	./features/corebox-workflow.en.md	apps/nexus/content/docs/guide/features/corebox-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/guide/index.en.mdc	24	11	link	./features/wallpaper.en.md	apps/nexus/content/docs/guide/features/wallpaper.en.md	missing-tracked-target
apps/nexus/content/docs/guide/index.en.mdc	25	17	link	./features/recommended-plugins.en.md	apps/nexus/content/docs/guide/features/recommended-plugins.en.md	missing-tracked-target
apps/nexus/content/docs/guide/index.en.mdc	26	15	link	./features/plugins/index.en.md	apps/nexus/content/docs/guide/features/plugins/index.en.md	missing-tracked-target
apps/nexus/content/docs/guide/index.zh.mdc	20	7	link	./start.zh.md	apps/nexus/content/docs/guide/start.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/index.zh.mdc	21	7	link	./features/preview.zh.md	apps/nexus/content/docs/guide/features/preview.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/index.zh.mdc	22	7	link	./features/quickops.zh.md	apps/nexus/content/docs/guide/features/quickops.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/index.zh.mdc	23	7	link	./features/corebox-workflow.zh.md	apps/nexus/content/docs/guide/features/corebox-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/index.zh.mdc	24	7	link	./features/wallpaper.zh.md	apps/nexus/content/docs/guide/features/wallpaper.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/index.zh.mdc	25	7	link	./features/recommended-plugins.zh.md	apps/nexus/content/docs/guide/features/recommended-plugins.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/index.zh.mdc	26	7	link	./features/plugins/index.zh.md	apps/nexus/content/docs/guide/features/plugins/index.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/index.zh.mdc	27	12	link	./scenes/developer.zh.md	apps/nexus/content/docs/guide/scenes/developer.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/start.en.mdc	34	28	link	./features/recommended-plugins.en.md	apps/nexus/content/docs/guide/features/recommended-plugins.en.md	missing-tracked-target
apps/nexus/content/docs/guide/start.en.mdc	35	53	link	./features/plugins/index.en.md	apps/nexus/content/docs/guide/features/plugins/index.en.md	missing-tracked-target
apps/nexus/content/docs/guide/start.zh.mdc	34	10	link	./features/recommended-plugins.zh.md	apps/nexus/content/docs/guide/features/recommended-plugins.zh.md	missing-tracked-target
apps/nexus/content/docs/guide/start.zh.mdc	35	19	link	./features/plugins/index.zh.md	apps/nexus/content/docs/guide/features/plugins/index.zh.md	missing-tracked-target
apps/nexus/content/docs/hello.en.mdc	13	75	link	./guide/index.en.md	apps/nexus/content/docs/guide/index.en.md	missing-tracked-target
apps/nexus/content/docs/hello.en.mdc	14	60	link	./guide/start.en.md	apps/nexus/content/docs/guide/start.en.md	missing-tracked-target
apps/nexus/content/docs/hello.en.mdc	15	68	link	./tips/intelligence-workflow.en.md	apps/nexus/content/docs/tips/intelligence-workflow.en.md	missing-tracked-target
apps/nexus/content/docs/hello.en.mdc	16	74	link	./tips/automation.en.md	apps/nexus/content/docs/tips/automation.en.md	missing-tracked-target
apps/nexus/content/docs/hello.en.mdc	17	63	link	./dev/getting-started/overview.en.md	apps/nexus/content/docs/dev/getting-started/overview.en.md	missing-tracked-target
apps/nexus/content/docs/hello.en.mdc	18	60	link	./dev/reference/manifest.en.md	apps/nexus/content/docs/dev/reference/manifest.en.md	missing-tracked-target
apps/nexus/content/docs/hello.zh.mdc	13	33	link	./guide/index.zh.md	apps/nexus/content/docs/guide/index.zh.md	missing-tracked-target
apps/nexus/content/docs/hello.zh.mdc	14	34	link	./guide/start.zh.md	apps/nexus/content/docs/guide/start.zh.md	missing-tracked-target
apps/nexus/content/docs/hello.zh.mdc	15	33	link	./tips/intelligence-workflow.zh.md	apps/nexus/content/docs/tips/intelligence-workflow.zh.md	missing-tracked-target
apps/nexus/content/docs/hello.zh.mdc	16	34	link	./tips/automation.zh.md	apps/nexus/content/docs/tips/automation.zh.md	missing-tracked-target
apps/nexus/content/docs/hello.zh.mdc	17	33	link	./dev/getting-started/overview.zh.md	apps/nexus/content/docs/dev/getting-started/overview.zh.md	missing-tracked-target
apps/nexus/content/docs/hello.zh.mdc	18	38	link	./dev/reference/manifest.zh.md	apps/nexus/content/docs/dev/reference/manifest.zh.md	missing-tracked-target
apps/nexus/content/docs/index.en.mdc	13	5	link	./guide/index.en.md	apps/nexus/content/docs/guide/index.en.md	missing-tracked-target
apps/nexus/content/docs/index.en.mdc	14	5	link	./guide/start.en.md	apps/nexus/content/docs/guide/start.en.md	missing-tracked-target
apps/nexus/content/docs/index.en.mdc	15	5	link	./dev/index.en.md	apps/nexus/content/docs/dev/index.en.md	missing-tracked-target
apps/nexus/content/docs/index.en.mdc	16	5	link	./dev/components/index.en.md	apps/nexus/content/docs/dev/components/index.en.md	missing-tracked-target
apps/nexus/content/docs/index.zh.mdc	13	5	link	./guide/index.zh.md	apps/nexus/content/docs/guide/index.zh.md	missing-tracked-target
apps/nexus/content/docs/index.zh.mdc	14	5	link	./guide/start.zh.md	apps/nexus/content/docs/guide/start.zh.md	missing-tracked-target
apps/nexus/content/docs/index.zh.mdc	15	5	link	./dev/index.zh.md	apps/nexus/content/docs/dev/index.zh.md	missing-tracked-target
apps/nexus/content/docs/index.zh.mdc	16	5	link	./dev/components/index.zh.md	apps/nexus/content/docs/dev/components/index.zh.md	missing-tracked-target
apps/nexus/examples/division-box/README.md	45	3	link	../../docs/DIVISION_BOX_API.md	apps/nexus/docs/DIVISION_BOX_API.md	missing-tracked-target
apps/nexus/examples/division-box/README.md	46	3	link	../../docs/DIVISION_BOX_MANIFEST.md	apps/nexus/docs/DIVISION_BOX_MANIFEST.md	missing-tracked-target
apps/nexus/examples/division-box/README.md	47	3	link	../../docs/DIVISION_BOX_GUIDE.md	apps/nexus/docs/DIVISION_BOX_GUIDE.md	missing-tracked-target
packages/tuffex/CONTRIBUTING.md	380	86	link	CODE_OF_CONDUCT.md	packages/tuffex/CODE_OF_CONDUCT.md	missing-tracked-target
```

<!-- markdownlint-enable MD010 -->

## Repair decisions

- 636 findings referenced an existing canonical `.mdc` file with a stale `.md`
  suffix. Those AST-selected destinations were changed to `.mdc`; ordinary
  text, code blocks, external URLs, and absolute site routes were not rewritten.
- CoreApp's missing update README promise was replaced with maintained download,
  update-acceptance, engineering, and contribution documents.
- The Search README now describes the query Provider and Indexed Source
  boundaries, links only maintained search documents, and records that
  `TUFF_DB_SEARCH_SPLIT_ENABLED` remains default-off pending writer migration
  and flag-on app evidence.
- Missing Nexus `feature-sdk`, plugin publish/migration, and top-level tips
  targets were redirected to their exact maintained API, workflow, release,
  and `guide/tips` pages. No unrelated generic destination was substituted.
- Nexus release indexes now list the tracked `/api/releases/*` route tree and
  link to the bilingual Download SDK, plugin workflow, persistence notes, and
  release-assets checklist.
- DivisionBox navigation now points to the six tracked example files and the
  maintained bilingual API/architecture/Manifest pages.
- TuffEx contribution guidance now uses current root tool versions, package
  scripts, component paths, Nexus docs, and repository contribution templates;
  the nonexistent package-local Code of Conduct promise was removed.
- No placeholder, redirect-only, or empty document was created.

## After verification

- Tracked Markdown/MDC documents: 1055
- In-scope source documents: 584
- Inspected relative links/images: 839
- Skipped external/absolute/fragment/query-only links: 106
- Broken in-scope targets: 0
- Repository-escape targets: 0
- Newly selected relative URLs: 670
- Unique newly selected Git-tracked file targets: 423
- Newly selected directory aliases: 0
- Default `markdownlint-cli` passed for the nine fully rewritten/new core
  documents, including this inventory.
- For 65 mechanically touched legacy documents, a HEAD baseline comparison
  moved from 3153 to 3147 unique file/line/rule diagnostics, with zero added and
  six removed. Existing unrelated MDC parser/style debt was not expanded into
  this repair.
- `git diff --check`, `git diff --cached --check`, and the stacked branch-range
  check passed; excluded sibling/concurrent paths had no diff.

## Batch D handoff

The permanent gate should retain the tracked-source and AST resolution contract
above. It also needs an explicit MDC lint policy: running default Markdown lint
against an entire legacy MDC file reports inherited directive/table diagnostics,
so the gate must define a deterministic baseline or MDC-aware rule set rather
than silently skipping `.mdc` files.

<!-- markdownlint-enable MD013 -->
