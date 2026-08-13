# 维护审计：需处理项（2026-08-10）

仅记录仍需动作的问题。任务状态、责任人与验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-08 审计](./maintenance-audit-2026-08-08.md) 作为当前问题索引，不建立第二套全局优先级。

## 失败验证与人工证据

- **文档质量门禁当前不可执行** — `mise run docs:verify` 以退出码 `1` 失败，启动阶段即找不到 `/Users/talexdreamsoul/Workspace/talex-touch/node_modules/vitest/vitest.mjs`；未到达文档诊断。修复本机/CI 所依赖的 workspace 与依赖安装拓扑后，重跑门禁并再分诊其已知 metadata 规则噪声。跟踪：[#1254](https://github.com/talex-touch/tuff/issues/1254)。
- **Windows Everything 严格发布验收仍缺 manifest** — `printf '' | corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 以退出码 `1` 结束，诊断为 `Unexpected end of JSON input`。这是缺少采集输入，不是已提交 manifest 的回归。需在交互式 Windows 打包 CoreBox 采集普通、`@file`、结构化筛选的结果/空态/降级态，写入 manifest 后重跑严格校验。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA 真实主机闭环缺失** — 官方可信 macOS N+1 包仍缺后台准备、单击、静默替换、自动重启与 health-ack 证据；OTA 父契约仍缺 Windows/Linux 的真实 handoff、恢复与 health 证据。静态检查不得替代真实主机运行。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)。
- **图标自愈缺官方 N+1 发布证据** — 本地未签名包不能满足 native trust `pass`；需对官方 attested N+1 包重跑 real-profile smoke 并回填任务机读证据。跟踪：[#310](https://github.com/talex-touch/tuff/issues/310)。
- **发布日志缺视觉验收** — actionlint 已闭环；剩余 Electron desktop/narrow 截图仍需在 release-build startup guard 未被占用的主机采集。跟踪：[#482](https://github.com/talex-touch/tuff/issues/482)。

## 数据库、跨平台与安全门禁

- **搜索分库任务文档仍与当前拓扑矛盾** — `runtime-flags.ts` 明确将 `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认设为 `true`，`=0` 是应急回退，且当前 roadmap 已记录三次 app-run 证据；迁移任务 PRD 仍称其默认关闭并以 flag-on 作为未来验收前提。更新任务 PRD/元数据，使其与当前运行时和已记录证据一致，避免旧措辞误导后续发布判断。跟踪：[#1107](https://github.com/talex-touch/tuff/issues/1107)。
- **搜索分库配置的文档与代码相互矛盾** — `runtime-flags.ts` 明确将 `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认设为 `true`，`=0` 是应急回退；`TODO.md` 与迁移任务 PRD 仍称其默认关闭。先统一当前模式、任务验收语言和发布断言，不能基于陈旧“flag-on/default-off”叙述判断安全性。跟踪：[#1107](https://github.com/talex-touch/tuff/issues/1107)。
- **SQLite writer ownership 只覆盖 search-index 域** — #351 的 source guard 已覆盖该域；下载、推荐、应用索引、分析、更新、Sentry、剪贴板等可变域仍未形成 owner map、统一 admission/retry 规则或真实锁竞争、恢复与关机证据。跟踪：[#351](https://github.com/talex-touch/tuff/issues/351)。
- **大目录 OOM 风险的结构修复缺量化闭环** — 生产路径已改为有界批处理，但仍缺百万条受控 fixture、显式内存预算、worker/client/reconciliation 三层峰值、取消/关机释放、打包应用响应性及批次边界正确性证据。跟踪：[#480](https://github.com/talex-touch/tuff/issues/480)。
- **macOS 发行架构策略未决** — 当前 `darwin/arm64` 产物需要明确产品支持范围；arm64-only 必须在下载/OTA 明示拒绝不支持架构，x64/Universal 则需完整签名、公证、清单、选择逻辑与真机矩阵。跟踪：[#311](https://github.com/talex-touch/tuff/issues/311)。
- **renderer/plugin 到本地代码执行链未闭合** — raw `ipcRenderer` bridge 与 plugin channel 非 default-deny 仍开放；受限 shell sink 和临时路径修复不能替代切断入口。按 #838 的顺序先收紧 plugin channel，再移除 raw bridge。跟踪：[#838](https://github.com/talex-touch/tuff/issues/838)。
- **生产依赖风险仍缺当前分支的可复现实测与处置门禁** — `@nuxt/devtools`/`nuxt` 升级受 `unhead` 2→3 迁移阻塞，或应移除 CoreApp 中引入 Nuxt 闭包的 `vue-sonner`；Dependabot 当前计数曾误在 `master` 测得，必须在 `TalexDreamSoul/app-shell-v2` 重跑并给 Critical/High 指派 owner、期限及发布前分诊门禁。跟踪：[#1098](https://github.com/talex-touch/tuff/issues/1098)、[#483](https://github.com/talex-touch/tuff/issues/483)。

## 任务记录、生成文件与人工复核

- **Trellis 活跃状态无法可靠反映进度** — 85 个活跃任务中，44 个 `in_progress`、41 个 `planning`；分别有 38 与 30 个缺少至少一个必填 `meta.blocker`、`meta.nextAction`、`meta.evidence`。大量 `implement.jsonl`/`check.jsonl` 仍仅有 `_example`。需由 workflow owner 决定门禁只约束有意义状态，或修复 producer 后回填，避免占位文本伪造进度。跟踪：[#309](https://github.com/talex-touch/tuff/issues/309)、[#1254](https://github.com/talex-touch/tuff/issues/1254)。
- **8 个 `in_progress` 记录超过 10 天未更新** — 尤其 Windows Everything、OTA one-click、图标自愈、插件目录按钮、发布日志、BaseAnchor、macOS screenshot core、beta.23 安装任务。负责人应记录新的证据、明确 blocker，或将不再执行的工作转回 planning/归档。
- **可同步包元数据仍漂移** — 根 `package.json` 缺少 `homepage`，而 `apps/core-app/package.json` 为 `https://tuff.tagzxia.com`；其余 `sync-core-package.mjs` 所选字段一致。由 package metadata owner 选择规范值并受控同步，审计阶段不直接改写 manifest。
- **并行工作树需人工归属复核** — 当前工作树已有 43 个未提交改动，包含源文件删除。后续合并、发布或全量验证前，负责人必须核对每项改动的归属、删除意图与覆盖验证；本次仅提交审计文档。
