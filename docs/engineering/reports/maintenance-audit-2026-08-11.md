# 维护审计：需处理项（2026-08-11）

仅记录仍需动作的问题。任务状态、责任人与验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-10 审计](./maintenance-audit-2026-08-10.md) 作为当前问题索引，不建立第二套全局优先级。

## 失败验证与人工证据

- **Windows Everything 严格发布验收仍缺 manifest** — `printf '' | corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 以退出码 `1` 结束，诊断为 `Unexpected end of JSON input`。这是缺少采集输入，不是已提交 manifest 的回归。需在交互式 Windows 打包 CoreBox 采集普通、`@file`、结构化筛选的结果/空态/降级态，写入 manifest 后重跑严格校验。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **文档质量总门禁仍失真** — #1254 已在基线复现 `docs:verify` 的 142 项失败，其中 `DOC-TASK-META` 125 项；CI 因而不能区分新增文档损坏。今日直接链接审计覆盖 602 份文档、868 条相对链接且为 0 finding，不能替代总门禁。workflow owner 需决定：只对有意义状态强制 task meta，或修复 task 创建器并回填现存记录。跟踪：[#1254](https://github.com/talex-touch/tuff/issues/1254)。
- **OTA、图标自愈与发布日志仍缺真实主机 N+1 证据** — 当前静态或本地证据不能替代 Windows/Linux OTA handoff/recovery/health、官方 attested macOS N+1 图标 real-profile smoke，以及 release-notes Electron desktop/narrow 截图。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)、[#310](https://github.com/talex-touch/tuff/issues/310)、[#482](https://github.com/talex-touch/tuff/issues/482)。
- **Windows native OCR 没有可信运行门禁** — Windows 2022 上原生 OCR fixture 实测识别为空，且此前无 Windows job 运行该路径；语言包缺失已排除，当前 fixture 的硬边点阵字与 Windows OCR 的输入特性冲突。维护者需在“签入预渲染抗锯齿 fixture”与“承认 Windows 跳过该断言”之间决策，并在 Windows 上验证。跟踪：[#1517](https://github.com/talex-touch/tuff/issues/1517)。
- **TuffEx 类型与尺寸审计未闭环** — `audit:types` 仍因 raw `workspace:^` 的 `file:` 安装模型不可运行，需在 CI 验证 tarball 安装路径；`audit:size` 仍超预算（base 29.7 KiB / 16.0，full 465.1 KiB / 330.0），需决定收缩 CSS 或调整经批准的预算。已合并的 exports/readme CI 不覆盖这两项。另，发布声明对 `@vue/reactivity` 存在未声明耦合；默认 pnpm 安装未复现消费者错误，但 `hoist=false` 路径仍须验证后决定是否补同版本 peer。跟踪：[#1555](https://github.com/talex-touch/tuff/issues/1555)、[#1557](https://github.com/talex-touch/tuff/issues/1557)。

## 数据库、发布与跨平台门禁

- **Drizzle 迁移快照基线断裂** — journal 已到 `0037`，快照仅存至 `0014` 且 `0011`/`0012` 也缺失；直接 `db:generate` 会重提既有表，生成 SQL 不可提交。现有 preflight 已阻止误用；仍需维护者选择“重建历史快照”或“以当前 schema 新建基线”，并在决策后加最高 snapshot/journal 一致性门禁。跟踪：[#1303](https://github.com/talex-touch/tuff/issues/1303)。
- **搜索分库发布叙述未收敛** — `TODO.md` 已正确写明 `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认开启、`=0` 为回退；迁移任务 PRD 与搜索审计 backlog 仍写默认关闭/flag-on 前置，不能据此做 release-ready 判断。更新任务事实后，仍需一次隔离 CoreApp 实跑证明首启重建、app/file 计数与结果一致、`search-index.db` 已填充、无 WAL/busy 风暴，并验证 `=0` 回退。跟踪：[#1107](https://github.com/talex-touch/tuff/issues/1107)。
- **索引大目录风险缺量化闭环** — 扫描、client 累积与 reconciliation 的原结构问题已改为有界流式，不能再按旧报告称其未修；但百万级受控 fixture、三层峰值内存预算、取消/关机释放、批次边界正确性和打包应用响应性均未验收。跟踪：[#480](https://github.com/talex-touch/tuff/issues/480)。
- **SQLite 可变域没有统一所有权收敛** — search-index 域已有 guard；下载、推荐、应用索引、分析、更新、Sentry、剪贴板等写入仍缺 owner map、统一 admission/retry 与真实锁竞争、恢复、关机证据。跟踪：[#351](https://github.com/talex-touch/tuff/issues/351)。
- **macOS 支持架构仍需产品决策** — 当前产物只支持 `darwin/arm64`。需明确 arm64-only 并在下载/OTA 显式拒绝不支持架构，或交付 x64/Universal 的签名、公证、manifest、选择逻辑与真机矩阵。跟踪：[#311](https://github.com/talex-touch/tuff/issues/311)。

## 安全与授权决策

- **renderer/plugin 到本地执行的链仍未切断** — 已收紧 shell sink、临时路径，并在 #915 修复 dotted permission-id 的 fail-open；但 raw `ipcRenderer` bridge 与 plugin channel default-deny/allowlist 仍未完成，CSP 仍保留 `unsafe-eval` 和宽泛连接策略。按追踪项顺序先收紧 plugin channel，再移除 raw bridge；不得把 #915 的单点修复误报为链路关闭。跟踪：[#838](https://github.com/talex-touch/tuff/issues/838)。
- **scene asset 是确认的跨租户读取缺口，但修复需要数据模型决策** — 读取端无 owner/scope 校验，创建端丢弃调用者身份，既有 asset 也没有 owner。需决定把归属落到对象元数据/治理记录还是持久化 run，及历史资产 fail-closed 还是临时兼容；未作该决策前，不能用空检查伪造修复。跟踪：[#898](https://github.com/talex-touch/tuff/issues/898)。

## 任务记录、生成文件与人工复核

- **Trellis 任务元数据与进度可信度不足** — 86 个活跃任务中大量 `in_progress`/`planning` 记录仍没有完整 `meta.blocker`、`meta.nextAction`、`meta.evidence`，且 23 个任务至少一份 `implement.jsonl` 或 `check.jsonl` 只保留 `_example`。优先修复 producer 或限定门禁适用状态，禁止用占位文本回填；#1254 与 #309 是同一信号质量问题的跟踪入口。
- **实质性陈旧的进行中任务需负责人处置** — `07-17` Windows Everything、`07-22` OTA one-click、`07-24` icon self-healing、`07-26` beta.23 安装、`07-27` BaseAnchor/发布日志/plugin-folder、`07-28` TuffEx docs、`07-29` macOS screenshot core 均逾一周无终态 task outcome。逐项补可复验事实、明确 blocker，或退回 planning/归档；不要保持无证据的 `in_progress`。
- **明确功能/验收缺口不能靠任务状态掩盖** — BaseAnchor 共享 drip/bead 引擎及视觉/交互验收未完成；plugin-folder action 尚未证明能打开已安装插件根目录并给出用户可见失败反馈；发布日志仍需先恢复 `actionlint` 再采集桌面/窄窗截图。它们必须各自具备实现与运行验收，而非只保留任务标题。
- **可同步包元数据仍漂移** — `scripts/sync-core-package.mjs` 选择的字段中，root `package.json` 缺 `homepage`，而 `apps/core-app/package.json` 为 `https://tuff.tagzxia.com`；其余选定字段一致。package metadata owner 需指定规范值后受控同步，审计不直接改写 manifest。
- **并行工作树需人工归属复核** — 当前工作树有 43 个未提交改动，包含源文件删除。合并、发布或全量验证前，负责人必须核对每项改动的归属、删除意图与覆盖验证；本次仅提交审计文档。
