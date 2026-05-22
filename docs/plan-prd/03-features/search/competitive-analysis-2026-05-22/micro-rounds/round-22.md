# 微审计 22/70

- 审计主题：Raycast File Search Action Panel / Alfred Universal Actions 中“文件结果后续动作”，是否已经能映射到 Tuff 当前 FileProvider 文件 item 与 CoreBox Action Panel，而不是只停留在文件召回。
- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`：第 2.2 节把 Action Panel 定义为结果项统一动作层，第 3 节把 File Search actions 列为 open / reveal / Quick Look / terminal / save quicklink / send to AI 等后续动作集合。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/03-alfred-workflow-model.md`：第 2 节把 Open File、Universal Action、File Action 归入对象流动作模型，说明文件不只是搜索结果，还会作为下游动作输入。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`：第 4 节把 Action Panel 的最小验证样本明确到 app/file/plugin/preview/image item，并指出文件 action menu 还缺明显证据。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`：第 24 条判断“Raycast File Search Action Panel 是否覆盖文件动作”，结论是 Tuff 有文件召回与 action 机制基础，但不应直接宣称 Quick Look / terminal / save quicklink 已完成。
  - `apps/core-app/src/main/modules/box-tool/addon/files/utils.ts`：`mapFileToTuffItem()` 会把文件结果构造成 `kind: "file"`，并写入 `actions: open-file/open-folder`；`meta.file.path/size/created_at/modified_at/extension` 保留文件动作所需元数据。
  - `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`：`onExecute()` 从 `args.item.meta.file.path` 读取路径，先 `fs.access()` 再 `shell.openPath()`，说明文件主动作是真实打开，不是占位。
  - `packages/utils/core-box/tuff/tuff-dsl.ts`：`TuffItem.actions?: TuffAction[]` 与 `TuffActionType = open/copy/preview/edit/share/custom...` 提供动作结构，但不是文件专属 action taxonomy。
  - `apps/core-app/src/renderer/src/components/render/ActionPanel.vue`：前端会先展示 `props.item.actions`，再补 `toggle-pin`、`copy-title`、文件/应用的 `reveal-in-finder`、`flow-transfer` 等内建动作。
  - `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`：`reveal-in-finder` 会读取 `targetItem.meta.app.path || targetItem.meta.file.path` 并调用 `appSdk.showInFolder(path)`；未知 item action 会 fallback 到 `CoreBoxEvents.item.execute`。
  - `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`：`Cmd/Ctrl+K` 打开 MetaOverlay 时会把 `currentItem.actions` 作为 `itemActions` 传入，同时为 `kind === "file"` 的结果生成内建 reveal 动作。
- 结论：
  - 主文档关于文件动作的边界判断成立。Tuff 当前不是“只会搜文件”：FileProvider 产出的文件 item 已经携带 `open-file` / `open-folder` 动作，默认执行路径也会真实打开文件；CoreBox Action Panel / MetaOverlay 还能为文件结果补 `reveal-in-finder`、复制名称、固定和 Flow transfer。
  - 但这仍不是完整的 Raycast File Search Action Panel 或 Alfred File Action/Universal Action。当前文件动作缺少统一的文件 action taxonomy、动作分组与搜索、Quick Look、Open Terminal Here、Save as Quicklink、Send to AI、权限/索引状态/路径失效 failure reason，以及“为什么这个文件动作可用”的 evidence。
  - 因此下一步仍应按主文档的 P1 口径推进：先把文件 item 的 action evidence 做实，记录 action count、primary action、reveal/open 失败原因、path source、provider/backend 和 latency；不要先扩成大型文件管理器，也不要宣称已经完整对齐 Raycast / Alfred 的文件动作体系。
- 是否发现需修正的主文档问题：否。`02`、`03`、`05`、`11` 都没有把当前文件动作夸大为完整竞品同款，只把它定位为已有基础加 evidence / action taxonomy 缺口；这与源码一致。
- 本轮未改业务代码、未提交 git 的说明：本轮仅新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-22.md` 并更新 `.codexpotter` 进度记录，未修改业务代码，未执行 git commit / push / branch / reset / checkout。
