# 维护审计：需处理项（2026-08-21）

仅记录当前仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-20 审计](./maintenance-audit-2026-08-20.md) 作为当前问题索引，不建立第二套全局优先级。

## 合并、发布与验证可信度

- **`master` 仍没有任何必需 CI 检查，失败或未完成的代码检查可被合并。** [#1716](https://github.com/talex-touch/tuff/issues/1716) 的 2026-08-20 复验仍显示 required contexts 为 `null`；应启用七个每个 PR 都报告的确定性 CI 作业，并以“单一必需检查失败拒绝合并”和“仅触发路径过滤工作流的 PR 不被卡住”双向验证。当前 `master` 的 CI 与 release 已绿，不改变该合并边界缺口。
- **测试失败可被误判为噪音。** [#1778](https://github.com/talex-touch/tuff/issues/1778) 记录了 `search-index-migration-evidence-verify` 中三项 CLI 测试在 Vitest 默认 5 秒下的已发生超时；为三个 spawn 链测试设置带理由的显式超时，并在繁忙 runner 复验。没有 #1716 的必需检查，该类假红会进一步降低对真实红灯的信任。
- **发布流程仍可能交付完全不可用的截图功能。** [#321](https://github.com/talex-touch/tuff/issues/321) 复验为 release workflow 不安装 Rust、不构建 `tuff_native_screenshot.node`，也不在 preflight/afterPack/packaged runtime 要求它；而缺失时用户侧没有软件截图回退。维护者应明确采用 release-only 硬门禁，或明确承认截图不是发布能力；现有事实更支持前者。
- **两类真实环境验收未完成。** [#308](https://github.com/talex-touch/tuff/issues/308)、[#326](https://github.com/talex-touch/tuff/issues/326)、[#482](https://github.com/talex-touch/tuff/issues/482) 分别缺 Windows packaged CoreBox、Windows/Linux OTA N/N-1 恢复、以及 CoreApp 窄窗口 release-notes/Update-history 运行证据。通过当前 CI 不能替代它们。

## 数据库、索引与功能完整性

- **设置页“清理索引”在 default-on split 下会删除应用目录而不清理文件索引。** [#1770](https://github.com/talex-touch/tuff/issues/1770) 已在真实库复现：229 条 primary `files` 中的 `app` 记录被无条件删除，`search-index.db` 的目标索引未受影响。应合入并验证 split-aware 清理、永久保留 `type='app'`、加 split-on 回归测试，并将 writer guard 改为按连接所有权而非正则导入形式判断。
- **default-on split 仍缺隔离 profile 的端到端、回退证明。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 必须一次性证明首启重建、两库正确填充与计数、查询、无锁争用，以及 quiesce/restart 后 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 的一致回退；#1775 还显示该取证工具的诊断路径曾依赖不存在的 `ipcRenderer.invoke`，其余三项同类 CDP probe 仍待修复。
- **目录过滤仍可能静默漏索引。** [#1727](https://github.com/talex-touch/tuff/issues/1727) 需要确定用户目录中 `tmp`、`cache`、`logs` 等普通名字的产品规则，同时维持对 `node_modules`、`target`、`dist` 的深层排除并重跑大目录边界验证。

## 安全与依赖风险

- **强制 CSP 的 `default-src` 与 `connect-src` 仍是通配符。** [#689](https://github.com/talex-touch/tuff/issues/689) 中的 `script-src *` 与 `unsafe-inline` 已修复；剩余风险是 host renderer 注入面仍依赖通配符隔离。report-only 违规已能进入主进程日志，下一步必须在真实日常使用（含 widget、Nexus、Sentry）中收集 `[csp-report-only]`，再按实际来源转为 enforcing policy；`unsafe-eval` 则需将预编译 widget 从字符串执行迁移为模块加载，不能直接移除。
- **生产依赖门禁通过，但依赖风险没有归零。** 本次 `check:prod-audit` 仍显示 5 条 Critical/High advisory 由可到期 allowlist 覆盖；[#483](https://github.com/talex-touch/tuff/issues/483) 还记录 json-formatter 交付的 Monaco vendored `dompurify` 风险不能靠 pnpm override 消除。应以 Monaco 实际 re-vendor 的升级路径处理，并在 waiver 2026-11-15 到期前重新生成扫描豁免；不要将 `pnpm audit --prod` 的通过等同于 GitHub Security Dashboard 的全 workspace 状态。

## 文档、门禁接线与工作治理

- **Nexus 双语 API 文档已经漂移，定义的门禁未接入 CI。** 本次 `pnpm -C apps/nexus check:doc-parity` 失败：`division-box` 缺 9 个英文标题、`flow-transfer` 缺 5 个、`intelligence` 缺 1 个。[#1776](https://github.com/talex-touch/tuff/issues/1776) 同时追踪未接线的 `build:analyze-worker`；其真实构建测得 worker gzip 4.10 MiB 对 2.70 MiB 预算超 52%、多个 chunk/page 预算违例。先补经源代码校对的英文文档；bundle 先分辨真实增长和旧 blank-icon 基线，再决定缩减或逐项重新基线，禁止 `continue-on-error` 或整体抬预算。
- **活跃 Trellis 任务已失去足够的执行语义。** 当前 81 个活跃任务（45 个 `in_progress`、36 个 `planning`）中，24 个至少缺少 `meta.nextAction`、`meta.blocker`、`meta.evidence` 之一；[#309](https://github.com/talex-touch/tuff/issues/309) 应先清理第一执行 lane 的 OTA/发布阻断记录，再把其余 planning 条目明确为被路线图阻塞、等待人工输入或下一可执行动作。不要让 backlog container 继续伪装成进行中的实施批次。
- **未归属的工具输出仍在工作区。** `.dsh-plugin-hub-adapter-staging/`、`.dsh-plugin-hub-install/`、`.dsh-plugin-hub-config-dump.yml`、`.dsh-plugin-hub-root.html` 未跟踪，且不属于本审计提交。其生成者应在保留前建立任务和验证边界；无价值时由其所有者删除，审计不得吞入或清理它们。
