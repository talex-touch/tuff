# 微审计 17/70

## 审计主题

Raycast Search Bar 的“主动输入 + 上下文输入”心智，是否已经能在 Tuff 当前 CoreBox 搜索链路中映射为 `TuffQuery.text` 与 `TuffQuery.inputs` 的清晰边界。

本轮只审一个具体映射点：用户在搜索框输入的文本、剪贴板图片/文件/HTML/长文本、文件模式路径，是否在 Tuff 中有可追踪的数据结构与搜索入口；同时确认这是否已经等价于 Raycast Command Arguments / Search Bar 参数状态机。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
  - 第 2.1 节把 Raycast Search Bar 定义为 Root Search、命令参数、文件导航、URL detection、计算、Inline Translate 的统一入口。
  - 第 2.3 节指出 Tuff 当前 `TuffQuery.text` 与 `inputs` 已能区分主动输入和附加输入，但参数填充仍分散在 Quicklinks、Snippets、AI Commands、Translate 等场景。
  - 第 3 节映射表把 Root Search 与 Command Arguments 分开：前者已有 CoreBox / SearchCore / PluginFeatureAdapter 基础，后者仍缺 manifest 参数字段和原地参数 UI。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 17 条确认 `TuffQuery.text` 与 `inputs` 的区分为 Search Bar + context input 提供基础，`02` 建议统一参数和动作合同，方向正确。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffInputType` 明确定义 `text`、`image`、`files`、`html` 四类输入。
  - `TuffQueryInput` 记录 `type`、`content`、`rawContent`、`thumbnail`、`metadata`，能承载剪贴板图片、文件路径、富文本和来源元数据。
  - `TuffQuery` 注释明确区分：`text` 是用户在输入框中主动输入的查询文本，`inputs` 是剪贴板或其他来源的附加输入数据。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
  - `executeSearch()` 通过 `buildQueryInputs()` 构造附加输入，并在普通搜索、推荐搜索、DivisionBox 广播中发送 `{ text: searchVal.value, inputs }`。
  - 空输入推荐路径也会发送 `{ text: '', inputs }`，说明“没有主动文本但有上下文输入”的场景被保留，而不是被折叠为空查询。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.ts`
  - `buildClipboardQueryInputs()` 对剪贴板输入有明确优先级：image、file mode、clipboard files、HTML/text。
  - 图片会携带 thumbnail 与 `canResolveOriginal` 元数据；文件可走文件模式路径或剪贴板文件；HTML 保留 `rawContent`；文本会做长度阈值和截断。
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
  - `onSearch()` 读取 `query.inputs` 的类型，并在存在非文本输入时按 feature `acceptedInputTypes` 过滤。
  - Text 与 Html 被视为 text-like，可参与命令匹配；image/files 这类非文本输入不会默认暴露给未声明支持的 feature。

## 结论

主文档对 Raycast Search Bar 到 Tuff 的映射判断成立：Tuff 当前已经有真实的数据边界和入口链路，能够把“用户主动输入什么”和“当前上下文附带了什么”分开处理。

已经成立的部分：

1. **主动输入边界清楚**：`TuffQuery.text` 始终来自搜索框文本，不把剪贴板内容伪装成用户 typed query。
2. **上下文输入有结构**：`TuffQuery.inputs` 能表达 image / files / html / text，并保留 thumbnail、rawContent、metadata 等后续 evidence 所需字段。
3. **搜索入口会透传上下文**：`useSearch()` 在普通搜索、推荐搜索和 DivisionBox 输入广播中都发送完整 query，而不是只发字符串。
4. **插件匹配有安全边界**：`plugin-features-adapter` 对非文本输入按 `acceptedInputTypes` 过滤，避免图片或文件上下文被默认交给所有插件。

但这还不能宣称为完整 Raycast Search Bar 参数状态机：

1. **Command Arguments 未闭环**：当前没有 manifest 级 `parameters` 字段，也没有选择命令后在 Search Bar 原地展示 text/dropdown/password 参数输入的统一 UI。
2. **参数结果没有统一落点**：主文档提到的 `TuffQuery.context.parameters` 或 `query.inputs[].metadata.parameters` 仍是设计建议，不是现有稳定合同。
3. **变量解析仍分散**：Quicklinks、Snippets、AI Commands、Translate 对 `{clipboard}`、`{selection}`、date/time/uuid/calculator 的处理还没有共享 `TuffParameterSet`。
4. **evidence 仍不足**：输入来源、权限 reason、截断、原始内容延迟解析、失败原因还没有统一展示到 Search Bar / Action Panel 用户界面。

因此，最准确的口径是：Tuff 已具备 Search Bar + context input 的底层 query contract；下一步应继续按主文档建议补 `TuffParameterSet`、Command Arguments 轻量参数 UI 和 evidence，而不是重做搜索框，也不应把当前 `TuffQuery` 直接说成 Raycast 参数系统完成。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。`02` 和 `11` 没有把当前能力夸大成完整 Raycast Search Bar / Command Arguments，只说 `TuffQuery.text` 与 `inputs` 提供基础，并把参数合同、动作合同和 evidence 列为后续缺口；这与源码一致。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-17.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
