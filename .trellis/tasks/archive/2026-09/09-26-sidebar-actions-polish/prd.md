# 侧边栏操作清晰化：删除二次确认、项目菜单分组、对话区新建

父任务：`09-25-home-session-polish`。2026-09-26 老板实机试用后提出的三条侧边栏意见。

## Goal

侧边栏里容易误触、看不懂、找不到的三个操作，改成一眼能懂、不会误删的样子。

## 老板原话（2026-09-26）

1. 「删除会话需要在原来的删除垃圾桶 icon 变成 确认？点两次哈」
2. 项目 ⋮ 菜单（新建对话 / 运行本机代理 / 发现本机会话 / 重命名 / 置顶 / 归档）：「这个看不懂啥意思啊，分类一下，啥叫运行本机代理？应该是有一个二级菜单选择运行哪一个？」
3. 「对话」分区标题：「滑动到这里也可以有一个 +」

## 现状（代码事实）

- 删除：`components/shell/ShellProjectRows.vue:56-62`，`.ShellProjectRows-Action` 垃圾桶按钮，单击直接 `emit('removeConversation', id)`。
- 项目菜单：`components/shell/ShellProjectFolder.vue:180-217`，`TxDropdownMenu` + 6 个平铺的 `TxDropdownItem`，无分组。「运行本机代理」→ `ShellConversationList.vue` 的 `openProjectAgent(projectId)`：只发 `omniPanelShowEvent`（`source: 'project-local-ai'`, `localAi: { projectId }`），不指定运行哪个代理。「发现本机会话」扫描本机 CLI 存档并接管（文案 `shell.projects.discover*`）。
- tuffex 已有 `TxDropdownSubmenu`（`packages/tuffex/packages/components/src/dropdown-menu/`）。
- 「项目」分区标题已有 + 按钮与 ⌘⇧N 提示；「对话」分区标题没有任何操作。

## Requirements

1. **删除二次确认**（所有带垃圾桶的对话行：项目下的对话与「对话」分区）
   - 第一次点击（或 Enter / Space）：垃圾桶原位变成一个危险色的「确认？」小按钮（同一个槽位，行高不变，标题让出宽度并截断），读屏文案「确认删除「标题」？」。
   - 第二次点击才真正删除（沿用现有 `removeConversation`）。
   - 自动复原为垃圾桶：指针离开该行、焦点离开按钮、按 Esc、或 3 秒内没有第二次点击。同一时间只有一行处于待确认。
   - 图标 ↔ 文字的切换有宽度过渡；减少动态效果时直接切换。
2. **项目菜单分组 + 二级菜单**
   - 分三组，组间有分隔、组有小标题：「对话」（新建对话）、「本机代理」（在本机代理中打开 ▸ 二级菜单；接管本机会话）、「项目」（重命名、置顶、归档）。文案以「做什么」为准，看完就懂；具体措辞可调整，但要与实际行为一致。
   - 「在本机代理中打开 ▸」的二级菜单列出本机可用的代理 CLI（例如 Claude Code、Codex、pi —— 以代码里已支持、已检测到的为准），每项带图标；未安装的显示为禁用并注明。选中后打开浮动面板并**预选该代理**在此项目中运行。如果浮动面板目前不接受「指定代理」参数，端到端补上（类型化 payload，渲染层 → 浮动面板），不改变不带该参数时的现有行为。
   - 「发现本机会话」如果改名，读屏与提示文案同步；它的进度 / 结果提示保持不变。
3. **「对话」分区的新建按钮**：指针悬停在「对话」标题行或其获得键盘焦点时，显示一个 + 按钮（与「项目」标题的 + 同组件、同尺寸、同位置），提示「新建对话」，动作与侧边栏「新建对话」一致；按住 ⌘ 时显示 ⌘N 提示（与现有 `MetaHintBadge` 用法一致）。

## Acceptance Criteria

- [ ] 单测：删除按钮 待确认 / 确认删除 / 各种复原（离开、失焦、Esc、3 秒）/ 同时只有一行待确认。
- [ ] 单测：项目菜单分组顺序与二级菜单项；选中某代理时发出的 payload 带该代理；不带时与现状一致。
- [ ] 单测：「对话」标题的 + 在悬停 / 聚焦时出现，点击等同新建对话。
- [ ] 真实应用走查（CDP，带调试端口的 dev）：三处交互亮 / 暗主题各截图；待确认时行高不变；二级菜单能打开、能选中。
- [ ] 全部新文案进 zh-CN / en-US，`translation-coverage` 测试通过。
- [ ] core-app 包内 eslint、prettier、`vue-tsc -p tsconfig.web.json --composite false` 通过。

## 不做

- 不改删除的数据语义（无回收站、无撤销）。
- 不改项目的新建 / 归档 / 置顶逻辑本身。

## 验收结果（2026-09-26，真实窗口 CDP 走查）

- 删除二次确认：点一次变「确认？」（读屏「确认删除「标题」？」，行高 33.5px 不变）；3 秒自动复原；焦点在按钮上按 Esc 复原；连点两下删除（行数 15→14）。走查中用它删除了 3 个测试对话。
- 项目菜单分组：对话 / 本机代理 / 项目，组间分隔。老板决定（2026-09-26）：本机代理 Beta（`TUFF_ENABLE_LOCAL_AI_CLI=1`，仅 macOS）未开启时整组隐藏——`projects` store 记住 `betaAvailable`（未知为 `null`），项目文件夹挂载时读一次状态（归档项目不读），只有明确为 `false` 才隐藏（读取失败仍显示并在二级菜单说明原因）。实机：Beta 关闭时菜单只剩「对话」「项目」两组。
- 二级菜单的代理列表与所选代理的 payload：本机 Beta 未开，实机无法走查，由 `ShellConversationList.test.ts` / `ShellProjectFolder.test.ts` / `local-ai-agents.test.ts` 覆盖。
- 「对话」标题 +：悬停时透明度 0→1，提示「新建对话」。
- 提交 `90b73f918`（`ShellConversationList.vue` 与语言包按段暂存：不含 `09-25-home-assistant-push` 的续接函数抽取与 `home.opening/home.push` 文案）。
- 开发期注意：pinia setup store 改形状后不热替换，需整页重载（已写入 `state-management.md`）。
