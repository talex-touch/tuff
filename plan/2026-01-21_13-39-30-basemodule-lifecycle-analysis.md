---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 分析 SearchLogger 未走 BaseModule 生命周期导致 StorageModule 未就绪的问题并给出修复方案
complexity: medium
planning_method: builtin
created_at: 2026-01-21T13:39:41+08:00
---

# Plan: SearchLogger 生命周期分析

🎯 任务概述
当前启动日志显示 SearchLogger 在 StorageModule 初始化前访问配置，导致 “StorageModule not ready: filePath not set”。
目标是定位触发链路、明确未走 BaseModule 生命周期的原因，并制定可落地的修复方案与验证步骤。

📋 执行计划
1. 追踪错误链路：从 SearchLogger 构造函数到 subscribeMainConfig/useMainStorage 的调用关系，确认触发时机与异常点。
2. 复盘模块加载与导入顺序：检查 `apps/core-app/src/main/index.ts` 的模块清单与 import 时副作用，确认 SearchLogger 在 StorageModule init 前被实例化的路径。
3. 对照 3+ 处正确模式：检视 `sentry-service.ts`、`device-idle-service.ts` 等使用 subscribeMainConfig 的位置，归纳“在模块 onInit/after storage ready 再订阅”的模式。
4. 制定修复方案选型：评估将 SearchLogger 初始化延后（显式 init）、改为模块生命周期托管、或惰性订阅并重试的方案，兼顾 API 影响与清理逻辑。
5. 设计依赖与清理点：明确 SearchLogger 与 CoreBoxManager/ SearchEngineCore 的依赖边界，确保订阅在模块 destroy 时释放。
6. 验证与回归：补充/调整 `search-logger-test.ts` 或启动验证脚本，确认无启动期报错、订阅正常、关闭时正确清理。

⚠️ 风险与注意事项
- 变更 SearchLogger 的导出形态会影响大量 import，需要谨慎评估 API 兼容性。
- 如果延迟初始化过晚，可能导致搜索日志功能在启动早期无法生效，需要接受或补救。
- 订阅/解绑生命周期处理不当可能引入内存泄漏或重复监听。

📎 参考
- `apps/core-app/src/main/modules/box-tool/search-engine/search-logger.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/storage/index.ts`
