# CoreApp Refactor 260111

> 状态：历史实施记录 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/CoreAppRefactor260111.full-2026-05-14.md`

## TL;DR

本文原始版本记录 CoreApp 早期重构计划。当前 CoreApp 治理已收敛到 SDK hard-cut、typed transport、legacy/compat 收口、启动异步化与 Windows release evidence。

## 历史有效结论

- 主进程模块需要清晰生命周期与职责边界。
- renderer/main/plugin 通信应统一 SDK 化。
- 大模块拆分需要保持外部契约与最近路径测试。

## 当前项目口径

- `2.4.10` 聚焦 Windows evidence，不扩大重构范围。
- `2.4.11` 继续关闭 legacy/compat/size 债务。
- SRP/size 治理回到 code review、targeted refactor 与最近路径测试。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md`
