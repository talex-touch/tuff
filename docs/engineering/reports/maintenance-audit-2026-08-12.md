# 维护审计：需处理项（2026-08-12）

仅记录仍需动作的问题。任务状态、责任人与验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-11 审计](./maintenance-audit-2026-08-11.md) 作为当前问题索引，不建立第二套全局优先级。每项均以本轮命令、任务记录或当前 GitHub issue 重新核验；已关闭的 OCR、scene asset 归属、TuffEx 审计与复合 renderer/plugin 执行链不再重复列为未解决风险。

## 失败验证与人工证据

- **Windows Everything 严格验收仍缺打包 UI manifest** — `printf '' | corepack pnpm -F @talex-touch/core-app run windows:acceptance:verify` 退出 `1` 并报 `Unexpected end of JSON input`。这是无采集输入的边界，不是已提交 manifest 的回归。仍需在交互式 Windows 打包 CoreBox 中记录普通、`@file`、结构化筛选及结果/空态/降级态；当前 manifest 对结果/空态没有专门字段，先确定记录载体再执行。跟踪：[#308](https://github.com/talex-touch/tuff/issues/308)。
- **OTA、图标与发布日志的真实主机证据未齐** — Windows/Linux OTA 仍缺真实安装 handoff、health/recovery；图标自愈已有官方签名公证 N+1 产物但未在 macOS 执行 isolated/real-profile smoke；release-notes 仍缺桌面与窄窗口 GUI 截图。非宿主静态检查不得替代这些运行证据。跟踪：[#326](https://github.com/talex-touch/tuff/issues/326)、[#310](https://github.com/talex-touch/tuff/issues/310)、[#482](https://github.com/talex-touch/tuff/issues/482)。
- **本机文档总门禁无法启动** — `mise run docs:verify` 在加载 Vitest 前因错误工作区路径缺少 `node_modules/vitest/vitest.mjs` 失败；本轮直接链接审计仍覆盖 602 份文档、868 条相对链接且为 0 finding。该环境的损坏 shim/依赖拓扑必须修复后，才能用总门禁证明本次文档变更。不要把已在 origin 通过的文档规则问题误报为当前规则回归。跟踪：[#1564](https://github.com/talex-touch/tuff/issues/1564)。

## 数据库、发布与跨平台门禁

- **分库发布事实仍在任务记录中自相矛盾** — `TODO.md` 已声明 `TUFF_DB_SEARCH_SPLIT_ENABLED` 默认开启、`=0` 为回退，但 `07-28-migrate-search-index-split-write-paths` 仍写“默认关闭、flag-on 后再启用”。先统一任务 PRD/meta 与运行事实，再以隔离 CoreApp 实跑证明首启重建、app/file 计数与搜索结果一致、`search-index.db` 已填充、无 WAL/busy 风暴，并验证 `=0` 回退。跟踪：[#1107](https://github.com/talex-touch/tuff/issues/1107)。
- **大目录索引的实现已流式化，验收仍为空** — worker、client 与 reconciliation 的原始全量累积论据已不成立；剩余是百万级受控 fixture、三层峰值内存预算、取消/关机释放、批次边界正确性与打包应用响应性。应将问题标题/任务收窄为验收证据，避免再次对已移除的实现缺陷动刀。跟踪：[#480](https://github.com/talex-touch/tuff/issues/480)。
- **SQLite 写入所有权只覆盖 search-index 三张表** — 当前守卫覆盖 `files`、`fileExtensions`、`keywordMappings`，其余 9/12 可变表尚无 owner map 与来源门禁；下载、推荐、应用索引、分析、更新、Sentry、剪贴板仍缺统一 admission/retry、锁竞争恢复和关机证据。跟踪：[#351](https://github.com/talex-touch/tuff/issues/351)。
- **macOS 架构声明与下载页不一致** — 产物/OTA 仅支持 `darwin/arm64`，Nexus 下载说明仍写 Apple Silicon 或 Intel；同时 Intel rejection 路径没有针对性测试。先作 arm64-only 或 x64/Universal 的产品决策，再令下载元数据、manifest、选择逻辑、签名公证与真机矩阵一致。跟踪：[#311](https://github.com/talex-touch/tuff/issues/311)。

## 安全与授权门禁

- **CSP 收紧仍等待真实运行清单** — `script-src` 任意来源与 inline 已移除，复合 renderer/plugin 本地执行链已断；但 `default-src`/`connect-src` 仍为宽松强制策略。report-only 违规现已落入应用日志，需经真实日常使用（含 widget、Nexus、Sentry）检查 `[csp-report-only]`：无违规才提升为强制；有违规按 directive/origin 收敛。`unsafe-eval` 需将预编译 widget 从字符串执行迁至模块加载后才可移除。跟踪：[#689](https://github.com/talex-touch/tuff/issues/689)。

## 任务记录、生成文件与人工复核

- **活跃任务树仍有陈旧/无上下文的 in-progress 记录** — 85 个非 completed 任务中，至少 `07-26-install-launch-v2-4-13-beta-23`、`07-28-tuffex-docs-audit`、`07-29-macos-screenshot-capture-core` 及多项 08-04 UI 任务已逾一周未更新且缺少 `meta.blocker`、`meta.nextAction`、`meta.evidence`。负责人应补可复验事实并继续、退回 planning 或归档；JSONL 的 `_example` 是 subagent 上下文模板，不应伪装成运行证据。跟踪：[#309](https://github.com/talex-touch/tuff/issues/309)。
- **包元数据存在单向漂移** — 同步脚本选择的字段中，root `package.json` 缺 `homepage`，CoreApp 为 `https://tuff.tagzxia.com`；其余四项一致。metadata owner 应指定 root 是否为规范源，随后受控同步；审计不直接改写 manifest。
- **脏工作树需先做归属复核** — 当前有 38 个未提交路径，包含源文件删除。合并、发布或全量验证前必须确认每项改动的负责人、删除意图与覆盖验证；本次仅提交本报告与路线图链接。
