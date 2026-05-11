---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 全量迁移到 TuffTransport，并补齐渲染器-主进程异步双向 IPC/任务能力
complexity: complex
planning_method: builtin
created_at: 2026-01-21T01:29:10+08:00
---

# Plan: TuffTransport 全量迁移与异步 IPC

🎯 任务概述
目标是移除业务代码对旧 Channel 的直接依赖，统一通过 TuffTransport。
同时补齐 renderer->main 的异步请求/任务模式（对齐 Nexus transport 原理与 Electron pattern-2）。

📋 执行计划
1. 盘点残留旧通道调用：ChannelType/genTouchChannel/regChannel/sendSync/$channel 注入点，按“必须迁移/可保留内核”分类。
2. 对照 Nexus transport 文档与 internals，确定 Transport 端口与 event 命名策略，补齐缺失事件（特别是 renderer->main 请求/响应与任务型 API）。
3. 设计并实现 renderer<->main 异步请求链路（invoke/handle 或等价封装），落到 TuffTransport 实现层，确保支持超时/错误包装与 context。
4. 迁移 renderer 侧旧同步 API（storage、terminal、touch-sdk）到 TuffTransport，移除 sendSync 依赖，替换为 async/stream/batch。
5. 迁移 preload 注入（app-ready 等）到 TuffTransport，统一暴露 $transport，不再暴露 $channel（或保留兼容期策略）。
6. 迁移 main 侧旧 regChannel/onMain 监听到 transport.on，并清理 ChannelType 依赖；保留 channel-core 仅作 transport 内部实现。
7. 覆盖插件 SDK：确保 plugin renderer 与 main 都仅通过 transport；对仍需兼容的旧 API 增加 deprecate 提示与桥接。
8. 做全量复扫与移除遗留：确保业务代码无旧 Channel 直接调用，生成迁移清单与残留说明。
9. 验证与回归：运行核心 IPC 相关流程（storage、corebox、division-box、terminal、plugin SDK），补充必要测试/模拟。

⚠️ 风险与注意事项
- sendSync 去除会牵涉到同步调用语义变更，需评估调用链是否允许 async 改造。
- 插件生态兼容：移除 $channel 可能影响旧插件，需要制定过渡期或兼容层。
- 事件命名/权限上下文：transport context 与旧 header.type/plugin 字段差异需要统一处理。

📎 参考
- `apps/nexus/content/docs/dev/api/transport.zh.md`
- `apps/nexus/content/docs/dev/api/transport-internals.zh.md`
- `apps/core-app/src/renderer/src/modules/channel/channel-core.ts`
- `apps/core-app/src/main/core/channel-core.ts`
- `packages/utils/transport/sdk/renderer-transport.ts`
- `packages/utils/transport/sdk/main-transport.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/renderer/storage/base-storage.ts`
