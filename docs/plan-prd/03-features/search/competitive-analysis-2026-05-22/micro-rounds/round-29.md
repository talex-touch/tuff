# 微审计 29/70

## 审计主题

Alfred Universal Actions 与 uTools 超级面板是否应在 Tuff 中统一映射为 `ContextActionProvider`，以及当前源码是否已经具备支撑该方向的动作与输入底座。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/03-alfred-workflow-model.md`
  - 第 2 节把 Alfred Universal Actions 定义为“对选中文本、文件、URL 等上下文展示可用动作”。
  - 第 4 节明确当前不足是 `acceptedInputTypes` 与 Flow target 分散存在，缺统一上下文动作入口；最小建议是新增 `contextActions` / `ContextActionProvider` v1。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 6 节把 uTools 超级面板收敛为 Tuff Context Actions 最小合同，而不是复制桌面鼠标面板。
  - v1 输入限定为 `selected-text`、`clipboard-image`、`files`，输出要求包含 `inputSource`、permission、capability status/reason 和执行结果。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
  - `context-actions-v1` 切片要求 selected text、clipboard image、files 三类输入能看到可执行动作列表。
  - `action-panel-evidence-v1` 切片要求 app/file/plugin/preview/image item 都能打开 Action Panel，并记录 action count、primary/secondary、failure toast。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 29 条结论：Universal Actions 与 uTools 超级面板可统一映射到 `ContextActionProvider`，首版围绕 selected text / clipboard image / files 足够。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffItem.actions?: TuffAction[]` 已能表达单个搜索结果的动作列表。
  - `TuffAction` 已包含 `id`、`type`、`label`、`description`、`icon`、`shortcut`、`payload`、`primary`、`condition`、`confirm`。
  - `TuffInputType` 与 `TuffQuery.inputs` 已覆盖 text/image/files/html，并明确区分用户主动输入的 `text` 与剪贴板等附加输入。
- `packages/utils/plugin/index.ts`
  - `IPluginFeature.acceptedInputTypes` 声明 feature 可处理的输入类型；未声明时默认只兼容文本。
  - `onFeatureTriggered` 可接收 string 或完整 `TuffQuery`，`onItemAction` 可处理 feature 生成 item 的动作。
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
  - provider 支持 text/image/files/html。
  - 查询含非文本输入时，会要求 feature 显式声明并接受所有输入类型。
  - 生成 plugin feature item 时会带一个 `trigger-feature` primary action，并把 `acceptedInputTypes` 放入 `meta.extension` 供前端判断。
- `apps/core-app/src/renderer/src/components/render/ActionPanel.vue`
  - 当前 Action Panel 会合并 item 自身 actions、pin/copy/reveal/image translate/flow transfer 等内置动作。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
  - action 执行路径已能处理 pin、copy title、reveal、flow transfer、image translate，并对未知 item action fallback 到 `CoreBoxEvents.item.execute`。
- `packages/utils/plugin/sdk/quick-actions-sdk.ts`
  - 插件可通过 QuickActions SDK 注册全局 MetaOverlay action，并监听自身 action execute 事件。

## 结论

主文档的方向成立，但必须继续保持“底座存在，统一合同未完成”的表述。

当前 Tuff 已经有三块可复用底座：

1. **输入底座**：`TuffQuery.inputs` 与 `acceptedInputTypes` 能表达 text/image/files/html，并在插件 feature 搜索时过滤非文本输入。
2. **结果动作底座**：`TuffItem.actions`、ActionPanel 和 `useActionPanel()` 能对当前搜索结果展示并执行动作。
3. **全局动作底座**：QuickActions SDK 可把插件动作注册到 MetaOverlay。

但这些还不是 Alfred Universal Actions 或 uTools 超级面板意义上的完整 Context Actions：

1. 仓库中没有真实 `ContextActionProvider` 类型或实现；当前命中主要来自本次竞品分析文档。
2. `acceptedInputTypes` 只能说明 feature 能处理哪些输入，不能说明该动作为什么匹配当前上下文、输入来自 selected text 还是 clipboard image，也不能表达 permission/capability reason。
3. `ActionPanel.vue` 的动作列表以 item actions 和内置动作拼接为主，不是从统一 provider 输出的 `inputSource + confidence + permission + executeResult` 合同生成。
4. QuickActions SDK 是全局 MetaOverlay action 注册面，不等于“针对当前 selected text / clipboard image / files 动态筛选动作”的上下文动作 provider。

因此，round-29 的精确判断是：`ContextActionProvider` 是正确的 P1 收敛点，首版只做 selected text、clipboard image、files 是合理的 KISS 路线；实现时应复用现有 `TuffQuery.inputs`、`acceptedInputTypes`、`TuffItem.actions`、ActionPanel 和 QuickActions SDK，而不是新增一套平行输入模型，也不应复制 uTools 长按鼠标右键超级面板。

## 是否发现需修正的主文档问题

否。

`03`、`04`、`10`、`11` 没有把当前源码夸大成完整 Universal Actions / 超级面板能力，而是明确把缺口放在 `ContextActionProvider`、inputSource、permission/status/reason、execute result 和 evidence 上。源码核对结果与该口径一致。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增本微审计输出文件，未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout。
