# 微审计 34/70

- 审计主题：Alfred External Trigger 映射到 Tuff workflow contract v1 时，是否应进入首版触发器集合；重点确认它只能是本机 CLI / deep link / typed event 的受控入口，而不能被解读为当前已开放任意远端执行或无需授权的自动化触发能力。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/03-alfred-workflow-model.md`
    - 第 1 节建议 workflow contract v1 支持 `command` / `context` / `external` 三类入口，但同时强调不做 Alfred 式完整节点库、拖拽画布或系统级热字符串自动展开。
    - 第 2 节把 Alfred External Trigger 定义为“允许外部调用 workflow trigger，并可传入参数”，Tuff 映射为 typed event / deep link / local CLI。
    - 第 5.3 节把 v1 触发器限定为 `command`、`context`、`manual`、`external`，其中 `external` 的权限边界是默认关闭，需要用户允许来源和 workflow id。
    - 第 5.6 节明确 External Trigger 启用后必须记录来源、参数 schema 和最后调用时间；第 6 节风险表要求用本机 allowlist、schema 和 run log 约束无边界外部触发。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
    - `workflow-contract-v1-doc-validate` 切片要求 manifest schema 草案、`tuff validate --strict` 检查 workflow id / trigger / input / config / step / permission，并输出 dry-run 风险摘要。
    - evidence 表把 workflow run 的 `trigger`、`steps`、redacted input/output、permissions、logs bucket 作为可记录字段，同时禁止 secret 明文、完整敏感文件内容和未脱敏 payload。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 34 条已给出边界判断：v1 trigger set 包含 `external`，但不要求立即开放任意远端执行；该判断需要由当前 manifest / plugin API 事实支撑。
  - `packages/utils/plugin/index.ts`
    - `IPluginFeature` 当前只声明 feature 级 `commands`、`acceptedInputTypes`、`omniTransfer`、`interaction` 等字段；没有 `workflows[]`、workflow trigger schema、external source allowlist 或 run policy 字段。
    - `IFeatureLifeCycle.onFeatureTriggered()` 当前是 feature 被命令或用户交互触发时的 Prelude handler，payload 可为 string 或 `TuffQuery`；它能承接受控输入，但不是 workflow-level External Trigger 合同。
  - `packages/utils/transport/events/app.ts` 与 `packages/utils/transport/events/index.ts`
    - 已存在 typed system / plugin event 基础，例如 `app:system:open-external`、`plugin:api:trigger-feature`、`plugin:feature:trigger` 等。
    - 这些事件说明 Tuff 有 typed event / plugin trigger 的技术底座，但当前没有公开的 `workflow:external:run` 或本机 CLI dispatch 合同，因此不能把 External Trigger 写成已落地能力。
  - `apps/core-app/src/main/modules/plugin/plugin.ts`
    - `triggerFeature(feature, query)` 会把 feature id、query 和 feature definition 交给 `pluginLifecycle.onFeatureTriggered()`，并用 `AbortController` 取消同一 feature 的旧运行。
    - 该路径适合作为未来 `action.feature.run` 或 command trigger 的底层执行点；但它当前缺 workflow runId、trigger source、参数 schema 校验、permission preflight 汇总和 external enable/allowlist。

- 结论：
  - 主文档把 External Trigger 纳入 workflow contract v1 是合理的，因为 Alfred workflow 的关键价值之一就是“可由外部自动化唤起并传参”；Tuff 若完全排除 external，会削弱 CLI、本机 deep link、插件间自动化和未来 Store workflow card 的表达力。
  - 但这个能力必须保持“合同先行、默认关闭、来源受控”的边界。当前 Tuff 只有 feature trigger、typed transport、CoreBox command/context 等底座，并没有稳定的 workflow external dispatch API；因此文档不能宣称 External Trigger 已实现。
  - 最小可落地定义应是本机入口而非远端入口：例如 `tuff workflow run <workflowId> --json`、受 allowlist 约束的 app deep link、或主进程内 typed event。所有 external run 都必须绑定 workflow id、source、参数 schema、permission preflight、run log redaction 和用户显式启用状态。
  - `packages/utils/plugin/index.ts` 也支持这个保守判断：现有 Manifest / Prelude 只能表达 feature 和 command，不足以表达 workflow 级 triggers、input schema、steps、run record 或 external policy。后续应扩 manifest contract 与 CLI validate，而不是复用 `onFeatureTriggered()` 伪装成完整 External Trigger。
  - 因此本轮审计结论是：External Trigger 应进入 P1 workflow contract v1，但只作为受控本机自动化入口的设计目标；当前状态应标为“有底座，未落地合同”，不能算 Alfred External Trigger parity。

- 是否发现需修正的主文档问题：否。`03`、`10`、`11` 都没有把 External Trigger 写成已实现能力，也没有要求立即开放任意远端执行；它们明确把默认关闭、来源 allowlist、schema、permission preflight、run log 和 redaction 作为首版边界，和源码现状一致。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-34.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理。
