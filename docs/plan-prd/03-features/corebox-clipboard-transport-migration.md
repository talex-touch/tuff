# CoreBox Clipboard Transport Migration

> 状态：历史迁移记录 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/corebox-clipboard-transport-migration.full-2026-05-14.md`

## TL;DR

本文原始版本记录 CoreBox 剪贴板链路向 typed transport / SDK 迁移的方案。当前 Clipboard 模块已完成多项拆分，release 关注 clipboard stress 真机证据。

## 历史有效结论

- 剪贴板数据流应通过 typed transport / SDK，不新增 raw channel。
- AutoPaste freshness 必须基于主进程捕获事件资格，而不是历史时间戳猜测。
- 图片/文件/HTML 等输入要有类型化 payload 与插件 accepted input types 约束。

## 当前项目口径

- Clipboard 已拆出 capture freshness、history persistence、transport handlers、autopaste automation、image persistence、polling policy、native watcher、meta persistence、stage-B enrichment 与 capture pipeline。
- Windows release 仍需 `clipboard:stress` `120000ms` 与 `clipboard:stress:verify --strict`。
- 新增 clipboard 能力必须遵守 Storage/Security 规则与 typed transport。

## 关联入口

- `docs/clipboard-mechanism-analysis.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
