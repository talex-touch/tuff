# PRD: 通用平台型能力建设 (v1.0)

## 1. 背景与目标

- **能力碎片化**: 目前通用能力分散在 SDK、CoreBox、工具模块中，缺乏统一抽象，开发者难以理解和复用。
- **平台定位升级**: Tuff 需要从“插件集合”进化为“应用平台”，提供一致的安全、配置、存储、洞察能力。
- **生态扩展需求**: 随着流转、多视图、AI 能力上线，需要一个平台级能力层支撑跨插件协作。

## 2. 平台能力全景

- **身份与授权**: 统一的用户身份、组织、权限模型。
- **数据与配置**: 同步的配置中心、密钥管理、持久化存储。
- **交互与 UI**: 通用通知、对话框、引导、快捷入口组件。
- **任务与调度**: 后台任务管理、Cron、事件总线。
- **观测与日志**: 统一日志、指标、追踪、告警体系。
- **安全与合规**: 权限申请、沙箱策略、数据脱敏。

## 3. 功能需求

### 3.1 能力目录与发现

- 提供 `Platform Capability Catalog`，以文档与 API 形式列出所有可用能力。
- SDK 暴露 `platform.capabilities.list()`，返回能力清单与状态。
- 支持按插件、系统、AI 模块归类，并标记稳定度（alpha/beta/stable）。

### 3.2 能力申请与授权

- 插件 manifest 声明所需能力，安装/首次运行时触发授权流程。
- 管理中心提供能力授权管理界面：启用、禁用、审计。
- 对敏感能力（如文件访问、账号信息）需提供细粒度权限描述。

### 3.3 能力接口统一

- 设计 `Capability Provider` 协议，能力由主进程模块实现并通过 IPC 暴露。
- SDK 提供统一调用方式：`platform.invoke<CapabilityId>(method, payload)`。
- 支持能力版本化，插件可声明兼容 range。

### 3.4 能力监控与告警

- 每次能力调用记录日志（调用方、耗时、结果）。
- 提供仪表盘展示使用频次、失败率、权限拒绝情况。
- 支持阈值告警，通知平台管理员处理异常。

### 3.5 开放能力扩展

- 平台开发者可注册自定义能力，通过 manifest 标记为 `provider`。
- 提供沙箱隔离策略、防止恶意能力影响平台稳定性。

## 4. 非功能需求

- **性能**: 能力调用平均延迟 ≤ 20ms；高并发场景需保持稳定。
- **安全**: 所有能力调用必须经过鉴权；敏感数据传输需加密。
- **兼容**: 保证旧版插件仍可使用原有能力接口，通过适配层兼容。

## 5. 技术方案概述

### 5.1 Platform Core Service

- 在主进程实现 `PlatformCoreService`，维护能力注册表(`CapabilityRegistry`)与授权策略。
- 能力定义遵循接口：
  ```ts
  interface CapabilityDefinition {
    id: string
    version: string
    handler: (context: CapabilityContext, payload: any) => Promise<any>
    metadata: {
      description: string
      scope: 'system' | 'plugin' | 'ai'
      sensitive?: boolean
    }
  }
  ```

### 5.2 SDK 层封装

- `plugin.utils.platform.invoke(capabilityId, method, params)` 统一入口。
- 支持 Typescript 提示，根据 `CapabilityDescriptor` 生成类型。
- 能力授权信息缓存于本地，减少重复请求。

### 5.3 管理与可视化

- 在设置中心新增 “平台能力” 页面，展示能力列表、授权状态、调用统计。
- 支持导出审计日志，满足企业审计需求。

## 6. 伪代码示例

```ts
// 注册能力
platformCoreService.register({
  id: 'system.clipboard.read',
  version: '1.0.0',
  handler: async ({ pluginId }, payload) => {
    assertPermission(pluginId, 'clipboard.read')
    return clipboardManager.read(payload.format)
  }
})
```

## 7. 实施计划

1. **[ ] 能力模型设计**: 定义 `CapabilityRegistry` 数据结构与授权策略。
2. **[ ] 核心服务实现**: 搭建 `PlatformCoreService`、IPC 通道、日志体系。
3. **[ ] SDK 封装**: 实现 `platform.invoke`、能力列表查询、类型声明。
4. **[ ] 管理 UI**: 构建能力管理页面、授权审批流程。
5. **[ ] 数据与监控**: 接入日志、指标、告警配置。
6. **[ ] 文档与生态推广**: 发布能力目录、示例插件与最佳实践。

## 8. 风险与待决问题

- **能力膨胀**: 如何防止能力定义过多导致维护困难，需要治理流程。
  - 建议设立能力评审委员会（产品+技术+安全）。
- **第三方能力安全**: 自定义能力可能引入风险，需沙箱/审核机制。
- **版本兼容**: 能力升级变更需考虑旧插件兼容性与迁移策略。

## 9. 验收标准

- 至少 20 个现有能力通过新框架注册并稳定运行。
- 插件可通过新接口完成 3 条典型能力调用（如剪贴板、通知、配置）。
- 管理中心可查看授权状态、修改权限并实时生效。
- 能力调用日志可在 5 分钟内查询到结果。

## 10. 成功指标

- 新能力框架启用后，能力调用失败率下降 ≥ 30%。
- 开发者满意度调查中，对能力发现/调用流程的满意度 ≥ 4.5/5。
- 首季度内新增 ≥ 5 个第三方能力提供方接入。

## 11. 后续迭代方向

- 引入多租户支持，适配企业级场景。
- 支持策略化授权（按组织、时间段、数据范围）。
- 与 Flow Transfer、DivisionBox 等新能力打通，实现一站式平台体验。
