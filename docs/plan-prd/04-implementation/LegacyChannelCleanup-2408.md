# Legacy Channel Cleanup 2.4.8（P0）

> 目标版本：2.4.8  
> 状态：规划中  
> 优先级：P0  
> 范围：main/renderer/plugin 的 P0 legacy channel 清理与 TuffTransport 统一

## 1. 背景与问题

当前多处仍依赖 legacy Channel（`ChannelType`/`ITouchChannel`/`$channel`），导致：
- 事件命名与 payload 语义分散，难以做 typed event 收口；
- transport 与 legacy channel 双栈并存，增加维护与排障成本；
- 插件与 CoreBox 高频链路仍可走 legacy 直连，阻碍 Hard-Cut。

## 2. 目标（2.4.8 必达）

- P0 模块不再直接依赖 `ChannelType/ITouchChannel/$channel`。
- CoreBox/Clipboard/Flow/DivisionBox 统一走 TuffTransport typed event。
- 插件主链路不再读取 raw channelMap（仅保留 transport 的 reply 语义）。
- 保持现有功能可用性与行为一致（向后兼容不破坏）。

## 3. 非目标

- 本次不移除 `packages/utils/channel` 包（作为后续版本收口）。
- 不调整现有 API 的外部语义（仅替换传输层）。
- 不引入新的兼容分支或额外 fallback 机制。

## 4. P0 范围清单

### 4.1 CoreBox

- `apps/core-app/src/main/modules/box-tool/core-box/transport/core-box-transport.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/input-transport.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/key-transport.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`

### 4.2 Clipboard

- `apps/core-app/src/main/modules/clipboard.ts`

### 4.3 DivisionBox / FlowBus

- `apps/core-app/src/main/modules/division-box/ipc.ts`
- `apps/core-app/src/main/modules/flow-bus/ipc.ts`

### 4.4 Plugin 主链路

- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/widget/*`

## 5. 迁移方案（按阶段）

### Phase A：CoreBox 传输层统一（P0）

- 用 transport context 判断 `plugin/main`，替换 `ChannelType` 参数。
- `window.ts` 的 `broadcastTo` 统一改为 `transport.broadcastToWindow`。
- 事件统一使用 `defineRawEvent`（保持 eventName 不变）。

**验收**
- CoreBox 输入/键盘/窗口广播功能一致（无行为回归）。

### Phase B：Clipboard 事件统一（P0）

- 移除 `clipboardLegacy*` 的发送/接收路径，统一走 `ClipboardEvents`。
- 插件 UI 通知使用 transport `sendToPlugin` + typed event。

**验收**
- 剪贴板新增/收藏/删除/读取功能全流程可用；
- CoreBox UI 仍能收到实时更新。

### Phase C：DivisionBox / FlowBus 直连 transport（P0）

- 构造函数直接注入 `ITuffTransportMain`（或从 `TouchApp` 获取 transport）。
- 删除对 `ITouchChannel` 的依赖与 `keyManager` 推断。

**验收**
- DivisionBox/FlowBus IPC 行为与权限校验保持一致。

### Phase D：Plugin 主链路收口（P0）

- 用 transport 实现 reply 语义，移除 raw `channelMap` 访问。
- `touchChannel` 仅保留 transport 适配的最小能力（send/on）。

**验收**
- 插件调用/回调链路可用；
- 不再出现 `ChannelType` 依赖在 plugin 主路径中。

## 6. 风险与回滚

### 风险
- 事件路径替换导致监听丢失；
- 插件回调依赖 `reply` 语义，迁移不当会影响返回值。

### 回滚
- 以模块为粒度逐个回滚（CoreBox / Clipboard / DivisionBox / FlowBus / Plugin）。
- 仅回滚本次替换，不新增兼容分支。

## 7. 验证与检查

- `pnpm -C "apps/core-app" run typecheck`（主/渲染）
- 手工回归：CoreBox 输入/快捷键/窗口显示；剪贴板增删改查；DivisionBox/FlowBus 触发链路；插件 UI 与 CoreBox 交互。

## 8. 文档同步

- `docs/plan-prd/TODO.md`：新增 2.4.8 P0 任务入口
- `docs/plan-prd/README.md`：补充里程碑入口
- `docs/INDEX.md`：补充迁移参考

