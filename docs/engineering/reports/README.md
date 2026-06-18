# Engineering Reports Hygiene

> 更新时间：2026-06-18
> 定位：工程报告、盘点、审计输出与 evidence 产物的提交边界。入口说明见 `../README.md`。

## 提交边界

可以提交：

- 摘要报告、审计结论、迁移记录与人工可复核说明。
- evidence manifest、checklist、strict verify / readiness 输出与退出码。
- 最终可复核截图、录屏、JSON capture 或必要 DOM snapshot。
- 能解释 evidence 来源、限制和后续 blocker 的 `README.md` / `REPORT-HYGIENE.md`。

默认不提交：

- 调试日志、进程 pid、临时 stdout/stderr mirror。
- `*-probe-output.json`、`*-capture-output.json`、`*-dom-probe-output.json` 等命令输出镜像。
- 重复阶段截图，例如 `*-before-input.png`、`*-after-input.png`。
- stale CDP target dump、失败探索 probe、中间临时 profile 记录。
- 不能作为验收 evidence 的本地 raw 产物。

## 目录约定

- 每个新 evidence 报告优先建独立目录，例如 `coreapp-visible-ai-stable-2026-06-18/`。
- 顶层目录只保留 curated 产物；raw/debug 放入同目录 `raw/` 或 `_local/`。
- `raw/` 与 `_local/` 已由仓库 `.gitignore` 排除，适合保留本地调试材料。
- 已经进入 Git index 的历史 raw 文件不会被 `.gitignore` 自动移除；需要单独 review 后执行 `git rm --cached <path> [...]`。
- 不在采集 evidence 时顺手批量删除历史报告；先生成候选清单、确认 keep set，再做 reviewed cleanup。

## Reviewed Cleanup 流程

1. 列出报告目录下 manifest/checklist/README 明确引用的 keep set。
2. 生成非 keep 候选清单，并按 raw/debug/duplicate/failed-probe 分类。
3. 确认候选不被当前 manifest、checklist、README 或矩阵引用。
4. 对已 tracked raw 使用 `git rm --cached` 移出索引，保留本地文件。
5. 将本地 raw 文件移动到同目录 `raw/` 或 `_local/`。
6. 复跑最小验证：manifest JSON parse、artifact existence、关键 PNG `file`、strict verify、`git diff --check`。
7. 在对应报告目录 `REPORT-HYGIENE.md` 和 `docs/plan-prd/01-project/CHANGES.md` 记录结果。

## 当前盘点

截至 2026-06-18，本目录约 27 MB，包含 19 个报告子目录和 13 个顶层文件（含本 README）。当前不做全局批量 cleanup，只把后续规则固定下来。

| 路径 | 文件数 | tracked | ignored entries | 大小 | 处理建议 |
| --- | ---: | ---: | ---: | ---: | --- |
| `archive/` | 3 | 3 | 0 | 40K | 保持归档。 |
| `clipboard-polling-stress-2026-03-24T14-28-47-073Z/` | 1 | 1 | 0 | 4.0K | 保持摘要。 |
| `clipboard-polling-stress-2026-03-24T14-29-51-167Z/` | 1 | 1 | 0 | 4.0K | 保持摘要。 |
| `clipboard-polling-stress-2026-03-24T14-37-31-316Z/` | 1 | 1 | 0 | 4.0K | 保持摘要。 |
| `clipboard-polling-stress-2026-03-24T14-38-09-212Z/` | 1 | 1 | 0 | 4.0K | 保持摘要。 |
| `coreapp-visible-ai-stable-2026-06-18/` | 86 | 16 | 1 | 2.8M | 已 reviewed cleanup；curated 顶层 + ignored `raw/`。 |
| `coreapp-visible-assistant-2026-05-21/` | 7 | 7 | 0 | 17M | 大截图目录，后续如需瘦身先确认 README 引用。 |
| `coreapp-visible-browser-smoke-2026-05-17/` | 3 | 2 | 1 | 36K | 保持；已有 ignored local/raw 项。 |
| `coreapp-visible-electron-dev-capture-2026-05-17/` | 1 | 1 | 0 | 4.0K | 保持摘要。 |
| `coreapp-visible-evidence-2026-05-17/` | 28 | 28 | 0 | 860K | 历史 visible evidence；若清理需单独 keep-set review。 |
| `coreapp-visible-evidence-2026-05-18/` | 1 | 1 | 0 | 4.0K | 保持说明。 |
| `startup-dev-runs-2026-03-24/` | 61 | 41 | 1 | 2.2M | 历史 benchmark；后续可 review 是否只保留汇总 + selected runs。 |
| `startup-dev-runs-2026-05-16/` | 31 | 21 | 1 | 1.2M | 历史 benchmark；后续可 review 是否只保留汇总 + selected runs。 |
| `startup-packaged-cold-runs-2026-05-17/` | 41 | 21 | 1 | 1.1M | 历史 benchmark；后续可 review 是否只保留汇总 + selected runs。 |
| `startup-packaged-hot-runs-2026-03-24/` | 31 | 21 | 1 | 84K | 历史 benchmark；低体量，暂不处理。 |
| `startup-packaged-hot-runs-2026-05-17/` | 85 | 47 | 1 | 1.8M | 历史 benchmark；后续可 review 是否只保留汇总 + selected runs。 |
| `startup-packaged-hot-runs-2026-05-17-open/` | 7 | 5 | 1 | 28K | 保持。 |
| `startup-packaged-hot-runs-2026-05-17-open-a/` | 5 | 4 | 1 | 20K | 保持。 |
| `startup-packaged-hot-runs-2026-05-17-preflight/` | 4 | 3 | 1 | 16K | 保持。 |

## 后续优先级

- P1：仅当继续压缩 reports 时，先 review `coreapp-visible-assistant-2026-05-21/` 的大截图 keep set。
- P2：startup benchmark 目录可改为“汇总 + selected runs + raw ignored”的模式，但需单独确认。
- P3：顶层旧报告文件体量小，暂不做迁移，避免破坏历史链接。
