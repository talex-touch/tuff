# 遥测与错误上报系统 PRD（Deep Dive）

> 状态：历史参考 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/telemetry-error-reporting-system-prd.deep-dive.full-2026-05-14.md`
> 当前入口：`./telemetry-error-reporting-system-prd.md`、`../TODO.md`、`../docs/PRD-QUALITY-BASELINE.md`

## TL;DR

本文保留早期遥测与错误上报系统完整设想，覆盖 Sentry、Nexus 聚合分析、设备指纹、性能监控、错误分类与隐私合规。当前项目的权威口径已收敛为：sanitized telemetry、Release Evidence、Windows 真机 performance evidence 与 Quality Baseline。

## 历史有效结论

- 错误与性能数据必须结构化，避免只依赖 console 日志。
- 遥测必须隐私优先、可关闭、最小化采集。
- 搜索、插件加载、窗口渲染、SSE/AI runtime 等关键路径需要可观测指标。
- 离线缓存与恢复上传应避免阻塞主流程。

## 当前项目口径

- Telemetry 默认开启但必须脱敏；用户可在设置中关闭。
- 登录后仅关联稳定用户 ID，不上传邮箱、用户名、设备指纹、搜索明文、文件路径、剪贴板内容、密钥、prompt/response。
- Sentry `beforeSend` 必须剔除 request、breadcrumbs、extra、server name、stack frame 路径/上下文/变量等敏感字段。
- Windows release 性能验收以 `search-trace-stats/v1` 与 `clipboard-stress-summary/v1` 真机 evidence 为准。

## 不再作为当前依据的内容

- 早期设备指纹设计。
- 未对齐当前隐私 sanitizer 的采集字段。
- 未对齐 Release Evidence API 的旧上报流程。

## 关联入口

- `docs/plan-prd/02-architecture/telemetry-error-reporting-system-prd.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
