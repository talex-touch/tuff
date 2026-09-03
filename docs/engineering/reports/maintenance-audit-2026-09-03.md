# 维护审计：需处理项（2026-09-03）

仅记录本次重新核验后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-09-02 审计](./maintenance-audit-2026-09-02.md) 作为当前问题索引，不建立第二套全局优先级。

## 数据库、数据完整性与生成物

- **默认开启的 search-index split 仍不可作为发布完成证据。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 缺同一 disposable profile 下 default-on 首启、索引、查询、健康，以及 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 回滚重启的计数和结果 parity；静态验证不能替代应用实跑。
- **SQLite 写者、admission 与 retry 归属尚未完整。** [#351](https://github.com/talex-touch/tuff/issues/351) 的 guard 覆盖面不足，参数化删除和 direct fallback / fire-and-forget usage 写入的 `SQLITE_BUSY` 丢失语义仍未定案。先定义单一所有权和可恢复策略，再扩大 guard。
- **遥测、隐私删除和 Credits 写入尚无原子、幂等闭环。** [#1788](https://github.com/talex-touch/tuff/issues/1788) 仍需 D1 原子 ingest、receipt retention、export/delete/finalization 与 Preview/Production 脱敏证据；当前不能把局部测试视为数据治理完成。
- **插件 source-package release receipt 过时且失败。** `.trellis/tasks/07-18-plugin-source-package-audit/evidence/source-package-audit.json` 仍是 dirty revision、`failed` 状态；必须在干净且单一所有者的工作树重新生成，不能用于发布判断。

## 安全、发布与功能门禁

- **截图 native addon 未被 release workflow 强制构建或验收。** [#321](https://github.com/talex-touch/tuff/issues/321) 所描述的 Cargo、afterPack 与实际 tag 三平台产物门仍未闭合；缺模块时功能不可用。先确定发布策略，再用正式产物验收。
- **跨平台 OTA、Windows Everything 和 release-notes 都缺真实交互证据。** [#326](https://github.com/talex-touch/tuff/issues/326)、[#308](https://github.com/talex-touch/tuff/issues/308)、[#482](https://github.com/talex-touch/tuff/issues/482) 分别需要真实 N→N+1、Windows CoreBox 四场景（含 degraded 语义决定）和 release-notes desktop/narrow captures；现有静态或 CI 证据不等价。
- **CSP 仍停留 report-only，依赖 `unsafe-eval`。** [#689](https://github.com/talex-touch/tuff/issues/689) 需要先采集候选策略真实运行日志，再隔离替代已编译 widget `new Function` 的加载机制；禁止未经观测直接收紧策略。
- **生产依赖风险尚未完全处置。** [#1098](https://github.com/talex-touch/tuff/issues/1098) 的五条 Nuxt High 临时豁免将于 2026-11-09 到期；[#483](https://github.com/talex-touch/tuff/issues/483) 的 Moderate/Low 告警也没有完整 disposition。允许列表不是修复。
- **squash merge 仍可能被提交正文意外关闭 issue。** [#1792](https://github.com/talex-touch/tuff/issues/1792) 需要在合并前扫描 constituent commit bodies，并建立回归用例。

## 验证、文档与人工动作

- **`docs:verify` 当前失败，报告门不可用。** verifier 实测 `DOC-TASK-ACTIVE-COMPLETED=5` 与 `DOC-TASK-META=15`：五个 completed task 仍位于活跃树，另有五个任务缺 `blocker`、`nextAction`、`evidence`。由 [#309](https://github.com/talex-touch/tuff/issues/309) 的 task-governance owner 写入真实状态或归档；不得用占位文本伪造进度。
- **四项安全/质量检查未能启动。** `pnpm check:prod-audit`、`privacy:inventory:verify`、`check:orphan-tests`、`check:build-allowlist` 和 `plugins:validate` 都在依赖状态检查阶段被 `packages/tuff-native` 的 Node 26 `node-gyp rebuild` 阻断：已有 `build/node_gyp_bins/python3` 时创建同名 symlink 返回 `EEXIST`。这与 [#1843](https://github.com/talex-touch/tuff/issues/1843) 的 Node 26 native rebuild 主题相关但错误形态不同；维护者须复现、判定同根后扩展该 issue 或新建独立 root-cause issue。验证未执行，不应被报告为通过。
- **Nexus worker bundle gates 尚未接线。** [#1776](https://github.com/talex-touch/tuff/issues/1776) 仍须先以实际产物解决 gzip/chunk/page budget 与图标规则冲突，再接为阻断 gate；禁止 `continue-on-error`。
- **路线图需要人工收口任务治理。** 全局顺序文件已指向 release/runtime 再到 search/cross-platform，但 98 个活跃任务中含已完成记录与空元数据，造成 `docs:verify` 失效并掩盖真实阻塞。先完成 #309 的归档/元数据收口，再更新每个 lane 的可执行 owner 与真实设备条件；本报告只更新当前审计入口，不重写任务本地优先级。

## 本次验证边界

- Drizzle snapshot ratchet 通过，未发现新增 snapshot drift。
- `mise run docs:verify` 与直接 verifier 均失败，原因如上。
- 本工作树存在其他所有者的两处未提交测试修改；本报告和推送不包含它们。
