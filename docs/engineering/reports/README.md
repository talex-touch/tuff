# Engineering Reports Hygiene

> 更新时间：2026-06-25
> 定位：工程报告、审计输出与 evidence 产物的提交边界。

## 提交边界

可以提交：

- 摘要报告、审计结论、迁移记录与人工可复核说明。
- evidence manifest、checklist、strict verify / readiness 输出与退出码。
- 最终可复核截图、录屏、JSON capture 或必要 DOM snapshot。
- 能解释 evidence 来源、限制和后续 blocker 的 `README.md` / `REPORT-HYGIENE.md`。

默认不提交：

- 调试日志、进程 pid、临时 stdout/stderr mirror。
- `*-probe-output.json`、`*-capture-output.json`、`*-dom-probe-output.json` 等命令输出镜像。
- 重复阶段截图、失败探索 probe、中间临时 profile 记录。
- Chromium / Electron `user-data`、GPUCache、Cookies、Local Storage、SQLite DB、`.key`。
- 不能作为验收 evidence 的本地 raw 产物。

## 目录约定

- 每个新 evidence 报告优先建独立目录，例如 `coreapp-visible-ai-stable-2026-06-18/`。
- 顶层目录只保留 curated 产物；raw/debug 放入本地 ignored evidence 目录。
- 6 月以前 reports 已移除；后续不再把历史 benchmark 流水账提交进文档树。
- `.gitignore` 已覆盖 `docs/engineering/reports/**/raw/`、`logs/`、`user-data/`、cache/profile/DB/secret 类产物。

## 当前 reports

- `coreapp-visible-ai-stable-2026-06-18/`：AI Stable / visible experience curated evidence。
- `release-integrity-2026-06-22/`：R1 Release Integrity Gate E 真实链路复采证据。
- `r3-indexing-runtime-2026-06-25/`：R3 Search / Indexing Runtime readiness、isolated SQLite/FTS copy simulation、legacy `file_fts` retain policy 与 packaged Settings diagnostics evidence。
- `startup-packaged-hot-runs-2026-06-21/`：packaged hot startup benchmark 摘要与结构化数据。
- `startup-packaged-cold-runs-2026-06-21/`：packaged cold startup benchmark 摘要与结构化数据。
- `native-screenshot-rust-2026-06-21/`：native screenshot Rust 验证摘要。
- `nexus-performance-2026-06-21/`：Nexus performance 当前工作表。

## 复核要求

1. 生成或更新 evidence 后，先确认 manifest/checklist/README 引用的 artifact 存在。
2. raw/log/user-data 必须保存在 ignored 路径。
3. 提交前执行 `git diff --check`。
4. 含 JSON artifact 的报告至少确认 JSON 可解析。
