# TuffEx：TxSelect 被 `<label>` 包住时点击箭头会被吞掉（开关切换两次）

来源：`10-02-tuffex-admin-primitives` 验收中发现（老板 2026-10-02 决定「库级问题另开任务」）。该任务只修了 Nexus 文档里触发问题的 demo，组件本身未改。

## Problem

`TxSelect` 放在 `<label>` 里时，**精确点击箭头图标**会让下拉面板打开后立刻关闭，看起来像点击没有反应。

## Evidence

- ego 实测（Chromium，`/zh/docs/dev/components/pagination` 修复前的「分页导航」demo，见 `../10-02-tuffex-admin-primitives/research/ui-verification.md`）：点击 `span.tuff-select__arrow` 内的 svg，在 document 捕获阶段记录到两个 click 事件——`svg(trusted)`，随后是 label 转发给 input 的 `INPUT(trusted)`；700ms 后 `aria-expanded="false"`。点击文字区域只有一个 click，正常打开；同页「每页条数」demo 没有 `<label>`，点击箭头也能正常打开。
- 读代码推断（复核 agent，未逐行复核）：`TxBaseAnchor.vue:783` 在捕获阶段每收到一次 click 就切换一次开关；两次 click 之间有微任务检查点，Vue 已把「打开」同步下去，于是第二次 click 又把它关上。jsdom 里同一调用栈连发两次，两次读到的都是旧状态，所以复现不出最终结果。
- 相关缺口：`TxSelect` 没有为下拉框命名的 prop（`aria-label` 落到根 `div` 上，并不能为控件命名）；`TxPagination` 的每页条数选择器是在挂载后给 `role="combobox"` 加 `aria-labelledby` 来绕开。

- 仍然把 `TxSelect` 包在 `<label>` 里的位置（2026-10-02 用多行搜索找到，均未修）：`apps/nexus/app/components/docs/DocsComponentsGallery.vue:1406-1411`（画廊「分页」格子，其 `aria-label` 同样没有为控件命名）、`apps/nexus/app/components/content/demos/TemplateInboxNotificationsDemo.vue:1478-1485`（免打扰开始 / 结束时间两个选择框）。库修好后这两处是回归验证点；如果库修复迟迟未落地，也可以先单独改这两处。

## Requirements（待规划时细化）

- 定位并修正同一次用户点击被处理两次的问题（例如识别并忽略 label 激活转发的 click，或改为按 pointer 事件切换），并确认不影响键盘打开、点击外部关闭、`TxBaseAnchor` 的其它使用方。
- 评估给 `TxSelect`（及基于 `TxBaseAnchor` 的同类组件）增加可访问名称 prop（`ariaLabel` / `ariaLabelledby`），替换 `TxPagination` 的挂载后补丁。
- 回归测试：在真实浏览器中验证（jsdom 复现不了时序），并补充能在 jsdom 中失败的测试（例如断言同一次点击只切换一次）。
- 同步受影响组件的 Nexus 文档（`tuffex-docs-sync.md`）。

## Out of Scope

- `10-02-tuffex-admin-primitives` 已修的 Nexus demo。
