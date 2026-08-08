# 维护审计：需处理项（2026-08-08）

仅记录仍需动作的问题。任务状态、责任人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-07 审计](./maintenance-audit-2026-08-07.md) 作为当前问题索引，不建立第二套全局优先级。

## 失败验证与人工证据

- **Windows Everything 严格发布验收仍缺 manifest** — `printf '' | corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 仍以退出码 `1` 结束，诊断为 `Unexpected end of JSON input`。这是缺少采集输入，不是已提交 manifest 的回归。需在交互式 Windows 打包 CoreBox 采集普通、`@file`、结构化筛选的结果/空态/降级态，写入 manifest 后重跑严格校验。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA 真实主机闭环缺失** — macOS 官方可信 N+1 包仍缺后台准备、单击、静默替换、自动重启与 health-ack 证据；OTA 父契约还缺 Windows/Linux 的真实 handoff、恢复与 health 证据。静态检查不得替代真实主机运行。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)。
- **图标自愈缺官方 N+1 发布证据** — 本地未签名包不能满足 native trust `pass`；需对官方 attested N+1 包重跑 real-profile smoke。跟踪：[#310](https://github.com/talex-touch/tuff/issues/310)。
- **发布日志缺视觉验收** — Electron desktop/narrow screenshots 仍被 release-build startup guard 阻塞。需在无构建占用时补截图；已关闭的 actionlint 问题不再构成本项。跟踪：[#482](https://github.com/talex-touch/tuff/issues/482)。

## 数据库、功能与跨平台门禁

- **搜索索引分库仍可静默丢数据** — `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认关闭，但环境变量仍可启用半迁移模式：剩余 provider/embedding 写入 `database.db`，读取改走 `search-index.db`。应完成每个 writer 的 worker 归属和 flag-on 应用证据，或在完成前硬禁用运行时开关；不得维持可公开激活的半迁移模式。跟踪：[#331](https://github.com/talex-touch/tuff/issues/331)。
- **SQLite writer ownership 分散** — scheduler、retry、worker、admission 与 observer 的职责尚未收敛，新的写路径可绕过策略。完成 #331 后需建立 owner map、显式窄 bypass 与真实锁竞争/恢复测试。跟踪：[#351](https://github.com/talex-touch/tuff/issues/351)。
- **大目录索引尚无量化发布门禁** — worker、生产 client 与 reconciliation 已改为流式/有界路径，但 #480 仍缺百万项 fixture、明确内存预算、三层峰值测量、取消/关机释放和打包响应性证据。未通过前不能宣称 OOM 风险已完成关闭。跟踪：[#480](https://github.com/talex-touch/tuff/issues/480)。
- **macOS 架构发布策略未决** — 配置当前仅产出 `darwin/arm64`。需明确 arm64-only 并在下载/OTA 中显式拒绝不支持架构，或交付 x64/Universal 的签名、公证、清单、选择逻辑和真机矩阵。跟踪：[#311](https://github.com/talex-touch/tuff/issues/311)。

## 安全与发布治理

- **Nuxt 生产依赖闭包仍含 Critical/High 告警** — `@nuxt/devtools@2.7.0` 低于修复版本，`nuxt@4.4.8` 低于 High 修复版本；升级受 `unhead` 2→3 迁移阻塞。优先评估移除 CoreApp 的 `vue-sonner`，以将 Electron 不需要的 Nuxt build/server 栈移出生产闭包；否则完成全量迁移与 Nexus 回归。跟踪：[#1098](https://github.com/talex-touch/tuff/issues/1098)。
- **Dependabot 告警缺可发布的处置门禁** — #483 尚缺每条告警的处置记录，以及每条 Critical/High 的责任人、目标日期和发布前新 Critical/High 分诊门禁。告警数不是可达性结论；已关闭的 #329 不再作为当前 P0。跟踪：[#483](https://github.com/talex-touch/tuff/issues/483)。
- **renderer/plugin 到本地任意代码执行链仍开放** — CSP 可注入脚本、raw IPC bridge、plugin channel 非 default-deny、shell 执行 sink 与插件安装路径写入可组合为 write-then-execute。应先 default-deny plugin channel 并移除 raw `ipcRenderer` bridge，再收紧 CSP 与 shell sink。跟踪：[#838](https://github.com/talex-touch/tuff/issues/838)。

## 任务记录、生成文件与人工复核

- **Trellis 工作可见性不足** — 79 个活跃任务中，32 个 `in_progress` 与 30 个 `planning` 记录同时缺少 `meta.blocker` 和 `meta.nextAction`；这不是任务失败证据，但无法区分受阻、等待人工证据与正常进行。任务负责人需补充真实下一动作或 blocker，完成后更新/归档状态。
- **工作树隔离风险** — 当前工作树含 42 个未提交改动，包括源文件修改与删除。审计文档已限定为独立提交；任何后续合并、发布或验证前，负责人需复核这些改动的归属、测试状态与删除意图，避免将并行工作误带入。
- **可同步的包元数据漂移** — 根 `package.json` 缺少 `homepage`，而 `apps/core-app/package.json` 为 `https://tuff.tagzxia.com`。按 `scripts/sync-core-package.mjs` 的选择字段，此项不一致；应由拥有 package metadata 的任务决定规范值后运行受控同步，避免审计阶段直接覆盖。
