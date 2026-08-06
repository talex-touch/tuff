# Tuff 项目综合路线图

> 更新时间：2026-07-31（经全条目事实校准，校准记录见 `.trellis/tasks/07-30-docs-roadmap-consolidation-cleanup/research/`）
> 定位：项目全貌一览。实时任务优先级见 [`docs/plan-prd/TODO.md`](docs/plan-prd/TODO.md)，任务状态见 [`.trellis/tasks/`](.trellis/tasks/README.md)。本文不复制易漂移细节，只保留稳定入口与高层状态。

## 🎯 当前版本：v2.4.14-beta.2

| 维度 | 状态 |
|------|------|
| CoreApp 版本 | `2.4.14-beta.2`（`apps/core-app/package.json`） |
| Node.js | `>=24.15.0` |
| pnpm | `10.34.4` |
| Electron | `^41.10.1`（根 `package.json`） |
| 当前执行窗口 | 两周稳定化（详见 `TODO.md`） |

---

## 📋 产品路线图（R0–R9）

完整路线在 [`docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md`](docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md)。

| 阶段 | 主线 | 状态 |
|------|------|------|
| **R0** | 稳定化与口径清理 | ✅ Usage 单写、Nexus sync 原子批、Trellis 任务收敛均已完成 |
| **R1** | Release Integrity | ✅ beta.19 strict Gate E 通过；stable 独立复核 + OTA lifecycle 开放 |
| **R2** | AI 2.5.0 Stable | 🔄 historical 13/13 surfaces passed；current-version recapture 开放 |
| **R3** | Search / Indexing Runtime | 🔄 ~74% 完成；FileProvider SQLite/FTS durable migration + scan_progress source-scope 待真实 profile evidence |
| **R4** | QuickOps 产品化 | 🔄 番茄钟/清洁屏幕/app quit cleanup 开放 |
| **R5** | Plugin Trust Boundary | 🔄 权限 surface fail-closed；secret cleanup UX + Widget sandbox 开放 |
| **R6** | UI / TuffEx | 🔄 语义控件/keyboard/focus 迁移；visual smoke 恢复开放 |
| **R7** | Nexus Governance | 🔄 Provider Registry/Intelligence Admin 收敛；deployed Cloudflare evidence 开放 |
| **R8** | i18n / Domain Lexicon / Catalog 2.6.0 | ⏸️ 暂停；CatalogService MVP + 完整本地模型待恢复 |
| **R9** | AI 2.5.x 后续 | ⏸️ 暂停；知识检索/本地 GGUF/ASR 保留路线（R9.2 ContextHygiene P0/P1 已完成） |

---

## 🔥 当前两周执行优先级

来源：[`docs/plan-prd/TODO.md`](docs/plan-prd/TODO.md)

1. **关闭已验证的 release 和 runtime blocker** — OTA、macOS release-evidence、application-icon acceptance
2. **完成搜索和跨平台修复** — Windows Everything productionization、search-index split write-path migration（flag 默认 off）
3. **继续其余独立活跃任务** — 按 Trellis task-local PRD 定义的实现顺序

### 安全门禁（不可绕过）

- `DB_SEARCH_SPLIT_ENABLED` 默认 **off**，开启前必须有 flag-on app run evidence
- 不把 local mock/dry-run/preflight/focused test 写成生产完成
- SQLite 是本地 SoT；JSON 只允许作为密文同步载荷

---

## 📁 活跃 Trellis 任务全景（27 个）

优先级与状态以各任务 `task.json` / `prd.md` 为准。父子任务缩进展示。

| 任务 | 优先级 | 状态 |
|------|--------|------|
| [audit-search-system-architecture](.trellis/tasks/07-09-audit-search-system-architecture/prd.md) | **P0** | 🔄 planning [3/7]：搜索架构审计与整改父任务 |
| ├ [scope-search-sessions-and-streams](.trellis/tasks/07-09-scope-search-sessions-and-streams/prd.md) | P1 | planning |
| ├ [gate-search-on-storage-hydration](.trellis/tasks/07-09-gate-search-on-storage-hydration/prd.md) | P1 | planning |
| ├ [establish-single-search-index-writer](.trellis/tasks/07-09-establish-single-search-index-writer/prd.md) | P1 | planning |
| └ [unify-search-provider-lifecycle](.trellis/tasks/07-09-unify-search-provider-lifecycle/prd.md) | P2 | planning |
| [batch-commit-release-v2-4-14-beta-1](.trellis/tasks/07-27-batch-commit-release-v2-4-14-beta-1/prd.md) | P1 | 🔄 planning [1/2] |
| └ [release-v2-4-14-beta-1](.trellis/tasks/07-27-release-v2-4-14-beta-1/prd.md) | P1 | planning |
| [catalog-service-mvp](.trellis/tasks/07-13-catalog-service-mvp/prd.md) | P1 | planning |
| [optimize-core-utility-plugins](.trellis/tasks/07-27-optimize-core-utility-plugins/prd.md) | P1 | 🔄 planning [0/3] |
| ├ [optimize-intelligence-plugin](.trellis/tasks/07-27-optimize-intelligence-plugin/prd.md) | P1 | planning |
| ├ [optimize-translation-plugin](.trellis/tasks/07-27-optimize-translation-plugin/prd.md) | P1 | planning |
| └ [optimize-clipboard-plugin](.trellis/tasks/07-27-optimize-clipboard-plugin/prd.md) | P1 | planning |
| [search-crossplatform-audit](.trellis/tasks/07-13-search-crossplatform-audit/prd.md) | P2 | 🔄 审计父任务 [1/3] |
| ├ [windows-everything-productionization](.trellis/tasks/07-17-windows-everything-productionization/prd.md) | P1 | 🔴 backend gate passed，packaged UI manifest 开放 |
| └ [migrate-search-index-split-write-paths](.trellis/tasks/07-28-migrate-search-index-split-write-paths/prd.md) | P1 | 🔴 flag 默认 off，等待全部 writer 迁移 |
| [unify-ota-update-flow](.trellis/tasks/07-17-unify-ota-update-flow/prd.md) | P2 | 🔄 OTA lifecycle 落地 [4/6]；host acceptance 开放 |
| ├ [ota-one-click-background-update](.trellis/tasks/07-22-ota-one-click-background-update/prd.md) | P2 | 🔄 in_progress |
| └ [bilingual-whats-changed](.trellis/tasks/07-27-bilingual-whats-changed/prd.md) | P2 | 🔄 in_progress |
| [harden-app-icon-self-healing](.trellis/tasks/07-24-harden-app-icon-self-healing/prd.md) | P2 | 🔄 real-profile evidence ready；N+1 release 开放 |
| [install-launch-v2-4-13-beta-23](.trellis/tasks/07-26-install-launch-v2-4-13-beta-23/prd.md) | P2 | 🔄 in_progress |
| [audit-plugin-privileged-security](.trellis/tasks/07-27-audit-plugin-privileged-security/prd.md) | P2 | planning |
| [base-anchor-liquid-animation](.trellis/tasks/07-27-base-anchor-liquid-animation/prd.md) | P2 | 🔄 in_progress（AC 验收中） |
| [fix-plugin-folder-button](.trellis/tasks/07-27-fix-plugin-folder-button/prd.md) | P2 | 🔄 in_progress |
| [tuffex-docs-audit](.trellis/tasks/07-28-tuffex-docs-audit/prd.md) | P2 | 🔄 审计进行中 |
| [fix-file-index-update-redaction-476](.trellis/tasks/07-30-fix-file-index-update-redaction-476/prd.md) | P2 | 🔄 in_progress |
| [docs-roadmap-consolidation-cleanup](.trellis/tasks/07-30-docs-roadmap-consolidation-cleanup/prd.md) | P2 | 🔄 in_progress（本任务） |
| [expose-plugin-search-sdk](.trellis/tasks/07-27-expose-plugin-search-sdk/prd.md) | P3 | planning |

完整列表 → `python3 .trellis/scripts/task.py list`

---

## 🏗️ 架构概览

```
talex-touch/
├── apps/
│   ├── core-app/          # Electron 主产品（Main + Renderer）
│   ├── nexus/             # Nuxt 文档站 + Dashboard + API
│   ├── tuff-analyse/      # 内部分析面板
│   └── reverse-proxy-design/  # 反代设计发布
├── packages/
│   ├── tuffex/            # 组件库（Vue 3）
│   ├── tuff-core/         # 核心运行时
│   ├── tuff-business/     # 业务逻辑层
│   ├── tuff-intelligence/ # AI 能力 SDK
│   ├── intelligence-uikit/# AI UI 组件
│   ├── tuff-cli/          # CLI 工具
│   ├── tuff-cli-core/     # CLI 核心
│   ├── tuff-native/       # 原生模块（OCR 等）
│   ├── tuff-analyse/      # 分析能力包
│   ├── utils/             # 共享工具
│   ├── test/              # 测试套件
│   └── unplugin-export-plugin/  # 构建插件
├── plugins/               # 官方 & 示例插件（24 个）
└── scripts/               # 构建/发布/验证脚本
```

### 技术栈

- **桌面**: Electron 41 + Vue 3.5 + Pinia
- **Web**: Nuxt 4 + UnoCSS + Nuxt Content
- **数据库**: Drizzle ORM + LibSQL（本地）+ Cloudflare D1（Nexus）
- **原生**: @talex-touch/tuff-native（OCR/系统能力）
- **AI**: LangChain + OpenAI-compatible provider + 本地 Ollama
- **构建**: pnpm workspace + Vite + electron-builder
- **部署**: Cloudflare Pages + Workers（Nexus）/ Electron auto-update（CoreApp）

---

## 📊 已完成关键里程碑（近 30 天）

来源：[`docs/plan-prd/01-project/CHANGES.md`](docs/plan-prd/01-project/CHANGES.md)（完成事实唯一 SoT）

| 日期 | 里程碑 |
|------|--------|
| 07-27 | Windows Everything packaged 证据落地；app-icon 自愈；beta.19 strict Gate E 通过；OTA 受控生命周期落地 |
| 07-17 | storage hydration / onboarding gate |
| 07-16 | Trellis 45 任务归档收敛；Nexus sync 原子批量化；usage 单写者修复；文档 SoT 收敛 |
| 07-13 | VoicePanel ASR provider 路由；Intelligence quota fail-closed 端到端 |
| 07-04 | Nexus 性能线 ~98.5% active（PWA precache trim 等本地收口，deployed preview/HAR 证据待补） |

---

## 📖 文档导航

| 想了解… | 看这里 |
|---------|--------|
| 当前两周做什么 | [`docs/plan-prd/TODO.md`](docs/plan-prd/TODO.md) |
| 产品路线图（R0-R9） | [`docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md`](docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md) |
| 实时任务状态 | [`.trellis/tasks/README.md`](.trellis/tasks/README.md) |
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
| **数据安全** | `DB_SEARCH_SPLIT_ENABLED` flag-off 前开启会导致 silent data loss | 🔴 默认 off，待 evidence |
| **搜索** | B1 语义搜索接而未用 | ✅ 已修（延迟召回二段推送）；余 1 项派生 carve-out 开放 |
| **搜索** | B2 completion 加权被 sorter 绕过 | ✅ 已修（46 相关用例通过） |
| **跨平台** | R1 Rust screenshot 模块未接入构建 | 🟠 已审计，开放 |
| **跨平台** | R2 macOS 签名/公证已闭环；残余为 Intel/Universal 产物与 dir/updater 目标冲突（#311） | 🟡 收窄跟进 |
| **文档** | Nexus 663 处断链（多为 `.md`→`.mdc` 扩展名漂移） | 🟡 已盘点，待批修复 |
| **CHANGES.md** | 1057 行，需按月归档 | 🟡 backlog 已记 |
| **代码质量** | `quality:release` 被既有 lint debt 阻断 | 🟡 分批清退中 |

完整审计 → [Search & Cross-Platform Audit](.trellis/tasks/07-13-search-crossplatform-audit/prd.md)

---

## 🔧 开发命令

```bash
pnpm core:dev          # 启动 Electron 开发
pnpm nexus:dev         # 启动 Nexus 文档站
pnpm lint              # ESLint 全量检查
pnpm typecheck         # TypeScript 类型检查
pnpm test:targeted     # 跑聚焦测试套件
pnpm quality:pr        # PR 质量门禁（release notes + lint + test + typecheck）
pnpm build:release:mac # macOS 发布构建
```
