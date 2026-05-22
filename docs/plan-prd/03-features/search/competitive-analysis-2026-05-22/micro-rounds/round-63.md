# 微审计 63/70

## 审计主题

剪贴板上下文输入的一次性消费与防误触发边界：Tuff 把 uTools 超级面板 / Alfred Universal Actions 的“当前上下文可触发动作”映射到 `TuffQuery.inputs` 后，是否避免同一份剪贴板内容在执行后继续滞留、重复触发后续插件命令。

本轮刻意不重复 round-33 已审过的 `acceptedInputTypes` 召回过滤，而是只审执行阶段的清理与隐私边界。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 1 节把 uTools 超级面板映射为 Tuff `ContextActionProvider`，并要求只先覆盖 selected text / clipboard image / files。
  - 第 5.4 节强调剪贴板读取要有用户可见来源，图片和文件不应把大体积内容长期塞进普通 JSON，HTML 要区分 sanitized text 与 raw html。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
  - `context-actions-v1` 的风险是隐式读取上下文会伤害隐私，明确不做鼠标超级面板、不后台常驻抓取选中文本。
  - Evidence 口径禁止记录 query 明文、剪贴板明文、文件内容；Context action 只保留 inputSource、inputTypes、pluginName、featureId、permission、capability/status/reason、execute result。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 29、38、44 条确认 `TuffQuery.inputs` + `acceptedInputTypes` 是 Universal Actions / 超级面板的基础，但截图和完整动作面板仍需 evidence。
  - 第 68 条确认 Clipboard 持久化需要同步留存、清理、多类型 evidence 与隐私策略。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-33.md`
  - 已覆盖输入合同、召回过滤和执行前 `searchResult.query.inputs` 写入；本轮只补充执行后的上下文清理判断。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffInputType` 定义 text / image / files / html。
  - `TuffQueryInput` 允许 `content`、`rawContent`、`thumbnail`、`metadata`，`TuffQuery` 区分用户主动输入的 `text` 与系统检测到的 `inputs`。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.ts`
  - 图片剪贴板优先生成 `TuffInputType.Image`，文件模式或剪贴板文件生成 `TuffInputType.Files`，HTML 生成 `TuffInputType.Html`。
  - 短文本剪贴板只有在插件执行时 `allowPendingTextClipboard` 为真且 `queryText` 仍等于原剪贴板内容时才会附加，避免用户编辑后的短文本继续被当作原始剪贴板上下文。
  - 文本与 HTML 会截断到固定长度，metadata 只保留 string / number / boolean / string array 这类可安全序列化字段。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
  - 执行插件 feature 前重新 `buildQueryInputs()`，并把 `currentInputs` 写回 `serializedSearchResult.query.inputs`。
  - 如果本次确实用了 clipboard input，执行后会写入 `lastClearedTimestamp`，并清空 `clipboardOptions.last`、`pendingAutoFillItem`、`detectedAt`。
  - 文件模式 attachment 单独清理 `boxOptions.file.paths` 并回到 `BoxMode.INPUT`，不误判为剪贴板清理。
  - 当执行插件但没有 clipboard input 且 `autoPaste.time === 0` 时，也会清空当前剪贴板状态，降低零自动粘贴配置下的重复触发风险。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboard.ts`
  - 新剪贴板进入时会比对 `lastClearedTimestamp`；如果 incoming timestamp 等于已清理 timestamp，则直接忽略，防止刚消费过的同一项再次弹回。
  - `clearClipboard({ remember: true })` 会记录已清理 timestamp，再清空当前剪贴板状态。
- `apps/core-app/src/main/modules/box-tool/search-engine/utils/resolve-clipboard-inputs.ts`
  - 对剪贴板文件输入，renderer 可只传 `clipboardId` metadata 和空 `content`，main 侧执行前再按 id 解析真实文件内容。
  - 这符合“执行 payload 可解析、长期 evidence 不记录完整文件内容”的方向。
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
  - feature execute 时会先调用 `resolveClipboardInputs(searchQuery.inputs)`，只记录 `resolvedCount` 和 `clipboardIds` 这类调试信息，不记录剪贴板明文。

## 结论

主文档对剪贴板上下文动作的隐私与清理口径基本成立：当前实现并不是把剪贴板内容永久挂在搜索状态里，而是在插件执行前临时组装 `TuffQuery.inputs`，执行后对已消费的 clipboard input 做一次性清理，并用 `lastClearedTimestamp` 阻止同一项立即重新进入 CoreBox。

已成立的具体点：

1. **执行前重新取上下文**：`useSearch.ts` 没有直接相信旧搜索结果里的 inputs，而是在执行插件 feature 前重新 `buildQueryInputs()`，降低 stale clipboard 被带入执行的概率。
2. **短文本防误触发**：短文本 auto-fill 后会进入 `pendingAutoFillItem`，只有插件执行且 query 仍等于原内容时才附加；用户编辑过 query 后不再附加 pending 短文本。
3. **执行后清理当前上下文**：使用 clipboard input 后会清空 `last` / `pendingAutoFillItem` / `detectedAt`，并记录 timestamp，避免同一份剪贴板上下文继续污染下一次搜索。
4. **已消费项不会马上回流**：clipboard channel 收到新项时会检查 `lastClearedTimestamp`，同 timestamp 的已清理项会被忽略。
5. **文件输入避免长期内联**：剪贴板文件在有持久 id 时可以只带 metadata，main 侧执行前解析；这比把完整文件路径数组长期塞进 renderer 状态和 evidence 更可控。

仍需后续 evidence 固化的点：

1. **执行失败后的清理体验**：当前清理发生在 `transport.send(CoreBoxEvents.item.execute)` 成功返回后；如果执行失败，代码进入 `catch`，不会走 used clipboard cleanup。主文档当前没有宣称失败后一定清理，因此无需修正，但后续 `context-actions-v1` 应明确失败态是否保留上下文供用户重试。
2. **selected text 来源仍缺统一合同**：本轮只确认 clipboard / file mode；真正的 selected text 还需要 `inputSource`、权限、用户可见触发入口和 evidence。
3. **日志与 evidence 仍需守住禁止明文**：源码已有 `resolvedCount` / `clipboardIds` 这种轻量调试，但 release evidence 仍要继续禁止剪贴板明文、图片 base64、完整文件内容长期落盘。

因此，`10-execution-roadmap-synthesis.md` 把这条能力放在 P1 `context-actions-v1`，并要求 evidence 字段带 input source、permission/status/reason、execute result，是合理的。当前实现可作为一次性上下文消费底座，但还不能宣称完整 Universal Actions / 超级面板体验闭环。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档没有把剪贴板上下文执行写成已完整产品化的全局 Action Panel，也没有忽略隐私边界；它把剪贴板、图片、文件、selected text 放入 `ContextActionProvider` 与 evidence 后续任务，和源码现状一致。

本轮补充的执行层注意点是：后续验收样本应覆盖“成功执行后同一 clipboard input 不再重复出现”和“执行失败后是否保留上下文用于重试”两种路径，并明确这不是同一种清理策略。

## 本轮未改业务代码、未提交 git 的说明

本轮仅新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-63.md` 并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
