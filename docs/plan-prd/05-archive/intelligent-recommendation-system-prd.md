# 智能推荐系统 PRD

> 状态：Archived / 历史 PRD
> 更新时间：2026-05-14
> 完整快照：`./full/intelligent-recommendation-system-prd.full-2026-05-14.md`

## TL;DR

本文是早期智能推荐系统 PRD。当前推荐相关验收聚焦 CoreBox 分时推荐真机 evidence、recommendation source 可复核与搜索排序稳定性。

## 历史有效结论

- 推荐需要结合 pinned、frequent、recent、time-based、context 等信号。
- 推荐结果必须可解释，UI/验收要能识别 source。
- 缓存需要按 context key 隔离，避免跨时段复用错误结果。

## 当前项目口径

- Windows acceptance 要求 time-aware recommendation 手工证据。
- 证据必须包含早/午 timeSlot/dayOfWeek、top item/provider source/recommendation source、frequent comparison 与 trace 摘录。
- 推荐和搜索性能仍需 search trace 真机样本。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
