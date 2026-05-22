# 微审计 09/70

## 审计主题

Raycast Action Panel / Alfred Universal Actions / uTools 超级面板，是否已经能在 Tuff 中具体映射为 CoreBox 当前 item 的可搜索动作面板。

本轮只审一个窄点：Tuff 现有 `TuffItem.actions`、内建 actions、`Cmd/Ctrl+K`、`MetaOverlay` 和 `useActionPanel()` 是否支撑主文档“先做 CoreBox/MetaOverlay Context Actions，不复制 uTools 鼠标超级面板”的判断。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
  - 第 2.2 节把 Raycast Action Panel 定义为每个 item 的统一动作路由，并指出 Tuff 已有 `useActionPanel()`、MetaOverlay bridge、`TuffItem.actions` 与若干内建 action。
  - 第 5 节要求 Action Panel 继续补 action group、shortcut、evidence toast，并用 app/file/image/snippet/quicklink 样本验收。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/03-alfred-workflow-model.md`
  - Universal Actions 被映射为 selected text / clipboard image / files 的上下文动作入口，而不是完整复制 Alfred workflow graph。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 6 节明确：超级面板应收敛为 `ContextActionProvider` 合同，供 CoreBox、MetaOverlay、Assistant 或未来入口复用；不做长按鼠标右键桌面面板。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
  - 第 4.1 节指出 Tuff `MetaOverlay`、built-in actions、item actions、插件 activation、clipboard/file inputs 已有雏形，但还缺统一 evidence。
  - 第 7.3 节把 Action Panel evidence 定义为 action count、primary action latency、failure reason、shortcut coverage。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 18 条确认 `Cmd/Ctrl+K` MetaOverlay / Action Panel 路径存在，缺 action taxonomy 和 evidence。
  - 第 39 条确认不应复制 uTools 长按右键超级面板，应先做 CoreBox/MetaOverlay 动作列表。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffItem.actions?: TuffAction[]` 已作为 item 级动作容器。
  - `TuffAction` 支持 `id`、`type`、`label`、`description`、`icon`、`shortcut`、`payload`、`primary`、`condition`、`confirm`。
  - `TuffQuickAction` / `TuffQuickActionRender` 已有 `group`、`shortcut`、`disabled`、`danger` 等 MetaOverlay 渲染字段。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
  - `generateBuiltinActions()` 为当前 item 生成 `toggle-pin`、`copy-title`、`reveal-in-finder`、图片翻译、`flow-transfer` 等动作。
  - `convertTuffActionToMetaAction()` 将 item 自带 `TuffAction` 转成 MetaOverlay action。
  - `Cmd/Ctrl+K` 会把当前 item、builtin actions、item actions 发送到 `MetaOverlayEvents.ui.show`。
- `apps/core-app/src/renderer/src/views/meta/MetaOverlay.vue`
  - `MetaOverlay` 会合并 `pluginActions`、`itemActions`、`builtinActions`，按 priority 排序。
  - 面板支持按 title/subtitle 搜索、按 group 展示、方向键导航、Enter 执行和快捷键匹配。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
  - `executeAction()` 对内建 action 有明确分支；未知 item action 目前仅支持 `navigate` 特例，其余 fallback 到 `CoreBoxEvents.item.execute`。

## 结论

主文档的方向成立：Tuff 已经具备“当前 item -> 可搜索动作面板”的真实入口，不需要为了对齐 Raycast / Alfred / uTools 重新做一套桌面鼠标超级面板。

现有事实链路是：

1. 数据层：`TuffItem.actions` 与 `TuffAction` 已能表达 item 级动作、快捷键、payload、confirm 和条件。
2. 入口层：CoreBox 的 `Cmd/Ctrl+K` 会基于当前 focus item 生成 builtin actions，并把 item actions 送入 MetaOverlay。
3. 展示层：MetaOverlay 已支持 action 搜索、分组、priority 排序、键盘导航和快捷键触发。
4. 执行层：`useActionPanel()` 能处理固定内建动作、导航动作和 fallback 执行。

但这个映射还不能被写成“完整 Context Actions 已完成”。当前缺口也与主文档一致：

- action taxonomy 还未稳定：`TuffAction.type`、`TuffQuickAction.handler`、MetaOverlay `handler` 与具体执行分支之间没有统一执行合同。
- failure evidence 不完整：权限缺失、平台不支持、依赖缺失、执行失败目前没有统一 reason 结构进入 Action Panel。
- plugin/global actions 与 item actions 的关系还需要 contract 化：MetaOverlay 类型支持 `pluginActions`，但 CoreBox item 级路径主要传 builtin + item actions。
- `useActionPanel()` 对未知 action 的 fallback 会执行整个 item，容易把“某个次动作失败/未实现”折叠成默认执行，后续 evidence 需要把 unsupported 和 fallback 区分开。

因此，主文档把下一步定为 `ContextActionProvider` / action evidence / failure reason，而不是重做 uTools 式鼠标面板，是正确且克制的。建议后续验收样本继续按 app、file、plugin、preview/image、snippet/quicklink 五类 item 跑，而不是先扩 UI 面积。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档没有把现状夸大成完整 Raycast Action Panel 或 Alfred Universal Actions，只说已有入口和雏形、缺 action taxonomy 与 evidence；这与源码一致。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-09.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
