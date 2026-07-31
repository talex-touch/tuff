# 维护审计：需处理项（2026-07-31）

仅记录仍需动作的问题；任务状态、责任人和验收证据以 Trellis 活跃任务树为准。本报告取代 `maintenance-audit-2026-07-30.md` 作为当前问题索引，不建立第二套全局优先级。

## 失败验证与人工证据

- **Windows Everything 发布验收仍未完成且工作已停滞 11.8 天** — `corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 当前从空 stdin 读取并以 1 退出：`Unexpected end of JSON input`。仓库中没有可用的 Windows acceptance manifest；需在已打包的 Windows CoreBox 补齐普通、`@file`、结构化筛选，以及结果、空态、降级态证据，写入清单后通过严格 verifier。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA 真实主机证据未闭环** — 官方可信 macOS N+1 包的后台准备、单击、静默替换、自动重启与 health-ack 仍缺；OTA 父契约的 Windows/Linux 真机 handoff、恢复与 health 证据也未完成。静态检查不能替代真实主机运行。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)。
- **图标自愈缺官方 N+1 发布证据** — 当前仅有本地未签名包验证；需在官方 attested N+1 发行包上重跑真实 profile smoke，且 native trust 必须为 `pass`。见 `07-24-harden-app-icon-self-healing/prd.md:68`。

## 数据库、资源与发布门禁

- **搜索索引分库存在潜在静默数据丢失边界** — `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` 必须保持默认关闭；余下 provider/embedding 写路径迁移完毕前启用，会使写入仍落在 `database.db` 而读取走 `search-index.db`。上线前必须完成每个 writer 的 worker 归属、flag-on 应用运行、首启重建、计数一致性和 flag-off 回滚证据。跟踪：[#331](https://github.com/talex-touch/tuff/issues/331)、[#351](https://github.com/talex-touch/tuff/issues/351)。
- **真实数据库迁移 readiness 未取证** — `search:index-migration:preflight` 需对可审计的隔离或 real-profile SQLite 文件运行；现有迁移测试不等同运行时数据库 readiness。
- **大目录扫描/对账可 OOM** — worker、client 与 reconciliation 同时保留完整集合；百万级根目录可形成约三份列表。需要有界、背压批次，取消/关闭释放与内存预算验收。跟踪：[#480](https://github.com/talex-touch/tuff/issues/480)。
- **macOS 架构发行范围尚未决策** — 需明确维持 arm64-only，或新增 x64/Universal 及其签名、公证、清单、下载选择和真机矩阵；不得向不支持架构分发不兼容资产。跟踪：[#311](https://github.com/talex-touch/tuff/issues/311)。

## 功能、门禁与文档质量

- **35 个开放 Dependabot 告警未分诊** — GitHub 当前报告 3 critical、15 high、14 medium、3 low；critical 均涉及 Nexus 使用的 `next-auth` / `@auth/core`。其余高危直接或锁文件依赖包括 `sharp`、`postcss`、`fast-uri`、`fast-xml-parser`、`svgo`、`shell-quote`、`js-yaml` 与 `brace-expansion`。需逐项确定可达性、升级/替换策略、回归门禁与例外理由；不得仅按锁文件位置忽略运行时可达依赖。
- **高权限插件审计任务未归档，但其既有 P0/P1/P2 风险均已关闭** — #296–#301 与总跟踪 #302 已 closed；任务 PRD 仍保留未完成的全量能力矩阵、数据流与最终审计产物验收。应补齐或明确归档该审计记录，避免把已关闭问题重复报告为开放安全风险。
- **TuffEx 文档审计未形成可验收终态** — 任务要求覆盖 114 个组件和 118 组双语文档、产出任务内报告并逐项去重立项；当前 `07-28-tuffex-docs-audit` 仍 in-progress，未记录完成报告与验收结果。完成覆盖证明、对抗验证和 issue disposition 后再关闭。

## 生成物与任务卫生

- **14 个活跃/review/planning 任务的 `implement.jsonl` / `check.jsonl` 仅含 `_example` 模板行** — 继续执行的任务应填入真实上下文；已不再继续的任务应归档。代表性任务：Windows Everything、CatalogService、搜索分库迁移与截图子任务。
