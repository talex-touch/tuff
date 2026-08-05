# 维护审计：需处理项（2026-08-05）

仅记录仍需动作的问题。任务状态、责任人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-04 审计](./maintenance-audit-2026-08-04.md) 作为当前问题索引，不建立第二套全局优先级。

## 失败验证与人工证据

- **Windows Everything 严格发布验收仍无 manifest** — 2026-08-05 执行 `printf '' | corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 以退出码 `1` 结束，诊断为 `Unexpected end of JSON input`。这是缺少采集输入，不是已提交 manifest 的回归。需在交互式 Windows 打包 CoreBox 采集普通、`@file`、结构化筛选的结果/空态/降级态，写入 manifest 后重跑严格校验。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA 真实主机闭环缺失** — macOS 官方可信 N+1 包仍缺后台准备、单击、静默替换、自动重启与 health-ack 证据；OTA 父契约还缺 Windows/Linux 的真实 handoff、恢复与 health 证据。静态检查不得替代真实主机运行。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)。
- **图标自愈缺官方 N+1 发布证据** — 本地未签名包不能满足 native trust `pass`；需对官方 attested N+1 包重跑 real-profile smoke。跟踪：[#310](https://github.com/talex-touch/tuff/issues/310)。
- **发布日志缺工作流和视觉验收** — `07-27-bilingual-whats-changed` 仍记录 actionlint 本机不可用，且 Electron desktop/narrow screenshots 被 release-build startup guard 阻塞。需在有 actionlint 的环境跑 `.github/workflows/build-and-release.yml`，并在无构建占用时补截图；不可将自动化检查等同视觉验收。跟踪：[#482](https://github.com/talex-touch/tuff/issues/482)。

## 数据库、发布与跨平台门禁

- **搜索索引分库仍可静默丢数据** — `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认关闭，但环境变量仍可启用半迁移模式：剩余 provider/embedding 写入 `database.db`，读取改走 `search-index.db`。应完成每个 writer 的 worker 归属和 flag-on 应用证据，或在完成前硬禁用运行时开关；不得维持可公开激活的半迁移模式。跟踪：[#331](https://github.com/talex-touch/tuff/issues/331)。
- **SQLite writer ownership 分散** — scheduler、retry、worker、admission 与 observer 的职责尚未收敛，新的写路径可绕过策略。完成 #331 后需建立 owner map、显式窄 bypass 与真实锁竞争/恢复测试。跟踪：[#351](https://github.com/talex-touch/tuff/issues/351)。
- **大目录扫描/对账可 OOM** — worker、client 与 reconciliation 同时物化完整集合；百万级根目录可同时保留约三份数据。需采用有界背压批次，并对 worker/client/reconciliation 峰值、取消和关机释放建立验收。跟踪：[#480](https://github.com/talex-touch/tuff/issues/480)。
- **macOS 架构发布策略未决** — 需明确 arm64-only，或交付完整 x64/Universal 的签名、公证、清单、下载选择和真机矩阵；不支持的架构必须显式失败，不能下发不兼容资产。跟踪：[#311](https://github.com/talex-touch/tuff/issues/311)。

## 任务记录、文档与安全处置

- **Trellis 外部处置尚未闭环** — #302 与 #296–#301 已关闭并有 superseding 460/460 验证；`07-27-audit-plugin-privileged-security` 仍为 planning，记录的下一步仍是原审计而非 closure disposition。`07-28-tuffex-docs-audit` 同样没有记录 #362 与 #363–#474 的整改归属、排序和集成闭环条件；其 421 项审计结论（含 59 项 high）仍由公开 issue 跟踪。应更新或归档任务，不重报历史已修复安全漏洞。跟踪：[#481](https://github.com/talex-touch/tuff/issues/481)、[#362](https://github.com/talex-touch/tuff/issues/362)。
- **模板 JSONL 污染活跃任务证据** — 35 个活跃任务的 70 个 `implement.jsonl` / `check.jsonl` 仍含 `_example` 行；其中 8 个已有真实记录却仍保留模板行。已有真实上下文或检查记录的任务必须删掉模板行；继续执行的任务需写入真实记录；无后续动作的任务应同步终态或归档。跟踪：[#481](https://github.com/talex-touch/tuff/issues/481)。
- **10 个进行中任务没有可执行状态元数据** — `07-26-install-launch-v2-4-13-beta.23`、`07-28-tuffex-docs-audit`、`07-29-macos-screenshot-capture-core` 及 7 个 2026-08-04 shell/settings/database 子任务均无 `meta.blocker` 或 `meta.nextAction`。需补具体下一步、验收命令/产物或终态；不得据此把已有本地改动的 08-04 子任务误报为停滞。其余发布/Windows/OTA/图标阻塞任务已有可行动作，不应误报为无主卡住。
- **Dependabot 告警仍未逐项分诊** — 当前基线仍为 2026-08-04 推送回执的 51 个告警（3 critical、20 high、25 moderate、3 low）。需在 GitHub Security dashboard 确认每项运行时可达性、升级或豁免理由及回归门禁；该数字不是漏洞可达性结论。跟踪：[#483](https://github.com/talex-touch/tuff/issues/483)。
