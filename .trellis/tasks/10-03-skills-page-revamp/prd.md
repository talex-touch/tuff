# 能力页改版为技能页（通用技能 / 内置技能 / 手动保存）

父任务：`.trellis/tasks/10-03-intelligence-settings-revamp`（需求来源：图 2、图 3）。调研：`research/skills-page.md`（行号以 2026-10-03 工作区为准，下文用 `Page` / `Info` 等简称，对照见调研 Files Found）。

## Goal

把 `/setting/intelligence/capabilities` 从「能力配置」改成「技能」页：
- 本机读到的 skills 和内置的 31 项放进同一个列表；
- 能看出每个技能来自哪些代理；
- 改动要点「保存」才生效。

## 已确认的决策

- **D1 分组**（2026-10-03）：左侧列表分两组，「通用技能」在前，放本机读到的 skills；「内置技能」在后，是原来的 31 项。原列表标题「能力配置商」就此作废。
- **D2 叫法**（2026-10-03）：本页和侧栏里所有「能力」改叫「技能」，en 用 "Skills"。
- **D3 手动保存**（2026-10-03）：去掉「自动保存已启用」，改为底部提示条加保存按钮。改动先暂存，点「保存」才写入，离开前提醒。
- **D4 只改文案，不改路由**：路由的 key 和 path 保持 `capabilities` 与 `/setting/intelligence/capabilities`。改它们会牵连 smoke 测试、两处硬编码跳转及其测试，以及旧路径的自动重定向（调研 §6.4）；只改文案则零影响。
- **D5 从智能页搬走**：智能页上的「技能」「本地技能目录」两组整体搬到本页，智能页不再显示。否则同一批 skills 会在两个地方各有一个开关。
- **D6 合并规则：名字和文件都相同才合并**（2026-10-03）。本机 skills 多由 cc-switch 库、`~/.agents` 共享层这类「管理者」统一存放，再软链接进各代理目录，属于共同管理。Tuff 只读、只展示，不参与管理。所以：
  - 列表一行对应一份真实文件（跟随软链接之后的 realpath，即现有的 `local:` id）。这一行列出所有软链接到它的代理，并标出它的存放位置，也就是物理上存放这份文件的根目录（如 cc-switch 库）。文件不在任何已知根下时，标「其他位置」。
  - 同名但文件不同的，分成多行，各有各的开关。例如 `lark-approval`：一行是「Codex · cc-switch 库」，另一行是「Claude · Pi · Kiro · Factory · Kilocode · ~/.agents 共享层」。
  - 开关语义不变，按 realpath id 管理一份文件。

## 现状要点

- **列表**：扁平排列，按 `CAPABILITY_USAGE_ORDER` 加关键词权重排序（`Page:41-91`）。
  - 卡片用 `TuffItemTemplate`（`div role="button"`，存量写法）。
  - 标题行「能力配置商」「共 {count} 个能力」放在 filter 槽里（`Page:465-472`）。
- **留白**：卡片到分栏线共 20px，其中 12px 是共用 `TxScroll` 的内边距（5 个分栏页和 `Plugin.vue` 都在用），8px 是本页私有的 `.capability-cards`（`Page:556-562`）。模型渠道页同一位置是 12px。
- **保存**：
  - 每次编辑都直接写进共享的 `intelligenceSettings`，store 约 300ms 后自己落盘（`base-storage.ts:674-676`）。
  - 页面再叠一层 900ms 去抖（`Page:315-335`）。
  - 窗口卸载时还会 `saveSync()`（`app-storage.ts:54-58`）。
  - 提示词编辑器有自己的 800ms 草稿，并受 2026-09-15 事故约束：只有真实编辑才写（`Info:56-73`，测试 `IntelligenceCapabilityInfo.test.ts:252-386`）。
  - 主进程有 10 处直接写 `aisdk-config`，模型渠道页也编辑同一份文档（调研 §4.3-8）。
  - 「测试能力」测的是主进程里已持久化的配置（`intelligence-module.ts:1878-1880`）。
- **本机 skills**：
  - 来源有两路：本地 skill（`agent-skill-roots.ts` 的 16 个代理根加用户链接目录，原位读取）和导入型 skill（orchestrator `importedItems` 里 `kind === 'skill'`，带 `provider`）。
  - 开关是立即写盘的（`ai:skill-local:set-enabled`，存 `skill-local-sources.json` 的 `disabledIds`）。
  - 主进程按 realpath 去重，**只保留表顺序里第一个命中的代理根**（`skill-local-sources.ts:211-237`），所以快照里每个 skill 只有一个来源，拿不到「Codex · Claude」这种多代理归属。
  - skill-local 的事件和类型在 main 与 renderer 各有一份副本（`skill-local-runtime.ts:58-77`，`SettingSkillsMcp.vue:68-125`），与 `spec/frontend/type-safety.md:109` 冲突。
- **本机实测**：14 个代理根、437 处，按 realpath 去重后 189 条，按目录名只有 103 个不同的名字。其中 80 个 realpath 被多个代理通过链接共享，68 个名字有 2 份以上物理拷贝。
- **骨架**：现有骨架永远不会出现，因为 `loading` 恒为 false（`useIntelligenceManager.ts:134`）。骨架卡片按 4.5rem 定高，而实际卡片可能是 3rem（未实测）。

## Requirements

- **S1 列表**
  - 两组依次是「通用技能」（本机 skills）和「内置技能」（31 项，组内排序不变），组头带计数，形式参照模型渠道页 `IntelligenceList` 的分组列表。
  - 搜索同时过滤两组。
  - 「通用技能」加载期间显示骨架，骨架形状与加载后一致。
- **S2 叫法**
  - 本页和侧栏所有含「能力」的文案改成「技能」（调研 §6.1 的 15 个 key，加 `router.intelligenceCapabilities`），en 同步改成 skill 措辞。
  - `Page:447` 的 `'能力测试失败'`、`CapabilityHeader.vue:11` 的 `'capability'` 这两处硬编码收进文案目录。
  - 和提示词页共用的 key（`autoSave*`、`capabilitySelectTitle`、`capabilityTestFailed`）不能连带改坏。
- **S3 留白**：去掉本页私有的 8px 水平内边距，卡片到分栏线降到 12px，与模型渠道页一致；标题行与卡片左右对齐。共享的 `TxScroll` 内边距不动。
- **S4 代理归属（按 D6）**：
  - 列表行显示软链接到这份文件的全部代理，以及存放位置标签。
  - 详情像「选择渠道」那样逐行列出代理，每行带代理名和该代理目录里的条目路径；再单独显示这份文件的真实位置和存放位置。
  - 主进程快照对每个 realpath 带出全部来源 `(根 id, 条目路径)`，不再只留第一个；同时带出存放位置，即包含该 realpath 的根，没有则为 null。
  - 导入型 skill 的代理用它的 `provider`，存放位置标「Tuff 导入」。
  - skill-local 的事件和类型收成一份共享定义，main 与 renderer 共用。
- **S5 本机技能详情**：头部显示技能名、描述和类型徽标「SKILL」；「来源代理」列表；「在 Tuff 中启用」开关，决定首页会话是否注入这个技能。
  - 统计行、选择渠道、模型和提示词、测试，这些只属于内置技能，本机技能不显示。
- **S6 手动保存**
  - 本页的所有编辑都先进页面草稿：内置技能的渠道选择、模型、提示词，以及本机技能的启用开关。
  - 底部提示条在没有改动时显示「已保存」，有改动时显示「有未保存的更改」并启用「保存」按钮；保存中、保存失败各有状态。
  - 去掉「自动保存已启用」。
  - 只有点「保存」才写入，而且只写有改动的条目。
- **S7 离开提醒**：有未保存的更改时，离开本页（站内路由跳转）要先确认，选项为保存、放弃、取消。
- **S8 测试与未保存**：当前技能有未保存的改动时，「测试」按钮不可用，并提示先保存。原因是测试用的是已保存的配置。
- **S9 本地技能目录**：用户链接目录的增删从智能页搬到本页。左栏底部放「添加技能目录」入口（同模型渠道页的「新增渠道」位置），点开后在弹层里管理目录。
- **S10 智能页**：智能页移除「技能」「本地技能目录」两组。MCP 两组由 `10-03-mcp-settings-page` 先行移走。

## Acceptance Criteria

- [ ] 真实应用：侧栏显示「技能」。页面左栏依次是「通用技能 · N」「内置技能 · 31」，卡片到分栏线约 12px，标题行与卡片对齐。搜索「apple」只剩匹配项。
- [ ] 真实应用：`lark-approval` 显示为两行，分别是「Codex · cc-switch 库」和「Claude · Pi · Kiro · Factory · Kilocode · ~/.agents 共享层」；点开任一行，详情列出对应的代理和真实文件位置。
- [ ] 真实应用：
  - 切换一个技能的开关、改一个内置技能的渠道，底部条变成「有未保存的更改」；
  - 此时在侧栏点别的页面，会弹出确认；
  - 点「保存」后底部条显示「已保存」，重启应用改动仍在；
  - 点「放弃」后恢复原值。
- [ ] 真实应用：智能页不再有「技能」「本地技能目录」两组；页面上看不到「能力」字样，没有遗漏的旧文案。
- [ ] 主进程单测覆盖多来源快照：链接共享时列出全部代理，物理拷贝各成一条，id 规则不变。
- [ ] 改写后的 `IntelligenceCapabilityInfo.test.ts` 保住 2026-09-15 事故的回归断言：没有真实编辑就不写。
- [ ] core-app `typecheck`（node + web）通过；涉及的单测通过；改动文件的 lint delta 为 0。

## Out of Scope

- 不做 cc-switch 式的技能管理（父任务硬约束）：不往任何代理目录写入、链接或同步技能，也不改动 cc-switch 库或 `~/.agents`。「存放位置」标签只作展示。

- 首页会话注入同名 skill 的去重：注入逻辑不改。
- 共享 `TxScroll` / `TuffAsideTemplate` 的内边距（会影响 6 个页面）。
- 退出应用时的未保存提醒：退出时直接丢弃草稿，见 design。
- `08-06-skills-local-dirs` 欠下的验收补齐。
