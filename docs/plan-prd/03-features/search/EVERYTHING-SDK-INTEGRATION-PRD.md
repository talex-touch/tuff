# Everything SDK 集成 PRD（压缩版）

> 状态: 活跃（Windows 专项）
> 更新时间: 2026-03-16
> 适用范围: Windows 文件搜索（Everything `sdk-napi -> cli -> unavailable`）
> 替代入口: `docs/plan-prd/TODO.md`、`docs/plan-prd/01-project/CHANGES.md`
> 深入文档: `EVERYTHING-SDK-INTEGRATION-PRD.deep-dive-2026-03.md`

## TL;DR

- Everything 已完成主链路接入，当前策略是稳定优先：保持回退链路与可观测字段完整。
- 本轮不扩展新能力，优先补齐真机回归证据与错误码分层统计。
- 本页保留执行边界，完整技术方案和代码细节下沉到 deep-dive。

## 当前结论

- 已落地：Provider 回退链路、状态可观测、N-API 查询实现、fallback 单测。
- 待补齐：Windows 真机回归留档、SDK/CLI 性能基线、错误码分层统计。

## 验收口径

- 功能：SDK 不可用时可自动回退 CLI，再降级 unavailable。
- 质量：设置页可见 backend/fallback/error 字段，且不影响主搜索链路。
- 文档：与 `TODO/CHANGES` 中的状态一致。

## 追溯

- 完整设计、实现样例、错误码细节：`EVERYTHING-SDK-INTEGRATION-PRD.deep-dive-2026-03.md`
