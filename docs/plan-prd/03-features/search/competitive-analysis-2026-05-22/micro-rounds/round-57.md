# 微审计 57/70

- 审计主题

  Raycast Quicklinks / Snippets 的动态占位符与参数填充合同，是否已经能与 Tuff 当前的 `TuffQuery` / `acceptedInputTypes` / `touch-snippets` / `touch-browser-open` 形成一致的最小映射；重点核对“统一变量语法”是否已经被误写成“统一变量引擎”。

- 读取/核对的文档或源码锚点

  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
    - 第 1 节已把 Raycast / Alfred / uTools 的差异收敛到变量流、workflow 生命周期、输入类型匹配，而不是复杂表单。
    - 第 3 节明确把 `TuffQuery`、`acceptedInputTypes`、`touch-snippets`、`touch-browser-open`、`OmniPanel` 视为散点能力。
    - 第 5 节把 `TuffVariableContract v1` 定义为薄解析器，不接管插件执行生命周期。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
    - 第 2.3 节把 Quicklinks / Snippets / AI Commands / Command Arguments 统一到 placeholder / argument 语义。
    - 第 3 节建议 Tuff 先做 `TuffParameterSet` / `ContextActionProvider` / `EvidencePayload`，并强调不要直接上大模板引擎。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 19、20、25、30 条确认 `Quicklinks`、`Snippets`、`{calculator}`、`Alfred Variables` 的映射仍是合同级建议，不是已完成大引擎。
  - `packages/utils/core-box/tuff/tuff-dsl.ts:1237-1345, 1533-1539`
    - `TuffInputType` 只有 `text/image/files/html`。
    - `TuffQuery` 已清楚区分 `text` 与 `inputs`。
    - `ISearchProvider.supportedInputTypes` 只解决“是否接受此类输入”，不负责变量解析。
  - `packages/utils/plugin/index.ts:273-280`
    - `acceptedInputTypes` 只声明 feature 能接收什么输入，不能描述参数填充、默认值或失败态。
  - `plugins/touch-snippets/index.js:109-121`
    - 当前 placeholder 仅硬编码支持 `{{date}}`、`{{time}}`、`{{uuid}}`、`{{clipboard}}`。
  - `plugins/touch-snippets/manifest.json:14-20, 22-45, 48-58`
    - 仅 `clipboard.read` 允许支持 `{{clipboard}}` 与保存片段，feature 仍是 text-only。
  - `plugins/touch-browser-open/index.js:266-272`
    - 搜索引擎 URL builder 已做 `encodeURIComponent`，但它只是内部 query 编码，不是用户可配置 Quicklink schema。

- 结论

  主文档对这个映射点的判断是准确的：Tuff 已有分散的输入与占位符底座，但还没有统一的变量合同。现阶段最合理的表述仍然是“散点能力 + 薄变量解析合同待建”，而不是“已具备 Raycast 式统一 placeholder 体系”。

  进一步看，当前源码已经足够支撑一个很小的 `TuffVariableContract v1`：
  1. `TuffQuery.text` 和 `inputs` 负责输入分层。
  2. `acceptedInputTypes` / `supportedInputTypes` 负责输入适配。
  3. `touch-snippets` 负责旧语法 placeholder。
  4. `touch-browser-open` 负责 URL encode。
  5. 缺的是统一的变量来源、隐私标签、默认值、失败态和 evidence，不是再造一层执行平台。

- 是否发现需修正的主文档问题

  否。`01-11` 现有表述没有把 Tuff 夸大成完整 Raycast placeholder 体系，也没有把 `touch-snippets` / `touch-browser-open` 写成共享变量引擎；`06` 和 `11` 对“缺口”与“合同建议”的边界是对的。

- 本轮未改业务代码、未提交 git 的说明

  本轮只新增本文件，没有修改业务代码，也没有执行 git commit / git push / 分支操作。
