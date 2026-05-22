# 微审计 03/70

## 审计主题

uTools / Alfred 的“按当前输入类型推荐可执行动作”，是否能映射到 Tuff 当前的 provider 输入过滤与 `searchScene` 证据链。

本轮只审一个具体映射点：当查询携带剪贴板文件、图片、HTML 或文本时，Tuff 是否已经能把输入类型传入搜索编排，并过滤到声明支持该输入的 provider / feature；以及主文档把缺口定位为 Context Actions v1 与 evidence，而不是底层输入类型缺失，是否准确。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
  - 第 2 节说明 Alfred Universal Actions 可对文件、URL、文本展示相关动作，uTools 超级面板可按选中文本、图片、文件、文件夹智能匹配功能。
  - 第 3 节把 Clipboard History 标为已落地，但图片/文件/HTML 回贴与隐私 evidence 仍需补。
  - 第 4 节把 Context Actions / Super Panel 标为“部分落地”，证据路径包括 `acceptedInputTypes`、`resolveClipboardInputs`、`ContextProvider`、OmniPanel，缺口是统一“当前上下文 -> 可执行动作”列表合同。
  - 第 5 节建议 P1 基于现有 `acceptedInputTypes` 与 clipboard/context signals，先做 selected text + clipboard image，不做鼠标面板重写。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
  - 第 2.2 节把 Alfred Universal Actions 映射为 Tuff clipboard/files/html inputs 与 MetaOverlay 的最小 Context Actions V1。
  - 第 2.3 节说明 uTools 输入文本、图片、截图、文件或文件夹后会自动展示可处理插件；对 Tuff 的启发是 `acceptedInputTypes` 和 clipboard query inputs 已有基础，但需补 source-level match reason。
  - 第 4 节把“结果召回”和“Action Panel”风险落到 source ready/degraded reason、inputTypes、action failure reason、shortcut coverage。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 6 条确认 Clipboard History 声明 text/image/files/html，主进程有 capture/persistence，P1 补 evidence 的口径合理。
  - 第 18 条确认 `Cmd/Ctrl+K` MetaOverlay / Action Panel 路径存在，缺 action taxonomy 和 evidence。
  - 第 21 条把 Raycast Translate 的映射放到 Context Action，而不是孤立插件，要求选中文本、剪贴板图片、截图翻译统一 evidence。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffInputType` 定义 `text`、`image`、`files`、`html`。
  - `TuffQueryInput` 定义 `content`、`rawContent`、`thumbnail`、`metadata`。
  - `TuffQuery` 明确区分 `text` 和 `inputs`，并说明 `inputs` 来自剪贴板或其他附加输入。
- `packages/utils/plugin/index.ts`
  - `acceptedInputTypes?: Array<'text' | 'image' | 'files' | 'html'>` 为插件 feature 声明可接收的输入类型。
- `plugins/clipboard-history/manifest.json`
  - `clipboard-history` feature 声明 `acceptedInputTypes: ["text", "image", "files", "html"]`，说明多类型输入至少在官方插件声明层存在。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
  - 搜索编排在发现非文本输入时读取 `query.inputs.map((i) => i.type)`。
  - 除 `plugin-features` 外，provider 必须声明 `supportedInputTypes` 且命中输入类型，才会参与本次搜索。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core-utils.ts`
  - `resolveSearchScene()` 会把 `files`、`image`、`html` 分别归类为 `clipboard-files`、`clipboard-image`、`clipboard-html`，否则回落到 `voice` 或 `text`。
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
  - `FileProvider` 声明支持 `Text` 与 `Files`，可成为文件输入场景的 provider。
- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts`
  - `SystemActionsProvider` 声明支持 `Text`、`Files`、`Html`。
  - `collectRawCandidates()` 会从 `Files` 输入解析文件路径，从 `Text` / `Html` 输入抽取候选动作目标。

## 结论

主文档的判断成立：Tuff 已具备把多类型上下文输入送进搜索编排的底层能力，且 provider 选择不会完全无视输入类型。`TuffQuery.inputs` 承载了与 uTools 超级面板、Alfred Universal Actions 相同方向的输入上下文；`search-core.ts` 会基于非文本输入过滤 provider；`search-core-utils.ts` 已把输入类型转成可观测的 `searchScene`。

这说明当前缺口不是“没有输入类型模型”，而是产品层还缺统一动作列表和 evidence：

1. 输入匹配可用，但用户看不到“为什么这个动作匹配当前图片/文件/HTML”。
2. provider 支持类型可过滤，但主文档要求的 source-level match reason、degraded reason、action failure reason 还未形成固定验收样本。
3. `SystemActionsProvider`、`FileProvider`、`clipboard-history` 已有多类型入口，但还没有统一 ContextAction taxonomy 串起 selected text、clipboard image、file path 与 MetaOverlay。
4. 因此 P1 做 `ContextActionProvider` 最小合同、先接 selected text + clipboard image + file path，是比复制 uTools 鼠标超级面板更小、更贴近现有架构的路径。

本轮没有发现主文档夸大当前能力。主文档使用“部分落地”“证据缺口”“产品缺口”的表述比“已完整对齐 Alfred/uTools”更准确。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。现有文档对该映射点的边界是正确的：Tuff 有 `acceptedInputTypes`、`TuffQuery.inputs`、provider `supportedInputTypes` 与 `searchScene` 基础，但仍缺 Context Actions v1 的统一动作合同、匹配原因、失败原因和真实验收样本。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-03.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
