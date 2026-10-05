# nexus-admin-kit

后台组合件里经 Comet 登记的两项行为：统计卡的说明行，以及选择器的可访问命名。组合件其余的冻结 API 见交接副本 `handoffs/10-02-nexus-admin-console-kit/design.md` §8，`useAdminResource` 见 `nexus-admin-resource`。

## Requirement: 统计卡说明行

`AdminStatGrid` 的条目（`AdminStatItem`）可以带 `meta`：显示在标签下方的第二行，字号 12px，与标签同色。说明由 `TxStatCard` 的公共 `meta` 能力绘制，组合件不再通过标签插槽重复生成说明。

- 同一排只要有一张卡带 `meta`，其他卡在同一位置留出等高的空行，各卡的数字与标签上下对齐。
- 加载占位与成品同版式：带 `meta` 的卡多一条占位线，其他卡留出同高的空隙。
- 一排都不带 `meta` 时，输出与登记前相同。
- 说明本身只渲染一次，等高排版不通过复制说明文本实现。

### Scenario: 只有一张卡带说明

- WHEN `AdminStatGrid` 收到五张卡，只有第一张带 `meta: '4 个已启用'`
- THEN 第一张卡在标签下方显示一次「4 个已启用」，其余四张在同一位置保留等高空间
- AND 五张卡的数字顶边在同一高度
- WHEN 同一组卡处于加载中
- THEN 第一张占位有三条占位线，其余四张各两条，并留出与说明行同高的空隙

Acceptance: A3

## Requirement: 控件命名

`TxSelect` 自身将 `id` 和可访问命名属性传给实际操作控件，后台通过公共属性使用它：

- 单选字段：`AdminFormField` 带 `:for="id"`，内部 `TuffSelect` 直接带 `:id="id"`；点击标签会聚焦对应控件。
- 行内选择器：直接带 `aria-label`，名称含可见字段名和需要区分的行号。
- `multiple` 模式保持非原生 label-for 控件的既有结构，由 `aria-label` 或 `aria-labelledby` 命名。
- `AdminFormField` 与 `AdminFilterField` 对错误、说明和缺省标签关联的现有行为保留。
- 原有 `v-admin-control-id`、`v-admin-control-label` 及专门为它们提供的 DOM 改写逻辑在全部调用方迁移后删除，不保留兼容别名。

### Scenario: 下拉字段与行内下拉

- WHEN 抽屉里的 `AdminFormField` 带 `:for="id"`，包着一个直接带 `:id="id"` 的 `TuffSelect`
- THEN 首次渲染的内部 combobox 已具有该 id，点击标签能聚焦这个下拉，根 div 不重复占用同一个 id
- WHEN 行内编辑器的 `TuffSelect` 带 `:aria-label="'模型（第 2 行）'"`
- THEN 内部 combobox 的 `aria-label` 为「模型（第 2 行）」，无需挂载后的指令改写

Acceptance: A2
