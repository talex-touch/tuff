# CoreBox 剪贴板机制与 AutoPaste 梳理

> 状态：历史分析 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/clipboard-mechanism-analysis.full-2026-05-14.md`

## TL;DR

本文原始版本梳理了 CoreBox clipboard ingestion、pin/recommendation interaction 与 AutoPaste 行为，并分析了 pinned item dedupe 不一致、剪贴板转发、推荐上下文和自动粘贴 freshness 等问题。当前实现已经经历多轮拆分与治理，因此本文只保留历史分析入口。

## 历史有效结论

- pinned item 去重必须使用稳定 key，不能假设 rebuild 后的 `TuffItem.id/source.id` 与数据库 `itemId/sourceId` 完全一致。
- 剪贴板监听需要区分文本、图片、文件、HTML，并按插件声明的 accepted input types 转发。
- AutoPaste 不能仅依赖历史 `createdAt/timestamp` 推断新鲜度，应基于主进程捕获事件资格。
- CoreBox 显示时的补扫不应把旧剪贴板误判为 5 秒内新复制。

## 当前项目口径

- Clipboard 模块已拆出 capture freshness、history persistence、transport handlers、autopaste automation、image persistence、polling policy、native watcher、meta persistence、stage-B enrichment 与 capture pipeline。
- AutoPaste freshness 已切到主进程捕获事件资格：`native-watch` / `background-poll` / `visible-poll` 才可授予 `autoPasteEligible`。
- `COREBOX_WINDOW_SHOWN` 补扫统一标记为 `corebox-show-baseline`，不再把旧剪贴板当作新复制自动填入。
- Windows release evidence 仍需 `clipboard:stress` `120000ms` 与 `clipboard:stress:verify --strict`。

## 不再作为当前依据的内容

- 原文中的旧文件行号与旧模块边界。
- 未对齐当前 clipboard split 后文件结构的实现细节。
- 未对齐当前 Windows acceptance 性能 evidence 的验收描述。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/CHANGES.md`
