# ModuleManager 生命周期隔离 + Nexus 启动指标上报 变更记录

## 目标
- ModuleManager 生命周期 created/init/start/stop/destroy 统一隔离，失败可回滚，避免污染全局状态
- 生命周期与启动指标上报 Nexus（成功/失败 + 耗时）
- 启动指标新增平均启动时间与模块平均启动耗时汇总（基于历史记录）

## 变更范围
- `apps/core-app/src/main/core/module-manager.ts`
- `apps/core-app/src/main/modules/analytics/startup-analytics.ts`
- `apps/core-app/src/main/modules/analytics/README.md`
- `apps/core-app/src/main/core/module-manager.test.ts`
- `apps/core-app/src/main/modules/analytics/startup-analytics.test.ts`
- `apps/core-app/package.json`

## 关键实现
- ModuleManager：
  - 新增 `runLifecyclePhase` / `rollbackLifecycle` / `queueModuleLifecycleTelemetry`。
  - created/init/start 失败即回滚（stop/destroy），失败不会写入 `modules`。
  - stop/destroy 分离 try/catch，destroy 失败也确保移除模块。
  - 结构化日志包含 moduleKey/moduleName/phase/duration/status/reason/rollback。
- Telemetry：
  - success → `performance`，failed → `error`。
  - metadata: `kind=module-lifecycle`, `phase`, `moduleKey`, `moduleName`, `durationMs`, `status`, `reason`, `rollback`, `errorMessage`。
- StartupAnalytics：
  - 新增 `computeStartupAverages`，计算 `startupSummary` 与 `moduleSummary`。
  - 上报 payload metadata 注入 `startupSummary`/`moduleSummary`（取 `config.maxHistory` 内历史 + 本次）。

## Nexus 上报字段
- `metadata.startupSummary`：
  - `samples`
  - `avgTotalStartupTime`
  - `avgModulesLoadTime`
  - `avgRendererReadyTime`
- `metadata.moduleSummary`：
  - 按 module name 聚合 `avgLoadTime` 与 `count`

## 结构化日志样例
成功（debug）：
```json
{
  "level": "debug",
  "message": "Module lifecycle ok",
  "meta": {
    "module": "PluginModule",
    "moduleKey": "plugin",
    "phase": "start",
    "durationMs": 18,
    "status": "success",
    "reason": "load"
  }
}
```

失败（error）：
```json
{
  "level": "error",
  "message": "Module lifecycle failed",
  "meta": {
    "module": "DatabaseModule",
    "moduleKey": "database",
    "phase": "init",
    "durationMs": 42,
    "status": "failed",
    "reason": "load",
    "error": "Init failed",
    "rollbackStop": true,
    "rollbackDestroy": true
  }
}
```

## Nexus payload 示例
模块生命周期（成功）：
```json
{
  "eventType": "performance",
  "metadata": {
    "kind": "module-lifecycle",
    "phase": "start",
    "moduleKey": "plugin",
    "moduleName": "PluginModule",
    "durationMs": 18,
    "status": "success",
    "reason": "load",
    "rollback": null
  }
}
```

模块生命周期（失败）：
```json
{
  "eventType": "error",
  "metadata": {
    "kind": "module-lifecycle",
    "phase": "init",
    "moduleKey": "database",
    "moduleName": "DatabaseModule",
    "durationMs": 42,
    "status": "failed",
    "reason": "load",
    "rollback": { "stopAttempted": true, "destroyAttempted": true },
    "errorMessage": "Init failed"
  }
}
```

## 字段含义对照
- `kind`: 固定为 `module-lifecycle`
- `phase`: 生命周期阶段（created/init/start/stop/destroy）
- `moduleKey`: 模块 key（symbol 的描述或字符串）
- `moduleName`: 模块类名/显示名
- `durationMs`: 阶段耗时（ms）
- `status`: `success` / `failed`
- `reason`: 触发原因（如 load/unload/error）
- `rollback`: 回滚信息（`stopAttempted`/`destroyAttempted`）
- `errorMessage`: 失败原因摘要

## 回滚策略说明
- created/init/start 任一阶段失败即触发回滚。
- 若 start 已调用 → 尝试 stop（失败不阻塞 destroy）。
- 若 created 或 init 已调用 → 尝试 destroy。
- 回滚阶段同样上报 telemetry 与结构化日志，失败不阻塞全局流程。

启动指标（包含均值汇总）：
```json
{
  "eventType": "performance",
  "metadata": {
    "startupSummary": {
      "samples": 10,
      "avgTotalStartupTime": 1820,
      "avgModulesLoadTime": 640,
      "avgRendererReadyTime": 410
    },
    "moduleSummary": {
      "DatabaseModule": { "avgLoadTime": 120, "count": 10 },
      "PluginModule": { "avgLoadTime": 80, "count": 10 }
    }
  }
}
```

## 测试
- 运行：
  - `pnpm -C "apps/core-app" run test -- src/main/core/module-manager.test.ts src/main/modules/analytics/startup-analytics.test.ts`
- 结果：
  - 目标用例通过
  - 其他历史问题仍在（如 download migration manager 与 tuffex 组件测试），未在本次处理

## 备注
- 未修改对外 API，仅新增 Nexus metadata 字段。
