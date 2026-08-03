# 修正 CoreApp 快捷键作用域

## Goal

停止 CoreApp 将页面级 Flow 操作注册为操作系统全局快捷键，避免 Tuff 在失焦时拦截其他应用的常用按键；移除不再需要的 AI Quick Call 快捷键，同时保留 CoreBox 已有的页面级 Flow 操作体验。

## Background

- `ShortcutModule` 会将已启用的 `MAIN` / `RENDERER` 快捷键统一交给 Electron `globalShortcut.register()`，因此回调内的可见性判断无法把按键归还给前台应用（`apps/core-app/src/main/modules/global-shortcon.ts:440-550`）。
- FlowBus 当前把 `CommandOrControl+D` 和 `CommandOrControl+Shift+D` 注册为全局快捷键（`apps/core-app/src/main/modules/flow-bus/module.ts:192-229`）。
- CoreBox 渲染端已在页面键盘处理器中实现同样的两个组合键，并通过 `corebox:detach-item` / `corebox:flow-item` 触发页面动作（`apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts:943-980`、`useDetach.ts:341-370`）。
- AI Quick Call 当前以 `CommandOrControl+Shift+I` 注册但默认关闭（`apps/core-app/src/main/modules/box-tool/core-box/index.ts:132-169`）；用户要求移除该快捷键。
- 历史快捷键会持久化到 shortcut settings。仅删除运行时注册会留下 `runtime-missing` 设置项，因此必须迁移删除退休 ID。

## Requirements

- R1：删除 `core.box.aiQuickCall` 的主进程快捷键注册和生命周期清理，不影响普通 CoreBox 唤起快捷键。
- R2：删除 Flow Detach / Transfer 的系统全局快捷键注册；Tuff 失焦时不得再占用 `Command/Ctrl+D` 或 `Command/Ctrl+Shift+D`。
- R3：保留现有 CoreBox 页面级 Detach / Transfer 行为，只在 CoreBox 页面键盘处理链路中消费组合键。
- R4：迁移删除历史持久化的 `core.box.aiQuickCall`、`flow:detach-to-divisionbox`、`flow:transfer-to-plugin`，且不得删除其他系统或用户自定义快捷键。
- R5：移除只服务于旧全局 Flow 触发链路的 FlowBus 死代码和设置页文案；保留 typed Flow 上下文通知，并通过专用 `CoreBoxEvents.uiMode.detach` 将视图转移交给主进程所有权边界，不得放宽通用 DivisionBox 插件调用权限。
- R6：保持快捷键录入时的全局禁用、CoreBox toggle、截图、OmniPanel、听写和插件全局快捷键现有行为不变。

## Acceptance Criteria

- [x] AC1：CoreBox 初始化只注册 `core.box.toggle`，不再注册或注销 `core.box.aiQuickCall`。
- [x] AC2：FlowBus 初始化和销毁均不调用 ShortcutModule，且 FlowBus 不再发送 `FlowEvents.triggerDetach` / `triggerTransfer`。
- [x] AC3：`useKeyboard` 中 `Command/Ctrl+D` 仍触发页面 Detach，`Command/Ctrl+Shift+D` 仍触发页面 Flow Transfer；插件 `WebContentsView` 聚焦时由 CoreBox 上下文路由触发同一 typed 通知，Detach 只通过主进程持有的真实视图和插件身份完成；成功转移同步让出 CoreBox 缓存所有权，失败回滚保持单一视图所有者并清理监控/UI 状态；非 CoreBox 页面或已移出的视图不消费这些按键。
- [x] AC4：启动快捷键模块时批量清理三个退休 ID，只发生一次必要持久化写入，并保留无关快捷键。
- [x] AC5：设置页不再展示三个退休项的专用标签，typed Flow 事件文档将生产者标记为 CoreBox 插件视图上下文路由。
- [x] AC6：相关 focused tests、CoreApp node/web typecheck 与 `git diff --check` 通过。

## Verification Evidence

- CoreApp shortcut / CoreBox / plugin boundary / DivisionBox focused suite: `12` files, `82/82` tests passed.
- Existing shortcut lifecycle suite: `35/35` tests passed.
- Shared transport and shortcut-storage suite: `42/42` tests passed.
- Nexus architecture-doc route/path/API suite: `15/15` tests passed; MDC fence check passed.
- CoreApp `typecheck:node`, `typecheck:web`, repository `lint:changed`, locale JSON parsing, and `git diff --check` passed.
- Three independent review rounds found and drove fixes for renderer-to-main authority, duplicate non-idempotent handler registration, cache ownership, partial-session rollback, and failed-transfer monitoring cleanup; final verdict: `APPROVE` with no Blocker/Major/Minor.

## Out Of Scope

- 本任务不重构完整的 `GLOBAL / APPLICATION / WINDOW` 快捷键作用域模型。
- 不改变其他真正需要跨应用唤起的全局快捷键默认值或启用策略。
- 不新增 Flow 快捷键自定义设置；页面级组合键继续沿用现有固定值。
