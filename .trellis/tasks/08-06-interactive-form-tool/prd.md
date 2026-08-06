# 交互式表单工具（tuff_render_form）

父任务：`.trellis/tasks/08-05-ai-toolchain-suite`。图表家族的姊妹篇：模型产出**声明式表单 spec**，会话内渲染成可交互卡片，用户提交后以结构化文本回流会话继续对话。绝不执行模型代码。

## Requirements

- 网关工具 `tuff_render_form(spec)`（risk=read）：主进程校验 spec（title?/description?/fields[]/submitLabel?；field: key/label/type(text|textarea|number|select|checkbox)/options?/required?/placeholder?/default?；≤20 字段；key 唯一）；合法 → `FORM_RESULT_PREFIX + JSON` 进 output（与 CHART_RESULT_PREFIX 同模式，常量单源于 agent-tools 域）
- 渲染 ToolFormCard.vue：tuffex 输入组件拼装、required 校验、提交/重置；提交后卡片进入已提交态（回显值、不可重复提交）
- 提交回流：值以 `key: value` 行格式作为用户消息发送（HomePage 接线由主会话装配，代理不碰 HomePage）
- 非法 spec → isError 文本给模型自纠

## Acceptance Criteria

- [ ] spec 校验矩阵单测（缺 key/重复 key/未知 type/超字段数/select 无 options）
- [ ] ToolFormCard 组件测试：渲染各 type、required 拦截、提交 emit 契约、已提交态
- [ ] 端到端（装配后）：让模型「做一个 2 字段调查表单」→ 卡片渲染 → 提交 → 模型基于提交值继续回复
- [ ] typecheck×2 / lint / vitest 绿
