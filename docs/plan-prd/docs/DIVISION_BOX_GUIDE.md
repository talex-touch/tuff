# DivisionBox 开发者指南（压缩版）

> 状态: 活跃（精简入口）
> 更新时间: 2026-03-16
> 适用范围: 插件开发者、`apps/core-app` DivisionBox 集成
> 替代入口: `docs/plan-prd/03-features/division-box-prd.md`、`docs/plan-prd/TODO.md`
> 深入文档: `DIVISION_BOX_GUIDE.deep-dive-2026-03.md`

## TL;DR

- DivisionBox 已完成核心能力与生命周期事件对外开放，当前重点是联调验收与文档语义补齐。
- 本页仅保留“接入最低要求 + 关键约束 + 排障入口”，完整示例与细节移至 deep-dive。

## 最小接入要求

1. Manifest 声明 `divisionBox` 配置。
2. 通过 SDK 调用 `plugin.divisionBox.open(...)` 打开会话。
3. 监听状态变化与 header action，确保会话内交互可回收。

## 关键约束

- 新代码不得绕过 typed transport 直接走 legacy channel。
- 与 Flow 联动时需满足权限中心校验（`actor/scope/sdkapi` 一致）。
- 发生异常时应输出可诊断错误，不允许 silent failure。

## 当前未闭环

- 生命周期语义文档继续补齐（prepare/attach/detach 边界）。
- 与 FlowTransfer 联调回归需持续产出可复现证据。

## 追溯

- 完整接入示例、最佳实践、排障清单：`DIVISION_BOX_GUIDE.deep-dive-2026-03.md`
