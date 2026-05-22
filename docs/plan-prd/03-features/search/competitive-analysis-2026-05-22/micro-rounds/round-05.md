# 微审计 05/70

## 审计主题

uTools `cmds` 数据源匹配中的“声明可处理某类输入后，触发时能拿到对应上下文”，是否能映射到 Tuff 插件 feature 的 `acceptedInputTypes` 与 `onFeatureTriggered(TuffQuery)` 链路。

本轮刻意避开 round-03 已覆盖的 provider 级输入过滤与 `searchScene`，只审插件 feature 从“被匹配展示”到“被执行触发”时，`text` / `image` / `files` / `html` 上下文是否仍能保留到插件生命周期。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 1 节判断 Tuff 现有 `acceptedInputTypes` 与 `TuffQuery.inputs` 已能承载 text / image / files / html，但缺统一 `ContextActionProvider` 合同。
  - 第 2.1 节把 uTools `cmds` 的 `regex` / `over` / `img` / `files` / `window` 数据源匹配，映射为 Tuff `acceptedInputTypes` + `TuffQuery.inputs`；同时强调 active window 只能作为后置信号，不能自动授权。
  - 第 4 节把文本、图片、文件/文件夹触发分别映射到 `acceptedInputTypes: ["text"]`、`["text", "image"]`、`TuffInputType.Files`，并要求补 input source、provider health、permission、failure reason。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 37 条确认 uTools `plugin.json` 与 Tuff Manifest 都以声明式能力、权限和输入类型为基础，且 Tuff 额外有 `sdkapi` hard-cut。
  - 第 38 条确认 uTools `cmds` 数据源匹配可映射到 `acceptedInputTypes`，并指出 plugin features adapter 会按非文本输入过滤 feature。
  - 第 44 条确认 Tuff 类型支持 text / image / files / html，Translation 支持 text / image，但截图仍需 evidence，不能宣称完整。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffInputType` 定义 `text`、`image`、`files`、`html`。
  - `TuffQueryInput.content` 对不同类型分别承载纯文本、data URL 图像、JSON 序列化文件路径数组、HTML 富文本。
  - `TuffQuery` 明确区分 `text` 是用户主动输入，`inputs` 是剪贴板或其他来源的附加输入。
- `packages/utils/plugin/index.ts`
  - `IPluginFeature.acceptedInputTypes` 声明 feature 可接收的输入类型；未声明时默认只按 text 兼容。
  - `IFeatureLifeCycle.onFeatureTriggered` 的 `data` 参数可为向后兼容字符串，也可为完整 `TuffQuery`，包含可选 `inputs` 数组。
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
  - `PluginFeaturesAdapter.supportedInputTypes` 覆盖 text / image / files / html，说明插件 feature provider 本身会进入多输入搜索链路。
  - 搜索阶段读取 `query.inputs` 得到 `queryInputTypes`；若存在非文本输入，则未声明 `acceptedInputTypes` 的 feature 会被跳过。
  - 对已声明输入类型的 feature，要求 `queryInputTypes.every(...)` 都被接受，才展示该 feature。
  - feature 可因为命中文本命令、命中剪贴板文本命令，或接受当前输入类型而进入结果列表；输入类型命中时 `matchSource` 记为 `input`。
  - 执行阶段把 `searchResult.query` 复制为 `TuffQuery` 后传入 `plugin.triggerFeature(feature, query)`；push 和非 push feature 都保留这一路径。
  - webcontent feature 会把相同 `query` 传给 `PluginViewLoader.loadPluginView(plugin, feature, query)`。
- `apps/core-app/src/main/modules/plugin/view/plugin-view-loader.ts`
  - `loadPluginView()` 接收 `query?: TuffQuery`，并把它继续传给 `coreBoxManager.enterUIMode(...)`，说明 UI 型插件初始打开也可以拿到同一份上下文。
- `plugins/touch-translation/manifest.json`
  - screenshot/image translation feature 声明 `acceptedInputTypes: ["text", "image"]`，是当前“图片上下文触发插件 feature”的具体样本。
- `plugins/touch-snippets/manifest.json`
  - snippet 相关 feature 声明 `acceptedInputTypes: ["text"]`，是当前“文本上下文触发插件 feature”的具体样本。

## 结论

主文档的映射方向成立：Tuff 不是只在类型层声明了 `acceptedInputTypes`，而是在插件 feature 搜索和执行链路中都保留了输入上下文。

具体链路是：

1. renderer / CoreBox 构造 `TuffQuery.text + TuffQuery.inputs`。
2. `PluginFeaturesAdapter.onSearch()` 用 `query.inputs` 判断当前输入类型。
3. 对非文本输入，feature 必须声明 `acceptedInputTypes` 且覆盖全部当前输入类型，才会作为可触发功能展示。
4. 命中后生成的 Tuff item 会把 `acceptedInputTypes`、`pluginName`、`featureId` 和 `matchSource` 写入 meta。
5. 用户执行 feature 时，adapter 将原始 `searchResult.query` 继续传给 `plugin.triggerFeature()`；webcontent feature 也会把 query 交给 view loader 和 UI mode。

这比“只把多类型输入当搜索过滤条件”更完整，已经具备对标 uTools `cmds` 中 `img` / `files` / `over` 等数据源匹配的底层基础。

但主文档要求补 `ContextActionProvider` 仍然必要。原因不是触发链路缺失，而是当前链路还缺产品级解释与验收字段：

- 用户看不到“该插件因为 clipboard image / files / selected text 被推荐”的稳定说明。
- `matchSource: "input"` 过粗，不能区分 `clipboard-image`、`clipboard-files`、`typed-query`、`selected-text`。
- 执行失败后没有统一 `blocked` / `unsupported` / `degraded` / `permission-missing` 的 action result 口径。
- `acceptedInputTypes` 只表达“能处理什么”，还没有表达输入来源、权限状态、平台状态和失败 reason。

因此，`04-utools-plugin-cross-platform.md` 把下一步收敛为 Context Actions v1，而不是复制 uTools 鼠标超级面板 UI，是符合当前架构的最小路径。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。现有主文档没有把 Tuff 宣称为完整复刻 uTools 超级面板，而是准确地区分了底层输入合同已存在、动作解释和 evidence 尚未闭环。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-05.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
