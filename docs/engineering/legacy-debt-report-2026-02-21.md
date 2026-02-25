# Talex Touch 深度技术债与兼容性分析报告（P0）

- 优先级：P0
- 日期：2026-02-21
- 范围：`apps/core-app/src`、`packages/*`、`plugins/*`（含部分运行时与 SDK 代码）
- 方法：静态扫描（legacy/compat/deprecated/migration/fallback/TODO/未实现）+ 抽样阅读

> 说明：仅做静态分析，未执行运行时、构建或测试验证。

---

## 1. 迁移/兼容性残留（新旧 API 并存）

### 1.1 Channel API 仍公开且未完全封口

- 旧 Channel API 仍对外导出（明确标注 v3.0.0 才移除）。  
  - `packages/utils/channel/index.ts:1`
- 插件侧 legacy Channel 实现仍保留。  
  - `packages/utils/plugin/channel.ts:73`
- renderer 仍支持 `$channel`/`$touchChannel` 注入通路。  
  - `packages/utils/renderer/hooks/use-channel.ts:33`

### 1.2 旧字段 / 旧配置继续兼容

- `manifestPath` 已 deprecated，但解析逻辑仍保留。  
  - `packages/unplugin-export-plugin/src/types.ts:193`  
  - `packages/unplugin-export-plugin/src/core/exporter.ts:90`
- Cloud Sync 仍支持 `apiBaseUrl`（deprecated）。  
  - `packages/utils/cloud-sync/cloud-sync-sdk.ts:25`
- 模块入口仍兼容 `module.filePath`。  
  - `apps/core-app/src/main/core/module-manager.ts:726`
- Legacy Tray 模块仍存在（deprecated）。  
  - `apps/core-app/src/main/modules/tray-holder.ts:24`

### 1.3 Legacy 事件 / 权限兼容仍在核心路径

- CommonChannel 大量 legacy raw event。  
  - `apps/core-app/src/main/channel/common.ts:120`
- Storage legacy 事件仍被定义并广播。  
  - `apps/core-app/src/main/modules/storage/index.ts:35`
- Analytics 继续挂载 legacy 事件。  
  - `apps/core-app/src/main/modules/analytics/analytics-module.ts:370`
- 权限系统对 legacy SDK 放行。  
  - `apps/core-app/src/main/modules/permission/permission-guard.ts:157`
- 旧 Permission 类型仍对外导出。  
  - `packages/utils/permission/legacy.ts:1`

### 1.4 兼容壳（Hooks / SDK）仍在使用

- Permission hook 兼容壳（deprecated）。  
  - `packages/utils/renderer/hooks/use-permission.ts:17`
- Update hook 兼容壳（deprecated）。  
  - `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts:224`

---

## 2. 新旧混用（Channel vs Transport）

- 插件 SDK 同时支持 transport 与 legacy channel（sendSync 回退）。  
  - `packages/utils/plugin/sdk/channel.ts:74`
- transport stream 失败后回退 channel。  
  - `packages/utils/transport/sdk/renderer-transport.ts:900`
- transport 类型允许显式禁用 Port 回退到 channel。  
  - `packages/utils/transport/types.ts:131`
- Clipboard 模块同时维护 legacy `clipboard:*` 与 transport 事件。  
  - `apps/core-app/src/main/modules/clipboard.ts:48`
- CommonChannel 仍大量 raw event 作为桥接。  
  - `apps/core-app/src/main/channel/common.ts:120`

---

## 3. 兜底 / Fallback 链路（示例）

- transport stream 失败 → channel fallback：  
  - `packages/utils/transport/sdk/renderer-transport.ts:907`
- Search Logger 配置 fallback 旧存储键：  
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-logger.ts:114`
- Search Gatherer 层策略 fallback legacy controller：  
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts:126`
- Nexus Store 同时兼容 legacy manifest / URL：  
  - `apps/core-app/src/renderer/src/modules/store/providers/nexus-store-provider.ts:70`
- Device Attest secure store 失败 → legacy seed fallback：  
  - `apps/core-app/src/renderer/src/modules/auth/device-attest.ts:50`
- Cloud Sync baseUrl 选择链含 deprecated 字段：  
  - `packages/utils/cloud-sync/cloud-sync-sdk.ts:70`
- Plugin SDK sendSync 回退 legacy channel：  
  - `packages/utils/plugin/sdk/channel.ts:75`

---

## 4. TODO / 未实现 / 迁移未闭环

- Extension unload TODO：  
  - `apps/core-app/src/main/modules/extension-loader.ts:33`
- 插件安装风险验证 TODO（TouchID）：  
  - `apps/core-app/src/main/modules/plugin/plugin-installer.ts:19`
- 下载迁移 down 逻辑未实现：  
  - `apps/core-app/src/main/modules/download/migrations.ts:430`
- 历史 TODO 汇总文档仍存在但可能过期：  
  - `codereview/todo-backlog.md`

---

## 5. 大文件/职责混杂（抽离线索）

> 行数来自静态扫描（排除缓存/构建目录），仅作拆分优先级参考。

| 文件 | 约行数 | 现象/风险 |
| --- | --- | --- |
| `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` | 4713 | 索引/查询/平台差异/缓存混杂 |
| `apps/core-app/src/main/modules/plugin/plugin-module.ts` | 3198 | 插件生命周期 + registry + IPC 过重 |
| `packages/utils/transport/events/index.ts` | 2670 | 事件定义过度集中 |
| `apps/core-app/src/main/modules/update/UpdateService.ts` | 2459 | 更新链路大而杂 |
| `apps/core-app/src/main/modules/clipboard.ts` | 2371 | IPC + DB + 监控 + OCR 混合 |
| `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` | 2190 | provider + IO + 多平台逻辑混合 |
| `apps/core-app/src/main/modules/plugin/plugin.ts` | 2112 | SDK/注册/事件等责任跨度大 |
| `apps/core-app/src/main/modules/box-tool/core-box/window.ts` | 1997 | UI 生命周期/窗口管理集中 |
| `apps/core-app/src/renderer/src/views/base/LingPan.vue` | 1930 | 单文件 UI 过大 |
| `apps/core-app/src/main/modules/ai/intelligence-sdk.ts` | 1879 | 多域能力聚合 |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | 1862 | 搜索引擎逻辑过于集中 |
| `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts` | 1823 | 推荐逻辑单文件过大 |
| `apps/core-app/src/main/channel/common.ts` | 1757 | IPC/系统能力/存储/文件等多域混杂 |

---

## 6. 建议（最小化改造，避免大重构）

1. **明确兼容边界**  
   将 legacy raw event / channel fallback 统一集中在 `legacy/adapter` 层，新模块仅允许使用 transport typed event。

2. **制定 deprecation 里程碑**  
   为 `packages/utils/channel`、`$channel`、`legacy events` 标记移除窗口与版本号，并加 usage 统计与告警。

3. **兜底策略统一化**  
   统一 fallback 的 telemetry 记录与开关，避免 silent fallback 长期存在。

4. **优先拆分大文件**  
   先从 `file-provider.ts`、`clipboard.ts`、`common.ts` 拆为“IO / IPC / Domain service”三层，降低耦合。

