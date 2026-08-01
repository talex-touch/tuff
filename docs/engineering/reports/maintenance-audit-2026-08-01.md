# 维护审计：需处理项（2026-08-01）

仅记录仍需动作的问题。任务状态、责任人和验收证据以 Trellis 活跃任务树为准；本报告取代 `maintenance-audit-2026-07-31.md` 作为当前问题索引，不建立第二套全局优先级。

## 失败验证与人工证据

- **Windows Everything 严格发布验收失败且任务停滞** — 2026-08-01 运行 `corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 以退出码 `1` 失败，诊断为 `Unexpected end of JSON input`。需在交互式 Windows 打包 CoreBox 采集普通、`@file`、结构化筛选的结果/空态/降级态证据，写入 acceptance manifest 后重跑 verifier。跟踪：[\#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA 真实主机证据未闭环** — 官方可信 macOS N+1 包仍缺后台准备、单击、静默替换、自动重启与 health-ack 证据；OTA 父契约的 Windows/Linux 真机 handoff、恢复与 health 证据也未完成。静态检查不能替代真实主机运行。跟踪：[\#326](https://github.com/talex-touch/tuff/issues/326)。
- **图标自愈缺官方 N+1 发布证据** — 当前仅有本地未签名包验证；需在官方 attested N+1 发行包上重跑真实 profile smoke，且 native trust 必须为 `pass`。见 `07-24-harden-app-icon-self-healing/prd.md:68`。

## 数据库、资源与发布门禁

- **搜索索引分库存在潜在静默数据丢失边界** — `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` 必须保持默认关闭；余下 provider/embedding 写路径迁移完毕前启用，会使写入仍落在 `database.db` 而读取走 `search-index.db`。上线前必须完成每个 writer 的 worker 归属、flag-on 应用运行、首启重建、计数一致性和 flag-off 回滚证据。跟踪：[\#331](https://github.com/talex-touch/tuff/issues/331)、[\#351](https://github.com/talex-touch/tuff/issues/351)。
- **真实数据库迁移 readiness 未取证** — `search:index-migration:preflight` 需对可审计的隔离或 real-profile SQLite 文件运行；现有迁移测试不等同运行时数据库 readiness。
- **大目录扫描/对账可 OOM** — worker、client 与 reconciliation 同时保留完整集合；百万级根目录可形成约三份列表。需要有界、背压批次，取消/关闭释放与内存预算验收。跟踪：[\#480](https://github.com/talex-touch/tuff/issues/480)。
- **macOS 架构发行范围尚未决策** — 需明确维持 arm64-only，或新增 x64/Universal 及其签名、公证、清单、下载选择和真机矩阵；不得向不支持架构分发不兼容资产。跟踪：[\#311](https://github.com/talex-touch/tuff/issues/311)。

## 安全、功能与文档门禁

- **依赖安全告警需要重新分诊** — 上次审计记录的 Dependabot 告警（含 Nexus 使用的 `next-auth` / `@auth/core`）未有可追踪的处置清单。需在 GitHub Security dashboard 逐项确认当前告警、运行时可达性、升级或豁免理由与回归门禁；不要以锁文件位置替代可达性判断。
- **高权限插件审计未形成终态** — 已关闭的既有 issue 不等于任务验收完成；`07-27-audit-plugin-privileged-security` 尚缺完整 capability/数据流矩阵和最终审计产物。应补齐证据后归档，避免把历史关闭项重复当作开放风险。
- **TuffEx 文档审计未形成可验收终态** — `07-28-tuffex-docs-audit` 要求覆盖 114 个组件与 118 组双语文档、形成 `report.md`、完成对抗验证与 issue disposition；当前仍无该报告及验收记录。完成覆盖证明、去重和用户确认后的 issue 处置。

## 任务卫生

- **28 个非归档任务的 `implement.jsonl` / `check.jsonl` 仍只有 `_example` 模板行** — 包含 Windows Everything、OTA、搜索分库、TuffEx 文档审计及截图子任务。继续执行的任务应填入真实上下文；已暂停或不再继续的任务应归档，避免模板被误作验证记录。
