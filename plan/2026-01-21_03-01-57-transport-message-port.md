---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: transport 引入 MessagePort 升级与流式通道迁移
complexity: complex
planning_method: builtin
created_at: 2026-01-21T03:02:05+0800
---

# Plan: transport MessagePort 升级与流式迁移

🎯 任务概述
为现有 TuffTransport 引入 MessagePort/MessageChannel 的升级能力，作为流式与高频消息的专用通道，保留现有 channel 作为兜底。基于新通道逐步迁移剪贴板、CoreBox 推送、推荐结果、文件索引与 AI 回复等高频链路。

📋 执行计划
1. 梳理现有 transport 流式实现与可升级点，明确哪些场景需要端口（高频/流式/大 payload）与哪些继续沿用 invoke/channel。
2. 设计 Port 升级协议与类型：新增事件/类型定义（请求升级、确认、关闭、错误码、端口绑定范围/权限），并确定 payload envelope（streamId/sequence/close）。
3. 主进程实现 Port 管理：基于 MessageChannelMain 创建端口、通过 webContents.postMessage 发送 port，维护端口生命周期与回收（close/GC/窗口销毁）。
4. 渲染进程实现 Port 层：新增 transport.upgrade/openPort API，缓存端口映射并与现有 stream 逻辑对接（优先端口，失败回退 channel）。
5. 统一错误与回退策略：端口不可用、断开、跨域/隔离受限时自动降级；补充日志与可观测性埋点。
6. 迁移首批高频通道到 Port：剪贴板推送、CoreBox UI 推送、推荐结果、文件索引进度、AI 回复流；逐个加开关与灰度回滚点。
7. 适配插件/多窗口场景：识别插件 UI 的端口传输限制，必要时通过 preload 桥接，保证隔离模式下仍可用。
8. 验证与文档：类型检查/冒烟验证；补充 Nexus 文档说明新端口协议、回退行为与示例。

⚠️ 风险与注意事项
- MessagePort 只能通过 postMessage 传输，invoke/send 无法携带端口；需处理隔离世界与多窗口生命周期。
- 端口流式若未正确 close 可能泄漏或阻塞；需统一回收与超时策略。

📎 参考
- packages/utils/transport/sdk/renderer-transport.ts
- packages/utils/transport/sdk/main-transport.ts
- packages/utils/transport/events/index.ts
- apps/core-app/src/main/modules/clipboard.ts
- apps/core-app/src/main/modules/box-tool/core-box/window.ts

## 📌 现有流式与高频链路盘点（TPORT-010）

### 流式 / 高频（优先 Port）
- Clipboard change stream: ClipboardEvents.change（apps/core-app/src/main/modules/clipboard.ts:1722，apps/core-app/src/renderer/src/modules/box/adapter/transport/clipboard-transport.ts:63）— 流式推送，变更频繁。
- File index progress stream: AppEvents.fileIndex.progress（apps/core-app/src/main/channel/common.ts:960，apps/core-app/src/renderer/src/composables/useFileIndexMonitor.ts:97，apps/core-app/src/renderer/src/views/base/LingPan.vue:283）— 流式进度，高频更新。
- CoreBox search query results: CoreBoxEvents.search.query（apps/core-app/src/main/modules/box-tool/core-box/ipc.ts:222，apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts:362）— 结果集大且可流式，适合 Port。

### 高频非流式（可评估 Port）
- CoreBox input change → plugin UI: CoreBoxEvents.input.change（apps/core-app/src/main/modules/box-tool/core-box/window.ts:1006，apps/core-app/src/main/modules/box-tool/core-box/window.ts:1482）— 输入变更高频，当前 sendToPlugin。
- Recommendation fetch: core-box:get-recommendations（apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1431）— 请求响应，中频，暂保留 invoke/channel。
- File index status/stats/rebuild: AppEvents.fileIndex.status/stats/rebuild（apps/core-app/src/main/channel/common.ts:967）— 用户触发/低频，保留 invoke/channel。
- Storage updates stream: StorageEvents.app.updated（apps/core-app/src/main/modules/storage/index.ts:351，apps/core-app/src/renderer/src/views/base/settings/SettingMessages.vue:73）— 流式更新，影响面大，后续可评估。

### 暂保留 invoke/channel 的理由
- 低频请求/响应（推荐、索引状态、剪贴板历史）: invoke/channel 足够且实现成本低。
- AI 回复流：当前 transport 仅暴露 intelligence:invoke（apps/core-app/src/main/modules/ai/intelligence-service.ts:37），未提供 intelligence:invoke-stream；如需流式需新增事件与 renderer 端消费逻辑，暂保留 invoke/channel。
