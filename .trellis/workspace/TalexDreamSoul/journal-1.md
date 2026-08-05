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
