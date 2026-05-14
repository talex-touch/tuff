# Notification SDK Notes

> 状态：历史工程笔记 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/notification-sdk.full-2026-05-14.md`

## TL;DR

本文原始版本记录 notification SDK 相关设计与实现笔记。当前通知能力应遵守 typed SDK、平台 capability、权限与 degraded/unsupported reason 规则。

## 历史有效结论

- 通知能力需要区分平台支持、用户权限、发送结果与失败原因。
- 插件调用通知需要权限声明与审计。
- macOS/Windows/Linux 的系统通知能力不能用同一成功语义伪装。

## 当前项目口径

- 平台能力不可用时返回 explicit unsupported/degraded reason。
- 插件平台命令/通知/窗口等能力应暴露 platform、permission、unsupported reason 与审计字段。
- 新增通知能力必须通过 SDK/typed transport，不新增 raw channel。

## 关联入口

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/TODO.md`
