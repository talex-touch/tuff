# 微审计 35/70

- 审计主题：Raycast Quicklinks / AI Commands 的动态参数能力，是否已在 Tuff 中落成统一的变量合同，而不是只停留在 `TuffQuery.inputs`、`acceptedInputTypes`、固定 `promptTemplate` 和内置 AI action payload 的分散实现。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
    - 把 Raycast 的 Quicklinks、Snippets、AI Commands、Command Arguments 与 Alfred / uTools 的变量与输入语义统一对照，明确最小下一步是 `TuffVariableContract v1`，而不是完整模板平台。
    - 现有 Tuff 证据被拆成 `TuffQuery`、`acceptedInputTypes`、`touch-snippets`、`touch-browser-open`、`touch-translation`、OmniPanel 和 Flow payload，说明当前是分散合同，不是统一 resolver。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
    - Raycast 的参数填充被定义为跨 Quicklinks、Snippets、AI Commands、Command Arguments 复用的能力。
    - 文档建议 Tuff 先做 `TuffParameterSet` / `ContextActionProvider` / evidence 三个小合同，不照搬完整表单或画布。
  - `packages/utils/core-box/tuff/tuff-dsl.ts`
    - `TuffQuery` 只区分 `text` 与 `inputs`，`TuffQueryInput` 只覆盖 `text`、`image`、`files`、`html` 四类输入。
    - 这说明 Tuff 目前的输入底座是多类型查询输入，而不是通用变量 spec。
  - `packages/utils/plugin/index.ts`
    - `IPluginFeature` 只有 `acceptedInputTypes`、`commands`、`interaction`、`omniTransfer` 等声明面，没有 `parameters` / `variables` / `defaultValue` / `validation` 这一类统一变量字段。
  - `plugins/touch-browser-open/index.js`
    - `buildSearchUrl(query)` 只是内部函数对搜索 query 做 `encodeURIComponent`，没有用户可管理的 Quicklink schema，也没有参数字段或 source / failure evidence。
  - `apps/core-app/src/main/modules/ai/intelligence-sdk.ts`
    - AI 能力执行链只接收 `promptTemplate` / `promptVariables` / `metadata`，并在 invoke 时记录 audit、缓存、provider 选择与失败重试。
    - 这更像运行时 prompt 渲染，而不是插件级统一参数模型。
  - `apps/core-app/src/renderer/src/views/omni-panel/ai-actions.ts`
    - OmniPanel 内置 AI action 目前直接把 selected text 组装成固定 payload：translate / summarize / rewrite / review / chat。
    - 这说明 UI 入口已存在，但仍是固定动作映射，不是可配置的 AI Command 参数合同。

- 结论：
  - 主文档口径成立。Tuff 当前没有把 Raycast Quicklinks / AI Commands 的动态参数收敛成一套统一变量模型。
  - 现状更准确地说是三层分散底座：`TuffQuery.inputs` 负责多输入载荷，`acceptedInputTypes` 负责输入类型过滤，`promptTemplate` / `promptVariables` 负责 AI invoke 级模板渲染。
  - 这三层能支撑一部分参数化场景，但还缺最小统一合同所需的 `name`、`source`、`type`、`defaultValue`、`validation`、`privacy`、`modifiers` 和 evidence 字段，所以不能宣称已经有 Raycast 级的参数系统。
  - 因此，主文档把下一步收敛成 `TuffVariableContract v1` 是合理的；首批应优先覆盖 Quicklinks、Snippets、Translate、AI Commands 的共用 resolver，而不是先扩展复杂 workflow 或全局表单平台。

- 是否发现需修正的主文档问题：否。`02` 和 `06` 没有把当前实现夸大成完整变量平台，反而明确写出这是薄合同、分散证据和后续统一 resolver 的问题，和源码事实一致。

- 本轮未改业务代码、未提交 git 的说明：本轮仅新增本文件作为微审计输出，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 `git commit` / `git push` / 创建分支 / reset / checkout / 清理工作树操作。
