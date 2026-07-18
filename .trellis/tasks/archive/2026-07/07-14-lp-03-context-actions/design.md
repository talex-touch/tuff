# LP-03 Technical Design

## Architecture

扩展现有 CoreBox 搜索/执行抽象，不创建第二套 UI 状态机：

1. `packages/utils/core-box/context-actions.ts` 作为共享合同所有者，定义上下文输入、查询元数据、动作匹配、provider、执行结果与 CoreBox 打开请求。
2. OmniPanel 保留现有选区捕获实现。快捷键显式触发时，优先生成 selected-text 输入；无文本时才读取 clipboard image，并通过 typed CoreBox event 打开 Context Actions。
3. Renderer `useSearch` 接收 typed open request，构造带 `TuffQuery.inputs` 和 `TuffContext.contextAction` 的查询；普通输入会退出 context mode。
4. `ContextActionsProvider` 作为 CoreBox `ISearchProvider` 注册。它将共享 `ContextActionProvider` 合同适配成 `TuffItem`，只匹配显式 context query。
5. AI/OCR/Browser 动作由内置 provider 定义表执行；表项持有类型化 executor，不用字符串 switch 分发。
6. Snippets、Translation 与 Dev Utils 动作生成现有 `PluginFeaturesAdapter` 条目，执行仍回到 `plugin-features` provider 和插件生命周期。

## Data Flow

```text
Explicit OmniPanel shortcut
  -> captureSelectionText (clipboard snapshot/restore)
  -> if empty: clipboard.readImage
  -> CoreBoxEvents.contextActions.open(request)
  -> renderer TuffQuery { inputs, context.contextAction }
  -> SearchEngineCore
  -> ContextActionsProvider.match + curated plugin feature matching
  -> CoreBox TuffItem list
  -> CoreBoxEvents.item.execute
  -> owning provider onExecute
  -> TuffIntelligence / PluginFeaturesAdapter / Browser Open
  -> activation-scoped result item or plugin UI result list
```

## Contracts

- `ContextActionInput`：`text` 与 `image` 判别联合；预留合同输入类型只声明 `files/html`，第一版不生成文件上下文。
- `ContextActionQueryContext`：session id、input type、source、capturedAt、捕获诊断；不携带原始敏感内容。
- `ContextActionMatch`：稳定 action id、provider id/displayName、输入类型、标题/说明/icon、可用状态与 typed unavailable reason。
- `ContextActionResult`：`success` / `error` 判别联合；成功输出可为 text/external/plugin；错误包含 code、message、recoverable。
- 原始文本/图片只走 `TuffQuery.inputs` 与执行时内存态，不写日志、SQLite、普通配置或 activation metadata。

## Matching

- 只有 `query.context.contextAction.mode === 'context-actions'` 才启用 provider。
- Text：QuickReview、AI translate/summarize/polish/rewrite、web search；并解析 touch-translation、touch-snippets/snippets-save、touch-dev-utils/dev-utils。
- Image：vision.ocr、OCR -> text.translate、image.caption。
- TuffIntelligence 动作用 capability status 生成可用/不可用匹配项。
- 缺失、禁用或输入类型不匹配的官方插件显示 unavailable item，不静默消失。

## Execution State

- CoreBox 原生 loading 表示执行中。
- 内置动作完成后返回 provider activation，仅携带 session/result id；provider 私有内存保存结果并在后续搜索渲染成功/失败条目。
- 文本输出结果提供 CoreBox item action 复制能力。
- 插件动作沿用插件 push/widget/webcontent 状态，不复制状态机。

## Compatibility And Privacy

- 不改变 `TuffQuery.inputs`、`acceptedInputTypes` 或既有 plugin item contract 的语义。
- 不新增 raw channel；新事件通过现有 typed event builder。
- OmniPanel 鼠标长按面板保持原行为；键盘快捷键作为 LP-03 显式 CoreBox 入口。
- selected text 优先，只有无文本时才读取 clipboard image；无显式触发不调用新读取逻辑。
- 文件输入不进入 AI provider。

## Rollback

删除 ContextActions provider 注册、typed event 与 OmniPanel 快捷键分支即可恢复原 CoreBox 搜索；不涉及数据库迁移或持久化数据。
