---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 日志中的 IPC 卡顿与资源加载失败问题排查与优化方案
complexity: medium
planning_method: builtin
created_at: 2026-01-19T11:10:42+08:00
---

# Plan: IPC 卡顿与资源加载失败排查

🎯 任务概述
围绕启动与使用阶段的性能日志，定位 core-box:query 同步 IPC 卡顿、事件循环 lag、/setting 路由加载慢，以及 tfile 资源请求失败的根因，并给出可落地的优化/修复步骤与验证路径。

📋 执行计划
1. 定位 core-box:query 主进程 handler 与渲染端触发路径，梳理同步执行链路、耗时阶段与可能的阻塞点。
2. 盘点启动期/后台任务（AppProvider、文件扫描、推荐引擎、OCR、插件更新等）与查询链路的耦合度，确认是否在同一事件循环上竞争。
3. 设计 IPC 优化方案：同步改异步/分段返回、结果缓存与节流、重计算移出主线程或拆分为可中断任务。
4. 检查 /setting 路由加载过程（路由守卫、懒加载组件、初始化逻辑），识别同步重任务并提出拆分/延后初始化的改动点。
5. 复核 tfile 协议路径拼接与规范化逻辑，确保绝对路径与编码一致，补充容错与回退策略。
6. 增强性能观测：在关键节点埋点或分段计时，建立对比基线，明确优化前后指标。
7. 规划验证路径：复现慢查询与路由加载，观察 Perf summary 与日志变化；必要时跑最小化的 typecheck/lint。

⚠️ 风险与注意事项
- IPC 同步改异步可能影响调用方预期，需要明确返回协议与兼容策略。
- 过度缓存可能导致结果过期或与实时输入不一致，需要定义失效策略。
- 路由初始化拆分需保证功能完整性，避免引入状态不一致。
- tfile 处理涉及平台差异，修复需覆盖 macOS/Windows/Linux 的路径格式。

📎 参考
- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts`
- `apps/core-app/src/main/modules/box-tool/core-box.ts`
- `apps/core-app/src/main/core/channel-core.ts`
- `packages/utils/transport/sdk/renderer-transport.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
