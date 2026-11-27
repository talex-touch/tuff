# Tuff 项目综合路线图

> 更新时间：2026-11-27（基线校准记录见冻结任务 [`07-30-docs-roadmap-consolidation-cleanup`](docs/engineering/workflow/backlog.md#07-30-docs-roadmap-consolidation-cleanup)；全新长期架构基线见 [`roadmap-brand-new.md`](roadmap-brand-new.md)）
> 2026-10-03：工作流切换为 Comet Native，原「活跃任务」表改为冻结记录，只读保留。
> 定位：项目全貌一览。执行顺序见 [`docs/plan-prd/TODO.md`](docs/plan-prd/TODO.md)；当前工作以用户确认的范围与验收、现有 PRD、工程规格、真实运行证据和当前负责人交接为准；切换前的任务已冻结，见 [`docs/engineering/workflow/backlog.md`](docs/engineering/workflow/backlog.md)。`docs/comet/` 只读保留退出前记录，不作为实时状态。本文不复制易漂移细节，只保留稳定入口与高层状态。

## 🎯 当前版本：v2.4.15-beta.14

| 维度 | 状态 |
|------|------|
| CoreApp 版本 | `2.4.15-beta.14`（`apps/core-app/package.json` 与根 `package.json`） |
| Node.js | `>=26.0.0`（`.node-version` / 根 `package.json`） |
| pnpm | `11.24.0`（根 `package.json` `packageManager`） |
| Electron | `^41.10.6`（根 `package.json` 与 `apps/core-app/package.json`） |
| TuffEx | `0.9.5`（`packages/tuffex/package.json`，含 `tuffex-core` / `tuffex-react` / `tuffex-wc` 多框架包） |
| 当前执行窗口 | 两周稳定化 + 3.0 内核与能耗演进（详见 [`docs/plan-prd/TODO.md`](docs/plan-prd/TODO.md) 与 [`3.0-runtime-and-energy-decision-2026-10-21.md`](docs/engineering/reports/3.0-runtime-and-energy-decision-2026-10-21.md)） |

---

## 📋 产品路线图（R0–R9）

历史 R0–R9 实施路线在 [`docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md`](docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md)；全新长期阶段门禁（G0–G7）见 [`roadmap-brand-new.md`](roadmap-brand-new.md)。

| 阶段 | 主线 | 状态 |
|------|------|------|
| **R0** | 稳定化与口径清理 | ✅ Usage 单写、Nexus sync 原子批、Trellis 任务收敛、文档质量 CI 门禁均已完成 |
| **R1** | Release Integrity | 🔄 beta.19 strict Gate E 通过；macOS 归档防覆盖与缓存对齐（PR `#2318`）、P0 `chokidar-fsevents` asar 校验（PR `#2325`）、Rust 工具链锁版与 `Protocol` 必检门禁（PR `#2321`）已落地；stable 独立复核 + OTA lifecycle 真机验收开放 |
| **R2** | AI 2.5.0 Stable | 🔄 historical 13/13 surfaces passed；Herdr Space / 统一 ACP 多 CLI 宿主 / Pi 轮中 steering 与启动自动恢复（PR `#2254`/`#2282`/`#2288`–`#2292`/`#2308`/`#2314`）已合入；current-version recapture 开放 |
| **R3** | Search / Indexing Runtime | 🔄 ~74% 完成；split 打包 62/62 实跑（`v2.4.15-beta.13`，PR `#2273`/`#2278`）、A10/A14–A16/A18 减容与 8 GiB 上限、Windows Everything CI `26/26`（PR `#2319`，run `45913177460`）已落地；真实 profile SQLite/FTS 与 `scan_progress` 迁移证据、Windows strict acceptance manifest 回填（`#308`）开放 |
| **R4** | QuickOps 产品化 | 🔄 OmniPanel 基础能力与功能门控已合入；番茄钟/清洁屏幕/app quit cleanup 开放 |
| **R5** | Plugin Trust Boundary | 🔄 权限 surface fail-closed、Widget 沙箱、零执行 npm 插件生态（PR `#2287`）与主进程响应头强制渲染层 CSP（PR `#2320`，关闭 `#689`）已落地；secret cleanup UX 与第三方插件全生命周期闭环开放 |
| **R6** | UI / TuffEx | 🔄 TuffEx `0.9.5` + 多框架包体系（PR `#2315`）、TDS M0–M3 单源令牌/OpenUI/L1 画布（PR `#2316`）、顶栏舞台操作收敛（PR `#2317`）与 CoreApp 对话框收敛（PR `#2253`）已落地；visual smoke 恢复与实机交互验收开放 |
| **R7** | Nexus Governance | 🔄 Provider Registry 简化、Admin Console 13/16 迁移、Nuxt 4.5.2 / unhead 3 升级（PR `#2321`，关闭 `#1098`）、文档全量 SSR 与 Worker 预算 CI 阻断门禁（PR `#2230`/`#2255`/`#2265`/`#2274`）已落地；最终 `--require-deployed-preview` 凭据采集门禁开放 |
| **R8** | i18n / Domain Lexicon / Catalog 2.6.0 | ⏸️ domain-lexicon 产品触发暂停；`09-13-voice-provider-cloud-pack` scoped extension 已合入主线（`ad49febb0`），生产签名配置与付费调用验收开放 |
| **R9** | AI 2.5.x 后续 | ⏸️ 暂停；知识检索/本地 GGUF/ASR 保留路线（R9.2 ContextHygiene P0/P1 已完成） |

---

## 🔥 当前两周执行优先级

来源：[`docs/plan-prd/TODO.md`](docs/plan-prd/TODO.md)

1. **关闭已验证的 release 和 runtime blocker** — OTA、macOS release-evidence、application-icon acceptance
2. **完成搜索和跨平台修复** — Windows Everything acceptance manifest 回填（hosted CI 已于 PR `#2319` / run `45913177460` 26/26 通过）、search-index split 剩余 R9 写者与真实 profile 迁移证据（flag 自 `cd39bdbf6` / 2026-08-05 起默认 **on**，`v2.4.15-beta.13` 打包 62/62 已通过）
3. **继续其余独立工作** — 3.0 内核进程化/空闲预算/渲染能耗打包复测，以及冻结任务先与用户重新确认范围和验收，再核对现有 PRD、工程规格与真实运行证据，并与当前负责人确认交接

### 安全门禁（不可绕过）

- `TUFF_DB_SEARCH_SPLIT_ENABLED` 自 `cd39bdbf6`（2026-08-05）起默认 **on**，2d.3 write-path 迁移与之同批落地；`TUFF_DB_SEARCH_SPLIT_ENABLED=0` 是回退到共享文件拓扑的应急开关，不是安全默认值
- 不把 local mock/dry-run/preflight/focused test 写成生产完成
- SQLite 是本地 SoT；JSON 只允许作为密文同步载荷

---

## 🧊 迁移前冻结任务（部分，本表 16 个）

2026-10-03 起项目工作流切换为 Comet Native。下表保留切换前活跃任务里的产品线索，**均已冻结，不是进行中的工作**：`冻结时状态` 是切换那一刻 `task.json` 的原值，备注是此前的产品状态摘要，二者之后都不再更新。恢复其中任何一项，先读冻结记录与交接证据，与用户重新确认范围和验收，再核对现有 PRD、工程规格与真实运行证据，并与当前负责人确认交接。父子任务缩进展示。

> **这张表不是全集。** 冻结任务共 170 项（`in_progress` 99、`planning` 71），本表收录 16 项；每项的 owner、下一步、blocker 与证据见 [`docs/engineering/workflow/backlog.md`](docs/engineering/workflow/backlog.md)，全部旧任务（含已归档）的身份见 [`retired-task-index.json`](docs/engineering/workflow/retired-task-index.json)。已完成并归档的任务不列在这里。

| 任务 | 优先级 | 冻结时状态 · 备注 |
|------|--------|------|
| [audit-search-system-architecture](docs/engineering/workflow/backlog.md#07-09-audit-search-system-architecture) | **P0** | 🧊 `planning` · [3/7]：搜索架构审计与整改父任务 |
| └ [unify-search-provider-lifecycle](docs/engineering/workflow/backlog.md#07-09-unify-search-provider-lifecycle) | P2 | 🧊 `planning` |
| [optimize-core-utility-plugins](docs/engineering/workflow/backlog.md#07-27-optimize-core-utility-plugins) | P1 | 🧊 `planning` · [0/3] |
| ├ [optimize-intelligence-plugin](docs/engineering/workflow/backlog.md#07-27-optimize-intelligence-plugin) | P1 | 🧊 `planning` |
| └ [optimize-translation-plugin](docs/engineering/workflow/backlog.md#07-27-optimize-translation-plugin) | P1 | 🧊 `planning` |
| [search-crossplatform-audit](docs/engineering/workflow/backlog.md#07-13-search-crossplatform-audit) | P2 | 🧊 `planning` · 审计父任务 [1/3]；活审计见 [search-crossplatform-audit.md](docs/engineering/reports/search-crossplatform-audit.md) |
| ├ [windows-everything-productionization](docs/engineering/workflow/backlog.md#07-17-windows-everything-productionization) | P1 | 🧊 `in_progress` · backend gate passed，packaged UI manifest 开放 |
| └ [migrate-search-index-split-write-paths](docs/engineering/workflow/backlog.md#07-28-migrate-search-index-split-write-paths) | P1 | 🧊 `planning` · flag 默认 on（`cd39bdbf6`），剩余 writer 归属待收口 |
| [unify-ota-update-flow](docs/engineering/workflow/backlog.md#07-17-unify-ota-update-flow) | P2 | 🧊 `planning` · OTA lifecycle 落地 [4/6]；host acceptance 开放 |
| ├ [ota-one-click-background-update](docs/engineering/workflow/backlog.md#07-22-ota-one-click-background-update) | P2 | 🧊 `in_progress` |
| └ [bilingual-whats-changed](docs/engineering/workflow/backlog.md#07-27-bilingual-whats-changed) | P2 | 🧊 `in_progress` |
| [harden-app-icon-self-healing](docs/engineering/workflow/backlog.md#07-24-harden-app-icon-self-healing) | P2 | 🧊 `in_progress` · real-profile evidence ready；N+1 release 开放 |
| [install-launch-v2-4-13-beta-23](docs/engineering/workflow/backlog.md#07-26-install-launch-v2-4-13-beta-23) | P2 | 🧊 `in_progress` · 本地安装记录，原未纳入版本控制；状态存疑，见冻结记录 |
| [fix-plugin-folder-button](docs/engineering/workflow/backlog.md#07-27-fix-plugin-folder-button) | P2 | 🧊 `in_progress` |
| [docs-roadmap-consolidation-cleanup](docs/engineering/workflow/backlog.md#07-30-docs-roadmap-consolidation-cleanup) | P2 | 🧊 `planning` · 2026-07-31 本路线图的校准任务 |
| [expose-plugin-search-sdk](docs/engineering/workflow/backlog.md#07-27-expose-plugin-search-sdk) | P3 | 🧊 `planning` |

完整冻结清单 → [`docs/engineering/workflow/backlog.md`](docs/engineering/workflow/backlog.md)

---

## 🏗️ 架构概览

```text
talex-touch/
├── apps/
│   ├── core-app/              # Electron 主产品（Main + Renderer + Utility Kernel）
│   ├── nexus/                 # Nuxt 4 文档站 + Store + Dashboard + API
│   ├── tuff-analyse/          # 内部分析面板
│   ├── reverse-proxy-design/  # 反代设计发布
│   ├── browser-connector/     # 浏览器扩展连接器
│   └── screenshot-acceptance/ # 截图验收工具
├── packages/
│   ├── tuffex/                # Vue 3 组件库（0.9.5）
│   ├── tuffex-core/           # 跨框架组件核心
│   ├── tuffex-react/          # React 组件绑定
│   ├── tuffex-wc/             # Web Components 绑定
│   ├── tuff-business/         # 业务逻辑层
│   ├── tuff-intelligence/     # AI 能力与 ACP SDK
│   ├── intelligence-uikit/    # AI UI 组件套件
│   ├── pi-desktop-reuse/      # Pi 桌面运行时复用层
│   ├── pi-extension-tuff/     # Pi Tuff 扩展桥接
│   ├── tuff-voice/            # 语音能力包
│   ├── tuff-cli/              # CLI 工具
│   ├── tuff-cli-core/         # CLI 核心
│   ├── tuff-native/           # 原生模块（OCR / 截图 / 音频 / Everything / 翻译）
│   ├── utils/                 # 共享工具与 Typed Transport
│   ├── test/                  # 跨包集成测试套件
│   └── unplugin-export-plugin/# 构建插件
├── plugins/                   # 官方与示例插件（41 个）
└── scripts/                   # 构建/发布/门禁/验证脚本
```

### 技术栈

- **桌面**: Electron 41 + Vue 3.5 + Pinia + WebContentsView（浏览器工作区）
- **Web**: Nuxt 4.5 + UnoCSS + Nuxt Content（全量 SSG 正文）
- **数据库**: Drizzle ORM + LibSQL（`@libsql/client@0.18.0`，本地）+ Cloudflare D1（Nexus）
- **原生**: `@talex-touch/tuff-native`（Rust/ObjC/C++ N-API：OCR / 截图 / 音频 / Everything / 翻译）
- **AI**: Pi Agent Core (`@earendil-works/pi-agent-core`) + ACP 多 CLI 宿主 + LangChain + OpenAI-compatible / Ollama
- **构建**: pnpm 11 workspace + Vite 7/8 + electron-builder 26
- **部署**: Cloudflare Pages + Workers（Nexus）/ Electron 签名公证与受控 OTA（CoreApp）

---

## 📊 已完成关键里程碑（近 30 天）

来源：[`docs/plan-prd/01-project/CHANGES.md`](docs/plan-prd/01-project/CHANGES.md)（完成事实唯一 SoT）

| 日期 | 里程碑 |
|------|--------|
| 11-26 | Windows Everything 托管门禁 `26/26` 全绿（PR `#2319`，run `45913177460`）；P0 `chokidar-fsevents` asar 回归修复（PR `#2325`）；TDS M0–M3 单源令牌与 L1 画布（PR `#2316`）；Nuxt 4.5.2 / Rust `1.100.0` / `Protocol` 必检门禁（PR `#2321`）；3.0 Phase 2 空闲预算协调器（PR `#2322`）；主进程响应头强制 CSP（PR `#2320`）；macOS 归档防覆盖与缓存对齐（PR `#2318`）；顶栏舞台操作整合（PR `#2317`） |
| 11-23 ~ 11-25 | TuffEx 多框架包与 Nexus 框架切换器（PR `#2315`）；Herdr Space / ACP 多 CLI 持久宿主 / 零执行 npm 插件生态（PR `#2282`–`#2314`）；`v2.4.15-beta.13` 打包实测（冷启动 `3,429 ms`、split `62/62`、macOS 截图真实捕获，PR `#2273`/`#2278`）；3.0 Phase 1 可选 `utilityProcess` 搜索内核与 Phase 3 渲染后台停帧（PR `#2279`–`#2281`） |
| 11-18 ~ 11-22 | Nexus 真 SSG 全量正文恢复、Worker 预算 CI 阻断与线上 `tuff.tagzxia.com` 8/8 路由采证（PR `#2230`/`#2255`/`#2265`/`#2274`）；`omp` ACP 接入（PR `#2254`）；CoreApp 对话框收敛至 TuffEx（PR `#2253`）；A14–A16/A6/B1/E2/E3/E5 搜索与索引可靠性修复（PR `#2247`–`#2250`/`#2267`/`#2268`） |
| 10-20 ~ 11-15 | 3.0 运行时与能耗决策定案；`search-index.db` 8 GiB / 2% 上限与容量模式淘汰（A18）、整数 `doc_id` 倒排（A10，−81.8%）、增量回收与读 worker 下沉；Nexus 发布说明自动同步（PR `#2213`/`#2214`）与 2.5.2 浏览器工作区 Phase 2 打磨 |

---

## 📖 文档导航

| 想了解… | 看这里 |
|---------|--------|
| 当前两周做什么 | [`docs/plan-prd/TODO.md`](docs/plan-prd/TODO.md) |
| 全新长期产品与架构路线（G0–G7） | [`roadmap-brand-new.md`](roadmap-brand-new.md) |
| 历史实施路线图（R0–R9） | [`docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md`](docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md) |
| 3.0 运行时选型与能耗路线 | [`docs/engineering/reports/3.0-runtime-and-energy-decision-2026-10-21.md`](docs/engineering/reports/3.0-runtime-and-energy-decision-2026-10-21.md) |
| 当前工作与交接 | 用户确认的范围与验收、现有 PRD、工程规格、真实运行证据和当前负责人交接；入口见 [`docs/engineering/README.md`](docs/engineering/README.md) |
| 冻结的迁移前任务 | [`docs/engineering/workflow/backlog.md`](docs/engineering/workflow/backlog.md) |
| 已完成事实 | [`docs/plan-prd/01-project/CHANGES.md`](docs/plan-prd/01-project/CHANGES.md) |
| AI 专题 | [`docs/plan-prd/TODO-AI.md`](docs/plan-prd/TODO-AI.md) |
| 搜索/索引专题 | [`docs/plan-prd/TODO-R3.md`](docs/plan-prd/TODO-R3.md) |
| Nexus 性能专题 | [`docs/plan-prd/TODO-nexus.md`](docs/plan-prd/TODO-nexus.md) |
| 长期债务 | [`docs/plan-prd/TODO-BACKLOG-LONG-TERM.md`](docs/plan-prd/TODO-BACKLOG-LONG-TERM.md) |
| 安全交接 | [`docs/engineering/security-hardening-handoff-2026-07-15.md`](docs/engineering/security-hardening-handoff-2026-07-15.md) |
| 工程规范 | [`docs/engineering/README.md`](docs/engineering/README.md) |
| 设计文档 | [`docs/design/README.md`](docs/design/README.md) |
| 全局索引 | [`docs/INDEX.md`](docs/INDEX.md) |
| 架构详解 | [`CLAUDE.md`](CLAUDE.md) |
| 项目 README | [`README.md`](README.md) / [`README.zh-CN.md`](README.zh-CN.md) |

---

## ⚠️ 已知风险与债务

| 类别 | 风险 | 状态 |
|------|------|------|
| **数据安全** | `TUFF_DB_SEARCH_SPLIT_ENABLED` 半迁移状态会导致 silent data loss | ✅ 默认 on 自 `cd39bdbf6`；`v2.4.15-beta.13` 打包 62/62 实跑通过（PR `#2273`/`#2278`），`=0` 仅作应急回退 |
| **搜索** | B1–B10 与 C1–C5、C7（语义写入召回、排序补全、连接泄漏、时间戳、缓存键、对话全扫等） | ✅ 均已修复验证（B1 隔离 PDF/图片闭环，packaged helper 另验；余 B1 派生全列表重排与 C6 Windows PowerShell 依赖开放） |
| **安全与 CI** | 渲染层 CSP（`#689`）、Nuxt 生产审计豁免（`#1098`）与 Rust 工具链/`Protocol` 门禁（`#1794`） | ✅ 已闭环（PR `#2320` 响应头强制 CSP；PR `#2321` 升级 Nuxt 4.5.2/unhead 3 清除 9 条豁免、锁定 Rust `1.100.0` 并启用 `Protocol` 必检门禁） |
| **Windows Everything** | Windows Everything 打包 CoreBox UI 与降级验收（`#308`） | 🔄 PR `#2319`（`6022abdce`）在 `windows-2022` 通过 `26/26`（run `45913177460`，含 SDK 与 unavailable 降级 UI）；余 `#308` 严格 acceptance manifest 补录开放 |
| **代码质量** | `quality:release` 发布门禁与既有 lint 债务 | ✅ 2026-09-13 5/5 段通过并接入发布流水线（PR `#2252` 补齐 `tuff-analyse` lint）；仅余 `apps/core-app` warn 口径收紧债务 |
| **跨平台（R1）** | 原生截图跨平台打包运行验收（`#321` / `#322`） | 🟠 macOS arm64 签名包实测通过（`v2.4.15-beta.13`）；Windows/Linux 打包运行验收与 issue 收口仍开放 |
| **跨平台（R2）** | macOS 跨架构发行与运行验证（`#311`） | 🟡 arm64/x64 已双架构发行且归档覆盖已修（PR `#2318`）；Intel x64 真机运行证据与范围决策仍开放 |
| **搜索（R3）** | 大目录扫描/对账内存峰值（`#318`） | 🟡 traversal 已实测 400k 文件 @ 64 MiB 堆上限通过；reconciliation 分页与持久化落库同类实测仍开放 |
| **跨平台（R8）** | Linux 平台能力与验收成熟度 | 🟠 应用扫描薄弱、无 OCR、更新仅 `openPath`、无独立验收框架，仍开放 |
| **存储（R9）** | SQLite 单写缓解分散与剩余写者收敛 | 🟡 打包 split 62/62 通过，但 AppProvider 尚未迁入 worker typed persistence port，`db/utils.ts` 与真实 profile 迁移证据仍开放 |
| **能耗（R13 / 3.0）** | 3.0 空闲能耗与安装版真实 profile 持续低能耗验收 | 🟠 Phase 0 Metric 1/3、Phase 1 可选 `utilityProcess`（PR `#2279`/`#2280`）、Phase 2 空闲预算（PR `#2322`）、Phase 3 渲染停帧（PR `#2281`）已落地；Phase 0 Metric 2（`sudo powermetrics`）与 `v2.4.15-beta.15` 打包 10 分钟空闲态/真实 profile 持续复测仍开放 |
| **文档治理** | `docs:verify` 断链守卫与 `CHANGES.md` 按月归档 | 🟡 `docs:verify` 已作为 CI 必检阻断断链与发布说明契约；`CHANGES.md` 历史按月归档列长期债务 |

完整审计 → [Search & Cross-Platform Audit](docs/engineering/reports/search-crossplatform-audit.md)

---

## 🔧 开发命令

```bash
pnpm core:dev          # 启动 Electron 开发
pnpm nexus:dev         # 启动 Nexus 文档站
pnpm lint              # ESLint 全量检查
pnpm typecheck         # TypeScript 类型检查
pnpm test:targeted     # 跑聚焦测试套件
pnpm quality:pr        # PR 质量门禁（release notes + lint + test + typecheck）
pnpm build:app --target=mac --type=release # macOS 发布构建
```
