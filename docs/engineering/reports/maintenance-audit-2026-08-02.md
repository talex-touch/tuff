# 维护审计：需处理项（2026-08-02）

仅记录仍需动作的问题。任务状态、责任人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-01 审计](./maintenance-audit-2026-08-01.md) 作为当前问题索引，不建立第二套全局优先级。

## 失败验证与人工证据

- **Windows Everything 严格发布验收尚未具备输入证据** — 2026-08-02 执行 `printf '' | corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 以退出码 `1` 结束，诊断为 `Unexpected end of JSON input`。这表示 acceptance manifest 仍未采集，不是已提交 manifest 的回归失败。需在交互式 Windows 打包 CoreBox 采集普通、`@file`、结构化筛选的结果/空态/降级态，写入 manifest 后重跑严格校验。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA 真机闭环缺失** — macOS 官方可信 N+1 包仍缺后台准备、单击、静默替换、自动重启与 health-ack 证据；OTA 父契约也缺 Windows/Linux 的真实 handoff、恢复与 health 证据。静态检查不得替代真实主机运行。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)。
- **图标自愈缺官方 N+1 发布证据** — 本地未签名包不能满足 native trust `pass`；需对官方 attested N+1 包重跑 real-profile smoke。见 `07-24-harden-app-icon-self-healing/prd.md:68`。
- **发布日志任务缺外部工具与视觉验收** — `07-27-bilingual-whats-changed` 记录 actionlint 本机不可用，且 Electron visual screenshots 被 release-build startup guard 阻塞。应在可用环境执行 actionlint，并在无构建占用时补桌面与窄窗口截图；不得把现有自动化验证写成视觉验收。跟踪：[#482](https://github.com/talex-touch/tuff/issues/482)。

## 数据库与发布门禁

- **搜索索引分库仍有可激活的静默数据丢失边界** — `DB_SEARCH_SPLIT_ENABLED` / `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认关闭，但环境变量仍可启用未完成模式，使剩余 provider/embedding 写落在 `database.db`、读取走 `search-index.db`。应完成每个 writer 的 worker 归属和 flag-on 应用证据，或在完成前硬禁用该运行时开关；不得维持可公开激活的半迁移模式。跟踪：[#331](https://github.com/talex-touch/tuff/issues/331)。
- **SQLite writer ownership 仍分散** — write scheduler、retry、worker、admission 和 observer 的责任尚未收敛；新增写路径可能绕过策略。需在 #331 后建立 owner map、受控 bypass 及真实锁竞争/恢复测试。跟踪：[#351](https://github.com/talex-touch/tuff/issues/351)。
- **大目录扫描/对账可 OOM** — worker、client 与 reconciliation 同时物化完整集合；百万级根目录可保留约三份数据。需改为有界背压批次，并对 worker/client/reconciliation 峰值、取消和关机释放建立验收。跟踪：[#480](https://github.com/talex-touch/tuff/issues/480)。
- **macOS 架构发布策略未决** — 需明确 arm64-only，或交付完整 x64/Universal 的签名、公证、清单、下载选择和真机矩阵；未支持架构必须得到显式失败而非不兼容资产。跟踪：[#311](https://github.com/talex-touch/tuff/issues/311)。

## 安全与任务记录质量

- **安全审计任务记录与已关闭证据不一致** — `07-27-audit-plugin-privileged-security` 的 PRD 仍保留未勾选的 capability/data-flow/SQLite/transport 验收项，但 parent #302 与 #296–#301 均已关闭并记录最终独立验证（#302 指向 460/460 的 superseding matrix）。需复核这些闭环证据后更新或归档 Trellis 任务；不得把已修复的历史 F1–F8 再当作当前开放漏洞，也不得以 closed issue 代替任务记录的终态。跟踪：[#481](https://github.com/talex-touch/tuff/issues/481)。
- **TuffEx 审计处置已外部化但 Trellis 未闭环** — `07-28-tuffex-docs-audit/report.md` 已记录 119 单元、421 条经对抗验证的 findings，且汇总 #362 与 112 个逐组件 issue（#363–#474）均已创建并保持 open。任务 PRD 的 issue 创建前用户确认门槛已被实际历史动作满足；当前需要把 issue disposition、后续整改 owner/顺序及完成条件回写到 Trellis 任务，而不是重复建 issue 或继续声称“报告缺失”。跟踪：[#481](https://github.com/talex-touch/tuff/issues/481)。
- **活跃任务 evidence JSONL 仍有模板污染** — Windows Everything、OTA、图标、发布日志、搜索分库和 TuffEx 审计等任务的 `implement.jsonl`/`check.jsonl` 仍含 `_example` 模板行。继续执行的任务应写入真实上下文与验证记录；已无后续动作的任务应完成状态同步或归档，避免模板被误当证据。跟踪：[#481](https://github.com/talex-touch/tuff/issues/481)。
- **Dependabot 告警尚未逐项分诊** — 最近一次推送回执的基线为 35 个告警（3 critical、15 high、14 moderate、3 low）。需在 GitHub Security dashboard 逐项确认运行时可达性、升级或豁免理由及回归门禁；该数字不是本项目漏洞可达性结论。

## 已验证的非问题

- `docs/engineering/reports/peripheral-docs-link-audit.mjs` 于 2026-08-02 检查 599 份产品文档、864 个相对链接，`findings: 0`。
- `scripts/sync-core-package.mjs` 所同步的 root/Core metadata 字段（version、description、author、license）一致；root 未声明 homepage，脚本按设计不覆盖 CoreApp homepage，因此不存在该生成同步器可修复的 drift。
