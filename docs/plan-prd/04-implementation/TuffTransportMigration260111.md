# TuffTransport 迁移清单 260111（历史迁移视图 / 分层入口）

> 状态: 历史参考 / 待按当前 typed event boundary 重写
> 更新时间: 2026-05-14
> 适用范围: CoreApp main/renderer/plugin transport 迁移审计
> 当前执行入口: `docs/plan-prd/TODO.md`、`docs/plan-prd/01-project/CHANGES.md`
> 相关现行专题: `docs/plan-prd/docs/TRANSPORT-LEGACY-RETIREMENT-CHECKLIST-2026-03.md`、`docs/plan-prd/04-implementation/TuffTransportPortPlan260111.md`

## TL;DR

- 本文是 260111 时点的迁移快照，下面“已迁移 / 部分迁移 / Legacy”列表不能直接作为当前真实清册。
- 当前事实以 typed event boundary 测试、`rawSendViolations / retainedRawEventDefinitions / typedMigrationCandidates` 指标和 `TODO` 中 Transport Wave A 记录为准。
- 后续 Transport 工作应优先围绕 MessagePort 高频通道、`sendSync` 清理、retained raw event 分批迁移和可复现门禁命令推进。

## 当前边界

- 二段或特殊 wire-name 在没有明确替代协议前可以保留 raw definition，但不得新增三段 typed-builder 形态的 raw event。
- 业务代码不得直接绕过 typed SDK 复活旧 Channel 调用；必要保留必须有测试或 registry 说明。
- 本文保留历史清单用于追溯，不作为 release gate 的唯一依据。

## 已迁移（明确使用 TuffTransport）
### 主进程
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/main/modules/analytics/analytics-module.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/storage/index.ts`（StorageEvents get/getVersioned/save/delete/updated）
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`（布局更新）
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`（CoreBoxEvents 处理器）
- `apps/core-app/src/main/modules/flow-bus/ipc.ts`（FlowEvents handlers + sessionUpdate/deliver push）
- `apps/core-app/src/main/modules/division-box/ipc.ts`（DivisionBoxEvents handlers + broadcast）

### 渲染进程
- `apps/core-app/src/renderer/src/composables/useFileIndexMonitor.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboardChannel.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`（CoreBoxEvents.query/show/hide/provider）
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useFocus.ts`（CoreBoxEvents.focus）
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useChannel.ts`（CoreBox input 事件）
- `apps/core-app/src/renderer/src/modules/channel/storage/base.ts`（Storage TuffTransport init）
- `apps/core-app/src/renderer/src/views/meta/MetaOverlay.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingMessages.vue`（仅 dev）
- `packages/utils/renderer/storage/base-storage.ts`（TouchStorage 走 StorageEvents）
- `packages/utils/renderer/storage/storage-subscription.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useDetach.ts`（FlowEvents.triggerDetach/triggerTransfer）
- `apps/core-app/src/renderer/src/modules/division-box/store/division-box.ts`（DivisionBoxEvents send/on）

## 部分迁移（TuffTransport + Legacy 并存）
- `apps/core-app/src/main/modules/storage/index.ts`：仍保留 `storage:get/storage:save/storage:update` 的 TouchChannel 方式（同步 / legacy 兼容）。
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`：使用 TuffTransport 处理 layout，但仍通过 TouchChannel 发 `core-box:search-update` 等旧事件。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`：搜索更新仍走 `core-box:search-update/search-end`。
- `apps/core-app/src/main/channel/common.ts`：作为 legacy 通道的桥接层存在。

## 仍为 Legacy（TouchChannel / regChannel）
以下文件仍以 `ChannelType`/`regChannel` 为主：
- `apps/core-app/src/main/core/touch-app.ts`
- `apps/core-app/src/main/service/service-center.ts`
- `apps/core-app/src/main/modules/system/tuff-dashboard.ts`
- `apps/core-app/src/main/modules/system/permission-checker.ts`
- `apps/core-app/src/main/modules/download/download-center.ts`
- `apps/core-app/src/main/modules/drop-manager.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/permission/index.ts`
- `apps/core-app/src/main/modules/update/UpdateService.ts`
- `apps/core-app/src/main/modules/global-shortcon.ts`
- `apps/core-app/src/main/modules/ai/intelligence-module.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.ts`
- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/terminal/terminal.manager.ts`
- `apps/core-app/src/main/modules/ai/intelligence-service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/ai/intelligence-config.ts`
- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/ai/agents/agent-channels.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`

## 迁移建议（优先级）
1. Storage：统一封装 API，隐藏 stream/legacy 差异
2. CoreBox：查询、布局、输入等全部迁移到 TuffTransport
3. FileProvider：索引状态、openers、files 相关事件迁移
4. UpdateService / SentryService：统一到 TuffTransport + 限流策略

## Port 抽象计划（新增）
- 目标：把 TuffTransport 从具体 IPC 中抽离出统一协议层，支持子 port 多路复用。
- 设计文档：`plan-prd/04-implementation/TuffTransportPortPlan260111.md`
- 迁移策略：
  1) 新增 Port/Protocol 层（不改现有 API）。
  2) Renderer/Main transport 改为基于 Port Adapter。
  3) 替换现有 stream 后缀事件为协议化流。
