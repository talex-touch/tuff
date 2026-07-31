# ROADMAP.md 事实校准报告

> 校准对象：根目录 `ROADMAP.md`（2026-07-31 生成，git untracked）
> 校准时间：2026-07-30 · 只读分析，未修改 ROADMAP.md
> 格式：声明摘要 | ROADMAP 所述 | 仓库事实 | 判定 | 修正建议

## 1. 版本事实

| 声明摘要 | ROADMAP 所述 | 仓库事实 | 判定 | 修正建议 |
|---|---|---|---|---|
| CoreApp 版本 | `2.4.13`（apps/core-app/package.json） | `apps/core-app/package.json` `"version": "2.4.13"` | ✅ 准确 | — |
| Node 版本 | `>=24.15.0` | 根 package.json `engines.node = ">=24.15.0"`（另有一处 pin `24.18.0`） | ✅ 准确 | — |
| pnpm 版本 | `10.34.4` | 根 package.json `packageManager: "pnpm@10.34.4"` | ✅ 准确 | — |
| Electron 版本 | `40.0.0+`（版本表）/ `Electron 40`（技术栈） | 根 package.json dependencies `"electron": "^41.10.1"`；`apps/core-app/package.json` 未单独声明 electron | ❌ 需修正 | 改为 `Electron 41` / `^41.10.1` |
| Vue 3.5 / Nuxt 4（技术栈） | Electron 40 + Vue 3.5 + Pinia / Nuxt 4 + UnoCSS | pnpm-workspace catalog：`vue: ^3.5.39`、`nuxt: ^4.4.8`、unocss 存在；pinia 经 catalog 引用 | ✅ 准确（Electron 项除外） | 仅改 Electron 为 41 |

## 2. R0–R9 状态表（SoT：`docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md` + `docs/plan-prd/TODO.md`）

| 阶段 | ROADMAP 所述 | 仓库事实 | 判定 | 修正建议 |
|---|---|---|---|---|
| R0 | ✅ Usage 单写、Nexus sync 原子批、Trellis 任务收敛均完成 | Roadmap L39：「R0 的 Usage、Nexus sync 与 task/doc convergence 已关闭」；CHANGES 07-16 三条均闭合 | ✅ 准确 | — |
| R1 | ✅ beta.19 strict Gate E 通过；stable 独立复核 + OTA lifecycle 开放 | Roadmap L40 同述；CHANGES 07-27 有 beta.19 Gate E pass 与 OTA lifecycle landed 条目 | ✅ 准确 | — |
| R2 | 🔄 historical 13/13；current-version recapture 开放 | TODO.md guardrail 原话一致 | ✅ 准确 | — |
| R3 | 🔄 ~74% 完成；durable migration + scan_progress source-scope 待真实 profile evidence | TODO-R3.md L9/L13：「当前完成度约 74%，active / partial」 | ✅ 准确 | — |
| R4 | 🔄 番茄钟/清洁屏幕/app quit cleanup 开放 | 与 Roadmap R4 行交付物一致；无更近证据反证 | ✅ 准确（与 SoT 一致） | — |
| R5 | 🔄 权限 surface fail-closed；secret cleanup UX + Widget sandbox 开放 | Roadmap R5 行一致；CHANGES 07-13 大量 fail-closed 条目佐证 | ✅ 准确 | — |
| R6 | 🔄 语义控件/keyboard/focus 迁移；visual smoke 恢复开放 | 与 Roadmap R6 行一致 | ✅ 准确 | — |
| R7 | 🔄 Registry/Admin 收敛；deployed Cloudflare evidence 开放 | Roadmap R7 行 + TODO-nexus「只剩 deployed preview HAR 等外部证据」一致 | ✅ 准确 | — |
| R8 | ⏸️ 暂停；CatalogService MVP + 完整本地模型待恢复 | Roadmap L44 + TODO.md「R8-F CatalogService MVP … remain paused」 | ✅ 准确 | — |
| R9 | ⏸️ 暂停；知识检索/ContextHygiene/本地 GGUF/ASR 保留路线 | Roadmap R9 行 + TODO.md R9.2 描述一致（注意 ASR 短语音 slice 已落地，属 2.5.0 范畴） | ✅ 基本准确 | 可选：注明 R9.2 ContextHygiene P0/P1 已完成 |

## 3. 活跃 Trellis 任务一览表（SoT：`.trellis/tasks/*/task.json`，共 27 个活跃任务）

ROADMAP 表仅列 10 个任务。逐行核对（优先级/状态以 task.json 为准）：

| ROADMAP 行 | ROADMAP 优先级/状态 | task.json 事实 | 判定 | 修正建议 |
|---|---|---|---|---|
| search-crossplatform-audit | P0 | **P2** / planning | ❌ 需修正 | 优先级改 P2 |
| migrate-search-index-split-write-paths | P0 | **P1** / planning | ❌ 需修正 | 优先级改 P1 |
| windows-everything-productionization | P1 🔴 | P1 / in_progress | ✅ 准确 | — |
| unify-ota-update-flow | P1 | **P2** / planning [4/6 done] | ❌ 需修正 | 优先级改 P2 |
| harden-app-icon-self-healing | P1 | **P2** / in_progress | ❌ 需修正 | 优先级改 P2 |
| base-anchor-liquid-animation | P2 🟢「P4-P6 已全部修复」 | P2 / **in_progress**；prd AC1–AC10 全部 `[ ]` 未勾选 | ❌ 需修正 | 改为 🟡 进行中；删除「已全部修复」或注明 evidence 出处 |
| tuffex-docs-audit | P2 🔄 | P2 / in_progress | ✅ 准确 | — |
| bilingual-whats-changed | P2 🟢「已落地」 | P2 / **in_progress**；prd AC1–AC5 全部 `[ ]` 未勾选 | ❌ 需修正 | 改为 🟡 进行中，「已落地」缺验收依据 |
| optimize-clipboard-plugin | P2 🟡 实施中 | **P1 / planning**（未开始） | ❌ 需修正 | 优先级改 P1，状态改 planning |
| fix-file-index-update-redaction-476 | P3 🟡 | **P2** / in_progress | ❌ 需修正 | 优先级改 P2 |

**遗漏的 17 个活跃任务**（ROADMAP 未列出）：
- 07-09-audit-search-system-architecture（**P0**，全仓最高优先级父任务，[3/7 done]）+ 4 个 P1/P2 子任务（scope-search-sessions-and-streams、gate-search-on-storage-hydration、establish-single-search-index-writer、unify-search-provider-lifecycle）
- 07-13-catalog-service-mvp（P1）
- 07-22-ota-one-click-background-update（P2, in_progress）
- 07-26-install-launch-v2-4-13-beta-23（P2, in_progress）
- 07-27-audit-plugin-privileged-security（P2）
- 07-27-batch-commit-release-v2-4-14-beta-1（P1）+ 子 07-27-release-v2-4-14-beta-1（P1）
- 07-27-expose-plugin-search-sdk（P3）
- 07-27-fix-plugin-folder-button（P2, in_progress）
- 07-27-optimize-core-utility-plugins（P1）+ 子 optimize-intelligence-plugin（P1）、optimize-translation-plugin（P1）
- 07-30-docs-roadmap-consolidation-cleanup（P2，本任务自身）

修正建议：要么补齐为完整 27 任务表（建议按父/子缩进），要么明确标注「节选高优先级任务」并至少补上 P0 的 audit-search-system-architecture 与 P1 的 release/catalog/optimize 系列。

## 4. 架构概览目录树

| 声明摘要 | ROADMAP 所述 | 仓库事实 | 判定 | 修正建议 |
|---|---|---|---|---|
| apps 目录 | core-app / nexus / tuff-analyse / reverse-proxy-design | 实际 4 个完全一致（另有 node_modules） | ✅ 准确 | — |
| packages 目录 | 列出 9 个：tuffex、tuff-core、tuff-business、tuff-intelligence、tuff-cli、tuff-native、utils、test、unplugin-export-plugin | 实际 12 个（除 node_modules）：**多出 `intelligence-uikit`、`tuff-analyse`、`tuff-cli-core`** | ❌ 需修正 | 补 3 个缺失 package 条目 |
| plugins 数量 | 22 个 | 实际 **24 个插件目录**（另含 AGENTS.md 文件） | ❌ 需修正 | 改为「24 个」 |

## 5. 文档导航表链接验证（test -f）

全部 14 个链接目标逐一验证：

| 链接 | 结果 |
|---|---|
| docs/plan-prd/TODO.md | ✅ 存在 |
| docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md | ✅ 存在 |
| .trellis/tasks/README.md | ✅ 存在 |
| docs/plan-prd/01-project/CHANGES.md | ✅ 存在 |
| docs/plan-prd/TODO-AI.md | ✅ 存在 |
| docs/plan-prd/TODO-R3.md | ✅ 存在 |
| docs/plan-prd/TODO-nexus.md | ✅ 存在 |
| docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md | ✅ 存在 |
| docs/engineering/security-hardening-handoff-2026-07-15.md | ✅ 存在 |
| docs/engineering/README.md | ✅ 存在 |
| docs/INDEX.md | ✅ 存在 |
| CLAUDE.md | ✅ 存在 |
| README.md / README.zh-CN.md | ✅ 存在 |

判定：✅ 导航表全部准确，无断链。

## 6. 里程碑表抽查（SoT：`docs/plan-prd/01-project/CHANGES.md`）

CHANGES.md 最新一节为 **2026-07-27**（文首「更新时间：2026-07-27」），**不存在 2026-07-30 条目**。

| ROADMAP 行 | 仓库事实 | 判定 | 修正建议 |
|---|---|---|---|
| 07-30 File index update redaction (#476) | CHANGES.md 无 07-30 节；任务 07-30-fix-file-index-update-redaction-476 仍 **in_progress**，非已完成里程碑 | ❌ 需修正 | 删除该行，或移入「活跃任务」表 |
| 07-27 BaseAnchor liquid 动画+P4–P6 修复；双语 What's Changed；插件安全审计 | CHANGES 07-27 节实际内容为：Windows Everything packaged 证据、app-icon 自愈、beta.19 Gate E、OTA lifecycle；**无** BaseAnchor/双语日志/插件审计条目 | ❌ 需修正 | 改为 CHANGES 实际四条；BaseAnchor/双语/插件审计属进行中任务，非里程碑 |
| 07-17 OTA 受控生命周期落地；storage hydration gate | OTA lifecycle 条目实际在 **07-27**；07-17 节只有 storage hydration/onboarding gate 一条 | ❌ 需修正 | 07-17 行只保留 storage hydration；OTA lifecycle 并入 07-27 行 |
| 07-16 Trellis 45 任务归档；Nexus sync 原子批；usage 单写者 | CHANGES 07-16 节三条完全对应 | ✅ 准确 | — |
| 07-13 VoicePanel ASR；Intelligence quota fail-closed；文档 SoT 收敛 | 前两条在 07-13 节 ✓；「文档 SoT 收敛」实际在 **07-16** 节（docs: consolidate the stabilization source of truth） | ⚠️ 部分失准 | 第三项移至 07-16 行或删除 |
| 07-04 Nexus 性能线 98.5% 收口（docs shell、路由矩阵、PWA precache trim、sidebase auth 迁移） | CHANGES 07-04 记「约 **98%** guarded」；TODO-nexus 记「约 98.5% **active**」且明确「最终完成判定仍只等待 deployed production preview/HAR 等外部证据」——**未收口**；括号内 docs shell/路由矩阵/sidebase auth 迁移在 CHANGES 中无对应条目 | ❌ 需修正 | 改为「Nexus 性能线 ~98.5% active（PWA precache trim 等本地收口，deployed preview 证据待补）」 |

## 7. 已知风险表（SoT：`.trellis/tasks/07-13-search-crossplatform-audit/prd.md`）

| 声明摘要 | ROADMAP 所述 | 仓库事实 | 判定 | 修正建议 |
|---|---|---|---|---|
| DB_SEARCH_SPLIT flag | 默认 off，开启导致 silent data loss，待 evidence | TODO.md safety gates 原话一致；迁移任务 prd 同述 | ✅ 准确 | — |
| B1 语义搜索接而未用 | 🟠 已审计，**待修** | 审计 prd L52：B1 **✅ 已修**（07-13-fix-ranking-dead-features，延迟召回二段推送）；仅余「B1 派生 carve-out 未做」 | ❌ 已过时 | 改为「B1 已修（延迟召回二段推送），余 1 项派生 carve-out 开放」 |
| B2 completion 加权被 sorter 绕过 | 🟠 已审计，**待修** | 审计 prd L58/L145：B2 **✅ 已修**（同任务，46 相关用例通过） | ❌ 已过时 | 改为「已修」或删除该行 |
| R1 Rust screenshot 未接入构建 | 🟠 已审计 | 审计 prd L91 仍为 `[ ]` 开放 | ✅ 准确 | — |
| R2 macOS unsigned/arm64-only vs electron-updater | 🟠 已审计 | 审计 prd L95-98：2026-07-21 Developer ID 签名 + 公证**已闭环**；R2 仍 open 的点收窄为「Intel/Universal 产物与 dir/updater 目标冲突」（#311） | ⚠️ 部分过时 | 改为「macOS 签名/公证已闭环；R2 残余：Universal 产物与 dir/updater 冲突（#311）」 |
| Nexus 663 断链 | 🟡 已盘点 | docs/plan-prd/docs/PERIPHERAL-DOCS-BROKEN-LINK-INVENTORY.md L48：「Broken in-scope targets: 663」 | ✅ 准确 | — |
| CHANGES.md 1058 行需按月归档 | 🟡 backlog 已记 | 实际 `wc -l` = **1057** 行；按月归档确为 backlog | ⚠️ 数字微差 | 改 1057 或写「~1060 行」 |
| quality:release 被 lint debt 阻断 | 🟡 分批清退中 | TODO-BACKLOG-LONG-TERM.md L15 原话一致 | ✅ 准确 | — |

## 8. 开发命令表

对照根 package.json scripts：`core:dev` ✅、`nexus:dev` ✅、`lint` ✅、`typecheck` ✅、`test:targeted` ✅、`quality:pr` ✅、`build:release:mac` ✅——全部存在，判定准确。

---

## 必须修正项汇总

**事实性错误（必须改）**
1. **Electron 版本**：`40.0.0+` / `Electron 40` → `^41.10.1`（根 package.json）。
2. **任务表优先级 5 处**：search-crossplatform-audit P0→P2；migrate-search-index-split-write-paths P0→P1；unify-ota-update-flow P1→P2；harden-app-icon-self-healing P1→P2；fix-file-index-update-redaction-476 P3→P2。
3. **任务状态 3 处夸大**：base-anchor-liquid-animation「已全部修复」、bilingual-whats-changed「已落地」均为 in_progress 且 AC 未勾选；optimize-clipboard-plugin 实为 P1/planning 未开始。
4. **P0 父任务遗漏**：07-09-audit-search-system-architecture（全仓唯一 P0）未出现在任务表；另漏 16 个活跃任务（见 §3），需补齐或注明「节选」。
5. **packages 目录漏 3 个**：intelligence-uikit、tuff-analyse、tuff-cli-core。
6. **plugins 数量**：22 → 24。
7. **里程碑 07-30 行**：CHANGES.md 无此节，任务仍 in_progress，删除或移表。
8. **里程碑 07-27 行内容张冠李戴**：实际为 Everything 证据/app-icon/beta.19 Gate E/OTA lifecycle；BaseAnchor、双语日志、插件审计均不在 CHANGES。
9. **里程碑 07-17 行**：OTA lifecycle 实际属 07-27；07-17 仅 storage hydration gate。
10. **风险表 B1/B2**：均已修复（07-13-fix-ranking-dead-features），非「待修」。

**建议修正项（提升准确性）**
11. R2 风险描述收窄：签名/公证已闭环，残余为 Universal/dir-updater 冲突（#311）。
12. Nexus 性能里程碑「98.5% 收口」→「~98.5% active，等 deployed preview 证据」。
13. 07-13 行「文档 SoT 收敛」移至 07-16 行。
14. CHANGES.md 行数 1058 → 1057。
15. R9 行可选注明 R9.2 ContextHygiene P0/P1 已完成。
