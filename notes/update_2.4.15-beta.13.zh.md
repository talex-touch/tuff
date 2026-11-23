# Tuff v2.4.15-beta.13 更新说明

## 摘要

- 搜索正文索引上限暂停修复（A6）：将搜索索引存储上限暂停独立为 `index-full` 状态，彻底消除磁盘空间充足时的 30 秒重试死循环，并在设置页准确提示索引存储已满而非磁盘空间不足。
- 应用索引未稳定目录重试加固（B1）：抽离应用条目稳定性探针模块，将仍在复制或变更中的 `.app` 目录纳入有界重试阶梯，并进一步收紧 `app-provider.ts` 模块体量棘轮。
- Home AI 与 UIKit 第二阶段收敛：完成 `HomePage.vue` 结构瘦身（降至 781 行，低于 800 行目标）并对齐 `@talex-touch/intelligence-uikit` 生产组件，同时修复 `submit-race` 单元测试冷编译抖动。
- `FileProvider` 模块治理（F1/F3）：抽离纯记录映射与可中止异步辅助函数、清理 4 个无调用公开成员，`file-provider.ts` 体量棘轮收紧至 2,650 代码行。
- Nexus 预览水合与路由预算修复：消除文档、登录与商店页 SSR/CSR 水合失配、收敛路由扇出并修正部署取证脚本统计逻辑，并补齐 3.0 Phase 0 能耗与内存基线探测工具。

## 变更内容

- 搜索正文索引上限与磁盘不足分离（A6）：在 `FileIndexContentStorage['status']` 与 `projectContentStorage` 中新增 `'index-full'` 状态；`FileProviderContentCapacityService` 将 `SEARCH_INDEX_RESERVE_REACHED`、`FILE_INDEX_STORAGE_FULL` 以及磁盘剩余 `>= 3 GiB` 时的裸 `SQLITE_FULL` 识别为索引上限暂停，不再按 30 秒磁盘轮询反复恢复撞满；仅在容量淘汰、压缩、配置清理、索引重建/清空、关闭正文索引清理或索引占用回落至安全余量后复核磁盘空间再恢复；同步更新 `SettingFileIndex.vue` 及中英文文案，清晰区分索引已满与磁盘可用空间不足。
- 应用目录稳定性探针抽离与重试阶梯接入（B1）：将 `_waitForItemStable` 与探针/稳定窗口逻辑抽离至 `app-provider-item-stability.ts`，支持 `AbortSignal` 与结构化状态；`AppProvider.processAppPath` 对 `changing` 及非缺失 `error` 接入按路径去重的有界重试阶梯（`2s/8s/30s` 与有界死信），保持 `missing` 终止态并在关停时释放全部在途等待与定时器，`app-provider.ts` 棘轮由 `3,878` 收紧至 `3,868`。
- Home AI 第二阶段重构与 UIKit 收敛：升级 `TxAiContextMeter`、`TxAiRunStatus` 与 `TxAiMessageRail`，以 `HomeRunDock` 直接复用 `@talex-touch/intelligence-uikit` 并移除重复局部组件；通过多个聚焦组合函数与子组件将 `HomePage.vue` 由 1,943 行逐步精简至 781 行且保持全部生产交互与样式契约不变；隔离测试中的重型渲染与主题存储边界，消除 `HomePage.submit-race.test.ts` 超时抖动。
- `FileProvider` F1/F3 拆分与清理：将纯记录映射抽离至 `file-provider-record-mapper.ts`，将重复的 yield/可中止 sleep 逻辑抽离至 `file-provider-async-utils.ts`，移除 4 个无生产调用方的公开成员，`file-provider.ts` 代码行棘轮由 `2,790` 收紧至 `2,650`。
- Nexus 预览水合、路由预算与 3.0 Phase 0 基线探针：修复 Nexus 文档侧边栏、认证流、商店页与示例包裹器的 SSR/CSR 水合不一致、bfcache/SW 与路由扇出问题，并修正 `collect-deployed-preview-evidence.mjs` 的状态采集逻辑；新增 `coreapp-energy-baseline-probe.mjs`（含隔离 profile 防护与 `powermetrics` 匹配单测）以支撑 3.0 Phase 0 能耗与内存基线采样。
