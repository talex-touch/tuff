# 微审计 33/70

## 审计主题

Alfred Universal Actions / uTools 超级面板能否准确映射到 Tuff 当前的 `TuffQuery.inputs` + `acceptedInputTypes` 输入匹配链路，而不是被误写成已经存在完整全局 Action Panel。

本轮只审一个具体映射点：当剪贴板、文件模式或富文本上下文进入 CoreBox 时，Tuff 是否会把这些上下文组装成 `TuffQuery.inputs`，并用插件 feature 的 `acceptedInputTypes` 做召回和执行过滤。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/03-alfred-workflow-model.md`
  - 将 Alfred Universal Actions 映射到 Tuff 的 Context Actions / typed input 合同，而不是要求直接复制 Alfred UI。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 将 uTools `cmds` 与超级面板的数据源匹配映射到 Tuff 插件 manifest、`acceptedInputTypes`、多输入类型与平台 fail-closed reason。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
  - 把 `ContextActionProvider` 放在 P1 薄合同，说明它是下一步产品化对象，不是当前已完整落地的全局动作面板。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 29 条确认 Alfred Universal Actions 与 uTools 超级面板可统一映射到 `ContextActionProvider`，首版围绕 selected text / clipboard image / files 足够。
  - 第 38 条确认 uTools `cmds` 数据源匹配可映射到 `acceptedInputTypes`；adapter 会按 non-text input 过滤。
  - 第 44 条确认 Tuff 类型支持 text / image / files / html，但截图仍需 evidence，不应宣称 complete。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffInputType` 只定义 `text`、`image`、`files`、`html` 四类输入。
  - `TuffQueryInput` 规定 `content`、`rawContent`、`thumbnail`、`metadata`。
  - `TuffQuery` 明确区分用户主动输入的 `text` 与系统自动检测的 `inputs`。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.ts`
  - 图片剪贴板会生成 `TuffInputType.Image`，携带预览内容、thumbnail、`canResolveOriginal` 与 clipboard metadata。
  - 文件模式或文件剪贴板会生成 `TuffInputType.Files`，文件路径用 JSON 字符串承载。
  - HTML 剪贴板会生成 `TuffInputType.Html`，同时保留截断后的 plain text 与 `rawContent`。
  - 文本剪贴板不是无条件附加，只有 URL-like、长文本或 plugin feature 触发时的 pending text 才作为输入进入。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
  - 插件 feature 被执行时，renderer 会根据 `acceptedInputTypes` 或 `interaction.allowInput` 决定是否继续显示输入框。
  - 执行插件 feature 前会重新 `buildQueryInputs()`，并把当前上下文写入 `serializedSearchResult.query.inputs`。
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
  - 搜索阶段如果 query 含 non-text input，feature 没有声明 `acceptedInputTypes` 会被过滤。
  - feature 只有在声明的 `acceptedInputTypes` 覆盖所有 query input types 时才继续参与召回。
  - webcontent / push feature 的 activation 也会根据 `acceptedInputTypes` 或 `allowInput` 决定 `showInput`。
- `plugins/touch-translation/manifest.json`
  - 普通翻译与多源翻译只声明 `acceptedInputTypes: ["text"]`。
  - 截图翻译声明 `acceptedInputTypes: ["text", "image"]`，说明图片上下文的插件入口是显式声明的。
- `plugins/clipboard-history/manifest.json`
  - 剪贴板历史 feature 声明 `acceptedInputTypes: ["text", "image", "files", "html"]`，是当前多类型输入接收能力的样本。

## 结论

主文档的映射口径成立：Tuff 当前已经有一条真实的“上下文输入进入插件命令”链路，可以作为 Alfred Universal Actions / uTools 超级面板的底座。

已经成立的部分：

1. **输入合同存在**：`TuffQuery.text` 与 `TuffQuery.inputs` 已经把主动搜索词和剪贴板/文件/HTML/图片上下文分开，避免把剪贴板内容混成搜索框文本。
2. **插件声明是显式的**：插件 feature 必须通过 `acceptedInputTypes` 声明能接收哪些输入类型；没有声明的 feature 不会在 non-text input 场景下被当作可用动作。
3. **召回过滤有真实实现**：main adapter 会要求 feature 覆盖 query 中所有 non-text input types，避免把图片或文件上下文误投给只支持文本的命令。
4. **执行链路会带上下文**：renderer 在执行插件 feature 前重新组装 inputs，并写入 `searchResult.query.inputs`，插件侧可以拿到本次上下文。
5. **已有多类型样本**：`touch-translation` 的截图翻译和 `clipboard-history` 的全类型输入声明，证明这不是纯文档设想。

仍然不能夸大的部分：

1. **还不是完整全局 Action Panel**：当前链路更像“命令召回 + 执行时附带上下文”，不是 Raycast / Alfred 那种对任意 selected item 展开统一二级动作列表的完整面板。
2. **item-level actions 还未统一**：文件、插件、剪贴板、预览等 item 的动作入口仍分散在 built-in actions、item actions、MetaOverlay 与插件 feature activation 中，缺少一个稳定的 `ContextActionProvider` 输出合同。
3. **输入来源还需 evidence**：selected text、clipboard image、file mode、HTML clipboard 的 UI 截图、trace 与 failure reason 仍要作为 evidence 固化。
4. **截图语义需谨慎**：`TuffInputType.Image` 可以承载剪贴板图片或预览图片，但“截图区域选择 -> OCR -> 翻译”的完整路径还需要单独 evidence，不能只因为 `image` 类型存在就宣称已完整对齐 uTools 截图超级面板。

因此，主文档把 Universal Actions / 超级面板收敛为 P1 的 `ContextActionProvider` 薄合同是合理的。当前实现可作为底座，但验收重点应是“哪些 feature 在哪些 input types 下可见、可执行、失败原因可解释”，而不是先做更重的 workflow 或全局动作 UI。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档没有把当前 `acceptedInputTypes` 链路夸大成完整全局 Action Panel；它把这部分作为 Context Actions / 参数合同的基础，并把产品化动作面板和 evidence 放在后续阶段，口径与源码一致。

本轮补充的执行层注意点是：后续做 evidence 时，应该至少覆盖三类样本：只支持文本的 feature 在图片/文件输入下不被误召回；支持图片的 feature 能收到 `TuffQuery.inputs`；支持 files/html 的 feature 能保留必要 metadata 与 failure reason。

## 本轮未改业务代码、未提交 git 的说明

本轮仅新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-33.md` 并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
