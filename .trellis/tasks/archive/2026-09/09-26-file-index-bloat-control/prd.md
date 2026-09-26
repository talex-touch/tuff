# 文件索引减负：排除缓存目录、断点续扫、遗留图标清理协调

## Goal

老板的 dev 索引库 `search-index.db` 已达 9.18 GB，`files` 27.6 万行中 22.2 万行在 `~/go/pkg/mod`（Go 模块缓存）、8 千行在 `~/OrbStack`（VM 挂载）。macOS 的索引根是整个 `$HOME`，全量扫描只在整棵根扫完后才写 `scan_progress`，dev 每次重启都从零开始，一轮跑 20 分钟到 9.5 小时且从未完成；扫描期间主进程事件循环卡顿数秒、读 worker 超时 15 秒，直接拖慢应用搜索。
本任务让索引停止吸入开发缓存、让全量扫描可以从断点继续，并把 base64 图标遗留行的处理交给已有任务。

## Requirements

- R1 遍历排除新增"home 锚定的工具链缓存"规则：`~/go/pkg`（所有平台的 GOPATH 模块缓存/构建产物）与 `~/OrbStack`（darwin）。规则只在紧邻 home 目录的相对位置命中，不做子串匹配。
- R2 `DEV_PATHS` / `CACHE_PATHS` 正则改为按路径段锚定（`/(^|\/)out\//` 形态），修复 `.../src/layout/...`、`.../about/...` 下文件被误判为 development-path 的问题（peer 研究 X3 已用探针证实）。同一套规则被 Spotlight 过滤器复用，属预期；`~/Library/Mobile Documents` 的 iCloud 例外必须保持（不新增 `~/Library/*` 规则）。
- R3 全量扫描按根目录的一级子目录记检查点：每扫完一个子目录就写一条 `scan_progress` 完成记录；重启后同一根下已完成的子目录跳过；根自身的顶层文件在子目录之后扫描；根全部完成后写根记录并清理子目录检查点。中断（signal abort / 退出）不丢已完成的检查点。
- R4 已入库但现在落在排除子树内的行（如 22 万条 go/pkg/mod）需要有界、可中断的清理路径；若现有 reconcile/cleanup 已覆盖则复用并写明触发条件，否则新增按路径前缀分页删除、经写 worker 执行、每页让出事件循环。
- R5 base64 图标遗留行（2.5 GB）不在本任务处理：由 `09-26-bound-indexing-memory-icons`（Issue 1964）负责"有界、可恢复的遗留图标转换，不做数据库删除/VACUUM"。本任务不得对 `file_extensions.icon` 做删除。
- R6 不改 `scan_progress` 表结构；不改变 `FileSystemWatcher` 监听行为；不改变 `~` 作为 darwin 根的决定。

## Acceptance Criteria

- [ ] `file-filter-service` 单测：`~/go/pkg/mod/...` 与 `~/OrbStack/...` 目录返回 `cache-path`/`excluded-path`；`~/Workspace/x/src/layout/a.vue`、`~/Documents/about/team/notes.md` 不再被 DEV_PATHS 误排除；`~/Documents/build/2026` 仍按现有规则处理；`~/Library/Mobile Documents` 行为不变。
- [ ] `file-provider-full-scan-run-service` 单测：根 `/h` 有子目录 `a b c`，`b` 已有检查点 → 只扫 `a c` 与 `/h` 顶层文件；扫完 `a` 后立即写检查点；中途 abort 后已写检查点保留、根未写；全部完成后根写入、子目录检查点删除。
- [ ] 真实 dev 应用：重启后日志 `Starting full scan for new paths` 之后的 `FileProvider.fullScan` 持续时间明显缩短且不再从零；`files` 表不再新增 `~/go/pkg/mod` 行。
- [ ] R4 的清理在真实库上有界运行并能中断恢复（或明确说明由 reconcile 覆盖及其触发时机）。
- [ ] `pnpm -C apps/core-app run typecheck:node`、`packages/utils` 相关 vitest、`addon/files` 相关 vitest 通过；`git diff --check` 干净。

## Notes

- 依赖/协调：`addon/files/**` 与 `utils.ts` 当前由会话 talex-touch-40 的检查 agent 审阅中，收到其 ping 后才能编辑；`packages/utils/common/*` 不在其清单内。
- 不 commit / push。
