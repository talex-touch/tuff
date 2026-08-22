# 维护审计：需处理项（2026-08-22）

仅记录当前仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-21 审计](./maintenance-audit-2026-08-21.md) 作为当前问题索引，不建立第二套全局优先级。

## 合并、发布与验证可信度

- **`master` 没有必需 CI 检查，代码红灯与未完成检查仍不阻止合并。** [#1716](https://github.com/talex-touch/tuff/issues/1716) 最近一次直接读取（2026-08-20）仍为 `contexts: null`，ruleset 仍是 disabled。2026-08-21 的 master CI 全绿不能填补这个边界；应只要求七个无路径过滤的确定性 `ci.yml` 作业，并以“单一必需检查失败拒绝合并”与“仅改 `packages/utils` 的 PR 不被条件工作流卡住”双向验收。
- **截图能力仍不在发布合同内。** [#321](https://github.com/talex-touch/tuff/issues/321) 的 release workflow 不安装 Rust、不构建或要求 `tuff_native_screenshot.node`；缺失时用户侧没有软件截图回退。先决定“无截图的发行包是否合格”；现有事实支持 release-only 硬门禁：构建 Cargo addon、preflight/afterPack 要求模块、再以打包运行时加载证明。
- **真实环境发行验收仍未完成。** [#308](https://github.com/talex-touch/tuff/issues/308)、[#326](https://github.com/talex-touch/tuff/issues/326)、[#482](https://github.com/talex-touch/tuff/issues/482) 分别仍缺 Windows packaged CoreBox、Windows/Linux OTA N/N-1 恢复、以及 CoreApp 窄窗口 release-notes/Update-history 证据。当前 CI 成功不替代这些运行证据。

## 数据库、索引与功能完整性

- **设置页“清理索引”在默认启用的 split 拓扑下会删掉应用目录、却不清理文件索引。** [#1770](https://github.com/talex-touch/tuff/issues/1770) 已以真实库复现：primary `files` 的 229 条 `app` 记录被无条件删除，`search-index.db` 未受影响。应合入并验证 split-aware 路由、永久保留 `type='app'`，并把 writer guard 从正则导入形式改为连接所有权不变量。
- **search-index split 仍没有隔离 profile 的端到端与回退证据。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 缺一次 split-on 首启重建、两库计数/查询、无 `SQLITE_BUSY` 或 WAL 异常，以及 quiesce/restart 后 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 的一致回退。静态路径梳理和 topology verifier 已完成，不能代替两次真实 CoreApp 启动。
- **目录名过滤仍可能漏掉用户文件。** [#1727](https://github.com/talex-touch/tuff/issues/1727) 需要明确普通用户目录中 `tmp`、`cache`、`logs` 等名字的产品规则，同时保留对构建产物目录的深层排除，并重跑大目录边界验证。

## 安全与依赖风险

- **强制 CSP 的 `default-src` 与 `connect-src` 仍包含通配符。** [#689](https://github.com/talex-touch/tuff/issues/689) 的 `script-src *` 和 `unsafe-inline` 已消除；剩余收敛依赖真实日常使用产生的 `[csp-report-only]` 记录。应由人工在插件 widget、Nexus 与 Sentry 场景下使用应用后检查日志：无违规才将候选 policy 转为 enforcing；有违规则按 directive/origin 定向处理。`unsafe-eval` 是 widget 字符串执行模型的独立设计问题，不能直接删除。
- **生产依赖门禁通过，但风险未归零。** 本次 `check-prod-audit` 仍发现 5 个 Critical/High advisory，均由带到期日的 allowlist 覆盖；[#483](https://github.com/talex-touch/tuff/issues/483) 还确认 json-formatter 随 Monaco vendored `dompurify` 3.2.7 向用户交付，单独加 pnpm override 只会让告警消失、不会替换实际执行的 vendored 代码。应以 Monaco 重新 vendoring 的升级路径处置，并在 2026-11-15 waiver 到期前做干净 tarball/插件运行复验。

## 文档、门禁接线与工作治理

- **Nexus 中英文 API 文档已漂移，且 parity guard 尚未进入 CI。** 本机 `pnpm -C apps/nexus check:doc-parity` 失败：`division-box` 英文少 9 个标题、`flow-transfer` 少 5 个、`intelligence` 少 1 个。[#1776](https://github.com/talex-touch/tuff/issues/1776) 还追踪未接线的 bundle analyzer；应先依据源码补齐英文 API 文档，再接入 parity gate。不得以 `continue-on-error` 或整体上调 bundle 预算伪造绿色。
- **活跃 Trellis 树无法可靠表达执行状态。** 当前 81 个活跃任务中，24 个至少缺 `meta.nextAction`、`meta.blocker`、`meta.evidence`，其中 12 个三项皆空，且一个仍标为 `in_progress` 的旧 v2.4.13-beta.23 安装/发布任务三项皆空。[#309](https://github.com/talex-touch/tuff/issues/309) 应先收敛当前 roadmap 第一执行 lane 的旧 release/OTA 记录，再将其余计划任务明确为“被路线图阻塞”“等待人工输入”或给出下一可执行动作；不要把 backlog container 当作进行中的实施。
- **未归属的工具输出仍留在工作区。** `.dsh-plugin-hub-adapter-staging/`、`.dsh-plugin-hub-install/`、`.dsh-plugin-hub-config-dump.yml`、`.dsh-plugin-hub-root.html` 未跟踪且不属于本审计提交。其生成者应建立任务与验证边界；无价值时由所有者删除，审计不得吞入或清理它们。
