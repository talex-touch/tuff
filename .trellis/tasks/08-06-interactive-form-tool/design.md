# 表单工具 · 设计

照抄图表家族的三层：域常量（FORM_RESULT_PREFIX='tuff:form:'，放 agent-tools.ts 与 CHART_RESULT_PREFIX 并排）→ 主进程校验（tool-registry parseFormSpec，错误返回给模型自纠）→ 渲染卡片（components/intelligence/ToolFormCard.vue，模式对齐 ToolChartCard：spec prop + submitted 态 + emit('submit', values)）。

提交回流的接线（HomePage）由主会话装配：卡片 emit → 组装 `【表单提交】key: value…` 文本 → conversation.send()。工具 risk=read：渲染无副作用，提交是用户主动行为。

字段渲染映射：text/textarea/number→TxInput 族、select→TxSelect、checkbox→TxSwitch/TxCheckbox（以 tuffex 现有组件为准，代理先查可用性再选型）。
