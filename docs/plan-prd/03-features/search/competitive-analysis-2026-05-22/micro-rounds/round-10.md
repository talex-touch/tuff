# 微审计 10/70

- 审计主题：Raycast / Alfred 的 Action Panel / Universal Actions 是否已在 Tuff 里形成稳定动作桥接，还是仍停留在单点 `item.execute` / `copy` / `pin` / fallback 层。
- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`：Action Panel 被定义为结果项的统一动作层，强调主动作、次动作、分组与可搜索动作列表。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`：把 uTools 超级面板收敛为 Tuff `ContextActionProvider` 的映射，不建议重做鼠标面板。
  - `packages/utils/core-box/tuff/tuff-dsl.ts`：`TuffDisplayItem.actions`、`TuffAction`、`TuffQuickAction` 已经提供动作数据结构。
  - `packages/utils/transport/events/types/meta-overlay.ts`：`MetaShowRequest` 区分 `builtinActions` / `itemActions` / `pluginActions`，`MetaActionExecuteRequest` 定义了执行入口。
  - `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`：Action Panel 通过 transport 接收打开事件，处理 `toggle-pin`、`copy-title`、`reveal-in-finder`、`flow-transfer`、图片翻译与 `item.execute` fallback。
  - `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.test.ts`：确认了 MetaOverlay 到 Action Panel 的 copy-title / toggle-pin 事件桥接。
- 结论：Tuff 已经有真实可用的动作执行桥，但它还是一个通用执行桥，不是第一类动作合同。现状能做 copy/pin/reveal/flow-transfer/图片翻译和兜底执行，但还没有统一的动作 taxonomy、输入来源、权限理由、失败 reason、可检索动作分组和证据展示。
- 是否发现需修正的主文档问题：否。主文档把缺口放在 `ContextActionProvider`、evidence 和 failure reason 上是对的，没有把现有桥接误写成完整动作体系。
- 本轮未改业务代码、未提交 git 的说明：本轮仅新增本文件并更新 `.codexpotter` 进度记录，未修改业务代码，未执行 git commit / push / branch / reset / checkout。
