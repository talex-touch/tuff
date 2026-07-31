# 维护审计：需处理项（2026-07-30）

仅记录仍需动作的问题；任务状态、责任人和验收证据以 Trellis 活跃任务树为准。
> 该报告的可行动问题状态已由 [2026-07-31 审计](./maintenance-audit-2026-07-31.md)重新核验；以该报告为当前索引。

## 失败验证与人工证据

- **Windows Everything 发布验收未完成** — `corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 在没有 `--input <manifest>` 时从空 stdin 读取，报 `Unexpected end of JSON input` 并退出 1；脚本的默认行为符合其参数契约，但仓库没有可用的完成清单可供严格验收。需要在 Windows 已打包 CoreBox 中补齐普通、`@file`、结构化筛选、结果/空态/降级态证据，写入清单后运行严格验证。跟踪：#308。
- **OTA 与图标发布证据未闭环** — OTA 仍缺官方可信 macOS 包的静默更新、重启与 health-ack 证据；图标自愈仍缺 N+1 官方证明发布上的真实 profile smoke。两项均不能由本地未签名包替代。跟踪：#326。
- **4 个安全修复仍处于 review** — #296（权限撤销）、#298（插件视图安全默认值）、#299（插件存储/Secret）和 #300（调用者身份）均需独立 review disposition，不能因实现记录存在而关闭。

## 数据库与发布门禁

- **搜索索引分库存在潜在静默数据丢失边界** — `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认关闭；若在余下 provider/embedding 写路径迁移前开启，写入落入 `database.db` 而读取走 `search-index.db`。保持默认关闭；上线前必须完成每个 writer 的 worker 归属、flag-on 应用运行、计数一致性、首启重建和 flag-off 回滚证据。跟踪：#331、#351。
- **迁移准备度未以真实数据库执行** — `search:index-migration:preflight` 是只读命令但必须提供 `--db <sqlite.db>`；当前没有可审计的 real-profile 或隔离 DB preflight 产物。`0034_privacy_retention_indexes` 已记录在 Drizzle journal，相关迁移测试已通过；这不构成运行时数据库 readiness 证据。
- **Rust 截图原生模块缺少干净 CI/打包/加载验收** — 现有发布链不证明 Cargo addon 被构建、复制、打包并被 production loader 加载；缺失时会退化为 `ERR_NATIVE_SCREENSHOT_UNAVAILABLE`。跟踪：#321。
- **macOS 发行范围未决** — Intel/Universal 产物与现有 `dir` 目标/updater 路径仍未统一决策。跟踪：#311。
- **大目录扫描与对账可触发 OOM** — scan worker、client 与 reconciliation 同时物化完整文件集合；百万级目录约三份列表并存。已建 GitHub issue，要求以流式落库与有界内存验收：#480。

## 安全、功能与文档质量

- **预览环境提交可预测凭据占位符** — `wrangler.toml` 的 `[env.preview.vars]` 仍包含 `AUTH_SECRET`、`ADMIN_EMERGENCY_JWT_SECRET`、`ADMIN_CONTROL_PLANE_PEPPER` 占位值。必须移到 Cloudflare secret storage，并以部署门禁拒绝缺失/默认值。跟踪：#475。
- **高权限插件边界审计未完成** — capability、SQLite、隐私、transport、host trust 的可复现实证尚未收齐。跟踪：#302。
- **TuffEx 全量审计已经发现 421 项** — 119 个单元中有 59 high、272 medium、90 low；D4 代码质量占 214 项，包括 82 个逻辑缺陷和 70 个可访问性缺陷。已发布 `tuffex/docs-audit` 问题序列（例如 #383–#474）；medium 批次 m4b–m8 仍待派工，P0 的 59 项虽声称经复核完成，但 113 个 GitHub issue 仍待关闭或按证据驳回。

## 任务与生成物卫生

- **Trellis 上下文清单仍有模板残留** — 14 个活跃/review/planning 任务的 `implement.jsonl` / `check.jsonl` 只有 `_example` 行；应填充真实上下文，或归档不再继续的任务。跟踪：#304。
- **生成包元数据无漂移** — 同步脚本声明的 `version`、`description`、`author`、`homepage`、`license` 中，根包省略 `homepage`，脚本按设计不覆盖 CoreApp 已有值；其余字段一致。无需生成修复。

## Roadmap 同步结论

`docs/plan-prd/TODO.md` 仍是唯一全局顺序来源，且准确保留 release/runtime 证据、Windows/搜索分库与默认关闭门禁。本文仅作可审计问题索引，不另立执行优先级。

## 已执行检查

- `corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` → 退出 1：`Unexpected end of JSON input`（缺少输入 manifest）。
- `corepack pnpm -F @talex-touch/core-app run search:index-migration:preflight -- --help` → 确认必须提供只读 `--db` 路径。
- `corepack pnpm -F @talex-touch/core-app exec vitest run src/main/modules/privacy/retention-migration.test.ts` → 4/4 通过。
