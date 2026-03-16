# DivisionBox API 文档（压缩版）

> 状态: 活跃（入口文档）
> 更新时间: 2026-03-16
> 适用范围: `apps/core-app` DivisionBox 主进程与插件 SDK
> 替代入口: `docs/plan-prd/03-features/division-box-prd.md`、`docs/plan-prd/TODO.md`
> 深入文档: `DIVISION_BOX_API.deep-dive-2026-03.md`

## TL;DR

- DivisionBox 已具备会话管理、生命周期广播、插件接入的核心 API。
- 当前阶段不再扩展大规模新接口，优先做语义对齐与回归稳定。
- 本页只保留“最小使用面 + 边界约束 + 验收入口”，完整 API 细节下沉到 deep-dive。

## 最小使用面

1. 主进程：通过 `DivisionBoxManager` 创建/查询/销毁会话。
2. 会话侧：围绕 `prepare/attach/active/inactive/detach/destroy` 生命周期管理资源。
3. 插件侧：通过 SDK 打开视图、监听状态变更、处理 header action。

## 关键约束

- 跨层调用必须走 typed transport，禁止新增 raw event 直连。
- Flow 联动必须通过权限中心校验，不允许绕过 actor/scope/sdkapi 约束。
- 异常必须返回可诊断错误并可观测，禁止 silent failure。

## 验收入口

- 功能：会话创建/复用/销毁链路稳定。
- 安全：权限拒绝、非法来源、失焦隐藏等边界场景有明确行为。
- 文档：与 `division-box-prd`、`TODO` 状态一致。

## 追溯

- 完整 API 列表与示例代码：`DIVISION_BOX_API.deep-dive-2026-03.md`
