# Tuff TODO

> 更新时间：2026-07-04
> 定位：当前 2 周执行清单。细项分别落到 `TODO-AI.md`、`TODO-R3.md`、`TODO-nexus.md`；6 月以前记录已从文档树移除。

## 当前执行窗口

- 当前主线：按 `04-implementation/Roadmap-vNext-2026-06-18.md` 推进 R0-R9。
- 当前代码版本：root / CoreApp `2.4.13-beta.1`。
- 工作方式：related-only 小切片；不混合 CoreApp、Nexus、AI、docs、packages；不主动 git commit / push。
- 公共包发布不再作为独立 Roadmap blocker，版本变更后以 GitHub 自动发版 workflow 结果为准。
- owner 已完成的平台人工验证不再作为待办、平台后续或 release blocker；平台能力只保留 degraded / fail-closed 回归要求。

## 状态快照

| 主线 | 状态 | 下一步 |
| --- | --- | --- |
| R0 口径 / docs hygiene | done for current pass | 继续清理死链与超长文档；入口只保留当前 SoT。 |
| R1 Release Integrity | blocked by release assets | `v2.4.12-beta.8` 真实链路已复采：Nexus latest/assets/download 通过，GitHub manifest 存在；仍缺 `.sig/.asc` sidecar、manifest `signature` 字段、Nexus `signatureUrl/signatureKey` 与 signing public key。 |
| R2 AI Stable | gate closed / productization follow-up | CoreBox AI Ask、Search/App Index/Login、OmniPanel writing tools、Provider migration、Assistant floating ball / screenshot translate、Workflow review queue 与 Provider registry observability 13/13 visible surfaces 已 passed；下一步做 OmniPanel / Assistant 产品化、性能优化、桌面烟花 MVP 与截图功能渐进引入。 |
| R3 Search / Indexing Runtime | partial (~74%) | 2026-07-04 goal 进度快照：active / partial，goal scope 暂不修改，后续单独讨论是否调整。FileProvider incremental DB persist、FTS write/delete、index worker flush、durable job history focused slice + Settings diagnostics JSON verifier/probe/controlled seeded evidence/isolated maintenance reset evidence、2026-06-30 isolated packaged durable scan DB snapshot、SQLite/FTS/`scan_progress` 只读 preflight + `migrationDryRun` report artifact（含 SQLite runtime PRAGMA profile、`queryOnly=true`、`evidenceSource.scope=isolated-controlled`，并暴露 isolated DB `source-index-row-parity` blocker；真实 profile preflight 需 `--evidenceScope real-profile --requireRealProfileEvidence`）、2026-07-03 生产迁移 source-read-only readiness rerun（含 legacy `file_fts` migration policy gate 与 Drizzle journal / SQL 文件一致性 gate）、2026-07-03 isolated `scan_progress` migration plan artifact（`mode=plan`、`executed=false`、`queryOnly=true`、`evidenceSource.scope=isolated-controlled`、`requiresApproval=true`；真实 profile plan 需 `--evidenceScope real-profile --requireRealProfileEvidence`）、FTS ownership / `scan_progress` isolated copy simulation（含 `sourceSnapshotUnchanged=true` 与 `evidenceSource.scope=isolated-controlled`；strict 关闭仍需 real-profile simulation evidence）、R3 migration evidence 聚合 verifier 已接入且当前 isolated packet strict gate 为 blocked、durable runtime-store resource migration、`scan_progress` source-scoped schema/resource migration/runtime compatibility、controlled migration helper/CLI 与 copy simulation 已收敛到 runtime/store evidence；strict verifier 已新增 Settings verification path + probe 内嵌 verification JSON 双绑定，防止跨 run 拼接 evidence；`source-index-row-parity` 的 scan completion drain 代码侧修复已补 focused tests，drain timeout 会 fail scan 以避免成功 history 假象，但仍需重包后重采 isolated packaged preflight；packaged cold-start `SIGABRT` 已补结构化失败 envelope artifact，不再只依赖终端输出；`visible:experience:indexing-diagnostics-attach` 已作为真实 packaged/profile 的 attach-only collector 入口，强制 loopback `--remoteDebuggingUrl`，避免误走不稳定 cold-start 或误连非本机 CDP endpoint，probe envelope 会显式标记 attach-only/read-only mutation policy；legacy `file_fts` 本批保留不改；剩余真实 profile SQLite/FTS/`scan_progress` migration/preflight/simulation evidence、npm/tsx packaged probe 冷启动稳定性、自然 recent task packaged Settings 截图/录屏 artifact 采集与 durable scheduler 长尾。 |
| R4 QuickOps 产品化 | partial | safe Flow 状态动作 payload 已标记 `statefulRuntime`，stop/reset 类清理动作额外标记 `cleanup`；clean-screen start/stop 插件 item 已带 `quickops-screen-clean-visual` contract marker；Pomodoro settings 已暴露默认 focus/break 只读模板 contract，高级循环仍标记 `pending-host-capability`；继续收真实清洁屏幕 visual evidence、Pomodoro 高级循环 runtime 与 app quit cleanup。 |
| R5 Plugin Trust Boundary | partial | `touch-translation` result copy 已从 `navigator.clipboard` 收回插件 Clipboard SDK；`touch-emoji-symbols`、`touch-snippets`、`touch-dev-utils` 与 `touch-text-tools` clipboard read/write/copy 已补 permission / clipboard SDK unavailable、request/read/write failure 的 fail-closed reason；继续收 shell/OS/network/fs/clipboard 权限缺失路径与 Widget sandbox 长尾。 |
| R6 UI / TuffEx | partial | `touch-music` player controls 与 TuffEx `TxNavBar` / `TxTabItem` / `TxBlockLine` / `TxFileUploader` / `TxSegmentedSlider` / `TxCollapseItem` 语义化小切片已收，`TxCardItem` 默认非交互 role/tabindex 已清理；继续收主路径 `div/span @click`、legacy Menu/Drawer 与 visual smoke。 |
| R7 Nexus Governance | partial | report evidence 已 fail-closed 区分 `live` / `d1` / `r2` / `local-only` / `memory` / `open`，D1 readiness 已接入 report，direct invoke channel quota 已在 dispatch 前阻断，operator cockpit view 已记录低敏审计；仍缺 production / preview browser evidence、生产 D1/R2、credential-backed live send/live storage 与真实 provider quota fail-closed 运行证据。 |
| R8/R9 Next Stage | partial | R8 Phase 1/2 foundation 已开始：`packages/utils/i18n` locale core、`LocalizedText` / `LocalizedList`、CoreApp 插件 manifest localized metadata loader 与展示解析已落地。R9.1 Local Knowledge Retrieval 继续沿 SQLite/FTS5/metadata/citation 路线推进，本轮已增强 metadata filter 的 nested path / array 包含语义，并把 retrieval citation/status/degraded reason 桥接到 R9.2 `ContextPackage` item metadata 与 package log metadata；metadata-only `contextListPackageLogs` / `contextListCheckpoints` typed SDK / CoreApp channel 已可按 session/trace 读取 explain log，并按 session/type 读取 checkpoint boundary reason/context scope/metadata；`@talex-touch/tuff-intelligence` 镜像 SDK 与 Intelligence Audit 展开区已能展示 trace 对应的 context package metadata 摘要、metadata-only explain drawer、included/excluded source detail、excluded/pruned/policy-blocked 证据和 session checkpoint boundary 摘要，官方 `touch-intelligence` CoreBox AI Ask 已在调用前生成 ContextPackage metadata 并 fail-soft 保持原问答路径；只读 `contextEvaluateMemory` 已提供显式记忆候选的 suggested/rejected/needs_review 策略预览，CoreBox AI Ask 仅在用户显式“记住 / remember”时生成 memory policy metadata，不写库且不自动保存长期记忆；`contextListMemories` / `contextSetMemoryEnabled` typed SDK / CoreApp channel 与 Intelligence Audit host-side Memory Review 最小面板已接入，用户手动输入候选、先评估策略、仅 suggested 且显式点击后调用 `contextSaveMemory`，saved list 默认只展示 normal / non-tombstoned memory，可禁用/重新启用，并可通过 `contextDeleteMemory` 写 tombstone 删除，rejected/needs_review fail-closed。下一步继续补完整 explain drawer 产品化、OmniPanel/Workflow/Assistant 最近路径、完整 Memory 面板搜索/编辑与真实数据 evidence。 |
| Nexus performance | separate thread | 详见 `TODO-nexus.md`，不要混入 CoreApp/AI/R3 改动。 |

## 当前阻塞

- R2 global visible gate 已关闭：strict verifier 当前 `gate.passed=true`，13/13 required surfaces `passed`；manifest 引用 72 个唯一 artifact，均存在、非空且 JSON 可解析。
- R2 `assistant-screenshot-translate` MVP + packaged evidence 已闭环：Assistant typed events、VoicePanel 双入口、cursor-display screenshot -> image translate -> pin window 主流程、focused tests 与 packaged visible evidence 均已落地；下一步是产品化 polish，不再是 broader surface blocker。
- R2 下一步 follow-up：Assistant screenshot translate 灰度产品化、OmniPanel / Assistant 性能优化、桌面烟花 MVP、截图 capture + preview + copy/save 渐进引入；每项继续走 feature flag、可回退和专项 evidence。
- R1 Gate E 仍失败：`docs/engineering/reports/release-integrity-2026-06-22/` 已绑定真实链路证据，阻塞项为发布资产签名材料与生产 signing key 配置缺失；旧本地 gate 缺已清理 risk-register 文件，本轮不作为闭环阻塞。
- R3 schema 与 durable runtime-store 属数据结构和持久化边界改动，执行真实 profile 前必须按 `TODO-R3.md` 的高风险迁移前置确认清单单独确认 SQLite/FTS、`scan_progress` 影响范围；2026-07-03 `search:production-migration-readiness` 只读复跑确认 source-read-only readiness 仍为 ready，`0024_search_index_runtime_store.sql` 与 `0025_scan_progress_source_scope.sql` 已接入资源迁移，Drizzle journal / SQL 文件一致性为 clean，且 resource migrations 未触碰 legacy `file_fts`；2026-06-30 isolated packaged DB 已取得 durable task state + preflight/simulation 证据，preflight 已包含 SQLite runtime PRAGMA profile，并暴露 isolated DB `source-index-row-parity` blocker；代码侧已补 runtime scan drain，但重包后重采 isolated packaged preflight 仍被 packaged cold-start `SIGABRT` 阻断，现有失败 envelope 只证明 cold-start blocker，不替代 DB/preflight 通过证据，旧 artifact 继续按 blocker 保留；legacy `file_fts` 决策为本批保留不改；剩真实 profile execute/preflight evidence。
- R7 Nexus governance 当前只完成 report source guard 与 operator cockpit view audit：local-only/memory/browser/dry-run/consumed smoke 不会关闭 production evidence，API audit 不能替代 authenticated browser 截图/录屏；生产/preview operator、D1/R2、credential-backed live send/storage 和真实 quota exhausted 仍需受控环境证据。

## R9.2 ContextHygiene 剩余 TODO

> 口径：R9.2 只推进 ContextHygiene P0/P1 与 2.5.3 retrieval/citation 消费；不提前开启自动长期记忆、本地模型或 ASR runtime。

| 项 | 当前状态 | 下一步 | 完成口径 / 验证 |
| --- | --- | --- | --- |
| Session / Checkpoint / ContextPackage P0 | partial landed | 补 CoreBox 最近路径之外的 entrypoint 调用边界与 fail-soft evidence | `contextPrepareTurn` 在目标入口返回 session/checkpoint/package metadata；不保存完整 prompt/response。 |
| 2.5.3 retrieval citation 消费 | partial landed | 补真实数据 evidence 与 explain drawer 产品化 | ContextPackage explain 可见 retrieval citation、degraded reason、included/excluded source metadata。 |
| MemoryPolicy / 手动确认 | minimal landed | 保持只读预览 + 用户显式保存；补编辑前重评估与来源审计 | `rejected` / `needs_review` 不写库；编辑后的保存必须重新 evaluate 或使用最新 candidate。 |
| Memory 面板最小治理 | minimal landed | 从 Audit shell 扩展搜索、编辑、来源 session/turn 展示 | normal / non-tombstoned list、enable/disable、tombstone delete 已有；搜索/编辑/来源审计仍缺。 |
| Tombstone / disabled 注入回归 | partial evidence | 补 prepareTurn focused regression，证明 disabled/tombstoned memory 不进入 package | seeded SQLite 或 service test 覆盖 memory source 不回灌；删除后 summary/cache 候选不再注入。 |
| CompressionSnapshot | open | 实现结构化 snapshot schema 校验、summary CAS、失败不删 turns | compression failure degraded；sourceTurnRange 正确；user-rejected 不进入 memory。 |
| OmniPanel / Workflow / Assistant 最近路径 | open | 各接 1 条 prepareTurn integration case，默认轻上下文 | 不继承 CoreBox 长会话；Workflow 独立 session；Assistant 只注入当前动作 capsule。 |
| 真实数据 evidence | open | 用受控本地 profile 收 context package / memory / tombstone 证据 | focused tests 之外至少保留一组可复核 JSON/截图/录屏 artifact。 |

## AI 批次估时

> 口径：单个 AI agent 连续执行，包含定位、必要代码修改、focused tests、evidence/文档同步；不包含等待外部凭证、人工平台操作或生产审批。

| 任务 | 预估 AI 时间 | 风险 / 备注 |
| --- | ---: | --- |
| Assistant screenshot translate 产品化 | 3-5h | 已有 MVP 与 evidence；补截图模式选择、权限恢复、pin window polish、provider fallback 文案与灰度开关。 |
| OmniPanel / Assistant 性能优化 | 2-4h | 聚焦窗口生命周期、悬浮球拖拽持久化、事件广播、packaged asset 排除与首屏不阻塞。 |
| 桌面烟花 MVP | 2-4h | feature flag 默认关闭；轻量 overlay/canvas，限制粒子数、帧率、自动退出与无障碍降级。 |
| 截图功能渐进引入 | 3-6h | 先做截图 capture + preview + copy/save，再接 translate；失败态区分权限拒绝、平台 unsupported 与 provider unavailable。 |
| R3 durable job history + Settings diagnostics | 1-2h evidence pass | 非 schema code/focused tests、diagnostics JSON verifier、packaged probe 入口、isolated `--seedRecentTaskEvidence` 受控 evidence、isolated `--runMaintenanceAction reset` runtime evidence、fixtureRoot guard、stale bundle preflight、重包后的 scan/reconcile controlled fixture evidence 与 2026-06-30 isolated packaged durable scan DB snapshot 已完成；2026-06-30 `source-index-row-parity` blocker 已补 runtime scan drain 代码侧修复，probe/verifier 已补 attach-only/read-only envelope policy、`--requireReadOnlyEnvelope` 与 `--requireNaturalRecentTaskEvidence` 真实 evidence gate，preflight 已能对 `indexed_source_task_state` 空表给 warning，但还需重包重采 evidence；isolated evidence 只证明 packaged UI/chip/verifier/typed maintenance/task-state persistence 链路，不替代自然真实 profile history；剩修复 npm/tsx packaged probe 冷启动稳定性（crash report 指向 AppKit/HIServices `_RegisterApplication`，早于 CoreApp JS 日志），并对已有真实 packaged profile 或受控真实 profile 运行 probe 收自然 recent task 的 Settings 截图/录屏 artifact。 |
| R3 Quicklinks persistent feed | 6-10h | 官方插件持久 feed storage、clear / rebuild UI 与 Settings evidence。 |
| R3 Browser Bookmarks platform evidence | 4-8h | 主要取决于真实浏览器 profile、watch root 与 packaged evidence 可采性。 |
| R3 Everything productionization | 8-16h | Windows / SDK / CLI / registry / PATH / fail-closed evidence 链路长。 |
| R1 Release Integrity | 2-4h code/check pass，外部资产另算 | 缺 `.sig/.asc`、manifest signature、signing key；AI 不能凭空闭环。 |
| R7 Nexus Governance | 8-20h+ | production / preview、D1/R2/live send/provider quota 受环境和凭证限制。 |
| Nexus performance 单批 | 3-6h/批 | 独立线程推进；每批只处理一个页面族或一个 runtime 问题。 |

需要先设计并确认影响范围，不建议直接开干：

| 任务 | 预估 AI 时间 | 风险 / 备注 |
| --- | ---: | --- |
| R3 SQLite/FTS durable ownership migration | 4-8h evidence pass | 数据结构 / 持久化所有权高风险；已有只读 preflight + dry-run plan + production readiness + isolated copy simulation，且 `indexed_source_task_state` / `search_index` durable resource migration 已接入；preflight/simulation 已有 `--requireRealProfileEvidence` 门禁防止 `/tmp` isolated artifact 冒充真实 profile，聚合 verifier 会在 strict 模式同时要求 real-profile preflight、`task-history-store=durable-history-present` 且 rows >= 1、source-scoped post-migration preflight、real-profile copy simulations、natural Settings verification 与 Settings/source detail screenshot artifact；legacy `file_fts` 本批保留不改，仍需真实 profile report 与验证矩阵。 |
| R3 `scan_progress` source-scoped schema migration | 4-8h evidence pass | schema/source migration 高风险；schema/resource migration、production startup helper、runtime 兼容读写层、query-only plan artifact 与 copy simulation 已接入；仍需真实 profile preflight/execute evidence、数据清理影响范围和回滚策略确认。 |

## 分批执行计划

> 执行规则：每批只处理一个主题；R2 visible surface、R3 indexing、Nexus performance、TuffEx / SDK dirty files 不混批。每批结束都要同步对应 SoT 文档；如果只完成侦察或遇到环境 blocker，不能把 surface 标为 `passed`。

| 批次 | 默认任务 | 交付物 | 文档落点 |
| --- | --- | --- | --- |
| 30min 侦察批 | R2 visible gate preflight | strict failure 分组、surface artifact 要求、截图要求、下一批推荐 | `TODO.md`、`TODO-AI.md` |
| 2-4h 产品化小切片 | OmniPanel / Assistant performance follow-up | window lifecycle、broadcast、floating-ball persistence、packaged asset hygiene | `TODO-AI.md`、AI report README、CHANGES |
| 半天批 | `assistant-floating-ball-entry` | 已完成：单 surface evidence；不混 Workflow 或 screenshot translate | `TODO-AI.md`、专题 report、CHANGES |
| 半天批 | Assistant screenshot translate 产品化 | screenshot mode、pin window polish、provider fallback、permission recovery | `TODO-AI.md`、专题 report、CHANGES |
| 半天批 | 桌面烟花 MVP / 截图功能渐进引入 | feature flag overlay/canvas；capture + preview + copy/save | `TODO-AI.md`、专题 report、CHANGES |
| R3 设计批 | durable job history + Settings diagnostics | append/update/store 最小设计、Settings chip 证据路径、focused test matrix | `TODO-R3.md` |
| 高风险迁移设计批 | SQLite/FTS ownership、`scan_progress` source-scoped schema | 已有只读 preflight + dry-run plan + production readiness auditor + FTS/scan_progress isolated copy simulation + strict evidence verifier；`indexed_source_task_state` / `search_index` / `scan_progress` source-scoped resource migration 已接入；legacy `file_fts` 本批保留不改；strict gate 仍要求真实 profile preflight、非空 durable task history rows、real-profile FTS/scan_progress copy simulations、real-profile `scan_progress` plan、source-scoped post-migration preflight、natural Settings verification、PNG screenshot 与 DOM recent task evidence，并要求 Settings verification 路径和 probe 内嵌 verification JSON 都匹配，继续补真实 profile report、影响范围、验证矩阵 | `TODO-R3.md`、必要时专题设计文档 |

### R2 follow-up 完成标准

- 默认 feature flag 或显式开关，不扩大生产默认行为。
- 运行最近路径 focused tests；涉及 visible evidence 时运行 strict verifier 并确认 13/13 surfaces 不回退。
- 同步 `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/README.md`、`TODO-AI.md`、`CHANGES.md`；如影响总状态，同步本文件。
- 性能优化必须有可复核指标或至少包含启动、窗口创建、拖拽/广播路径的专项回归证据。

### R3 批次完成标准

- durable job history focused code/test、Settings diagnostics JSON verifier、packaged probe 入口、isolated seeded evidence、isolated maintenance reset/scan/reconcile fixture evidence、2026-06-30 isolated packaged durable scan DB snapshot、fixtureRoot guard 与 stale bundle preflight 已完成；后续修复 npm/tsx packaged probe 冷启动稳定性并运行真实 packaged probe 补自然 recent task 的 Settings 截图或录屏 evidence，不触碰 schema。
- SQLite/FTS ownership 与 `scan_progress` migration 必须先按 `TODO-R3.md` 高风险清单完成确认；未确认前不得实施迁移。
- Browser Bookmarks、Everything、Quicklinks 只能用真实平台 / packaged evidence 关闭，不用 mock evidence 替代。

## 验证命令

```bash
pnpm quality:pr
pnpm publish:check
pnpm publish:check:pack
pnpm -C "apps/core-app" run typecheck
pnpm typecheck:all
git diff --check
```

涉及 packaged evidence、真实平台 watcher、schema migration、production/preview evidence 时，必须补专项证据，不能只用 focused tests 替代。
