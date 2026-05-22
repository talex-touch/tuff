# 微审计 53/70

- 审计主题

剪贴板上下文输入在 Tuff CoreBox 中是否有足够清晰的自动附加、隐私与插件匹配边界；重点映射 Raycast Clipboard / Alfred Universal Actions / uTools 超级面板的“当前输入能做什么”，避免把“能读取剪贴板”误写成“可以默认把剪贴板内容交给所有能力”。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
   - 第 1 节把失败态、provider 不可用、权限与输入缺失列为 Raycast 丝滑体验的关键约束。
   - 第 3 节把 Clipboard History、Translate、Action Panel、ContextActionProvider 和 EvidencePayload 拆成输入来源、权限、provider、trace / failure reason，而不是只做功能入口。
   - 风险表明确写到 selected text / clipboard 不能默认静默发送，clipboard 自动读取需要记录 input source，不记录原文。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
   - 第 2.3 节说明 uTools 输入框可输入文本、粘贴图片、截图、文件或文件夹，并按数据源匹配插件；Tuff 对应底座是 `acceptedInputTypes` 与 clipboard query inputs。
   - 第 4 节把 Context input 样本定义为 clipboard text URL、clipboard image、file path input、HTML input，并要求补 source diagnostics、inputTypes、failure / degraded reason。
   - 第 6 节明确 search trace / evidence 不记录 query 明文、剪贴板明文或文件内容。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 6 条确认 Clipboard History 多类型输入边界存在，但图片/文件/HTML 回贴与隐私 evidence 仍是 P1。
   - 第 29、38、44 条把 Universal Actions / 超级面板 / 多数据源触发统一落到 `acceptedInputTypes` 与 `TuffQuery.inputs`，同时保留截图和 source evidence 缺口。
4. `packages/utils/core-box/tuff/tuff-dsl.ts`
   - `TuffInputType` 只定义 `text`、`image`、`files`、`html` 四类输入。
   - `TuffQuery.text` 明确是用户在输入框中主动输入的查询文本；`TuffQuery.inputs` 才是剪贴板或其他来源附加输入。
   - `TuffQueryInput.metadata`、`thumbnail`、`rawContent` 为后续 evidence 提供结构，但不是用户可见 evidence 的完成态。
5. `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.ts`
   - `buildClipboardQueryInputs()` 按 image、file mode、clipboard files、text/html 的优先级构造输入，遇到 image / files 会直接返回单一输入，避免把多种剪贴板态混在一起。
   - 文本输入默认不会短文本全量附加；只有 URL-like、长度达到 `MIN_TEXT_ATTACHMENT_LENGTH`，或插件执行阶段允许 pending text 且 query 未被编辑时才附加。
   - `safeSerializeClipboardMetadata()` 只保留 string / number / boolean / string[]，避免把复杂对象或不可控结构塞进 query metadata。
   - 文本和 HTML 会分别按 `MAX_TEXT_INPUT_LENGTH` / `MAX_HTML_INPUT_LENGTH` 截断。
6. `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
   - `executeSearch()` 会把 `{ text, inputs }` 一起广播和发送给搜索主进程；空输入推荐路径也保留 `inputs`。
   - 执行插件 feature 时，只有 `isPluginFeature` 才允许 pending short text clipboard 作为附加输入；执行后会清理已消费的 clipboard input 状态。
7. `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
   - `PluginFeaturesAdapter.supportedInputTypes` 支持 text / image / files / html。
   - 搜索时 `Text` 和 `Html` 被视为 text-like，可参与 command match；image / files 这类 non-text input 要求 feature 显式声明 `acceptedInputTypes` 且接受全部输入类型。
   - 匹配来源会写入 `matchSource`，输入类型匹配时使用 `input`，为后续 source-level evidence 留出锚点。
8. `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.test.ts`
   - 已覆盖长文本剪贴板会附加、插件执行时 pending 短文本可附加、query 被编辑后 pending 短文本不附加，说明短文本防误消费不是纯文档约束。

- 结论

主文档对该映射点的判断成立：Tuff 当前不是“任意读取剪贴板并分发给插件”，而是已经形成了一条较克制的上下文输入链路。

已经成立的事实有四点：

1. `TuffQuery.text` 与 `TuffQuery.inputs` 的边界清楚，主动输入不会被剪贴板内容覆盖。
2. renderer 构造 clipboard inputs 时有优先级、长度阈值、HTML 截断、metadata 安全序列化和 pending 文本防误消费规则。
3. plugin adapter 对 image / files 做显式 `acceptedInputTypes` 过滤，不会默认把非文本上下文交给所有插件。
4. 现有单测至少覆盖了长文本、pending 短文本和 query edited 三个容易造成误消费的分支。

但这仍不是完整 Raycast Clipboard / Alfred Universal Actions / uTools 超级面板体验。当前缺口在用户可见 evidence 和动作合同，而不是底层 query 数据结构：

1. 用户尚不能稳定看到“本次动作消费了 clipboard image / clipboard files / HTML / URL text”的 input source chip。
2. `matchSource: "input"` 还只是 item metadata，不等于完整的“为什么这个插件被推荐”说明。
3. clipboard image / files / HTML 的 Action Panel 样本和失败态仍需固定 evidence；例如权限拒绝、原始图片解析失败、文件路径不可访问、HTML 被截断。
4. search trace / evidence 仍需要证明不记录剪贴板明文或文件内容，只记录类型、长度、hash、provider / feature、failure reason。

所以最小下一步应继续沿主文档方向：基于现有 `TuffQuery.inputs` 和 `acceptedInputTypes` 补 `ContextActionProvider` / evidence，而不是重写 CoreBox 搜索框，也不应复制 uTools 鼠标超级面板。首批验收样本建议只覆盖 clipboard URL text、clipboard image、file path input、HTML input 四类，并明确记录 source、matched feature、accepted input type、privacy-safe evidence、failure reason。

- 是否发现需修正的主文档问题

否。`02`、`05`、`11` 对该能力的表达是谨慎的：它们把 Tuff 当前能力定位为有 `TuffQuery.inputs`、`acceptedInputTypes`、clipboard query inputs 与插件过滤底座，同时把 input source、隐私、failure reason、Action Panel evidence 继续列为缺口。源码核对没有发现需要修改 `01-11` 主分析文档的问题。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-53.md`，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
