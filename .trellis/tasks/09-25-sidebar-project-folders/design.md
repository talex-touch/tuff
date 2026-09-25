# 设计：侧边栏项目文件夹化

## 1. 结构（展开态，Home 上下文）

```
ShellSearchEntry
nav   新建对话            ← active 规则见 §3
      插件
      [rail 专用] 新建项目 ← 仅 collapsed 时渲染
ShellConversationList
  section 项目            [+]  ← 新建项目（MetaHintBadge command="new-project"）
    ShellProjectFolder × N    ← 新组件：一行项目 + 展开后的嵌套行
  section 对话                  ← 原「主页」分组
    ShellProjectRows
  已归档项目（折叠开关，行为不变，归档项目行复用 ShellProjectFolder 的只读形态）
Spacer
设置
```

## 2. 新组件 `ShellProjectFolder.vue`

从 `ShellConversationList.vue` 里把「项目标题 + 行」拆出来，列表文件已经 523 行，项目行再加开关、图标切换、重命名、菜单会继续膨胀。

- Props：`project`、`rows`（已排序的对话 / 会话行）、`activeId`（当前对话 id）、`current: boolean`（该项目是当前空白对话的所属项目）、`expanded: boolean`、`archived: boolean`（只读形态）、`renaming` 相关状态沿用列表里现有的实现。
- Emits：`toggle`、`enter`（点名称）、菜单动作沿用现有事件名，嵌套行的 `open-conversation` 等直接透传给 `ShellProjectRows`。
- 模板：

```html
<div class="ShellProjectFolder" :class="{ 'is-current': current, 'is-expanded': expanded }">
  <div class="ShellProjectFolder-Row">
    <button class="ShellProjectFolder-Toggle" :aria-expanded="expanded" :aria-label="…">
      <span class="ShellProjectFolder-Folder" :class="expanded ? 'i-ri-folder-open-line' : 'i-ri-folder-line'" />
      <span class="ShellProjectFolder-Chevron" :class="expanded ? 'i-ri-arrow-down-s-line' : 'i-ri-arrow-right-s-line'" />
    </button>
    <button class="ShellProjectFolder-Name" :title="project.rootPath" :aria-current="current ? 'page' : undefined">{{ project.name }}</button>
    <TxDropdownMenu …>⋯</TxDropdownMenu>
  </div>
  <div v-if="expanded" class="ShellProjectFolder-Children">
    <ShellProjectRows v-if="rows.length" … />
    <p v-else class="ShellProjectFolder-Empty">{{ t('shell.projects.empty') }}</p>
  </div>
</div>
```

- 开关占图标列（16px），平时显示文件夹图标；行悬停或开关聚焦时，同一位置换成箭头（Notion 式，图标列不增加宽度，名称列与导航文字列对齐）。文件夹图标本身也区分打开 / 合上，所以不悬停时也能看出状态。
- 名称按钮占满剩余宽度，省略号截断；`⋯` 在 `:hover`、`:focus-within`、菜单打开、`is-current` 时可见。

## 3. 选中态规则（集中在 `ShellConversationList` 一处计算）

```ts
const activeId = route.params.id (string) | null
const blankProjectId = activeId ? null : projectStore.activeProjectId   // 空白对话所属项目
项目行 current      = project.id === blankProjectId
对话行 active       = row.conversation.id === activeId                // 现有逻辑
「新建对话」 active = route.path === '/home' && !activeId && projectStore.activeProjectId === null
```

`ShellSidebar.vue` 的 `isHomeActive` 换成上面第三条（由 sidebar 自己用 store 计算，不从列表往上传）。第一次发送后到对话落盘前，路由仍是 `/home`，这段时间「新建对话」保持高亮，落盘后 `router.replace('/home/c/:id')`，高亮转到新出现的对话行——这是预期行为。

## 4. 展开状态

- 存储：`appSetting.shell.expandedProjectIds: string[]`（`packages/utils/common/storage/entity/app-settings.ts` 的默认值里加 `[]`，与 `sidebarWidth` / `sidebarCollapsed` 同处；读时做数组与字符串校验，与 `useShellSidebar` 读 `shell` 的防御写法一致）。
- 新 composable `modules/layout/useProjectFolders.ts`：`isExpanded(id)`、`toggle(id)`、`expand(id)`、`prune(liveIds)`；写入时生成新数组（`appSetting` 自动保存，避免原地 push 丢响应式）。
- 自动展开：`watch(() => projectStore.activeProjectId, id => id && expand(id))`，只在值变化时触发，所以用户在当前项目里手动收起后不会被立刻又展开。
- 清理：`projects` 加载完成后 `prune`，只在确实删掉了 id 时写回。

## 5. 新建项目入口

- 分区标题 `项目` 右侧 `+`：`<button>`，`aria-label` = `shell.newProject`，内含 `<MetaHintBadge command="new-project" placement="…" />`，点击 `enterPickedProjectConversation()`。
- `ShellSidebar.vue`：顶部导航去掉「新建项目」；`collapsed` 时额外渲染一个 rail 专用的「新建项目」导航项（rail 下对话列表整体隐藏，否则这个动作在 rail 里就消失了）。
- 没有项目时：分区照常渲染标题与 `+`，下面一行弱化按钮「从文件夹新建项目」（同一动作）。`ShellConversationList` 目前在「无对话、无项目」时整体 `v-if` 掉，这个条件改为只在骨架屏 / 数据未就绪时隐藏。

## 6. 对齐的度量

以 `ShellNavItem` 为准：行内 `padding: 6px 9px`、图标 16px、间距 10px ⇒ 图标列起点 9px、文字列起点 35px。

| 元素 | 图标列 | 文字列 | 行高 |
| --- | --- | --- | --- |
| 导航行 | 9px | 35px | 同 ShellNavItem |
| 分区标题（项目 / 对话） | — | 9px 起（caption） | 更矮，上方 12px 分组间距 |
| 项目行 | 9px（开关） | 35px（名称） | 同导航行 |
| 嵌套对话 / 会话行 | — | 35px | 同导航行 |
| 「对话」分区里的对话行 | — | 9px | 同导航行 |

具体数值抽成 `ShellSidebar` 根上的 CSS 变量（`--shell-row-pad-x`、`--shell-row-icon`、`--shell-row-gap`），三个组件共用，避免再各写一套。

## 7. 测试影响

- `ShellConversationList.test.ts` 里依赖旧结构的用例要改：
  - 「点项目标题开始项目对话」→ 改成点 `ShellProjectFolder-Name`；
  - 「项目头上的直接新建按钮」→ 删除（按钮已移除），由 `⋯` 菜单里的「新建对话」用例覆盖；
  - 「空项目的虚线新建按钮」→ 改成空提示行；
  - `shellSidebar project picker` 两条用例 → 改为点分区标题的 `+`，并新增 rail 模式下的导航项断言。
- `useShellSidebar.test.ts` 不受影响；新增 `useProjectFolders.test.ts`。
