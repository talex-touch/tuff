# Analytics Data PRD

> 状态：历史 PRD / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/analytics-data-prd.full-2026-05-14.md`

## TL;DR

本文原始版本描述 analytics 数据采集与分析设计。当前遥测/分析口径已收敛到 sanitized telemetry、Nexus Release Evidence、Provider health/usage ledger 与 Quality Baseline 的隐私规则。

## 历史有效结论

- analytics 数据必须结构化、可聚合、可追溯。
- 用户隐私与敏感字段需要默认脱敏。
- 关键产品路径需要 success/error/latency 等指标。

## 当前项目口径

- telemetry 默认开启但可关闭，登录后仅关联稳定用户 ID。
- 不上传搜索明文、文件路径、剪贴板内容、邮箱、密钥、prompt/response。
- Sentry 与 Nexus telemetry 上传前必须 sanitizer。
- Release / performance evidence 以专用 evidence schema 为准。

## 关联入口

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/02-architecture/telemetry-error-reporting-system-prd.md`
- `docs/plan-prd/TODO.md`
