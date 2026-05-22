# 微审计 25/70

## 审计主题

uTools 超级面板 / Alfred Universal Actions 中“选中文件后推荐批量处理动作”的心智，是否能映射到 Tuff 当前 `touch-batch-rename` 的 `files` 输入、预览计划与写入前权限 / 确认边界。

本轮只审一个窄点：当 CoreBox 或未来 Context Actions 携带文件路径输入时，Tuff 是否已有“文件输入 -> 批量重命名预览 -> 冲突提示 -> 写入权限 -> 二次确认”的真实链路；同时确认主文档把文件写入类动作列为必须 fail-closed、不得默认执行，是否与源码一致。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 6.1 节把 `files` 列为 Context Actions v1 输入之一，来源是 File mode 或剪贴板文件路径。
  - 第 6.3 节把 `touch-batch-rename` 映射为 `files` 输入下的“批量重命名预览”，并要求 `fs.write` 前二次确认，不做默认执行。
  - 第 6.4 节要求文件只读动作优先，批量写入类只展示预览；路径不可读、权限不足或写入类动作默认执行都属于不通过口径。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
  - Raycast File Search actions 被拆为 open / reveal / Quick Look / terminal / save quicklink / send to AI 等后续动作；Tuff 侧建议先标准化文件 item action 与 evidence，而不是直接扩大文件写入动作。
- `plugins/touch-batch-rename/manifest.json`
  - `sdkapi: 260428`，feature `batch-rename` 声明 `acceptedInputTypes: ["files", "text"]`，三平台启用。
  - 权限声明为必需 `fs.read` 与 `fs.write`，`permissionReasons` 分别解释“读取选中文件信息用于生成重命名计划”和“执行文件重命名操作”。
- `plugins/touch-batch-rename/index.js`
  - `extractFilesFromQuery()` 从 `TuffQuery.inputs` 查找 `type === "files"`，并解析 JSON 序列化的文件路径数组。
  - 若没有文件输入，会走 `pickFiles()` 打开多选文件对话框；这说明插件可从显式文件上下文或用户手动选择两条路径进入。
  - `parseRules()` 支持 `prefix:`、`suffix:`、`replace:`、`seq:`、`date:` 等文本规则；`buildRenamePlan()` 先生成计划并检测 duplicate / exists 冲突。
  - `onFeatureTriggered()` 先请求 `fs.read`，再推送当前规则、文件数量、冲突提示、应用重命名、撤销上次重命名和预览项；没有文件或缺读取权限时返回可读提示 item。
  - `onItemAction()` 执行 `apply` 前检查冲突、请求 `fs.write`、调用确认框 `confirmAction()`；用户确认后才调用 `applyRenamePlan()` 真正重命名。
  - `undo` 同样请求 `fs.write` 并二次确认，再读取 `last-rename.json` 还原。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffInputType.Files = "files"`，`TuffQueryInput.content` 对 files 场景约定为 JSON 序列化的文件路径数组。
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
  - 插件搜索 provider 支持 text/image/files/html；当 query 存在非文本输入时，会按 feature `acceptedInputTypes` 过滤。
  - feature 接受当前输入类型时，即使不是文本命令匹配，也可以被展示为候选 item，支撑“文件上下文推荐可用动作”的底层机制。

## 结论

主文档的映射边界成立：`touch-batch-rename` 已经是 Tuff 文件上下文动作的一个真实样本，不是空规划；但它仍应被定位为“写入类 Context Action 的预览 / 权限边界样本”，不能被宣传成完整 uTools 超级面板或 Alfred Universal Actions parity。

已经成立的部分：

1. **输入合同能接上文件上下文**：Manifest 声明 `acceptedInputTypes: ["files", "text"]`，`extractFilesFromQuery()` 能从 `TuffQuery.inputs` 读取文件路径数组；PluginFeaturesAdapter 也会按 files 输入过滤候选 feature。
2. **不是默认写入**：触发 feature 时先生成预览计划和冲突提示，`apply` 才进入写入路径。
3. **写入前有双重门槛**：真正重命名前会检查 `fs.write` 权限，并通过确认框要求用户继续；冲突存在时直接阻断。
4. **撤销路径也保守**：撤销同样要求 `fs.write` 和确认，并依赖上次记录，不会在无记录时假装成功。

仍然不能夸大的部分：

1. **没有统一 ContextActionProvider evidence**：当前 item 没有一等 `inputSource=files`、`capability.status`、`permission.state`、`executeResult` 字段，主文档要求的 evidence 还没有产品化。
2. **文件可读性只到权限层**：`fs.read` 会被请求，但对每个输入路径的 unreadable / outside-root / symlink / directory 等细分 reason 还没有统一输出。
3. **写入动作仍是插件内协议**：`apply` / `undo` 通过 `defaultAction` 和 `actionId` 进入 `onItemAction()`，尚未沉淀为跨插件文件写入动作 taxonomy。
4. **批量重命名不是文件动作全集**：它能证明“files 输入 + 写入前预览确认”路径可行，但不代表 Quick Look、Open Terminal、Save Quicklink、Send to AI 等文件后续动作已经完成。

因此，主文档把 `touch-batch-rename` 放在 Context Actions v1 的文件写入风险控制样本里是准确的。下一步应该补 `inputSource`、permission / capability reason、冲突和执行结果 evidence，而不是先做新的桌面超级面板 UI，也不应把批量写入动作放进默认执行路径。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。现有文档没有把 `touch-batch-rename` 夸大成完整文件动作体系，只把它作为 `files` 输入下的批量重命名预览样本，并明确要求 `fs.write` 前二次确认；源码核对支持该判断。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-25.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
