# 直接预览计算 PRD

> 状态：Archived / 历史 PRD
> 更新时间：2026-05-14
> 完整快照：`./full/direct-preview-calculation-prd.full-2026-05-14.md`

## TL;DR

本文是早期直接预览计算方案，关注搜索/预览链路中的即时计算、结果展示与性能预算。当前搜索与预览验收已转向 Windows App 索引、search trace、CoreBox 性能 evidence 与具体 provider 诊断，因此本文件仅作历史参考。

## 历史有效结论

- 预览计算不能阻塞首帧搜索结果。
- 重计算需要节流、取消和 latest-wins。
- 预览失败应可见但不影响主搜索结果。
- 大资源应通过引用或懒加载，不内联进入搜索 payload。

## 当前项目口径

- CoreBox 搜索性能验收以 `search-trace-stats/v1` 200 样本为准。
- Windows release 关注 App Index、Everything、common app launch 与 clipboard stress evidence。
- 预览/推荐/后处理应作为 enrichment update 或后台任务，不阻塞首帧结果。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/03-features/SEARCH-REFACTOR-PRD.md`
