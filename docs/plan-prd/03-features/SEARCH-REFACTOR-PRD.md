# 搜索系统重构 PRD

> 状态：Historical / 当前执行索引
> 更新时间：2026-05-14
> 完整快照：`./archive/SEARCH-REFACTOR-PRD.full-2026-05-14.md`

## TL;DR

本文原始版本记录搜索系统重构方案。当前搜索主线已收敛为“平台原生快速层 + 自建索引增强层”，并以 Windows App 索引真机 evidence、search trace `200` 样本和 clipboard stress 作为 release gate。

## 当前搜索架构口径

- Windows：Everything 负责首帧快速文件候选；AppProvider 负责应用索引与启动。
- macOS：Spotlight/mdfind fast provider + 自建索引增强。
- Linux：locate/Tracker/Baloo best-effort + 自建索引增强。
- 自建 FileProvider 负责 FTS、内容解析、语义和后台修正。
- 搜索 payload 禁止内联 base64 图标/缩略图，大资源通过 `tfile://`/路径懒加载。

## 当前验收重点

- Windows acceptance collection plan。
- Everything target probe。
- App Index diagnostic。
- common app launch / copied app path / UWP / Steam。
- search trace `200` 样本：first.result/session.end P95 与 slowRatio 达标。
- clipboard stress `120000ms`。

## 不再作为当前依据的内容

- 未对齐当前 Windows acceptance manifest 的旧阶段计划。
- 未对齐 appIndex typed domain / settings SDK 的旧设计。
- 未对齐 startup/background provider ready 策略的旧实现描述。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/everything-integration.md`
- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md`
