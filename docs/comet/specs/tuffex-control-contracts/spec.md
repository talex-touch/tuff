# tuffex-control-contracts

本文定义 TxButton、TxSelect、TxStatCard 与 TxDrawer 在尺寸、可访问命名、说明内容和叠层键盘上的公共契约。其余属性、事件、插槽与样式入口维持既有组件文档。

## Requirement: 圆形按钮

TxButton 的 circle 是形状修饰，不改变 size 的尺寸档位。同一 size 的圆按钮宽高相等，水平内边距和普通按钮的最小宽度不能将其拉长。现有尺寸别名沿用组件尺寸归一化规则，不新增尺寸词汇。

### Scenario: sm 圆按钮

- WHEN TxButton 设置 circle 和 size="sm"
- THEN 按钮宽高相等，边长等于 sm 的既有按钮高度，图标居中，没有继承普通按钮的长条最小宽度
- AND 不同 size 的圆按钮各自保持对应尺寸，非圆按钮仍按原有文字内容与内边距排版

Acceptance: A1

## Requirement: 选择器属性

TxSelect 的 id、aria-label、aria-labelledby 与关联可访问属性由实际操作控件承载，不只附在外层布局 div；不得为了传递 id 生成两个同名 DOM id。class 与 style 保留既有根布局语义。

单选的实际输入/combobox 可通过 label-for 聚焦；多选保持既有操作结构并由 aria-label 或 aria-labelledby 命名，不将不可关联的 div 宣称为原生 label-for 控件。外部属性从首次渲染起可用，更新后同步生效，不能依赖挂载后的业务指令补写。

### Scenario: 直接传入和更新可访问名称

- WHEN 单选 TxSelect 直接收到 id 和 aria-label
- THEN id 与名称在实际 combobox 上生效，点击关联 label 能聚焦控件
- WHEN 父组件更新 id 或可访问名称
- THEN 控件采用新属性，旧 id 不残留在根节点
- WHEN 使用 multiple 模式并传入 aria-label 或 aria-labelledby
- THEN 实际多选操作控件拥有对应名称，键盘选择行为不变

Acceptance: A2

## Requirement: 统计卡说明

TxStatCard 的 meta 在 default 和 progress 两种既有变体中都有效。默认变体将说明显示在标签下方；progress 保留既有说明语义。没有非空 meta 时，不因本次修复额外占据说明行空间。

### Scenario: 两种变体的说明

- WHEN default 或 progress 变体收到非空 meta
- THEN 每张卡恰好显示一次说明
- WHEN 未提供 meta
- THEN 卡片不产生新的空说明行，也不改变既有值、标签和进度布局

Acceptance: A3

## Requirement: 叠层键盘

TxDrawer 不得在上层确认框已经处理或拥有键盘交互时再次处理同一 Tab、Shift+Tab 或 Escape。键盘所有权由组件层处理，调用方无需知道 TxModal 的内部 CSS 类名，也无需给 document.body 安装局部拦截器。

### Scenario: 抽屉之上的确认框

- WHEN 在已打开的抽屉上打开确认框
- THEN Tab 和 Shift+Tab 在确认框内循环，底层抽屉不抢回焦点
- WHEN 确认框不在提交中并按 Escape
- THEN 只关闭确认框，抽屉仍然打开
- WHEN 确认框处于提交中并按 Escape
- THEN 确认框与底层抽屉均不被关闭
- WHEN 确认框关闭后再次操作抽屉
- THEN 抽屉恢复自身正常的键盘与焦点行为

Acceptance: A4

## Requirement: 文档与集成证据

组件源行为变更必须同步 Nexus 中英组件文档和受影响的包装组件说明；已有错误描述与绕行示例必须撤除。用户可见变化有可运行演示，实际尺寸、命名和叠层交互在真实浏览器验证。

### Scenario: 组件文档可复核

- WHEN 查看受影响组件的中英文档与演示
- THEN 两种语言描述同一公共行为，演示可观察到实际控件而非仅 props 表更新
- AND 提交验收材料包含真实尺寸与交互结果，未运行的场景不声称通过

Acceptance: A11
