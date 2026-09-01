# 维护审计：需处理项（2026-09-01）

仅记录本次重新核验后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-30 审计](./maintenance-audit-2026-08-30.md) 作为当前问题索引，不建立第二套全局优先级。

## 发布、数据库与数据完整性

- **默认开启的 search-index split 仍是发布阻断项。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 仍缺同一 disposable profile 的两次真实 CoreApp 证据：default-on 首启、索引、查询、健康；quiesce/reconcile 后以 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 重启并证明计数与结果 parity。静态路由核验和 `search-split-topology-verify.ts` 只能判定输出，不能替代应用实跑。
- **SQLite 写者归属与保护范围仍不完整。** [#351](https://github.com/talex-touch/tuff/issues/351) 的 CI guard 仅覆盖 72 张表中的 3 张，且不能识别参数驱动的 delete；`#1770` 的数据删除缺陷已关闭，但其 guard 盲区已移交到 #351。`search-usage-service` 的 direct fallback / fire-and-forget usage writes 是否允许丢失 `SQLITE_BUSY`，仍需明确所有权与 retry 语义，不能在 facade 层盲目包一层 retry。
- **遥测、隐私删除与 Credits 仍缺原子、幂等的生产证据。** [#1788](https://github.com/talex-touch/tuff/issues/1788) 仍要求 D1 原子 ingest、receipt retention、完整 export/delete/finalization 和 Preview/Production 红脱敏证据；issue 目前仍引用未推送的本地 `08-23` 任务路径，外部协作者无法复核该前提，需先改为已提交证据或仓库锚点。
- **插件 source-package release receipt 过期且为失败态。** `.trellis/tasks/07-18-plugin-source-package-audit/evidence/source-package-audit.json` 固定为 2026-08-27 dirty revision，并声明 `failed`；不得用于发布。恢复干净、单一所有者的工作树后重新生成 clean-source receipt。

## 安全与发布门禁

- **Cargo screenshot addon 未进入正式发布链，且缺产品决定。** [#321](https://github.com/talex-touch/tuff/issues/321) 已确认 release workflow 不构建 Cargo addon，release preflight/afterPack 也不要求模块；运行时没有软件截图 fallback，缺失即令截图功能不可用。需决定 A/B/C；审计建议 B：发布构建 Cargo addon 并只在 release 目标 fail-closed，再以真实 tag 的三平台产物验收。
- **OTA 跨平台真机验收被验证 harness 自身阻断。** [#326](https://github.com/talex-touch/tuff/issues/326) 的验证器把非 `darwin/arm64` runtime evidence 强制拒绝为 `static-only`；先泛化 schema/host-pair 校验，再收集 Windows/Linux N/N+1。否则产出的正确证据仍必然被门禁拒绝。
- **Windows Everything 的最后门禁缺一个 schema 决定和现有 CDP probe。** [#308](https://github.com/talex-touch/tuff/issues/308) 已有 packaged launch、CDP interaction 和 screenshot primitives，但 manifest 没有 `degradedSearchPassed`。先决定 degraded 是 backend-only 事实，还是必须记录 CoreBox UI；后者需扩展 verifier，再写/接入四场景 probe。当前空 stdin 验证器仍以 `Unexpected end of JSON input`、exit 1 失败，说明未填 acceptance manifest 不能被误判通过。
- **CSP report-only 尚未提升为 enforce。** [#689](https://github.com/talex-touch/tuff/issues/689) 仍缺真实使用期间 `[csp-report-only]` 日志；在候选策略安静之前，`default-src` / `connect-src` 通配符不能收紧。`unsafe-eval` 由已编译 widget 的 `new Function` 依赖，需独立设计模块加载和作用域注入替代，而不是直接删除指令。
- **五条 High 的生产依赖豁免有硬截止期。** `check-prod-audit` 当前允许 5 条 High（另有 17 Moderate、5 Low）；[#1098](https://github.com/talex-touch/tuff/issues/1098) 的五个 `nuxt` 豁免均于 2026-11-09 到期。仍需完成 `unhead` 2→3 / Nuxt family 收敛，并避免 caret 把 `@nuxt/kit` 单独漂移到更高 4.x。
- **Squash commit 正文可意外关闭 issue。** [#1792](https://github.com/talex-touch/tuff/issues/1792) 仍只扫描 PR body，未扫描 GitHub 实际消费的 constituent commit bodies；需让引述的 `close #N` 也失败，并以 `6448f5f9c` 的重建文本做负向回归。

## 工作、文档与路线图治理

- **四项长期 `in_progress` 记录没有可执行的收口边界。** `07-26-install-launch-v2-4-13-beta-23` 已 37 天未更新且 `meta.nextAction/blocker` 均为空；`08-05-skeleton-spec-rule` 与 `08-05-skeleton-primitives` 的 PRD 验收已全勾选却仍为 `in_progress`；`08-15-anchor-delay-service` 仅记录“由 owning session 覆盖”，16 天没有真实状态。应由各 owner 归档已完成项，或记录剩余验收和证据；不能继续以活跃状态占用路线图。
- **仍有需要人工/运行时证据的阻断任务。** Windows packaged CoreBox（#308）、macOS N→N+1 OTA、official-attested icon real-profile smoke、Windows/Linux screenshot capability、桌面视觉验收等都不能由静态检查结案。Trellis 当前共有 93 个 active records；报告只把上述没有行动边界或明确 runtime prerequisite 的项目视为需处理项，`_example` JSONL 是 sub-agent context 模板，不是失败证据。
- **Nexus worker bundle gate 仍未接入 CI。** [#1776](https://github.com/talex-touch/tuff/issues/1776) 的中英文 doc parity 已解决并已接线；剩余 `build:analyze-worker` 仍因 gzip/chunk budget、图标预算和 `i-carbon-fingerprint-recognition` 规则/测试矛盾而无法直接接线。禁止以 `continue-on-error` 伪装为门禁。
- **无归属的 DeepSeek Harness 工件仍待维护者处置。** [#1785](https://github.com/talex-touch/tuff/issues/1785) 的 `.dsh-plugin-hub-*` 是无仓库生成路径的第三方 clone/dump；忽略规则只隐藏 `git status`，不构成所有权或保留策略。其 owner 必须选择显式保留到可复现工作流，或自行删除。

## 本次验证边界

- 通过：外围文档链接审计（699 个来源文档、964 条相对链接、0 finding）、`scripts/docs/verify-docs.mjs`、Drizzle snapshot ratchet、root/CoreApp 同步字段、生产依赖门（带上述五条 High 有时限豁免）、`check:audit-report-claims`。
- 失败：`pnpm -F @talex-touch/core-app run windows:acceptance:verify` 在空 stdin 时以 `Unexpected end of JSON input`、exit 1 拒绝未提供 manifest；这是 fail-closed 的当前边界，不是 Windows 验收已经通过。
- 未把本机静态或开发态结果外推为 packaged、跨平台或 Production 证据。
