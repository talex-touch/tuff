# 维护审计：需处理项（2026-08-13）

仅记录仍需动作的问题。任务状态、责任人与验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-12 审计](./maintenance-audit-2026-08-12.md) 作为当前问题索引，不建立第二套全局优先级。每项均由本轮命令、任务记录或当前 GitHub issue 重新核验；已关闭的历史实现缺陷不作为当前风险重复列出。

## 失败验证与人工运行证据

- **Windows Everything 的打包交互验收未采集** — `printf '' | corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 以 `1` 退出并报 `Unexpected end of JSON input`；这是无 manifest 输入的严格边界，不是提交证据的回归。仍需在 Windows 打包 CoreBox 采集普通、`@file`、结构化筛选以及结果、空态、降级态；其中结果/空态尚无专用 manifest 字段，须先确定记录载体。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA 与发布 UI 的真实宿主证据未齐** — Windows/Linux 仍缺真实安装 handoff、启动 health/recovery；release-notes 仍缺运行中的 CoreApp 桌面与窄窗口截图。静态检查和 CI 不能替代这些实跑证据。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)、[#482](https://github.com/talex-touch/tuff/issues/482)。
- **本机 `docs:verify` 仍无法启动** — `mise run docs:verify` 在加载 Vitest 前因错误工作区路径 `/Users/talexdreamsoul/Workspace/talex-touch/node_modules/vitest/vitest.mjs` 不存在而失败。直接文档链接审计仍覆盖 602 份源文档、868 条相对链接且为 0 finding；修复本机安装/共享 shim 拓扑后，才能重新取得全量文档门禁证据。[#1564](https://github.com/talex-touch/tuff/issues/1564) 的仓库侧探测器已关闭此类故障的诊断缺口，但当前 checkout 的环境仍需人工恢复。

## 数据库、跨平台与发布门禁

- **search-index 分库任务记录仍与当前运行事实相反** — `TODO.md` 明确 `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认开启、`=0` 为应急回退；`07-28-migrate-search-index-split-write-paths` 的 PRD 与 `meta.blocker` 仍称默认关闭且要求保持关闭。先统一 task PRD/meta 与运行事实，再以隔离 CoreApp 实跑证明首启重建、app/file 计数与查询一致、`search-index.db` 填充、无 WAL/busy 风暴、`=0` 回退有效。未核验 writer 仍是静默数据偏移风险。跟踪：[#1745](https://github.com/talex-touch/tuff/issues/1745)；[#1107](https://github.com/talex-touch/tuff/issues/1107) 仅记录已关闭的历史报告错误。
- **SQLite 写入所有权仍只覆盖一个小域** — 当前 source guard 覆盖 `files`、`fileExtensions`、`keywordMappings` 三表；71 张 schema 表中 59 张在 main 有写入点，剩余 owner registry、admission/retry 合同、锁竞争与关机恢复证据未收敛。跟踪：[#351](https://github.com/talex-touch/tuff/issues/351)。
- **大目录索引仍有条件性单目录 fan-out 峰值** — 流式批处理、背压、分页和临时 seen-path 表已取代旧的全量三份复制；但单目录 `readdir` 仍按目录大小物化，100k 条目实测峰值约 95.7 MiB。默认根目录下当前不可触及该量级，风险会在用户增加大扁平目录或放宽 `node_modules`/`target` 过滤时重新变成运行问题；#318 尚缺 assembled-pipeline persistence/backpressure 与分页/取消的完整证据。跟踪：[#318](https://github.com/talex-touch/tuff/issues/318)。

## 安全门禁

- **Renderer CSP 的强制策略仍保留 `default-src *` / `connect-src *`** — `script-src` 通配符和 `unsafe-inline` 已修，report-only 候选策略与主进程日志上报也已具备；仍需在真实日常使用中检查 `[csp-report-only]`，据指令与 origin 收敛后才能升级为强制策略。`unsafe-eval` 依赖已编译 widget 的字符串执行，移除它需先改为模块加载并替代 scope 注入。host-renderer raw transport 面对注入时仍主要依赖 CSP 边界。跟踪：[#689](https://github.com/talex-touch/tuff/issues/689)。

## 任务记录、生成元数据与文档质量

- **活跃 Trellis 状态不可用于可靠排程** — 当前 `task.py list` 为 86 个活跃任务（41 planning、44 in_progress、1 completed）；44 个 in-progress 中 38 个同时没有 `meta.blocker` 和 `meta.nextAction`，29 个 machine-readable context manifest 仅保留 `_example`。后者是设计模板而不是证据缺口；前者才是需要负责人补齐继续条件、阻塞原因或归档结论的管理问题。跟踪：[#309](https://github.com/talex-touch/tuff/issues/309)。
- **CoreApp 包元数据存在单向漂移** — `version`、`description`、`author`、`license` 与根包一致；根 `package.json` 缺 `homepage`，CoreApp 为 `https://tuff.tagzxia.com`。`sync-core-package.mjs` 仅从根包向 CoreApp 覆盖已定义字段，须由 metadata owner 决定根包是否补为规范源；本审计不直接改写生成元数据。
