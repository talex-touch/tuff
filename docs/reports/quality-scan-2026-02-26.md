# Quality Scan 2026-02-26

> 状态：历史质量扫描 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/quality-scan-2026-02-26.full-2026-05-14.md`

## TL;DR

本文原始版本记录 2026-02-26 质量扫描结果。当前质量基线、执行清单与 release gate 已迁移到 PRD Quality Baseline 与 TODO。

## 历史有效结论

- 质量扫描需要区分 blocker、warning、长期债务。
- 扫描结果必须能映射到可执行修复清单。
- 文档、typecheck、lint、test、build 需要分别记录证据。

## 当前项目口径

- PR 使用 `pnpm quality:pr`。
- release/milestone 使用 `pnpm quality:release`。
- 当前 `quality:release` 仍受既有 CoreApp lint debt 阻断，需记录替代验证。

## 关联入口

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
