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

## 实现偏差

实现与上文设计不一致的地方，以代码为准；每条附原因。

- **动作留在列表，文件夹只发事件**（§2、implement 步骤 3 原计划把重命名 / 置顶 / 归档 / 发现会话 / 运行本机代理迁进 `ShellProjectFolder`）：「发现会话」的锁跨所有项目（同一时间只跑一个），重命名同一时间也只有一个项目在改，「对话」分区的行又和嵌套行共用同一组行处理函数。留在列表里各只有一份；搬进每个文件夹就得各持一份再往上同步。`ShellProjectFolder` 只持有自己的菜单开关与重命名草稿。
- **自动展开的 watcher 立即执行，并在模块级记住「上次跟随的项目」**（§4 原为只在值变化时触发的普通 `watch`）：进设置页时侧边栏换成设置导航，列表随之卸载。按实例、不立即执行的 watcher 会漏掉列表不在时变成当前的项目（如在设置页按 ⌘⇧N）；每次挂载都立即展开，又会把用户刚收起的当前项目重新打开。模块级的「上次跟随」让重新挂载不算变化，真正的变化照样展开。
- **项目行的 current 还要求路由是 `/home`**（§3 原为 `activeId ? null : activeProjectId`）：HomePage 是 keep-alive 的，离开主页（如 `/store`）后 `activeProjectId` 仍停在上一个对话的项目上，原规则会让项目行和「插件」导航同时高亮。规则收成共享函数 `blankConversationOwner(path, activeProjectId)`（`modules/layout/useProjectFolders.ts`），`ShellSidebar` 的「新建对话」和列表的项目行都读它，仍各自用 store 计算，不从列表往上传。
- **`⋯` 的键盘可见用 `:has(:focus-visible)`，不用 `:focus-within`**（§2）：Chromium 里鼠标点按钮也会让它获得焦点，`:focus-within` 会让点过开关或名称的那一行一直露着 `⋯`，直到焦点移走；`:focus-visible` 只在键盘聚焦时成立。
- **`⌘⇧N` 提示徽标放在 `+` 前面，作为同级元素，不放进按钮**（§5）：`+` 是 24px 方形按钮，`inline` 放进去会把按钮撑宽；`trailing` 需要定位宿主，且会盖住 `+` 本身；`above` / `below` 会压在导航或项目行上。放在按钮前面读起来就是这个按钮的快捷键，也不挪动按钮（徽标只在按住 ⌘ 时出现）。
- **rail 专用的「新建项目」留在原位置（新建对话与插件之间）**（§1 画在插件之后）：图标栏顺序对已经用惯的人保持不变，两个「新建」动作也挨在一起。
- **已归档项目没有展开开关**（§1 只说复用只读形态）：开关位置换成不可交互的文件夹图标，对话行始终显示（与文件夹化之前一致，PRD 写明已归档部分行为不变），名称不可点，菜单只有「取消归档」。「已归档项目」本身已是默认收起的开关，再给每个归档项目一层折叠和一份持久化状态，只是给只读内容多套一层。没有任何对话的归档项目不渲染子容器（空盒子也会占掉列里的一个 2px 间距）。
- **多了 `--shell-row-pad-y` / `--shell-row-min-height` 两个变量；`useShellSidebar.ts` 的默认 `shell` 对象加了 `expandedProjectIds: []`**（§6 只列了 `--shell-row-pad-x` / `--shell-row-icon` / `--shell-row-gap`）：嵌套行要与导航行等高，得用同一个纵向内边距；没有图标的行（嵌套行、空提示行）另拿「图标那一份」（边框 + 内边距 + 16px 图标）当下限，免得图标比文字行高时它们比导航行矮。行高本身不写成变量，它来自名称那一行文字（见「检查后修复」第三条）。`persistState` 在 `shell` 缺失时会整块新建 `AppSetting['shell']`，新字段进了类型就必须给出。另：§6 表里的 9px / 35px 没算 `ShellNavItem` 的 1px 透明边框，实际图标列、文字列距行外沿是 10px / 36px，与导航行一致（走查量得图标 x=20、文字 x=46，含侧边栏 10px 内边距）。

### 检查后修复

检查阶段在本任务改写的侧边栏代码里找出三处，已修：

- **重命名输入框不再吞掉输入法的 Enter / Escape**（`ShellProjectFolder.vue`）：原来的 `@keydown.enter` / `@keydown.escape` 在输入法组字时照样触发。macOS Chromium 选字的那下 Enter 带 `isComposing: true`，且早于 `v-model` 拿到组好的字，于是保存的名字少了正在组的那段；Escape 本该只收起候选框，却直接放弃了重命名。改成一个 keydown 处理函数，`isComposing` 或 `keyCode === 229` 时直接返回、不 `preventDefault`，按键留给输入法（与主页输入框 `HomePage.vue` 的 `handleKeydown` 同一判断；229 兜底先结束组字再发键的引擎）。已归档形态不进入重命名，但用的是同一个输入框。
- **重命名输入框自动聚焦并全选**（`ShellProjectFolder.vue`）：`autofocus` 只在页面加载时生效，之后插入的输入框拿不到焦点，选「重命名」后还得再点一下。改为输入框挂载后的下一帧（`nextTick` + `requestAnimationFrame`）手动 `focus()` + `select()`。晚一帧是因为「重命名」从本行菜单里选，菜单在同一次更新里关闭、渲染之后才处理关闭；按 ARIA 菜单模式在关闭时把焦点还给触发按钮的菜单，会把刚给输入框的焦点抢回去。现在的 `TxDropdownMenu` 关闭时其实不还焦点（只有子菜单的 ← 会），直接原因是 `autofocus` 无效；晚一帧是防这种关闭顺序。测试里的菜单替身按最坏情况演：选项先发 `select` 再关菜单，关闭后一个 tick 把焦点还给 `⋯`，断言最终焦点在输入框、名字全选。
- **加载骨架与加载后的布局对齐**（`ShellConversationList.vue`）：原骨架还是旧版布局（标题条 y≈8–17，行 25–53 / 57–85 / 89–117），冷启动会跳。骨架改用加载后「项目」分区自己的容器搭：同一个 `ShellConversationList-Section`（2px 行距）和 `ShellConversationList-SectionHeader`（24px 标题行），下面三行 `ShellConversationList-SkeletonRow`，图标列一个 `--shell-row-icon` 见方的方块、名称列一条横条。
  - **第一版行高错了。** 骨架行当时靠 `--shell-row-height`（图标 16 + 内边距 12 + 边框 2 = 30px）撑高，里面没有文字行。可加载后的行高不由图标决定，而由名称那一行文字决定：行标签都是 13px（`--shell-fs-body`），继承整页的行高 1.5，一行 19.5px，比 16px 图标高，所以导航行、项目行、嵌套行都是 19.5 + 12 + 2 = 33.5px。整页的 1.5 来自 Milkdown 主题里的 Tailwind 预设（`html { line-height: 1.5 }`、`button { line-height: inherit }`），经 `useUpdateRuntime.ts` → `AppUpgradationView.vue` → `FlatMarkdown.vue` 在启动时就加载，不在本组件里。真实应用实测（CDP，跨一次渲染进程重载、在插入时刻用 MutationObserver 取快照，列表内坐标）：骨架标题条 y 14–23，行 32–62 / 64–94 / 96–126（30px）；加载后分区标题 y 10–27，项目行 32–66 / 68–102（取整后 34px，实为 33.5px）。标题与第一行顶边对齐，之后每行多错约 4px（实为 3.5px）。当时的几何测试比的是两边写了同一个最小高度，而那个下限根本不是真实行的行高来源，所以照样通过。
  - **现在的做法：骨架行和真实行从同一处得到高度。** 骨架行不再声明任何高度，像导航行一样由内容撑高：图标方块，加一个名称列 `ShellConversationList-SkeletonName`，字号与名称相同（`--shell-fs-body`），行高照样继承，`height: 1lh`（一行这种字的高度），名称条在其中垂直居中。于是骨架行 = 这一行文字 + 纵向内边距 + 边框，和真实行同一条式子，两边都不写死数字。`--shell-row-height` 改名 `--shell-row-min-height` 并改了注释：它只是没有图标的行的下限（图标那一份），不是行高。
  - **测试**：`ShellConversationList.geometry.test.ts` 改为断言高度的来源。骨架名称列的字号与三种真实标签（`ShellNavItem-Label` / `ShellProjectFolder-Name` / `ShellProjectRows-Open`）相同，高度是 `1lh`；两边从侧边栏到这一行的整条链上都不声明 `line-height` 或 `font`（`font-family` 只许 `inherit`）；骨架一侧除这一行外不声明任何高度，名称列没有纵向内边距、边框、外边距；四种行的纵向内边距都是 `--shell-row-pad-y`，边框相同；rail 下整个列表隐藏，所以 rail 规则不计。拿第一版骨架样式跑这份测试会挂两条（名称列没有字号、骨架行有 `min-height`）。渲染出来的高度 jsdom 量不了（没有布局，也不解析继承的行高），而且取决于组件外的整页行高和平台字体度量，所以留在 CDP 走查里量。列表测试另断言名称条在名称列里。
  - **修复后的数值**：在 ego 里用从应用读出的整页样式与侧边栏 DOM 复现：骨架标题条中线 y=18，与分区标题中线相同；骨架行 32–65.5 / 67.5–101 / 103–136.5，项目行 32–65.5，嵌套行 67.5–101；名称列计算值为字号 13px、行高 19.5px、高 19.5px，与项目名称相同。侧边栏 195 / 260 / 360px 下行高都是 33.5px。名称条用像素宽（96 / 72 / 108），因为内容定宽的盒子里百分比无从解析；最窄时最宽的一条止于行内 x=144，而 `⋯` 从 x=146 起。
  - **未改**：「暂无对话」提示行是 12px 字（`--shell-fs-sm`），按样式推算 18 + 12 + 2 = 32px，比导航行矮 1.5px，不在本次修复范围内。
