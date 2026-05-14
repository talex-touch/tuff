# Transport Retained Event Wire-name 迁移方案 260514

> 状态: 当前参考 / 方案已定稿，待分批实施  
> 更新时间: 2026-05-14  
> 适用范围: CoreBox / terminal / auth / sync / opener 的 retained raw event names  
> 执行入口: `docs/plan-prd/TODO.md`、`docs/plan-prd/01-project/CHANGES.md`

## TL;DR

- 当前 `defineRawEvent` 后续批不再存在可直接无损迁到 typed builder 的三段事件；剩余项都是一段、二段或特殊 wire name。
- 这些事件不能直接替换成 `defineEvent(namespace).module(module).event(action)`，否则会改变对外 IPC event name。
- 迁移必须采用“canonical typed event + retained legacy alias”的显式窗口：先双监听，再切发送端，最后按 evidence hard-cut。
- 新增 raw definition 只能进入 alias registry，不允许继续散落在业务代码里。

## 当前扫描边界

2026-05-14 复核范围覆盖 TODO 点名的 CoreBox / terminal / auth / sync / opener 以及 auth/store 调用侧：

| 域 | raw definitions | unique names | typed candidates |
| --- | ---: | ---: | ---: |
| `sync` | 6 | 3 | 0 |
| `terminal` | 5 | 5 | 0 |
| `opener` | 5 | 5 | 0 |
| `auth` | 31 | 17 | 0 |
| `corebox` | 18 | 17 | 0 |

补充说明：此前 TODO 关闭的“后续批梳理”按点名源文件统计为 `62` 个 retained raw definitions；本文方案把 auth store consumer 也纳入迁移设计，因此覆盖面扩展为 `65` 个 definitions / `47` 个 unique names。

## 命名规则

1. Canonical event name 必须是 `namespace:module:action`。
2. Namespace 使用稳定业务域，不使用组件内部昵称：
   - `core-box` 统一替代 `corebox`。
   - plugin opener 相关特殊事件统一归入 `plugin:*:*` 或 `opener:*:*`。
3. Module 表达资源或子域，action 表达动作：
   - `terminal:create` -> `terminal:session:create`
   - `sync:start` -> `sync:lifecycle:start`
   - `auth:get-state` -> `auth:session:get-state`
4. Legacy alias 必须保留原 wire name，不改调用方语义；只在迁移窗口内存在。
5. 一段或特殊前缀事件不得再新增同类命名；必须先给 canonical name。

## Canonical 目标映射

### Sync

| Legacy wire name | Canonical typed event |
| --- | --- |
| `sync:start` | `sync:lifecycle:start` |
| `sync:stop` | `sync:lifecycle:stop` |
| `sync:trigger` | `sync:lifecycle:trigger` |

### Terminal

| Legacy wire name | Canonical typed event |
| --- | --- |
| `terminal:create` | `terminal:session:create` |
| `terminal:write` | `terminal:session:write` |
| `terminal:kill` | `terminal:session:kill` |
| `terminal:data` | `terminal:session:data` |
| `terminal:exit` | `terminal:session:exit` |

### Opener / Plugin Install

| Legacy wire name | Canonical typed event |
| --- | --- |
| `@open-plugin` | `plugin:opener:open` |
| `@install-plugin` | `plugin:install:request` |
| `plugin:install-dev` | `plugin:install:dev` |
| `drop:plugin` | `plugin:drop:install` |
| `openers:resolve` | `opener:app:resolve` |

### Auth / Account

| Legacy wire name | Canonical typed event |
| --- | --- |
| `auth:get-state` | `auth:session:get-state` |
| `auth:login` | `auth:session:login` |
| `auth:logout` | `auth:session:logout` |
| `auth:update-profile` | `auth:profile:update` |
| `auth:update-avatar` | `auth:profile:update-avatar` |
| `auth:attest-device` | `auth:device:attest` |
| `auth:nexus-request` | `auth:nexus:request` |
| `auth:state-changed` | `auth:session:state-changed` |
| `auth:manual-token` | `auth:token:manual` |
| `auth:request-stepup` | `auth:step-up:request` |
| `auth:get-stepup-token` | `auth:step-up:get-token` |
| `auth:clear-stepup-token` | `auth:step-up:clear-token` |
| `auth:get-fingerprint-hash` | `auth:device:get-fingerprint-hash` |
| `account:get-auth-token` | `account:auth:get-token` |
| `account:get-device-id` | `account:device:get-id` |
| `account:get-sync-enabled` | `account:sync:get-enabled` |
| `account:record-sync-activity` | `account:sync:record-activity` |

### CoreBox / Meta Overlay

| Legacy wire name | Canonical typed event |
| --- | --- |
| `beginner:shortcut-triggered` | `beginner:shortcut:triggered` |
| `core-box:ui-resume` | `core-box:ui:resume` |
| `core-box:allow-input` | `core-box:input:allow` |
| `core-box:toggle-pin` | `core-box:item:toggle-pin` |
| `core-box:get-recommendations` | `core-box:recommendation:get` |
| `core-box:aggregate-time-stats` | `core-box:recommendation:aggregate-time-stats` |
| `core-box:is-pinned` | `core-box:item:is-pinned` |
| `corebox:focus-input` | `core-box:input:focus` |
| `corebox:show-history` | `core-box:preview-history:show` |
| `corebox:hide-history` | `core-box:preview-history:hide` |
| `corebox:copy-preview` | `core-box:preview:copy` |
| `corebox:open-action-panel` | `core-box:action-panel:open` |
| `meta-overlay:action-executed` | `core-box:meta-overlay:action-executed` |
| `meta-overlay:item-action` | `core-box:meta-overlay:item-action` |
| `meta-overlay:flow-transfer` | `core-box:meta-overlay:flow-transfer` |
| `shell:show-item-in-folder` | `shell:item:show-in-folder` |
| `trigger-plugin-feature-exit` | `plugin:feature:exit` |

## 迁移阶段

### Phase 0: Freeze

- 保持 `transport-event-boundary.test.ts` 对三段 raw event 的禁止规则。
- `defineRawEvent` 只允许用于 retained non-conforming wire names。
- 新功能必须直接使用 canonical typed event。

### Phase 1: Alias Registry

- 在 shared transport events 下新增集中 alias registry，例如 `transport/events/retained-aliases.ts`。
- Registry 同时导出：
  - canonical typed event。
  - legacy raw alias。
  - alias owner、保留理由、计划 hard-cut 版本。
- 业务代码不得继续局部 `defineRawEvent('legacy-name')`。

### Phase 2: Dual Listen

- Main 侧 handler 同时监听 canonical event 与 legacy alias。
- Push event 发送端可短期同时广播 canonical 与 legacy alias，但必须避免重复消费。
- Renderer / plugin SDK 优先切到 canonical event。

### Phase 3: Legacy Hit Evidence

- 对 legacy alias 命中增加最小诊断计数，至少记录 event name、caller domain、版本与时间窗口。
- 连续窗口内无 legacy hit 后，才能关闭该 alias。
- Evidence 记录到 `CHANGES` 与对应 TODO 子项，不写入生产 Release Evidence 之前不得声称远端闭环。

### Phase 4: Hard-cut

- 移除 legacy alias listener / sender。
- 删除 alias registry 中对应 raw definition。
- 收紧 `RETAINED_RAW_EVENT_DEFINITION_MAX`。
- 补 domain SDK / main handler / renderer caller 回归测试。

## 第一切片建议

优先选择 `sync` 或 `terminal`：

- 事件数量小，调用面集中。
- 语义清晰，canonical name 不需要产品决策。
- 可用定向测试覆盖主/渲染两侧，不依赖 Windows 真机或外部凭证。

建议第一切片验收命令：

```bash
pnpm -C "packages/utils" exec vitest run "__tests__/transport-event-boundary.test.ts"
pnpm -C "apps/core-app" run typecheck:node
pnpm -C "apps/core-app" run typecheck:web
git diff --check
```

## 关闭条件

- 每个被迁移域都有 canonical typed event、legacy alias 与 hard-cut 版本记录。
- 发送端优先走 canonical event，legacy alias 只用于兼容窗口。
- retained raw definition 数量随切片下降，且 `typedCandidates` 保持 `0`。
- TODO / CHANGES 同步记录每批 alias 的证据与剩余项。
