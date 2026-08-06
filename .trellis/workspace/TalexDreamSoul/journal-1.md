# Journal - TalexDreamSoul (Part 1)

> AI development session journal
> Started: 2026-07-02

---

## Session 1: Fix CoreBox recommendation logos

**Date**: 2026-07-04
**Task**: Fix CoreBox recommendation logos
**Branch**: `master`

### Summary

Fixed CoreBox recommendation logo normalization so app and plugin icons preserve valid data/file/tfile/local path sources and colors, replaced recommendation badge emoji with icon classes, added focused tests, and documented the icon payload contract.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `eed7430f9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 2: Contain plugin window privilege boundary

**Date**: 2026-07-10
**Task**: Contain plugin window privilege boundary
**Branch**: `master`

### Summary

Hardened plugin-owned Electron windows with fail-closed permissions, local-only content, typed commands, trusted host preload and isolated navigation/resource policies; added focused tests, packaged smoke evidence, and Trellis runtime security contracts.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `bd95a0009` | (see git log) |
| `7db0a9db9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 3: Serialize async search gather updates

**Date**: 2026-07-10
**Task**: Serialize async search gather updates
**Branch**: `master`

### Summary

Serialized async search gather updates, centralized cancellation completion, added regression coverage, and documented the cross-layer contract.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `f40d92698` | (see git log) |
| `efdcbecee` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 4: Close CoreBox AI single-submit dispatch

**Date**: 2026-07-12
**Task**: R9.2 Context execution CoreBox dispatch closure
**Branch**: `master`

### Summary

Closed the remaining packaged AI Ask dispatch race: active feature execution now keeps an immutable activation snapshot, explicit widget actions reach the plugin lifecycle without a `defaultAction`, and custom widget clicks no longer also trigger the feature item.

### Main Changes

- Preserved the canonical activation feature while the live widget result updates.
- Routed explicit `actionId` metadata through the plugin adapter and `touch-intelligence` lifecycle.
- Stopped custom widget DOM clicks at the widget boundary.
- Versioned the official AI plugin as 1.0.3 and recorded the packaged single-submit evidence.

### Testing

- [OK] 70 focused Vitest cases across CoreBox, adapter, and official plugin dispatch.
- [OK] CoreApp node and web typechecks.
- [OK] macOS arm64 packaged Electron returned the controlled response in stateless mode.
- [OK] Controlled Provider observed exactly one `/api/chat` request with `system`, `user` roles for one Send click.

### Status

[OK] **Completed**

### Next Steps

- Audit official plugin installation/update delivery so built-in plugin fixes do not depend on a manually installed evidence profile.

## Session 5: Close R9.2 ContextHygiene P0/P1

**Date**: 2026-07-11
**Task**: R9.2 ContextHygiene P0/P1 closure
**Branch**: `master`

### Summary

Completed the six-task R9.2 P0/P1 tree: host-owned context execution, Memory governance and review, CompressionSnapshot, isolated CoreBox/OmniPanel/Workflow/Assistant entrypoint contracts, CoreBox single-submit dispatch, and tiered evidence with explicit packaged/real-profile limits.

### Main Changes

- Bound Assistant's trusted one-shot context to actual CoreBox item execution and suppressed duplicate programmatic search dispatch.
- Verified Workflow run isolation and OmniPanel/Assistant `new + light` policies through the shared host assembler.
- Synchronized the canonical `touch-intelligence` build into CoreApp's bundled seed and documented the generated-runtime freshness contract.
- Reconciled README, TODO, AI PRDs, R8/R9 execution plan, Quality Baseline, changelog, Trellis acceptance criteria, and the `6/6` task tree.

### Testing

- [OK] Parent CoreApp focused validation: 9 files / 128 tests.
- [OK] Intelligence SDK/facade validation: utils 46 tests, plugin facade 42 tests, typed event builder 2 tests.
- [OK] CoreApp node/web typechecks and focused entrypoint ESLint.
- [OK] Evidence manifest: 5 cases, 4 passed, 1 real-profile open; privacy scan passed.
- [OK] Isolated packaged Electron: CoreBox `new / retrieval` and Assistant `new / light`, one controlled Provider call each.

### Status

[OK] **Completed with declared evidence limits**

### Next Steps

- Productize archived-session summary retrieval and tombstone explain reasons.
- Capture OmniPanel/Workflow packaged and real-profile evidence before upgrading those levels.
- Keep workspace/project memory fail-closed until a separately approved `scopeRef` migration has preflight and rollback evidence.
- Task remains completed but unarchived because this session did not create a work commit.

## Session 6: Productize archived context continuation

**Date**: 2026-07-11
**Task**: Productize archived ContextHygiene continuation
**Branch**: `master`

### Summary

Closed the highest-priority R9.2 follow-up: explicit continue across archived, expired, idle, or missing sessions now creates a fresh session, carries at most one governed summary, and exposes only metadata-only transition status to SDK consumers and the CoreBox widget.

### Main Changes

- Removed duplicate-session-id insertion from inactive continuation boundaries.
- Preferred policy-valid CompressionSnapshot content and fail-closed legacy summary fallback without source raw turns or MemoryItem carryover.
- Added canonical `ContextContinuationSummary` types and tuff-intelligence re-exports.
- Projected sanitized reason/status through `touch-intelligence`, rebuilt the plugin, and synchronized the canonical bundled seed.
- Updated SDK docs, code-spec, TODO, PRDs, execution plan, Quality Baseline, and changelog.

### Testing

- [OK] CoreApp ContextHygiene/execution: 59 tests.
- [OK] Plugin Intelligence facade: 42 tests; utils SDK: 46 tests; official seed delivery: 8 tests.
- [OK] Plugin production build, CoreApp node/web typechecks, focused lint-error checks, and task-slice whitespace check.

### Status

[OK] **Completed with packaged/real-profile evidence open**

### Next Steps

- Productize metadata-only tombstone hits in the Context explain drawer.
- Capture OmniPanel/Workflow packaged and real-profile evidence before upgrading those levels.
- Task remains completed but unarchived because this session did not create a work commit.

## Session 7: Productize tombstone context explain

**Date**: 2026-07-12
**Task**: Productize tombstone ContextHygiene explain
**Branch**: `master`

### Summary

Closed the remaining P1 ContextHygiene explain gap by turning `memory-tombstoned` package metadata into a dedicated, localized, content-free Intelligence Audit state.

### Main Changes

- Added independent tombstone counts and a stable reason-to-i18n-key mapper.
- Displayed localized deletion-before-invoke status in both inline package summaries and the explain drawer.
- Kept excluded records metadata-only and preserved unknown reasons as safe machine strings.
- Updated code-spec, TODO, PRDs, execution plan, Quality Baseline, and changelog.

### Testing

- [OK] Focused summarizer suite: 9 tests.
- [OK] CoreApp web typecheck, catalog JSON parse, focused lint-error check, and task-slice whitespace check.

### Status

[OK] **Completed with packaged/real-profile evidence open**

### Next Steps

- Capture OmniPanel/Workflow packaged and real-profile evidence before upgrading those levels.
- Keep workspace/project memory fail-closed until a separately approved `scopeRef` migration.
- Task remains completed but unarchived because this session did not create a work commit.

## Session 8: Harden packaged Workflow dispatch and persistence

**Date**: 2026-07-12

### Task

- Fix packaged Workflow execution failing first on Electron structured clone and then on cloned built-in step primary-key collisions.

### Main Changes

- Copied reactive `toolSources` into a plain outbound array at the typed SDK boundary.
- Generated workflow-scoped step IDs for new/built-in-derived definitions and remapped model `previousStep` references.
- Added structured-clone and scoped-step/reference regression coverage.
- Clarified roadmap/evidence docs: generic packaged runtime is now proven; owner/scope context evidence remains open.

### Testing

- [OK] Focused workflow editor suite: 12 tests.
- [OK] CoreApp web typecheck and focused ESLint.
- [OK] Production renderer/main bundle and isolated macOS arm64 package; afterPack verified both official plugin seeds.
- [OK] Fresh-profile packaged built-in workflow persisted and reached terminal explicit provider-unavailable state without clone or step-insert errors.

### Status

[OK] **Completed with Provider success and Workflow owner/scope context evidence open**

### Next Steps

- Capture Workflow owner/scope/run-isolation packaged metadata before upgrading R9-E context evidence.
- Capture OmniPanel packaged context execution separately; do not reuse this generic Workflow runtime smoke.
- Task remains completed but unarchived because this session did not create a work commit.

## Session 9: Progressive CoreBox index search

**Date**: 2026-07-15
**Task**: Progressive CoreBox index search
**Branch**: `master`

### Summary

Removed transient CoreBox indexing/search hints and added post-commit App/File index refresh with bounded coalescing, selection preservation, and lifecycle cleanup.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `d85bb7ea6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 10: Harden Dependabot and CI reliability

**Date**: 2026-07-15
**Task**: Harden Dependabot and CI reliability
**Branch**: `master`

### Summary

Unified workflow Node and PNPM sources, repaired fresh-runner Intelligence setup, fixed lockfile policy, simplified weekly Dependabot updates, and enforced read-only package CI permissions; all focused gates passed.

### Main Changes

(Add details)

### Git Commits

| Hash                                       | Message       |
| ------------------------------------------ | ------------- |
| `4922b47984865e5f4b134c7ce36a82f3266b485a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 11: Verify CoreBox app indexing and clipboard lifecycle

**Date**: 2026-07-15
**Task**: Verify CoreBox app indexing and clipboard lifecycle
**Branch**: `master`

### Summary

Live-tested app discovery, indexing, search, launch, AutoPaste, and AutoClear in an isolated Electron profile; fixed shortcut/show event ordering so fresh clipboard text auto-fills before the CoreBox visibility lifecycle consumes the trigger.

### Main Changes

(Add details)

### Git Commits

| Hash                                       | Message       |
| ------------------------------------------ | ------------- |
| `bfa18626b04fec62d4bceacfb076498217ff3f5b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 12: 修复官方插件发布链并完成 Beta.14 验证

**Date**: 2026-07-16
**Task**: 修复官方插件发布链并完成 Beta.14 验证
**Branch**: `master`

### Summary

修复 clean-checkout 官方插件前置构建、Windows Node 24 pnpm 调用、Builder 依赖与缓存、Linux AppImage 命名、Beta 版本一致性、Nexus 首选资产及 macOS arm64 资产身份；Beta.14 三平台构建、GitHub Release 与 Nexus 发布全部验证通过。

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `ef039c893` | (see git log) |
| `282dd6fc7` | (see git log) |
| `dc5cd7ce9` | (see git log) |
| `40d3bc809` | (see git log) |
| `20325f87f` | (see git log) |
| `41410f9ee` | (see git log) |
| `270e8f0c6` | (see git log) |
| `a8a0bf335` | (see git log) |
| `ec87f4f14` | (see git log) |
| `5338970d4` | (see git log) |
| `02243e353` | (see git log) |
| `2eedfd58f` | (see git log) |
| `07770e4a9` | (see git log) |
| `7fb58530a` | (see git log) |
| `4d32b8615` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 13: Stabilization P0 closure and unified file filtering

**Date**: 2026-07-16
**Task**: Stabilization P0 closure and unified file filtering
**Branch**: `master`

### Summary

Committed usage-stat single-writer repair, atomic Nexus batch ingest, stabilization documentation convergence, and a shared cross-platform file filtering policy enforced at scan, index-write, provider, aggregation, cache, recommendation, and semantic-recall boundaries; verified focused tests, lint, CoreApp Node typecheck, and representative path smoke, then archived the completed filtering task.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `7d2a24714` | (see git log) |
| `1d26362dd` | (see git log) |
| `c180cdc0d` | (see git log) |
| `f03cc7c3f` | (see git log) |
| `3fcd39163` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 14: Search core test fixture repair

**Date**: 2026-07-16
**Task**: Search core test fixture repair
**Branch**: `master`

### Summary

Updated three SearchEngineCore regression fixtures to use IndexedSourceEventRouter lifecycle and complete Electron, storage, event-bus, logger, polling, and Mica mocks; all three suites pass independently and together, with CoreApp Node typecheck, changed-file lint, and diff checks passing.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `69ed465c3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 15: Downloaded release acceptance flow

**Date**: 2026-07-16
**Task**: Downloaded release acceptance flow
**Branch**: `master`

### Summary

Ran the standardized v2.4.13-beta.14 release acceptance flow against GitHub and Nexus, downloaded and hash-verified the real macOS arm64 asset through both sources, inspected bundle trust, and passed the isolated packaged Settings/indexing probe. Release status is fail because manifest signatures/canonical matrix, Nexus signature endpoints/key, and native macOS signing are not release-ready; Gatekeeper assessment was blocked by host security-assessment override. Added the durable 发版测试 contract and sanitized evidence.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `45462a71b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 16: Harden release signing and official build verification

**Date**: 2026-07-17
**Task**: Harden release signing and official build verification
**Branch**: `master`

### Summary

Rotated the RSA-4096 release key, added signed app build attestations, synchronized CoreApp and Nexus trust roots, blocked trust-root drift, and verified the packaged app plus Nexus Worker fallback.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `723b1bdd4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 17: Merge PR #287 into master

**Date**: 2026-07-18
**Task**: Merge PR #287 into master
**Branch**: `master`

### Summary

Merged LP-03 Context Actions and Windows Everything productionization into master; resolved OmniPanel/TODO-R3 conflicts, corrected main-to-renderer notification direction, and verified focused tests, lint, typecheck, build, and isolated CoreBox toast behavior.

### Main Changes

(Add details)

### Git Commits

| Hash                                       | Message       |
| ------------------------------------------ | ------------- |
| `726c53d00011329e2ba0b724e979cbdc6a12e35e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 18: Consolidate remaining master work

**Date**: 2026-07-18
**Task**: Consolidate remaining master work
**Branch**: `master`

### Summary

Committed verified CoreBox toast gating, completed and validated nine plugin TuffEx supply-chain planning tasks, and fixed the file-index parent-row race with unified SQLite retry, preserved worker error causes, throttled retry logs, focused regressions, lint, typecheck, and production build.

### Main Changes

(Add details)

### Git Commits

| Hash                                       | Message       |
| ------------------------------------------ | ------------- |
| `79f04faece31d64cd632d4918330e96a1de785fc` | (see git log) |
| `03858db71dd2d71e1279189fda2f1e907a9d8944` | (see git log) |
| `ad20e747c4fae731d91b8ce5ea491ff86e5f642e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 19: Harden CoreBox transport and WindowManager

**Date**: 2026-07-18
**Task**: Harden CoreBox transport and WindowManager
**Branch**: `TalexDreamSoul/master`

### Summary

Aligned CoreBox typed transport contracts, split WindowManager into focused controllers, fixed the Sentry singleton initialization cycle, and verified the Electron runtime path.

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `80ab3e68d` | (see git log) |
| `2ec45efa2` | (see git log) |
| `8e2bdc559` | (see git log) |
| `3a7c15ef1` | (see git log) |

### Testing

- [OK] Focused CoreBox tests, typecheck, lint, and Electron runtime verification.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 20: Integrate Pi AI orchestrator and CLI imports

**Date**: 2026-07-18
**Task**: Integrate Pi AI orchestrator and CLI imports
**Branch**: `TalexDreamSoul/master`

### Summary

Added durable AI orchestration contracts and storage, governed automation and multi-CLI imports, completed the Pi runtime cutover, exposed the renderer/plugin experience, and verified Ollama 3B, tests, typechecks, lint, package builds, and Electron production bundling.

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `3ae037fe6` | (see git log) |
| `66b22612a` | (see git log) |
| `c5e137930` | (see git log) |
| `5427d65fa` | (see git log) |
| `0fae854ef` | (see git log) |
| `508da272d` | (see git log) |

### Testing

- [OK] 128 focused AI tests, node/web typecheck, lint, package builds, utility-process smoke, and isolated Electron UI verification.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 21: Integrate AI CLI Orchestrator

**Date**: 2026-07-18
**Task**: Integrate AI CLI Orchestrator
**Branch**: `master`

### Summary

Resolved master conflicts, preserved Pi-only orchestration and CoreBox/plugin security boundaries, verified typechecks, focused and full regressions plus Electron build, then fast-forwarded master.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `5c28b32bb` | (see git log) |
| `0357f3a3f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 22: Close single search-index writer acceptance

**Date**: 2026-07-18
**Task**: Close single search-index writer acceptance
**Branch**: `master`

### Summary

Closed the single-writer task with real-profile query-only/copy evidence, correlated migration verification, and a passing isolated packaged scan. Fixed provider-scoped preflight parity, moved the remaining shared keyword-index DDL into the writer, preserved scan reason/trigger diagnostics, and accepted already-migrated scan_progress no-op evidence.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `5f2f4ab99` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 23: Plugin Security Scan

**Date**: 2026-07-18
**Task**: Plugin Security Scan
**Branch**: `master`

### Summary

Implemented deterministic TPEX security scanning across shared rules, CLI artifact preflight and Nexus admission with persisted summaries, governance events and server-owned waivers; 24 focused assertions, type/build/lint/plugin validation and two real TPEX smoke scans passed.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `9d2a4e5e1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 24: 发布 Tuff 2.4.13-beta.16

**Date**: 2026-07-19
**Task**: 发布 Tuff 2.4.13-beta.16
**Branch**: `master`

### Summary

完成插件供应链收敛后的 beta.16 多平台发布；修复 macOS 空签名环境与 Nexus rollbackCompatible=false 同步，验证 GitHub Release、签名证据、下载路由和 Pages 生产部署。

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `340a65fae` | (see git log) |
| `6a1c8cd20` | (see git log) |
| `ba74b5fbb` | (see git log) |
| `a80716005` | (see git log) |
| `7c4dc8c44` | (see git log) |
| `1bf13dce1` | (see git log) |
| `844a58a18` | (see git log) |
| `44544d09a` | (see git log) |
| `62873ee7e` | (see git log) |
| `c2f375511` | (see git log) |
| `f651fd7aa` | (see git log) |
| `dab91a636` | (see git log) |
| `5c2b28181` | (see git log) |
| `d1696b52e` | (see git log) |
| `80470e9b0` | (see git log) |
| `ae41f2ae3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 25: 修复搜索流 MessagePort 交付

**Date**: 2026-07-20
**Task**: 修复搜索流 MessagePort 交付
**Branch**: `master`

### Summary

通过 preload window.postMessage transfer list 向 CoreApp 与 trusted plugin renderer 交付真实 MessagePort，保留 channel fallback；补充回归覆盖、sandbox preload 独立打包与真实 Electron 搜索验收。

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `478a8871c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 26: 统一运行时错误上报与 SQLite 重建可靠性

**Date**: 2026-07-21
**Task**: 统一运行时错误上报与 SQLite 重建可靠性
**Branch**: `master`

### Summary

建立 OperationalErrorService 与安全 transport/UI 契约，统一 SQLite retry/health 与 App Provider 写入治理，并通过隔离 Electron BEGIN IMMEDIATE 故障及释放锁恢复验收。

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `b6c7d8886` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 27: Enable macOS signing and notarization

**Date**: 2026-07-21
**Task**: Enable macOS signing and notarization
**Branch**: `master`

### Summary

Configured Developer ID and App Store Connect notarization for local and CI builds, retired CI waiver mode, fixed packaged workspace symlinks, and verified a notarized beta artifact.

### Main Changes

(Add details)

### Git Commits

| Hash                                       | Message       |
| ------------------------------------------ | ------------- |
| `ebf6330c19156da6e9d815fc0e116513f9e2bd1c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 28: Publish reverse proxy trust-boundary design

**Date**: 2026-07-22
**Task**: Publish reverse proxy trust-boundary design
**Branch**: `master`

### Summary

Added and verified the standalone Astro trust-boundary design site; removed generated Astro type artifacts from version control.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `a413da30c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 29: 修复 Nexus 文档侧边栏空白与 Hero 中文断行

**Date**: 2026-07-27
**Task**: 修复 Nexus 文档侧边栏空白与 Hero 中文断行
**Branch**: `master`

### Summary

侧边栏空白的根因是 better-sqlite3 原生模块从未编译（Node v24 ABI，build/ 目录缺失），所有 Nuxt Content 查询 500；navigation 端点在 dev 下把错误吞成 [] 并被 defineCachedEventHandler 缓存 300s/stale 3600s，故障恢复后侧边栏仍空一小时。pnpm rebuild -r better-sqlite3 修复环境后，把四个 docs 端点的缓存策略收敛到 server/utils/docsContentCache.ts：缓存改放在成功路径内侧（defineCachedFunction 抛错即不写入），内容库不可用返回 503 而非成功的空载荷，空结果分级（集合级永不缓存 / 单页 404 仍可缓存，除非共享降级窗口打开），并新增 dev 首请求健康探针。Hero 标题用 word-break: keep-all + accent white-space: nowrap 阻止 CJK 词中断行。

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `a7a6daad8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 30: 分批提交并推送工作区代码

**Date**: 2026-07-28
**Task**: 分批提交并推送工作区代码
**Branch**: `master`

### Summary

将 workspace、CoreApp 安全与插件目录、#297 隔离 capability、Nexus 界面和 Trellis 证据拆为九笔提交；focused tests、typecheck、build、Electron smoke 和插件校验通过，并普通推送 master。

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `ad8c54944` | (see git log) |
| `6bee9f5f3` | (see git log) |
| `d0caa9073` | (see git log) |
| `3030bcee5` | (see git log) |
| `b584ef96b` | (see git log) |
| `1a118b73e` | (see git log) |
| `e8cb3d393` | (see git log) |
| `0474cdb5a` | (see git log) |
| `21484fd3f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 31: Contain isolated Intelligence invoke cancellation

**Date**: 2026-07-28
**Task**: Contain isolated Intelligence invoke cancellation
**Branch**: `master`

### Summary

Added host-only immediate cancellation containment for Intelligence chat/OCR invokes, stable redaction and commit-point semantics; focused and strict tests passed and independent review found no P0/P1/P2. Task #297 remains active for production Intelligence/Translation migration and final hard cut.

### Main Changes

- Added host-only cancellation containment for isolated Intelligence chat/OCR calls.
- Preserved stable redaction and explicit success commit-point behavior.

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `f1cdd7772` | (see git log) |

### Testing

- [OK] Focused cancellation and Intelligence SDK regressions passed.
- [OK] Independent review found no P0/P1/P2 findings in the scoped change.

### Status

[OK] **Completed**

### Next Steps

- Continue task #297 with production Intelligence/Translation migration and the final hard cut.

## Session 32: Repair peripheral product documentation

**Date**: 2026-07-28
**Task**: Repair peripheral product documentation
**Branch**: `TalexDreamSoul/peripheral-docs-cleanup`

### Summary

Repaired 663 tracked relative-link failures to zero, refreshed CoreApp/Search/Nexus/DivisionBox/TuffEx guidance, added reproducible AST inventory evidence, opened stacked PR #356, and synchronized the advanced planning base without rebase or force push.

### Main Changes

- Repaired 663 broken product-documentation relative links across CoreApp, Search, Download, bilingual Nexus API/component/guide/release navigation, DivisionBox, and TuffEx; stale `.md` destinations now resolve to their tracked canonical `.mdc` files or exact maintained documentation.
- Added the reviewed AST inventory and reproducible audit helper, refreshed the owned product guidance, and removed no unrelated content, placeholders, redirect-only, or empty documents.

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `05aa394a3` | (see git log) |

### Testing

- [OK] AST audit: 1121 tracked Markdown/MDC documents, 586 in-scope sources, 841 inspected relative links/images, and 0 broken or repository-escape findings.
- [OK] Repair selection: 674 newly selected URLs resolve to 427 unique tracked files; no directory aliases were selected.
- [OK] Default `markdownlint-cli` passed on the nine rewritten/new core documents; baseline-aware legacy diagnostics changed from 3171 to 3165 (added=0, removed=6).
- [OK] `git diff --check`, `git diff --cached --check`, stacked branch-range, and ownership/excluded-path checks passed.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 33: Complete Prelude utility-process isolation

**Date**: 2026-07-29
**Task**: Complete Prelude utility-process isolation
**Branch**: `master`

### Summary

Completed and pushed the #297 production hard cut: all 22 official manifested Preludes run in activation-scoped utility processes with typed capabilities, default-on rollout, heartbeat and restart-budget containment, no legacy fallback, 1104 passing plugin tests, production build and Electron smoke evidence; archived #297 and cleaned 15 stale completed task entries from the active task list.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `1bcbca825` | (see git log) |
| `a0a2091a5` | (see git log) |
| `997b246f5` | (see git log) |
| `24be46329` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 34: CoreBox 与 Nexus 端到端调试及 Issue 发布

**Date**: 2026-07-29
**Task**: CoreBox 与 Nexus 端到端调试及 Issue 发布
**Branch**: `master`

### Summary

完成 CoreBox/Nexus 全链路调试与去重，发布并验证 #477、#478、#479；复用 #323/#324/#327/#329/#332，未修改产品源码。

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 35: Close sensitive data lifecycle and issue baseline

**Date**: 2026-07-30
**Task**: Close sensitive data lifecycle and issue baseline
**Branch**: `master`

### Summary

Implemented and independently reviewed #301 sensitive-data lifecycle, closed and archived #301, reconciled stale security child tasks, closed #302 with evidence, and preserved #213 as an externally blocked diagnostic issue.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `5bf6e08b4` | (see git log) |
| `70c65575f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 36: Close Preview Secret Configuration #475

**Date**: 2026-07-30
**Task**: Close Preview Secret Configuration #475
**Branch**: `master`

### Summary

Removed deployable Preview credential placeholders, added name-only Cloudflare Secret inventory and double preflight deployment guard, enforced platform-binding runtime credentials, migrated four Preview Secrets, deployed branch preview, completed remote auth/emergency smoke, and captured the Nexus deployment contract.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `b8261e06b` | (see git log) |
| `aba777981` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 37: Ship versioned native screenshot workflow

**Date**: 2026-07-30
**Task**: Ship versioned native screenshot workflow
**Branch**: `master`

### Summary

Implemented the protocol-only Rust native transport and ScreenCaptureKit/xcap screenshot core, delivered same-overlay screenshot editing with managed-resource boundaries and unified entrypoints, and verified focused suites, strict macOS integration, production addon loading, real save output, and the isolated demo video.

### Main Changes

(Add details)

### Git Commits

| Hash        | Message       |
| ----------- | ------------- |
| `f184d0966` | (see git log) |
| `5c3e0710e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 38: 修复文件索引更新与错误脱敏 #476

**Date**: 2026-07-30
**Task**: 修复文件索引更新与错误脱敏 #476
**Branch**: `master`

### Summary

将文件 metadata 更新路由到 SearchIndex worker 单写者，新增整批输入校验与真实双连接 libSQL 锁回归；公共 transport/dashboard/renderer/Sentry/Nexus 投影改为 exact allowlist，阻断 SQL、params、绝对路径和 stack/cause 外泄。独立 review 的两个 P1 已修复。验证通过：CoreApp focused 140/140、Utils 979/979、node/web typecheck、CoreApp production build、scoped lint/format 与 git diff --check。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `554435f33` | (see git log) |
| `baf3bf3d2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 39: 同步分支并整理设置与更新代码

**Date**: 2026-07-31
**Task**: 同步分支并整理设置与更新代码
**Branch**: `master`

### Summary

同步 origin/master，审计 4 个 stash 与 detached worktree；提交设置页高级层级和默认值优化，移除版本历史并补强渠道行为测试；质量门通过后非强制推送并归档 3 个任务。

### Main Changes

- Fast-forward 同步并再次 fetch `origin/master`，确认本轮前后无远端分叉。
- 审计本地分支、4 个 stash、两个 detached worktree 和远端辅助分支；确认无 stash 恢复候选。
- 提交设置页高级设置分层、默认值归一化、首次引导静默保护、macOS 标签和 12px 区块间距。
- 移除版本历史浏览、远端历史请求与缓存，保留一次性更新摘要，并补强更新渠道行为测试。
- 完成非强制 GitHub 推送与 3 个 Trellis 任务归档。

### Git Commits

| Hash | Message |
|------|---------|
| `0efd10533` | `feat(settings): streamline advanced configuration` |
| `80c44ade4` | `ref(update): remove version history browser` |
| `a3a5bd26f` | `chore(repo): record consolidation audit` |

### Testing

- [OK] 设置任务 focused tests：10 个文件、85 条用例
- [OK] 更新任务 tests：25 个文件、192 条用例
- [OK] `pnpm quality:pr`，targeted tests 107/107
- [OK] CoreApp node/web typecheck、无缓存 scoped ESLint、locale JSON parse
- [OK] `git diff --check` 与推送后 `master...origin/master = 0/0`

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 40: Release v2.4.14-beta.1

**Date**: 2026-07-31
**Task**: Release v2.4.14-beta.1
**Branch**: `master`

### Summary

Published the v2.4.14-beta.1 desktop prerelease, repaired release recovery and dependency setup, restored Cloudflare production runtime credentials, synchronized Nexus metadata, and verified desktop, web, docs, and release API delivery.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `945a3a363` | (see git log) |
| `6970d12cd` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 41: Fix Nexus local Cloudflare runtime credentials

**Date**: 2026-08-02
**Task**: Fix Nexus local Cloudflare runtime credentials
**Branch**: `master`

### Summary

Restored explicit local Nitro Cloudflare credential bindings without weakening remote Preview fail-closed validation; added regression tests and updated the Preview secret deployment spec.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2d68261b0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 42: Add TxResizeBox component and Nexus docs

**Date**: 2026-08-02
**Task**: Add TxResizeBox component and Nexus docs
**Branch**: `master`

### Summary

Added the TxResizeBox TuffEx primitive with lifecycle race coverage, published bilingual Nexus documentation and an interactive responsive demo, and registered the component across sidebar, demo loader, and on-demand global loading.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `74b7ee33b` | (see git log) |
| `b5a0a27b9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 43: Publish v2.4.14-beta.2 GitHub Release

**Date**: 2026-08-02
**Task**: Publish v2.4.14-beta.2 GitHub Release
**Branch**: `master`

### Summary

Prepared bilingual release notes and version metadata, published annotated tag v2.4.14-beta.2, verified the successful three-platform GitHub Actions release, validated signed manifest assets and macOS native trust, confirmed Nexus BETA publication, and archived the release task.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `154508d50` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 44: 修正 CoreApp 快捷键作用域

**Date**: 2026-08-02
**Task**: 修正 CoreApp 快捷键作用域
**Branch**: `master`

### Summary

移除 AI Quick Call 与 Flow 的系统全局快捷键，保留 CoreBox 页面/插件视图上下文操作；迁移退休快捷键记录，并加固主进程 sender、权限、视图缓存所有权和 DivisionBox 失败回滚。相关测试、类型检查、lint 与文档验证通过，独立终审 APPROVE。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `d8549845f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 45: 推送 CoreApp 快捷键作用域修复

**Date**: 2026-08-02
**Task**: 推送 CoreApp 快捷键作用域修复
**Branch**: `master`

### Summary

核对 master 仅领先 origin/master 三笔预期提交，使用普通非强制推送同步 CoreApp 快捷键作用域实现、任务归档与 Session 44；远端和本地 SHA 一致，ahead/behind 为 0/0。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `d8549845f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 46: CoreBox packaged runtime performance closure

**Date**: 2026-08-04
**Task**: CoreBox packaged runtime performance closure
**Branch**: `master`

### Summary

Closed packaged search runtime, bounded optional renderer, database and macOS watcher lifecycles, validated packaged search and resource behavior, and published the performance report.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `15a47a91c` | (see git log) |
| `92f7eeb0b` | (see git log) |
| `0619fe42e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## 2026-08-05 · 08-04-db-single-writer-root-fix · Phases 1–4 landed

- 根因四层(research/root-cause-analysis.md):R1 双写连接(split flag 默认关)、R2 全局队列内重试睡眠(~20 处)、R3 aux 回落/compat 双写、R4 启动写风暴。
- Phase 1 调度器原生 busy 重试(延迟重排队,退避不占队头)→ commit 90aa26b17;Phase 2 调用点收敛 scheduleDbWrite/scheduleAuxWrite(enqueue 时解析 aux,修掉 stale-capture 类缺陷)→ commit 3c62566fb。注意:这两个提交由并发 Pi 批量提交会话(pi-rewind 019fd0a9…)从共享工作树创建,内容逐项核验正确;规划工件被扫进 49e4f454b。
- Phase 3 按库分车道(primary/aux 各自队列+忙退避计时器;WAL gating 读主车道;聚合 stats 形状不变+lanes 明细)→ commit 052d1d506(本会话)。
- Phase 4 启动期维护写门控(telemetry retention 窗口内跳过且不报 PARTIAL;backfill/UsageSummary 延后;manual-delete 永不门控)→ commit 08b64b650(本会话)。
- 测试:db/database/privacy/sentry/app-provider/usage-summary 全绿;box-tool/ai 既有 23 失败归因于 privacy #301 测试 mock 缺 PRIVACY_DATA_CATEGORIES 与 shell-chrome 拉入 temp-file 单例(证据:db 提交 diff 零新增相关 import 边),非本任务范围。
- 待办:V1 验证跑(TUFF_DB_SEARCH_SPLIT_ENABLED=1,被用户 dev 实例单实例锁阻塞)→ Phase 5 翻默认 → V2 全默认验证 → Phase 6 compat 双写退役 → spec 固化(单文件单写者 / 队列不睡眠)。


## Session 47: 设置页 IA 重构：拆页、选项收敛与死开关清理

**Date**: 2026-08-05
**Task**: 设置页 IA 重构：拆页、选项收敛与死开关清理
**Branch**: `TalexDreamSoul/app-shell-v2`

### Summary

把「网络与更新」拆成 更新/网络/下载 三个分类，存储从中转页改为直呈内容，解散 advanced 并新增 file-index，11 个分类页统一 SettingsPage 外壳。选项集按设计稿收敛：更新页合并安装方式、删 8 字段诊断网格与重复信任块；网络页把代理五项收进模态、阈值+冷却合并为一个开关；下载页删五个引擎参数、新增下载位置与完成后通知。清掉多处硬编码 false 的死开关——SettingUpdate 的 showAdvancedSettings、SettingSetup 的 showPermissionRecovery（整个权限区从不渲染，而 main 侧 platform-permission-service 一直在响应）、Renderer Override 改为 env 条件渲染。接线三处此前无消费者的配置：historyRetention（cleanupExpiredData 已实现却从无调用者）、NotificationConfig 的 downloadComplete 与 updateAvailable。Auto Context 从 composer 本地 ref 落到 appSetting，与设置页共用一个键。20/22 验收达成，未达成两条已在 prd 标注原因。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `ea78b1fa8` | (see git log) |
| `3d7aeca04` | (see git log) |
| `b977006ea` | (see git log) |
| `7624798d5` | (see git log) |
| `c1b82bf3d` | (see git log) |
| `eb7133ba9` | (see git log) |
| `3cec262c8` | (see git log) |
| `3afd2df39` | (see git log) |
| `eaec11f87` | (see git log) |
| `d2068e611` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## 2026-08-05 · db-single-writer-root-fix · V1 验证闭环(三轮)

- V1 抓出 3 个 ship-blocker:①新 search 库缺带外 schema 修补(provider_id / scan_progress 形态)+ worker init 拒绝逃逸;②embedding 写脑裂 + 句柄泄漏 + 索引齐平(审计);③「首启重建」无触发器——实为双向镜像脑裂(app 目录读空 search 家/写主库;文件扫描调度读主库旧 scan_progress)。均已修复并提交(schema-complete/fail-safe 提交 + unify-index-homes/bootstrap 提交)。
- 第三轮 0.2/0.3 全过:4678 条目重建入 search 文件、二次启动跳过、全程零 BUSY。
- 默认开关暂不翻:2d.3 增量写路径(parked 07-28 任务 migrate-search-index-split-write-paths)未迁移,watch 修改存在跨库 id 碰撞风险;另 scan_progress 持久化存疑、Phase4 backfill 门控需复核。flag-off 拓扑下 Phase1-4 已实测消除全部用户症状(31 分钟零 BUSY 对照)。

## 2026-08-05 · tuffex-ai-suite · ①②落地(stream-markdown + conversation-stream)

- 立项父任务 08-05-tuffex-ai-suite + 四子任务(①流式MD ②会话流 ③附件工具卡 ④主界面融合);①②过审后同会话串行实施并提交(24abbaa33 / 4e4d46b2d / d235fee3d),③④仅 PRD。
- ①TxStreamMarkdown:比较驱动块级增量(全量重lex+raw前缀比对,不做"已闭合"假设,setext/引用链接改写自然正确);shiki v4(root包+JS引擎,免wasm)、mermaid 走 catalog ^11.16.0,双双动态 import,dist 实证 entry 零静态引用;顺带移除零引用的 ai-elements-vue。37 单测。
- ②TxConversationStream:live zone 恒为末条(免虚拟↔实挂搬家抖动)、位置缓存按 key(prepend 平移不失效)、原生滚动+IO sentinel+手动锚定(better-scroll 方案否决);loader 签名修订为 () => Promise<{hasMore}>(数据完全受控,消费方自行 unshift)。23 单测。
- 两个硬坑:①Vue 缺省 Boolean prop 铸 false 吃掉 hasMoreInitial 的 ??回退(withDefaults 显式 undefined 解);②vue-tsc 泛型 SFC expose 面是解包后类型(atBottom 是 boolean 不是 Ref),drift 契约双向失败抓出,且整体结构比较对实例化顺序敏感——契约里先断言 keyof 再比整体。已写 memory。
- 全量门:tuffex 985 测试/typecheck/lint/build 全绿。①② 的【review 门】真机手测(mermaid 观感、触控板惯性滚动)留到④集成时一并验。


## Session 48: 下载空闲超时、死开关甄别与深色对比度核对

**Date**: 2026-08-05
**Task**: 下载空闲超时、死开关甄别与深色对比度核对
**Branch**: `TalexDreamSoul/app-shell-v2`

### Summary

修掉下载超时语义：network.timeout 经 AbortSignal.timeout 挂在 fetch 上，对流式响应会连同 body 一起中止，30 秒设置等于杀死所有超过 30 秒的下载。requestStream 本就优先用调用方 signal，故在 download-worker 侧传一个每收 chunk 就重置的空闲计时器，不改 network-service。死开关甄别：上一轮在 SettingUpdate/SettingSetup 挖出的硬编码 false 是真问题，但 SettingTools 的同类门控不是——它有两个用例明确钉住边界，且删改设置属于 08-04-batch-settings-razor 的决定，误解除后已用 git show HEAD 单文件还原，只保留 recommendation.maxItems/showReason 两个零消费者控件的删除。深色态：本次改过的 11 个文件零硬编码颜色；但 --shell-on-primary 未在 .dark 重定义，白字在深色 primary #4e9ae6 上仅 2.96:1（浅色 4.09:1），两者均低于 WCAG AA，因与设计稿一致且属品牌色决定，未擅自修改，待拍板。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `5f3edaabb` | (see git log) |
| `c5fbf1485` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## 2026-08-05 · tuffex-ai-attachments-toolcards · ③落地(分部模型+附件+工具卡)

- parts 模型纯可选增量(`AiElementMessage.parts?`,text/reasoning/tool-call/attachment 四类),旧 content 消费方零改动;TxAiConversation 过滤器补"parts-only 空 content 不滤掉"。
- 新组件×3:TxAttachmentTray(缩略+进度环+TxModal 预览)、TxToolCallCard(四态+`result` Widget 展面槽+320px 内滚约束,零 arrow-js import)、TxReasoningDisclosure(shimmer 思考态+时长完结态);折叠动画统一 grid-rows 0fr↔1fr 免测高。
- TxChatComposer 原地扩展:paste/drop → `attachmentAdd(File[])`、dragenter/leave 计数器防高亮抖动、**补上缺失的 IME isComposing 守卫**(HomePage 手写版有、组件版一直没有)。
- 坑:barrel 对同名类型双源 `export *` 会静默歧义化——tool-call-card 不 re-export `AiToolCallPart`。
- 全量门:1016 测试/typecheck/lint/build 全绿;动画手感 review 门并入④集成验。提交 87e67d03c / 7b4e4d6fa。


## Session 49: Database single-writer root fix: land search split, de-amplify write queue

**Date**: 2026-08-05
**Task**: Database single-writer root fix: land search split, de-amplify write queue
**Branch**: `TalexDreamSoul/app-shell-v2`

### Summary

Root-caused the recurring SQLITE_BUSY/DATABASE_BUSY_RETRY_EXHAUSTED chain to four interlocking mechanisms (dual writers on database.db behind the dark #295 split flag; ~20 call sites sleeping busy-backoff inside the global write queue; aux fallback/stale-capture + compat dual-writes; boot write storms). Landed scheduler-native delayed-re-enqueue retry, converged all call sites onto scheduleDbWrite/scheduleAuxWrite with live home resolution, split the queue into per-file lanes, gated boot maintenance writers. Three app-run validation rounds caught and fixed three ship-blockers in the parked split (schema parity fixups, read/write home split-brains incl. embeddings, missing bootstrap reindex) plus the 2d.3 write-path migration; V2 ran zero BUSY/FK, DB_SEARCH_SPLIT_ENABLED default flipped ON. Compat dual-writes retired; contracts captured in .trellis/spec/main-process/database-write-contracts.md.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `90aa26b17` | (see git log) |
| `3c62566fb` | (see git log) |
| `052d1d506` | (see git log) |
| `08b64b650` | (see git log) |
| `95d7fb3c3` | (see git log) |
| `d12af493e` | (see git log) |
| `571af84ed` | (see git log) |
| `cd39bdbf6` | (see git log) |
| `c2350bc6c` | (see git log) |
| `ab904670a` | (see git log) |
| `e91a4b085` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## 2026-08-05 · home-chat-tuffex-ai-fusion · ④落地(首页接入 tuffex ai 全栈)

- 基线是 08-04 未提交的 R2(整会话粒度 transport)——设计随之定型:无 loadOlder(打开即全量+虚拟化兜底)、TxAiMessage 不上首页(卡片语言与 shell v2 平铺冲突,item 插槽承载原版式)、composer 不换件(保焦点/IME,paste/drop 本地实现)。
- 交接表:手写 stick-to-bottom 全删移交 TxConversationStream;composer 测高改喂 scroller padding+浮钮偏移;keep-alive 切会话后显式 scrollToBottom(整体替换不触发 prepend 锚定)。
- 附件内存态:ConversationMessage.attachments 挂 user 消息,provider payload 与持久化由构造双双不含;objectURL 卸载统一 revoke;降级提示行 i18n 四 key。
- 两个大坑:①包目录内 pnpm add 会剪掉 lockfile 的具名 catalogs 段(①时已提交出去的回归,本轮根目录全量 install 修复),且残留 vite@terser 孤儿实例破坏 typecheck:node——已写进 memory;②lang json 用 json.dump 往返引入全文件格式噪声,用 HEAD 紧凑形态逐点收敛,顺带去掉 home 对象的重复键。
- 纠缠文件(HomePage/useHomeConversation/lang)如实并入一个双任务提交(fe581a6be),pi-cli 层(cf8b4ac5c)与 lockfile 修复(5ba253976)独立成提交。
- 全量门:tuffex 1016 + core-app conversation 31 + typecheck node/web + lint 全绿。唯一留白:core:dev 目验 review 门(①②③④合并清单)交用户。

## 2026-08-05 · home-chat-tuffex-ai-fusion · CDP 代验 review 门 + 4 个真机 bug

- 验法:dev 实例带 --remote-debugging-port,自写 cdp.mjs(eval/shot/files/mediashot/watch)驱动+截图,我直接读图核验;清单 1-5 全过,截图存 /tmp/tuff-verify/。
- **bug#1 持久化全挂**(useConversationHistory):reactive meta 过不了 structuredClone,每次 save 静默失败——toRaw+spread 修;修后 URL 变 /home/c/:id、reload 恢复实证。
- **bug#2 scoped 样式失配**(HomePage):`.HomePage .tx-*` 覆写在 scoped 块里永不匹配子组件内部——:deep() 修;顺带 composer 测高 contentRect→borderBoxSize(浮钮偏移差 40px 的根源)。
- **bug#3 跟流缴械竞态**(tuffex stick):scrollToBottom 同步 measure 即释放 guard,而 scroll 事件异步到达时内容又长高→误判用户滚动→following 永久 false。改按**位置**判到达(programmaticTarget),内容中途增长不再缴械;补回归单测。
- **bug#4 follow 打在过期 scrollHeight**(tuffex stream):RO 回调里 spacer 高度还没经 Vue 重渲染落 DOM,scrollTo 目标过期且 spacer 落地无 RO 事件——follow 挪 nextTick(post-flush);viewport 迟到收缩同样补 grew 触发。
- 发送即回底补齐(旧手写行为):submit 后显式 scrollToBottom。
- 遗留:pi provider 首发偶发空响应(retry 即恢复,08-04 侧待查);Chromium 会恢复 reload 前滚动位置(与落底逻辑共存,可接受)。

## 2026-08-05 · search-hotpath-quadratic-fix · 搜索热路径去 O(n²)

- 三线并行审查(app/file/engine 代理,70+ 发现)后按用户指令只修搜索级二次方:addSearchToken 去重 O(n²)→WeakMap+Set O(1)(JSON key 等语义保留);processSearchResults 的语义目录×2+拼音+token 构建按内容指纹 LRU(512)记忆化(键含 user aliases);索引期 record-sync 的 isAlias/isAcronym 每关键词全目录重扫 hoist 为一次预计算。
- bench(临时文件已删):去重 150 app×200→400 token 时旧 4.33×/新 1.82×(1388ms→34ms,40 倍);150 候选冷 21.6ms→热 2.9ms(换查询同样命中,匹配集 75/75/75 全等)。
- 门:utils 979 + core-app addon/apps 161 + typecheck:node 全绿;packages/test 61 失败为既有(插件 prelude 回归,不 import 搜索模块);lint 净增 +3 同类 style(文件整体与根配置风格不合,新代码贴文件局部风格)。
- spec 固化 main-process/search-hotpath-contracts.md:去重必须走 addSearchToken 漏斗、记忆化键必须覆盖全部派生输入(漏字段=陈旧缓存 bug 类)、缓存数组共享引用只读。
- 遗留(审查报告在案未动):排序结果到不了 UI 的结构断层、关键词白名单正则、对账丢数据三件、SQL 前缀全扫——待后续任务。

## 2026-08-05 · home-tool-loop · S3-S7 落地(工具网关→extension→UI→图表)

- **S3 网关**:主进程 loopback HTTP(127.0.0.1 随机端口 + 每会话 bearer token,timingSafeEqual 校验),工具在主进程执行、agent 进程只转发——确认门因此无法被绕过;deny/异常/未知工具一律以 tool error 回给模型让循环继续;read 类可「本会话记住」,write/execute 每次必问;19 例单测。
- **S4 extension**:packages/pi-extension-tuff(pi 扩展包,`pi install <path> -l` 开发装),三工具薄壳;provider 注入 env + `--tools` 白名单,且**工具开时必须撤 `--no-extensions`**(否则白名单形同虚设)。
- **S5 UI**:parts→ChainOfThought 时间线(单步退化为 ToolCallCard)、确认卡浮在 composer 上方(agent 被阻塞时滚走也能答)、Tools 开关默认关(翻开关才开网关+发白名单)。
- **S6**:tuff_search_files 改接 coreBoxManager.search(与启动器同索引同排序);tuff_render_chart 收**声明式 spec**(校验 type/labels/series 对齐)→ ToolChartCard 按需 import echarts 渲染——「数据→报表」不给模型任意执行面。
- **S7 端到端**:自写 gateway-smoke.mjs 起真网关 + 真 pi 跑通全链。**抓出真 bug**:pi 的 executor 签名是 `(toolCallId, params, …)` 而非 `(args)`,我按后者写 → 网关收到的 args 是 callId 字符串,真实场景下每次调用都会参数校验失败。单测抓不到(没人拥有 pi 的签名),只有端到端能抓;已修 + 加契约回归测试锁死。
- 全量门:137 测试 / typecheck node+web 双绿。遗留:tuff_list_features / tuff_invoke_feature 未做(插件 feature 调用面);MCP 挂载等 C 任务。

## 2026-08-05 · search-audit-remediation · 批次 A：A4/A1/A3 落地

- 任务树:父任务持久化 70+ 审查发现 digest(E/A/F 编号+B/C 批次映射),批次 A 四子任务。A4 语义目录 token 边界匹配(3a8e40cd3):共享 matcher 只认身份字段,Postgres≠Telegram/家目录不再污染,双 catalog 版本升触发重扫。
- A1 排序送达 UI(d880b6b22,implement+check 双代理):排序分/pinned 回写浅拷贝(防跨查询泄漏)、主路径单次 full 富化发布(IPC 减半)、渲染端合并→重排→每源保底 6→截 80、完成时缓存累计集、选中按 id 跟随。check 抓到渲染端 80 预截断抵消后端 200 放宽的高危并修复(红绿验证)。
- A3 文件索引数据安全(7f9e806e3,implement+check+收尾三轮):扫描错误计数+按根删除守卫(空扫/超半删除拦截)、搜索路两条清理全改 ENOENT 闸门、NFC darwin 门控单一入口+幂等迁移(单写者合规,reconcile 让路一轮且不可能永久停摆)、mtime 秒级量化(含 check 抓出的 worker 拷贝路径)。
- 新发现入 digest:E-NEW1 语义召回在 complete 后必丢;E-NEW3 ai search-agent 语义分被绝对分饱和到 1(阈值失效,待 ai/ 并发会话稳定后专项修);F-NEW1 全空根永不被 reconcile 删(既定保守);用户需求「展示主窗口类命令靠前」入 C4。
- 门:A1 引擎 499+渲染 89;A3 files 294+utils 986;typecheck node/web 对己方文件零错。packages/test 61 失败与 ai/tuffex 报错均为并发/既有,未触碰。
- 待办:A2 字符集统一(工件已备,依赖 A3 已落地→可派发);reco-audit 推荐系统评估在飞;批次 A 收口后做合并 spec 更新。

## 2026-08-05 · home-tool-loop · 渲染批+动效批(用户中途追加)

- **渲染批**(3db7b2b64):开围栏 120ms 合并定时器实时高亮(流式中就是彩色的,弃「闭合才高亮」);html/svg/xml 定稿围栏 Preview 切换(空 sandbox srcdoc iframe——不执行脚本不同源);图表家族扩到 10 型(area/doughnut/radar/funnel/gauge/heatmap+轴标/堆叠/数值标签),仍是声明式 spec。
- **动效批**(2045c628d):composer 首发 FLIP 居中→落底(WAAPI,测量夹在响应式翻转两侧);新消息 iMessage 弹入(overshoot bezier,只在 isStreaming 时标记 id——restore 与虚拟化重挂载不重放,animationend 出集合);问候语退场 Transition;composer 双层阴影(contact+ambient)+focus 柔环;缓动词汇表三档制(out-quint 入场/overshoot 弹入/standard 状态)扫平 HomePage 与 tuffex 折叠族的裸 ease。
- 坑:Transition 包裹 v-if 会拆断兄弟 v-else 链(改显式 !isEmpty);scoped keyframes 会被 hash 改名,探针要按前缀匹配。
- 全量门:tuffex 1045/build、core-app typecheck×2、lint 全绿;HMR 已在用户实例生效。
- 决策记录:MCP 路线定为主进程自建 client(--mcp-config 属第三方扩展且绕确认门,弃);C 任务下轮从 design 起步。

## 2026-08-05 · search-audit-remediation · A2/R1 收口 + 批次 R 全量规划

- A2 字符集统一(7dac5286c,三轮实现+复核):共享 search-charset(\p{L}\p{N} 清洗/折叠孪生含假名浊点例外/Script=Han/FTS5 引号/schema 版本)替换全部本地正则含第 4 处;三态查询变体经共享 search-keyword-lookup 双侧对称;复核真 FTS5 注入 24 条实测+CJK 码位差集穷举=0+红绿 14 条;复核抓到 R5 file 源不成立→版本键门控分页 DB 内回填(拒用会读磁盘的 scheduleIndexing,走纯映射链,幂等以 AUTOINCREMENT id 快照为证),与 path-normalization 串行互斥。
- R1 推荐三修复(856f89b85,实现+复核):rebuild 按评分序返回+写 scoring.final、pinned 截断在排序后;usage 口径统一 source.id+门控迁移(先改写后合并为负控测试锁死的契约,'system' 字面行透传,映射键与真实 provider id 证明不相交);CoreBox 抢焦点前前台快照(TTL 15s,自见即弃)。复核顺手修 timer 逃逸等 3 处。
- spec 固化 main-process/search-charset-and-identity-contracts.md:charset 单源、版本 bump 语义(app 自动/file 走绑定回填/禁走读盘 worker)、门控分页迁移模式四要素、usage 身份契约。
- 批次 R 全量批准并规划(reco-signal-program.md):R2(接现成信号+hit-rate@k 指标)→R3a 采集基座→R3b 系统状态/R3c 文件活动→R3d 日历→R3e 行为学习;真地理位置停放。R4 扩展信号 14 条已入册。
- 新账:E-NEW5 backfillTrendDay 违写契约(既有)、E-NEW6 迁移读窗竞态(自愈可接受)、E-NEW7 折叠孪生使 E-M2 更早触顶(批次 B 计入)。
- 门(收口时):box-tool 1132 全绿、utils 1008+1skip、typecheck:node 己方文件零错;并发会话(ai/tool-gateway/conversation)文件全程未触碰。

## 2026-08-06 · skills-mcp-config S1-S3 + 动效反馈轮 + thinking orbs

- **关键翻案**:「主进程自建 MCP client」已存在——intelligence-mcp-registry 本就是全功能 client(双传输/懒连/代际/闲置回收/annotations→风险)。C 收窄为三桥一面;--mcp-config 路线弃(server 会落 agent 进程侧、绕确认门),PRD 验收第 3 条已改道。
- **S1-S3 双代理并行**(4594c3200):S1 注入(surface 防伪标记 host-only+invoke/stream 双路径+autoContext 门)、S2+S3 网关三工具+扩展 spec;代理间自行对齐 skill_read 的 contentRef 契约;classify 逐调用风险+rememberKey 按被代理工具收窄是代理的超预期设计,采纳。设计漏算:skill_read 也要扩展 spec(共 3 个不是 2 个)。
- **动效反馈轮**(c7b935831):发送飞行(视觉位起飞+模糊剥离+撞击上方 ±7/3px 交错回弹+加法后座力,WAAPI 类型库旧→animateRaw 窄转换);光环自然化(互质周期 8/11/9/13/6.4/7.6s 反向+色相巡游+呼吸);出字渐显(v-html 尾块每 delta 重建子节点→:last-child 动画天然重放,45%→100%)。
- **thinking orbs**(fe0ae08b1):vendor 引擎(MIT v0.2.0)+TxThinkingOrb(随机每挂载);三落点(等待首token 28px/推理头/思维链头)。
- 归属纪律:lang jsons+SettingTools+box-tool/reco+db/utils 是另一会话(reco-wire-existing-signals)在飞件,已避开;typecheck:node 的 9 错全在其范围。
- 附件诊断存档:UI-only 是任务④有意留白(attachmentNotSent 提示在案);pi 支持 @files 位置参数,打通=临时落盘+@path+消息类型加字段,待立项。

## 2026-08-06 · skills-mcp-config S4-S6 收口（代理撞限，主会话接力）

- S4/S5 双代理在报告前撞会话额度上限,留 85% 成品:S4 三件套已装配齐(15 测试绿),S5 组件成品但缺挂载+全部 60 个 i18n 键。主会话接力:挂进 SettingIntelligencePage、写 zh/en skillsMcp 块、SettingChip tone 三档归属核实为 S5 所需。787e2c554。
- **lang json 多会话并发的提交法**:git show HEAD 取基线→只应用自己的块→hash-object -w→update-index --cacheinfo。工作区他人未提交行原样保留。两次实战(c3cb09839 三键、787e2c554 68 行块)。
- **S6 冒烟**:9223 竟是用户在用的实例(我的启动因 5173 被占而失败,dev log 才暴露)——已误导航两次,即刻恢复 #/home。教训:**驱动 CDP 前先验证实例归属(检查 dev log 有没有 Port already in use)**。冒烟改离 app:真 registry+真 npx server 集成测试 15.2s 绿(TUFF_MCP_SMOKE=1 opt-in 守卫)。
- 遗留观察:用户实例导航到 /setting/intelligence 白屏(组件动态 import 正常,疑设置 shell 上下文问题),待用户从设置入口自然点击核实;pi 回复重复 5 遍的旧毛病再现(08-04 挂账)。


## Session 50: C 任务全程：skills 与 MCP 桥入首页 + 动效反馈三轮 + thinking orbs

**Date**: 2026-08-05
**Task**: C 任务全程：skills 与 MCP 桥入首页 + 动效反馈三轮 + thinking orbs
**Branch**: `TalexDreamSoul/app-shell-v2`

### Summary

MCP client 已存在的翻案把 C 收窄为三桥一面：注入桥（surface 防伪+autoContext 门）、网关三工具（classify 逐调用风险+rememberKey 收窄）、设置管理面（probe/手动 upsert/i18n 60 键）、真 server 冒烟 15.2s 绿（opt-in）。代理撞限主会话接力收尾。动效侧：thinking orbs vendor+三落点、发送飞行+撞击、光环互质周期天气化、出字渐显试错后回撤、消息操作栏（pilot 移植）、滚动守卫改实时底部释放。多会话纪律两法沉淀：index-object 提交法、CDP 实例归属预检。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4594c3200` | (see git log) |
| `c7b935831` | (see git log) |
| `787e2c554` | (see git log) |
| `d05aa8c08` | (see git log) |
| `fe0ae08b1` | (see git log) |
| `c3cb09839` | (see git log) |
| `2045c628d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## 2026-08-05 · realtime-freshness + R2 · 豆包诊断落案与推荐信号接线

- 豆包个案取证:直接原因=dev 实例运行期 out/main 被清空(import('./darwin') 失败 93 次),环境事故;照出 4 个 HEAD 真缺陷立项修复(research/realtime-chain-diagnosis.md 含链路图/逐条证伪/验收脚本)。
- realtime(a09d10bdd):失败三态(failed≠not-app,Info.plist 存在性二分)+2/8/30s 排程退避+死信(64 上限,空集即撤 timer);合并窗 400/300ms 后到者胜(SDK 粘性 delete 会把自动升级的应用删掉,红绿锁死);健康探针文件系统集合差(NFC 归一+manifest 校验,仅两个启动决策点);lastIndexedAt 补写;dev mdls 门 >6h。装→可搜预算 1.5-2.5s,空闲零定时器。复核修 4(NFC 鲁棒/manifest 空壳/死信双所有权泄漏/上报口径)。
- R2(3ee91b54a):小时分布等量纲进评分;缓存键只剩慢上下文+易变请求时重排(复核抓到剪贴板 URL 候选进缓存的真 bug,红绿修复);冷启动 app catalog 兜底;聚合增量化(全量重建降为门控修复路径,E-NEW5 收口);选区接入+时区切换;isAppSourceType 双拼写修 17 处恒假判定;hit-rate@k 本地指标(0036 aux 表,id 不落盘不进 Sentry)。
- 途中两代理撞额度上限,SendMessage 原地续跑无损;高负载(load 93-126)下 hook 超时定性为既有负载敏感 flake(search-core init),单跑全过。
- 发现:db:generate 是死命令(drizzle-kit 未装,0015 起 22 个迁移手写)→迁移链+DDL parity 测试为正确门禁,记 E-NEW8;剪贴板 URL 候选的 content 是哈希非 URL(HEAD 既有,设计问题待决)。
- 待用户:重启 dev 实例后跑 .trellis/tasks/08-05-realtime-index-freshness/verify-realtime-index-freshness.sh 验收「装 app ≤10s 可搜」。

## 2026-08-06 · 三线收官：feature 工具、附件进模型、pi 重试根修

- **feature 工具**(9022c763e):list/invoke 成对落地(前任代理流超时,继任续写其投影层不推倒);首页工具面板至此九件套一门。
- **附件进模型**(647fb3f2a+d9a25ed5f):双镜像类型→spill(MIME 白名单/10MB/0600/跳过不炸轮)→@files 位置参数;vision 冒烟真凭实据(模型读回生成图文字)。提示文案改「实发对比」显隐。spec 落 pi-provider-contracts.md。
- **pi 重复/空回复根修**(cd018f946):诊断代理实盘 NDJSON 证据(单进程 4 轮重放、json 模式恒退出 0)→主会话复审发现原案工具轮过度回滚缺陷→定形 commit/rollback(delta=预览,message_end=提交点,auto_retry_start=回滚);实施代理三处有据偏离全采纳(显式 stopReason 才 commit、尾部预览保留+抛错只看已提交、播种与水位交互加 textLength)。
- **边界测试 mock 陈旧根治**:手列导出两级过期(PRIVACY_DATA_CATEGORIES→PLUGIN_STORAGE_ERROR_CODES→域事件全面缺)→importOriginal+Proxy 自动桩,4/7 套件复绿;余 3 套 HEAD 逐字节一致仍败=actor-boundary 流既有漂移,立 08-06-intelligence-boundary-drift 交接(决定性证据:未改文件同样失败)。
- 教训:手列 mock 是定时炸弹,partial mock(importOriginal)/Proxy 桩才是可持续形态——已写进提交信息与交接任务。
