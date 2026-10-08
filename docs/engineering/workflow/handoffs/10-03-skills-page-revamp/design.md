# Design — 能力页改版为技能页

行号引用 `research/skills-page.md` 与 2026-10-03 工作区。文中简称：
- `Page`：`R/views/base/intelligence/IntelligenceCapabilitiesPage.vue`
- `Info`：`R/components/intelligence/capabilities/IntelligenceCapabilityInfo.vue`
- `R/` = `apps/core-app/src/renderer/src/`，`M/` = `apps/core-app/src/main/`，`U/` = `packages/utils/`

## 边界

- 产品定位是硬约束：只读取、只展示本机 skills，开关只影响 Tuff 自己的注入，不写任何代理目录。
- 路由的 key、path、缓存键都不变（D4）。
- 基线：`10-03-mcp-settings-page` 完成后剩下的 `SettingSkillsMcp.vue`，里面只有技能和本地技能目录两组。本任务接走这两组，然后删除这个文件。
- 不改首页注入逻辑，也不碰共享的 `TxScroll` 内边距。

## 1. 主进程：多来源快照与批量开关

**共享定义（`U/transport/events/skill-local.ts`，新增）**

- 把 `list`、`add-dir`、`remove-dir`、`set-enabled` 四个事件的定义，以及快照类型，从 `M/modules/ai/skill-local-runtime.ts:33-77` 和 `SettingSkillsMcp.vue:68-125` 这两份副本收成一份。main 和 renderer 都从这里导入，满足 `spec/frontend/type-safety.md:109`。
- 事件名保持 `ai:skill-local:*`，线上协议兼容。
- 新增 `set-enabled-batch`：payload 是 `{ changes: Array<{ id: string; enabled: boolean }> }`，一次写盘、一次重扫，返回快照。
- 原来的 `set-enabled` 保留。

**快照形状变化**

```ts
LocalSkillView = {
  id, name, description, path /* realpath */, sourceDir /* 第一个命中的根，保留 */, enabled,
  sources: Array<{ sourceDir: string; entryPath: string }>, // 新增：所有软链接到这份文件的入口
  storeDir: string | null                                    // 新增：物理上包含 realpath 的根
}
```

**扫描（`M/modules/ai/skill-local-sources.ts`）**

- `LocalSkillLocation` 增加 `entryPath`，记录 realpath 之前的入口路径（`collectSkillLocations` 170-208）。
- `locationsFor`（211-237）不再先到先得、丢掉后来者。改为按 id 收集全部 `{ sourceDir, entryPath }`，主条目仍取第一个，保证 `sourceDir` 的语义不变。
- `storeDir` 的取法：按配置顺序找第一个「其 realpath 是 skill realpath 的路径前缀」的根，按路径边界判断，不是字符串前缀；找不到就是 null。
- 根目录本来就会先取 realpath（调研 §5.1），直接复用。

**不变的部分**

- id 规则不变：`local:` 加 realpath 的 sha1。
- 开关语义不变，按 id 一份文件一个开关（D6）。
- 上限和预算不变。

## 2. 渲染层数据：`R/modules/intelligence/useLocalSkills.ts`（新增）

- 读取 `skill-local:list` 快照，和 `orchestratorGetSnapshot().importedItems` 里 `kind === 'skill'` 的条目。
- 对外提供：
  - `rows`（按 D6 构造）、`dirs`、`loading`、`error`；
  - `refresh()`、`applyChanges(changes)`（走 batch）、`addDir()`、`removeDir(path)`。
- 行模型：

```ts
SkillRow = {
  key: `skill:${id}`, kind: 'local' | 'imported', id, name, description, enabled,
  agents: Array<{ sourceId: string | null; label: string; entryPath: string }>,
  store: { sourceId: string | null; label: string; path: string }   // 展示用
}
```

- **代理和存放位置怎么算**
  - `sourceDir` 和 `storeDir` 都通过 `dirs[].path → sourceId` 映射成代理 id，标签复用 `settings.skillsMcp.sources.<id>`。
  - 存放位置的文案分几种：
    - `cc-switch` →「cc-switch 库」；
    - `agents` →「~/.agents 共享层」；
    - 某个代理自己的根 →「{代理} 自带」；
    - 用户链接的目录 → 目录名；
    - null →「其他位置」；
    - 导入型 →「Tuff 导入」，代理用 `item.provider`。
- **排序**：启用的在前，再按名字。同名的多行按存放位置标签排，保证相邻且顺序稳定。
- **路径展示**：用 `~/` 缩写家目录。只在本地 UI 显示，不写日志。

## 3. 页面结构（`Page`）

**左栏**

- 原来的 filter 槽标题行（「能力配置商」「共 N 个能力」，`Page:465-472`）删掉。
- 改用 `TuffListTemplate` 分组，与 `IntelligenceList.vue:84-106` 同一种形态，依次两组：
  1. 「通用技能」：`useLocalSkills().rows`。组头 `badgeText` 显示条数。加载中显示 6 行骨架，行高与真实卡片相同，都是 3rem。
  2. 「内置技能」：原来的 31 项，排序规则不变（`Page:41-91`）。

**卡片**

- 沿用 `TuffItemTemplate size="sm"`，这是存量写法，不新增 `div role="button"`。
- 本机技能：
  - `title` 是名字；
  - `subtitle` 是「代理1 · 代理2 · … · 存放位置」；
  - `statusDot` 表示启用状态，读的是草稿值。
- 内置技能：
  - 卡片本身不变；
  - 状态点的 aria 原来误用了 `capabilitySummary`（「共 N 个能力」），改用新键「{count} 个渠道」。

**搜索**

- 两组同时过滤。
- 本机技能按名字、描述、代理标签、存放位置标签匹配；内置技能保持原规则。

**选中**

- key 加前缀区分：`builtin:<capabilityId>` 和 `skill:<id>`。
- 默认选中第一组的第一项，第一组为空时选第二组。
- 搜索把当前选中项过滤掉时，按同样的规则重新选。

**留白**

- 去掉本页私有的水平 8px（原 `.capability-cards`），卡片到分栏线只剩共享的 12px，与模型渠道页一致。
- 换成 `TuffListTemplate` 之后，要量一次它自己的内边距，保证总量仍是 12px。

**右栏**

- 内置技能：`Info`，改动见第 4 节。
- 本机技能：新组件 `R/components/intelligence/capabilities/SkillLocalInfo.vue`。
  - 头部沿用 `CapabilityHeader`：标题、描述，类型徽标显示「SKILL」。
  - 「来源代理」组：`TuffGroupBlock` 里每个代理一行 `TuffBlockSlot`，标题是代理名，描述是 `~/…` 形式的入口路径。
  - 「存放位置」行：真实路径加存放位置标签。
  - 「在 Tuff 中启用」：`TuffBlockSwitch`，改动写进草稿；描述说明它只决定首页会话注入。
  - 统计行、渠道、模型、提示词、测试这些区块，本机技能都不显示。

**左栏底部**

- `#aside-footer` 放「添加技能目录」按钮，位置同模型渠道页的「新增渠道」。
- 点开 `SkillDirsDialog.vue`（`TxModal`），列出两类目录：
  - 自动探测到的代理根，只读，带条数；
  - 用户链接的目录，可移除，带条数。

  底部有「添加目录」按钮，用 `dialog:open-file` 选目录。
- 目录的增删**立即生效**，不进保存条。理由：
  - 它是结构性操作，加完立刻重扫，新技能才能出现在列表里；
  - 这和「新增渠道」立即生效的先例一致。
- 迁过来的文案复用 `settings.skillsMcp.localDirs.*`。

## 4. 手动保存

**草稿（页面内）**

```ts
capabilityDraft: Map<capabilityId, { providers?; promptTemplate?; userReordered?: true }>
skillDraft: Map<localSkillId, boolean>
importedDraft: Map<importedItemId, boolean>
```

- 展示用的值是「store 当前值叠加草稿补丁」。按 `computed` 现算，所以主进程或模型渠道页在底下改了别的字段，也会如实显示。
- 编辑流向：
  - `onReorderProviders`、`updateModels`、`updatePrompt` 等原来写 store 的地方（`Page:218-307`，`useIntelligenceManager.ts:254-293`）一律改写草稿；
  - 补丁与 store 当前值相等时，删掉这个键；
  - 补丁为空时，删掉这一项；
  - 这样「改了又改回去」就不算脏。
- `dirtyCount` 是三个 Map 的条目总数。
- 删除以下自动保存机制：`scheduleCapabilityAutoSave`、900ms 去抖、`dirtyGeneration`，以及切换项目或卸载时的 flush（`Page:148-153, 315-413`）。
- 提示词编辑器保留它自己的草稿和「只有真实编辑才发出」（`Info:56-73`），这是 2026-09-15 事故后加的约束。它发出的 `updatePrompt(owner, value)` 现在只进页面草稿；`owner` 机制保留，保证不会写错 id。

**保存**

点「保存」，或在离开确认里选「保存」，依次执行：

1. 把 `capabilityDraft` 里的每一项合并进 store 的当前 capability，只覆盖补丁里有的字段。然后 `saveSettings()` 强制写盘，失败原因按原映射处理（`Page:371-409`）。
2. `skillDraft` 走一次 `set-enabled-batch`。
3. `importedDraft` 逐项调用 `orchestratorSetImportedItemActive`。

规则：

- 每一部分成功后，清掉它那部分草稿；失败的部分保留，底部条显示失败原因。
- 页面用自己的 `saving` 状态，不再读共享的 `intelligenceSettings.savingState`。
- 已知局限：保存时，草稿里的 `providers` 会整体覆盖这一个 capability 的绑定列表。如果主进程在草稿期间改过同一个 capability 的绑定（比如 Nexus 登录切换），以用户保存的为准。没有编辑过的 capability 不受影响。

**底部提示条**

- 新增 `R/components/intelligence/capabilities/SkillSaveBar.vue`，挂在右栏底部，不随内容滚动。为此：
  - `SettingsPage` 的 split 形态新增 `#detail-footer` 插槽；
  - 透传给 `TuffAsideTemplate` 新增的 `#main-footer`，放在 `TuffAsideTemplate-Main` 的 Transition 之后，`.TuffAsideTemplate-Main` 本身就是纵向 flex；
  - 如果开了 `mainEdgeBlur`，底部的模糊带要让到提示条上方。
- 状态文案用 `TxStatusHint`：
  - 没有改动：「已保存」；
  - 有改动：「有 N 项未保存的更改」；
  - 保存中：「保存中…」；
  - 保存失败：「保存失败：原因」。
- 按钮：
  - 「放弃更改」（次要），只在有改动时出现；
  - 「保存」（主要），没有改动或保存中时禁用，保存中显示 loading。
- 样式按 `tuffex-design-rules.md:93-97`：顶部 1px `--tx-border-color` 分隔线，不用阴影；字号 13–14px。
- `Info` 里的「自动保存已启用」状态区块（`Info:300-318, 352-361, 537-554`）和相关 props 一并删除。

**测试按钮**

- `Info` 新增 prop `testBlockedReason?: string`。当前内置技能有草稿时，「测试技能」按钮禁用，并提示「先保存再测试」。
- 原因：测试读的是主进程里已持久化的配置（`intelligence-module.ts:1878-1880`），测不到草稿。

**离开拦截**

- 页面里用 `onBeforeRouteLeave`。有改动时，弹 `forTouchTip`，按钮依次是「保存」「放弃」「取消」，按 `confirm-external-link.ts` 的写法包成 `Promise<'save' | 'discard' | 'cancel'>`：
  - 保存成功才放行，失败就留在页面；
  - 放弃：清空草稿后放行；
  - 取消：留在页面。
- KeepAlive 下守卫只在页面激活时生效（调研 §4.4），这正好覆盖了「从本页离开」这一种情况。离开前必须先处理草稿，所以缓存里不会留着脏草稿等被淘汰。
- 退出应用时**直接丢弃草稿**，不弹窗（PRD Out of Scope）。草稿不在 store 里，所以 `onbeforeunload` 的 `saveSync()` 不会把它写进去。

## 5. 改名（D2）

**改 zh / en 的值，key 不变**

| key | zh | en |
|---|---|---|
| `settingsIntelligenceHub.capabilities` | 技能 | Skills |
| `settingsIntelligenceHub.capabilitiesDesc` | 管理本机技能与内置技能。 | Manage local and built-in skills. |
| `router.intelligenceCapabilities` | 技能 | Skills |

`capabilitySearchPlaceholder`、`capabilityListEmpty`、`capabilityProviderSectionDesc`、`capabilityConfigTitle`、`capabilityConfigDesc`、`capabilityPromptSectionDesc`、`capabilityTest`、`capabilityTestTitle`、`capabilityTestDesc`、`capabilityAsrBindingTestDesc` 这些，把「能力」换成「技能」，en 里的 capability 换成 skill。

**删除**：本次改动后不再被引用的 `capabilityPageTitle`、`capabilitySummary`。原本就没被引用的那批 key（调研 §6.2）不在本任务处理。

**硬编码收进文案目录**

- `Page:447` 的 `'能力测试失败'` 改为新键「技能测试失败」。
- `CapabilityHeader.vue:11` 的 `'capability'` 改为新键「skill」，大写由样式负责。

**不能动的共享键**：`autoSave*`、`capabilitySelectTitle`、`capabilityTestFailed`，提示词页还在用。

**新增键**：分组名、保存条、离开确认、测试拦截提示、本机技能详情（来源代理、存放位置、各类存放位置标签、启用开关）、渠道计数的 aria。

**编辑语言文件的方式**：两份语言文件里有他人未提交的改动，所以只用唯一锚点做插入或替换，不整文件重排；提交时只取自己的 hunk。

## 6. 智能页清理

- `SettingIntelligencePage.vue` 去掉 `SettingSkillsMcp`。
- 删除 `SettingSkillsMcp.vue` 和它剩下的测试。技能行、目录相关的断言迁到 `useLocalSkills` / `SkillDirsDialog` 的测试里。
- `SettingIntelligencePage.test.ts` 去掉对它的 mock。

## 7. 新增组件的放置

`SkillLocalInfo.vue`、`SkillSaveBar.vue`、`SkillDirsDialog.vue` 放在 `R/components/intelligence/capabilities/`，和同页的其他区块组件放在一起。

这个目录会被 unplugin 自动注册，dev 时会改写 `components.d.ts`，而那个文件有他人的改动。提交时只取本任务新增的那几行。

## 取舍

- **草稿用「补丁叠在 store 上」，不复制整份配置**：底下的变化能实时显示，保存时只碰用户真正改过的字段。代价是同一字段可能被覆盖，上面已经写明。
- **目录增删立即生效、不进保存条**：理由见第 3 节「左栏底部」。
- **不做三方合并，也不做退出时提醒**：前者没有对应的需求，后者需要跨进程的退出握手；都写进 Out of Scope。

## 回滚

分三块，可以分别还原：
1. main 和共享事件定义：`skill-local-*`、`U/transport/events/skill-local.ts`；
2. 页面和组件：`Page`、`Info`、`CapabilityHeader`、新组件、`SettingsPage`、`TuffAsideTemplate`；
3. 文案与智能页清理。

已有文件逐个用 `git show HEAD:<path> > <path>` 还原，新增文件直接删除。
