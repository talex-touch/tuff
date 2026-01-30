# DeviceIdleService 与后台扫描调度

## 背景
后台扫描（应用补漏、全量对比、索引更新）需要结合用户空闲状态与设备电量，避免打扰用户与耗电。
目前空闲与电量逻辑分散在不同模块中，后续统一抽离为全局服务。

## 技术实现
- **统一状态源**：
  - `powerMonitor.getSystemIdleTime()` 获取系统空闲时长。
  - `powerMonitor.isOnBatteryPower()` 与电量查询（复用现有电量广播逻辑）。
  - 活动跟踪与任务调度（复用 `BackgroundTaskService` 的 idle 模型）。
- **统一决策接口**：
  - 输出 `isIdle / idleMs / batteryLevel / charging` 及 `nextEligibleAt`。
  - 提供任务级 `canRun` 判断（附带原因码）。
- **任务接入**：
  - App 索引补漏与周期全量对比统一使用 DeviceIdleService 的可执行窗口。
  - File Index 等扫描任务也可迁移至统一决策。
- **兜底策略**：
  - 当系统 idle/电量不可用时，降级为固定周期执行（低优先级）。

## 配置建议
后续配置集中到统一的后台任务设置（支持用户自定义）：
- `idleThresholdMs`
- `minBatteryPercent`
- `allowWhenCharging`
- `forceAfterHours`
