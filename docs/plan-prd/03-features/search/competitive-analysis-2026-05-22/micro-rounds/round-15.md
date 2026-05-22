# 微审计 15/70

- 审计主题：selected text 进入 OmniPanel 后，是否已经能等价映射为 Raycast / Alfred Universal Actions / uTools 超级面板式的 Tuff Context Action 输入。
- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`：第 6 节把超级面板收敛为 `ContextActionProvider`，首批输入限定为 `selected-text`、`clipboard-image`、`files`，并要求每个 action 带 `inputSource`、permission、capability status/reason 和执行结果。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`：`context-actions-v1` 的验收字段明确要求 selected text、clipboard image、files 三类输入都有可解释动作列表，且不复制 uTools 鼠标超级面板。
  - `apps/core-app/src/main/modules/omni-panel/index.ts`：`executePluginFeature()` 会把 OmniPanel 的 `contextText` 传给插件 feature；`buildFeatureQuery()` 会生成 `TuffQuery`，并在 `inputs[0].metadata.source` 写入 `omni-panel:${source}`。
  - `packages/utils/core-box/tuff/tuff-dsl.ts`：`TuffQuery.text` 与 `TuffQuery.inputs` 已拆开，`TuffQueryInput.metadata` 可承载来源信息，但当前 DSL 没有一等的 `inputSource` / permission / capability reason 字段。
  - `packages/utils/plugin/index.ts`：`IPluginFeature.acceptedInputTypes` 只声明 `text/image/files/html`，`onFeatureTriggered` 能接收 string 或完整 `TuffQuery`。
  - `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`：对非文本输入会按 `acceptedInputTypes` 过滤；文本和 HTML 被视为 text-like，可参与 command matching。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-01.md`、`round-09.md`、`round-10.md`：已有微审计分别确认了输入底座、当前 item 动作面板和动作桥接；本轮只补 selected text 专用路径的边界。
- 结论：主文档的边界判断成立。Tuff 已经有 selected text -> OmniPanel -> plugin feature 的真实路径，且能把选中文本包装为 `TuffQuery.text` 和 `TuffQuery.inputs.text`，这足以证明 selected text 可以复用现有 CoreBox / plugin 输入模型，不需要另建一套超级面板输入模型。

  但它还不能被写成完整 Context Actions 已完成。当前 `buildFeatureQuery()` 写入的 metadata 主要是 `source` 与 `featureId`，并没有统一的 action id、confidence、permission、capability.status、capability.reason、执行状态枚举或用户可见 evidence。`executeCoreBoxTransfer()` 也只是把选中文本塞回 CoreBox 查询框，不是生成一组可搜索、可解释、可失败提示的上下文动作。

  因此，`context-actions-v1` 的最小下一步应继续沿用主文档口径：只做 selected text / clipboard image / files 三类输入；复用 `TuffQuery.inputs` 与 `acceptedInputTypes`；新增的是动作合同和 evidence 字段，而不是桌面鼠标超级面板或并行输入系统。
- 是否发现需修正的主文档问题：否。主文档没有把 OmniPanel selected text 夸大为完整 Universal Actions / 超级面板，只把它列为可复用底座，并把缺口放在 `ContextActionProvider`、permission/status/reason 和 evidence 上；这与源码一致。
- 本轮未改业务代码、未提交 git 的说明：本轮仅新增本文件并更新 `.codexpotter` 进度记录，未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
