# 维护审计：需处理项（2026-09-02）

仅记录本次重新核验后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-09-01 审计](./maintenance-audit-2026-09-01.md) 作为当前问题索引，不建立第二套全局优先级。

## 数据库、数据完整性与生成物

- **默认开启的 search-index split 仍是发布阻断项。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 仍缺同一 disposable profile 的两次真实 CoreApp 证据：default-on 首启、索引、查询、健康；quiesce/reconcile 后以 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 重启并证明计数与结果 parity。静态路由核验和 `search-split-topology-verify.ts` 只能判定输出，不能替代应用实跑。
- **SQLite 写者归属与保护范围仍不完整。** [#351](https://github.com/talex-touch/tuff/issues/351) 的 CI guard 仅覆盖 72 张表中的 3 张，且不能识别参数驱动的 delete。`search-usage-service` 的 direct fallback / fire-and-forget usage writes 是否允许丢失 `SQLITE_BUSY`，仍需明确所有权与 retry 语义；不能在 facade 层盲目包一层 retry。
- **遥测、隐私删除与 Credits 仍缺原子、幂等的可复核闭环。** [#1788](https://github.com/talex-touch/tuff/issues/1788) 仍要求 D1 原子 ingest、receipt retention、完整 export/delete/finalization 和 Preview/Production 红脱敏证据。issue 仍引用未推送的本地任务路径，外部协作者无法复核其前提；先改为已提交证据或仓库锚点。
- **插件 source-package release receipt 已过时且处于失败态。** `.trellis/tasks/07-18-plugin-source-package-audit/evidence/source-package-audit.json` 记录 2026-08-27 的 dirty revision，`status` 为 `failed`。不得用于发布；恢复干净、单一所有者的工作树后重新生成 clean-source receipt。

## 安全、发布与功能门禁

- **截图 native addon 未进入正式发布链，且仍缺产品决定。** [#321](https://github.com/talex-touch/tuff/issues/321) 仍确认 release workflow 不构建 Cargo addon，release preflight/afterPack 也不要求模块；运行时没有软件截图 fallback，缺失即令截图功能不可用。需在 A/B/C 中明确选择；审计建议 B：发布构建 Cargo addon 并仅在 release 目标 fail-closed，再以真实 tag 的三平台产物验收。
- **OTA 跨平台真机验收被验证 harness 自身阻断。** [#326](https://github.com/talex-touch/tuff/issues/326) 的验证器把非 `darwin/arm64` runtime evidence 强制拒绝为 `static-only`；先泛化 schema/host-pair 校验，再收集 Windows/Linux N/N+1。否则产出的正确证据仍必然被门禁拒绝。
- **Windows Everything 的最后门禁缺 schema 决定和 CDP probe。** [#308](https://github.com/talex-touch/tuff/issues/308) 已有 packaged launch、CDP interaction 和 screenshot primitives，但 manifest 没有 `degradedSearchPassed`。先决定 degraded 是 backend-only 事实，还是必须记录 CoreBox UI；后者需扩展 verifier，再接入四场景 probe。
- **CSP report-only 尚未提升为 enforce。** [#689](https://github.com/talex-touch/tuff/issues/689) 仍缺真实使用期间的 `[csp-report-only]` 日志；在候选策略安静之前，`default-src` / `connect-src` 通配符不能收紧。`unsafe-eval` 由已编译 widget 的 `new Function` 依赖，需独立设计模块加载和作用域注入替代，不能作为 CSP 清理顺手删除。
- **生产依赖门仍有五条 Nuxt High 临时豁免。** [#1098](https://github.com/talex-touch/tuff/issues/1098) 的 `unhead` 2→3 / Nuxt family 迁移未完成，五条 allowlist 将于 2026-11-09 到期；同时 caret 已被证明允许 Nuxt family 版本偏斜。迁移前先固定并复查兼容目标，不能以 allowlist 代替修复。
- **Squash commit 正文可意外关闭 issue。** [#1792](https://github.com/talex-touch/tuff/issues/1792) 仍只扫描 PR body，而 GitHub 会解析 constituent commit bodies 拼成的 squash message。合并前扫描提交正文，并以 `6448f5f9c` 的引用文本建立负向回归。
- **Dependabot 的 Moderate/Low 仍没有全量处置。** [#483](https://github.com/talex-touch/tuff/issues/483) 的 Critical/High `--prod` 门已存在，但其完整告警集仍缺 documented disposition；不要把 Nuxt allowlist 当作全量依赖风险结论。

## 文档、路线图与人工动作

- **`docs:verify` 当前失败。** 三个仍标记 `in_progress` 的 08-31 TuffEx 子任务均以空 `meta` 保存，触发 9 条 `DOC-TASK-META`（各缺 `blocker`、`nextAction`、`evidence`）。由 [#309](https://github.com/talex-touch/tuff/issues/309) 的 task-governance owner 为每项写入真实继续条件、阻塞原因和证据，或在完成后归档；不得用占位文本伪造进度。
- **Nexus worker bundle 门仍无法接入 CI。** [#1776](https://github.com/talex-touch/tuff/issues/1776) 的 `build:analyze-worker` 仍因 worker gzip/chunk/page budgets 及 `i-carbon-fingerprint-recognition` 规则/测试矛盾而未接线。先用实际产物解决预算与规则矛盾，再作为阻断 gate；禁止 `continue-on-error`。
- **无归属的 DeepSeek Harness 工件等待维护者决定。** [#1785](https://github.com/talex-touch/tuff/issues/1785) 的 `.dsh-plugin-hub-*` 为外部 clone/dump，当前忽略规则不能构成所有权或保留策略。维护者须指定可复现保留流程，或由其所有者删除；审计提交不得吸收或清理它们。
- **Release Notes 的已合并 probe 仍未产出最终视觉证据。** [#482](https://github.com/talex-touch/tuff/issues/482) 只剩 CoreApp release-notes modal 与 Settings → Update 页的 desktop/narrow captures。现有 CDP probe 已具备，需在可运行的受控会话中执行并附上四张捕获；静态/单元验证不能替代。

## 本次验证边界

- Drizzle snapshot ratchet 通过，未发现新增快照漂移；不把既有 snapshot 基线债务重复列为本次 drift。
- `mise run docs:verify` 失败，原因仅为上述 9 条 `DOC-TASK-META`。
- 工作树有 44 个未提交路径，均不纳入本报告提交；后续合并、发布或全量验证前，相关 owner 必须确认归属、删除意图及覆盖验证。
