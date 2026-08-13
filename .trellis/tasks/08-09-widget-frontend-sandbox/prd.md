# AI 自写 widget 的纯前端沙箱方案

父任务：`08-09-home-panel-layering-v2`

## 本轮交付物

**只出方案，不写实现代码。** 交付 `design.md` 一份，说明纯前端隔离怎么做、边界在哪、有哪些必须先解决的前提。是否进入实现由用户看完方案后决定。

## 需求来源

用户原话：

> widget 为啥不允许 ai 自己写代码。。。而是固定死了

> 我们参考微服务 不需要 webcontents 就给一个隔离沙箱环境 webcontents 太重了 webcontents 是不是基于了electron？我们后续都改成融合的 最好是仅仅前端技术

## 现状

现在 widget 是两个固定工具 + 两个固定组件：

- `tuff_render_chart`（`tool-registry.ts:441`）与 `tuff_render_form`（`:635`）在主进程把模型 args 解析成校验过的声明式 spec
- spec 带 `tuff:chart:` / `tuff:form:` 前缀走普通 tool-result 通道回到渲染进程
- `ToolChartCard.vue` / `ToolFormCard.vue` 把固定字段映射成 ECharts option / 表单控件

`ToolChartCard.vue:5-10` 写明了这个约定的意图：*"The spec is declarative and was checked in the main process, so nothing the model wrote is executed here"* —— 模型写的东西一行都不在渲染进程里执行。

这不是懒，是渲染进程的红线：渲染进程持有完整的 preload / IPC 面（channel、storage、plugin API），模型生成的 JS 直接在这里跑等于把整个 IPC 面交给模型输出。

## 约束

1. **不使用 WebContents。** 用户明确否掉了。`BrowserWindow` / `BrowserView` / `<webview>` 每个都自带独立 WebContents（独立进程 + 独立 Chromium 实例开销）。
2. **优先纯前端技术。** 隔离手段应当是标准 Web 平台能力，不依赖 Electron 特有 API，以便后续「融合」。
3. **模型代码绝不能触达 preload / IPC / 父 DOM / 应用存储。**
4. 现有的 `tuff_render_chart` / `tuff_render_form` 声明式路径**保留**。沙箱是新增的第三条路，不是替换 —— 声明式路径更安全也更省 token，能用它的场景不该被赶去写代码。

## 方案必须回答的问题

- [ ] 隔离原语选什么：`<iframe sandbox srcdoc>` / Web Worker / 两者叠加，各自能挡住什么、挡不住什么
- [ ] **网络出口怎么关**。应用当前的 CSP 是 `default-src *` + `script-src * 'unsafe-inline' 'unsafe-eval'`（`apps/core-app/src/renderer/index.html:8-18`），几乎不设防；沙箱必须自带 CSP，不能指望文档级 CSP
- [ ] 宿主与沙箱的通信契约：消息形状、能力白名单、超时、错误上报
- [ ] 沙箱要不要能调工具 / 读数据？如果要，走什么审批（和现有的 `agentTools` 权限三档怎么对齐）
- [ ] 尺寸协商：沙箱内容高度怎么告诉宿主，不能让模型代码随意撑满窗口
- [ ] 崩溃 / 死循环 / 内存泄漏的兜底（一个 `while(true)` 就能卡死渲染进程主线程吗？）
- [ ] 持久化与重放：会话重载时沙箱 widget 怎么恢复，代码存在哪
- [ ] 降级路径：沙箱不可用 / 被用户关掉时显示什么

## Acceptance Criteria

- [x] `design.md` 存在，上述问题均有结论或明确标注为未决
- [x] 每条平台能力断言都写明依据；无法从代码核实的那一条（srcdoc iframe 的死循环是否冻住主线程）**没有当成结论**，而是列为阶段 0 的必做实验并给了实验方法
- [x] 明确列出「这个方案挡不住什么」（5 条，含视觉欺骗与 srcdoc 拼装是信任根）
- [x] 分阶段路径：阶段 0 实验 → 1 只读渲染 → 2 交互 → 3 能力，并写明阶段 3 必须单独评审
- [x] 本任务未产出任何实现代码
- [ ] 用户确认方案后才进入实现

### 规划期发现（重要，改变了方案形状）

跑测试时才发现仓库里**已经有一套 widget 沙箱**：`widget-sandbox-policy.ts` + `widget-registry.ts`，配 20 条测试，含能力枚举、配额、审计日志、动态代码拦截、命名空间化存储、证据对象。

但它服务的是**插件** widget，隔离层是同 realm 的 `with (Proxy)` + `new Function`（`widget-registry.ts:1632-1638`）。对插件是成立的取舍，对模型输出不是 —— 信任等级不同，且同 realm 代理沙箱原理上可逃逸。

方案据此改成：**隔离层另起（iframe + Worker + CSP），策略层复用既有的能力/配额/审计/证据**。少写一套，也少一套要维护的策略语义。

如果不是顺手跑了全量测试，这套东西不会被发现，方案就会变成重复造轮子。

## 非目标（本轮）

- 不写任何实现代码
- 不改 `tuff_render_chart` / `tuff_render_form`
- 不改应用的全局 CSP（沙箱自带 CSP 是方案的一部分，改全局 CSP 是另一件事，影响面大得多）
