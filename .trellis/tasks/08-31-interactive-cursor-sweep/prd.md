# 全量补齐可交互组件的 cursor

父任务：`08-31-tuffex-interaction-polish`

## Goal

把 tuffex 组件库里"能点但 hover 上去没有指针反馈"的元素一次性补齐，并留下一道守卫防止再退化。

## 现状（已扫描，含阳性对照）

扫描脚本：`/tmp/tuffex-cursor-scan.mjs`（扫 `packages/tuffex/packages/components/src` 下全部 `.vue` / `.scss` / `.css`，排除 `__tests__`）。
阳性对照：`button/` 必须被标出——`.tx-button` 基类只声明了 `disabled → not-allowed`、`loading → progress`，**没有 `cursor: pointer`**，而同目录的 `copy-button.vue` / `icon-button.vue` 有。对照 **PASS**，扫描有效。

扫描口径：交互标记 = `@click` / `@mousedown` / `@pointerdown` / `role="button|tab|option|menuitem"` / `<button` / `<a ` / `tabindex`。

**A 类 · 整个组件目录零 `cursor` 声明（13 个）**

`agents`、`base-anchor`、`cell-link`、`dialog`、`dropdown-menu`、`empty-state`、`flat-dropdown`、`fusion`、`inline-citation`、`loading-overlay`、`search-select`、`spark-chart`、`status-badge`

其中 `dropdown-menu` 正是用户截图那一页。

**B 类 · 该文件无 `cursor`、同目录兄弟文件有（8 个，需逐个判断）**

`button/src/button.vue`、`button/src/split-button.vue`、`chat/src/TxChatComposer.vue`、`context-menu/src/TxContextMenuItem.vue`、`flat-radio/src/TxFlatRadio.vue`、`group-block/src/TxBlockSwitch.vue`、`select/src/TxSelectItem.vue`、`switch/src/TxSwitch.vue`、`tabs/src/TxTabs.vue`

## 需求

1. **逐个核实再改，不批量替换。** 扫描给的是"值得看一眼的位置"，不是判决。每一处都要确认：
   - 该元素确实可交互（不是纯展示的 `<a>`、不是仅为可访问性挂的 `tabindex="-1"`）；
   - 样式没有已经通过 `style/index.scss`、父级选择器或全局规则拿到 cursor（B 类尤其容易假阳性）。
2. 判定为缺失的，补上语义正确的值：
   - 可点击 → `cursor: pointer`
   - 禁用 → `cursor: not-allowed`
   - 加载中 → `cursor: progress`
   - 拖拽把手 → `grab` / `grabbing`
   - 文本输入 → `text`
3. 留一道守卫，让新增可交互组件漏 cursor 时能被发现。守卫**首跑不设为阻塞**（新 gate 的首跑基线不可信）。
4. 不改视觉，不改 DOM 结构，不改 props。这是纯 cursor 补齐。

## 约束

- 不做整文件 `eslint --fix`：core-app 与根配置规则相反，只判 delta。
- 报告要按"确认缺失 / 已有覆盖（假阳性）/ 判定不需要"三类给出，逐条列出理由，不能只给一个总数。
- 顺手看到的其它样式问题写注释 + 报告，不夹带修改。

## 验收标准

- [ ] A 类 13 个组件逐个给出结论（补齐 / 假阳性 / 不需要），并写清理由
- [ ] B 类 8 个文件逐个给出结论
- [ ] `.tx-button` 基类补上 `cursor: pointer`，且不覆盖 `disabled` / `loading` 的既有值（优先级顺序要验证，不能只看写没写）
- [ ] 用户截图的 DropdownMenu 触发器 hover 出现指针光标
- [ ] 守卫脚本可复跑，且自带阳性对照（故意去掉一处 cursor 时必须报错）
- [ ] `packages/tuffex` 单测通过
