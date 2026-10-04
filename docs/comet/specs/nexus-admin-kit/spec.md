# nexus-admin-kit

后台组合件里经 Comet 登记的两项行为：统计卡的说明行，以及 `TxSelect` 这类控件在没有自带 `id` 时的命名。组合件其余的冻结 API 见交接副本 `handoffs/10-02-nexus-admin-console-kit/design.md` §8，`useAdminResource` 见 `nexus-admin-resource`。

## Requirement: 统计卡说明行

`AdminStatGrid` 的条目（`AdminStatItem`）可以带 `meta`：显示在标签下方的第二行，字号 12px，与标签同色。`TxStatCard` 的默认变体本身不渲染 `meta`，由 `AdminStatGrid` 经标签插槽画出。

- 同一排只要有一张卡带 `meta`，其他卡在同一位置留出等高的空行，各卡的数字与标签上下对齐。
- 加载占位与成品同版式：带 `meta` 的卡多一条占位线，其他卡留出同高的空隙。
- 一排都不带 `meta` 时，输出与登记前相同。

### Scenario: 只有一张卡带说明

- WHEN `AdminStatGrid` 收到五张卡，只有第一张带 `meta: '4 个已启用'`
- THEN 第一张卡在标签下方显示「4 个已启用」，其余四张在同一位置是空行
- AND 五张卡的数字顶边在同一高度
- WHEN 同一组卡处于加载中
- THEN 第一张占位有三条占位线，其余四张各两条，并留出与说明行同高的空隙

## Requirement: 控件命名

`TxSelect` 不接受 `id`，并把 `aria-label`、`id` 这类属性留在根 `div` 上：读屏器不读这个 `div`，`<label for>` 也关联不到它。组合件提供两个指令，在挂载与每次更新后，把名字写到 `TxSelect` 内部的 combobox 上；查找控件的方式与 `AdminFormField` 相同：

- `v-admin-control-id="id"`：给内部 combobox 设 `id`，配合 `AdminFormField` 的 `for` 使用；点击标签会聚焦并展开下拉。服务端渲染时在根元素上输出 `data-admin-control-id`。
- `v-admin-control-label="label"`：给内部 combobox 设 `aria-label`，用于没有可见标签的行内编辑器（例如「能力（第 2 行）」）。服务端渲染时在根元素上输出 `data-admin-control-label`。

两个指令在 `useAdminFieldControl.ts` 中，对应的纯函数 `identifyAdminControl(root, id)`、`nameAdminControl(root, label)` 在 `admin-kit.ts` 中。

限制：`multiple` 模式的 `TxSelect` 内部是 `div`，不是 `<label for>` 能关联的元素，`v-admin-control-id` 对它无效。多选字段继续用不带 `for` 的 `AdminFormField`，由 `aria-labelledby` 命名。

### Scenario: 下拉字段与行内下拉

- WHEN 抽屉里的 `AdminFormField` 带 `:for="id"`，包着一个带 `v-admin-control-id="id"` 的 `TuffSelect`
- THEN 挂载后内部 combobox 的 `id` 等于 `id`，点击标签会聚焦并展开这个下拉
- WHEN 行内编辑器的 `TuffSelect` 带 `v-admin-control-label="'模型（第 2 行）'"`
- THEN 内部 combobox 的 `aria-label` 为「模型（第 2 行）」，根 `div` 上没有 `aria-label`
