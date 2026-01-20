---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 扫描并迁移 $touchSDK / window 全局访问到 hooks
complexity: medium
planning_method: builtin
created_at: 2026-01-20T18:50:39+0800
---

# Plan: TouchSDK/Window 全局访问迁移

🎯 任务概述
围绕 plugin SDK 与示例代码，扫描 window 上的全局依赖（如 $touchSDK/$channel 等），补齐并统一 hooks 入口，替换裸 window 访问，保持行为一致并提升可维护性。

📋 执行计划
1. 使用 MCP 搜索与 rg 交叉确认 window 全局依赖：$touchSDK/$channel/$plugin/$boxItems/$crash/$config 等，产出清单并标注已迁移/未迁移。
2. 对齐既有 3+ 个 hook 使用范式（如 useChannel/useFeature/useNotificationSdk），确认命名、错误信息与返回类型风格。
3. 为缺失的 window 访问补齐 hooks（例如 useTouchSDK/usePluginInfo/useBoxItems），并在 SDK/示例中替换裸 window.$ 访问，保持 API 行为一致。
4. 如存在初始化时序依赖，加入轻量 guard 或 lazy getter，确保仅在 plugin renderer context 下执行。
5. 同步更新 examples 与 sdk/examples，改用 hooks 访问，避免示例继续使用 window 直取。
6. 运行 pnpm core:dev 做基础验证，重点观察 plugin renderer 与 hooks 注入链路是否报错。

⚠️ 风险与注意事项
- hooks 替换可能改变抛错时机或错误信息，需要保证兼容并更清晰。
- 非 plugin renderer 环境下调用 hooks 会触发错误，需确认现有调用场景。
- 示例修改需注意向后兼容与文档一致性。

📎 参考
- packages/utils/plugin/sdk/hooks/life-cycle.ts:18
- packages/utils/plugin/sdk/channel.ts:31
- packages/utils/plugin/preload.ts:26
- packages/utils/plugin/sdk/feature-sdk.ts:301
- packages/utils/plugin/sdk/index.ts:1

🔍 Window 全局依赖审计（TSDK-010）
- $touchSDK
  - packages/utils/plugin/preload.ts:21（声明/白名单）
  - packages/utils/plugin/sdk/touch-sdk.ts:7（hook）
  - packages/utils/plugin/sdk/index.ts:8（注释）
  - packages/utils/plugin/sdk/examples/storage-onDidChange-example.js:10（示例未迁移）
  - examples/basic-usage.js:7（示例未迁移）
  - examples/message-system-example.js:7（示例未迁移）
  - examples/complete-example.js:6（示例未迁移）
  - examples/complete-communication-example.js:9（示例未迁移）
  - examples/notification-example.js:6（示例未迁移）
  - examples/communicate-example.js:7（示例未迁移）
- $channel
  - packages/utils/plugin/preload.ts:16（声明）
  - packages/utils/plugin/preload.ts:33（预加载内使用）
  - packages/utils/plugin/sdk/channel.ts:13（说明）
  - packages/utils/plugin/sdk/channel.ts:19（hook）
  - packages/utils/plugin/sdk/channel.ts:30（说明）
  - packages/utils/plugin/sdk/channel.ts:81（类型声明）
  - packages/utils/plugin/sdk/system.ts:5（hook）
  - packages/utils/plugin/sdk/clipboard.ts:118（hook）
  - packages/utils/plugin/sdk/temp-files.ts:22（hook）
  - packages/utils/plugin/sdk/division-box.ts:181（注释）
  - examples/index.js:14（示例未迁移）
  - examples/index.js:27（示例未迁移）
- $plugin
  - packages/utils/plugin/preload.ts:10（声明）
  - packages/utils/plugin/preload.ts:28（预加载内使用）
  - packages/utils/plugin/sdk/plugin-info.ts:19（hook）
  - examples/index.js:18（示例未迁移）
  - examples/index.js:28（示例未迁移）
- $boxItems
  - packages/utils/plugin/sdk/box-items.ts:9（hook）
- $crash
  - packages/utils/plugin/preload.ts:17（声明）
  - packages/utils/plugin/preload.ts:32（预加载内使用）
- $config
  - packages/utils/plugin/preload.ts:18（声明）
