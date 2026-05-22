# 微审计 01/70

## 审计主题

`acceptedInputTypes` + `TuffQuery.inputs` 是否足以作为 uTools 超级面板 / Alfred Universal Actions 的最小映射底座。

本轮只审一个具体映射点：当 CoreBox 携带剪贴板图片、文件路径、长文本或 HTML 输入时，Tuff 是否已经有类型、查询构造和插件过滤链路，支撑主分析文档中“不要复制鼠标超级面板，先做 Context Actions v1”的判断。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 1 节明确：Tuff 已有 `acceptedInputTypes` 与 `TuffQuery.inputs` 承载 `text / image / files / html`，缺口是统一 `ContextActionProvider` 合同，而不是复制 uTools 超级面板 UI。
  - 第 3 节把输入合同、剪贴板输入和插件触发列为当前能力；第 4 节把图片、文件、超级面板映射到 CoreBox/MetaOverlay Context Actions。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
  - 第 1 节说明 `TuffQuery` 已区分主动输入与附加输入，`acceptedInputTypes` 只能表达“能接收什么”，还缺参数 resolver / failure evidence。
  - 第 3 节列出 `TuffQuery`、`IPluginFeature.acceptedInputTypes`、`plugin-features-adapter.ts` 的 live-tree 对照。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 38 条确认 uTools `cmds` 数据源匹配可映射到 `acceptedInputTypes`，adapter 会按输入类型过滤。
  - 第 39 条确认不应复制 uTools 长按右键超级面板，首版应落在 CoreBox/MetaOverlay 动作列表。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffInputType` 定义 `text`、`image`、`files`、`html`。
  - `TuffQueryInput` 定义 `content`、`rawContent`、`thumbnail`、`metadata`。
  - `TuffQuery` 明确区分 `text` 与 `inputs`，其中 `text` 是用户主动输入，`inputs` 是剪贴板或其他附加输入。
- `packages/utils/plugin/index.ts`
  - `IPluginFeature.acceptedInputTypes?: Array<'text' | 'image' | 'files' | 'html'>`。
  - `onFeatureTriggered` 的 payload 允许 string 或完整 `TuffQuery`，可携带图片、文件、HTML 等 clipboard inputs。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.ts`
  - renderer 会把剪贴板图片、file mode、剪贴板文件、长文本/HTML 构造成 `TuffQueryInput[]`。
  - 文本/HTML 有长度与截断边界，图片优先用 preview/thumbnail，文件型持久 clipboard item 可只传 `clipboardId` metadata。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
  - `executeSearch()` 会把 `text` 与构造出的 `inputs` 一起发送到 `CoreBoxEvents.search.query`。
  - 执行插件 feature 前会重新构造 `currentInputs`，并写回 `serializedSearchResult.query.inputs`。
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
  - 对非文本输入，会跳过未声明 `acceptedInputTypes` 的 feature。
  - 对多输入类型，要求 feature 接收所有 query input types，避免 image/files 误进入 text-only feature。

## 结论

主文档的映射判断成立：Tuff 已经有足够的底层合同来承接 uTools 超级面板 / Alfred Universal Actions 的最小子集，不需要为了竞品对齐重做桌面鼠标面板。

当前事实链路是：

1. 类型层：`TuffInputType` 覆盖 `text / image / files / html`，`TuffQuery.text` 与 `TuffQuery.inputs` 已拆开。
2. renderer 层：CoreBox 查询会从剪贴板或 file mode 构造 `TuffQueryInput[]`，并随搜索请求与插件执行请求传递。
3. main 层：插件 feature adapter 会根据 `acceptedInputTypes` 过滤非文本输入，避免图片/文件上下文误触发普通文本插件。
4. SDK 层：插件 feature 生命周期接收 string 或 `TuffQuery`，具备处理上下文输入的形态。

但这还不是完整的 Context Actions 产品闭环。主文档把缺口定位为 `ContextActionProvider` / evidence / failure reason 是准确的：现在能表达“这个 feature 接受哪些输入”，但还没有统一表达“这个输入来自哪里、为何匹配、需要什么权限、执行失败原因是什么、用户在哪个动作面板可见”。因此 P1 继续做 selected text / clipboard image / files 的 Context Actions v1 是合理的，且应复用现有 `TuffQuery.inputs`，不要新增一套平行输入模型。

本轮发现一个小的代码注释风险，但不构成主文档问题：`useClipboardState.ts` 注释自称 clipboard query 的 single source of truth，而当前 `useSearch.ts` 实际调用的是 `clipboard-query-inputs.ts`。微审计结论以实际调用链为准；这个注释漂移可留给后续源码清理，不影响本轮主文档判断。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档对该映射点的表述保持了正确边界：Tuff 有底层输入合同，但缺统一 Context Actions evidence；不应复制 uTools 鼠标超级面板。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-01.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
