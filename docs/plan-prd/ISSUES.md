# 项目问题与清理候选

> 状态：历史扫描 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/ISSUES.full-2026-05-14.md`

## TL;DR

本文原始版本是一次 i18n 清理候选扫描，范围包括 CoreApp renderer i18n key 与 `packages/utils/i18n/message-keys.ts` 中的 `$i18n` 消息 key。候选列表受动态 key 影响，不可直接作为删除依据。

## 历史扫描概要

- CoreApp renderer i18n keys：总计 1525。
- 已用：1096。
- 文档-only：19。
- 未用候选：410。
- utils `$i18n` 消息 keys：`DevServerKeys`、`FlowTransferKeys` 有使用；`PluginKeys`、`WidgetKeys`、`SystemKeys`、`PermissionKeys` 在当时扫描中为未用分组。
- 未使用文件候选：`apps/core-app/src/renderer/src/locales/*/download-migration.json`。

## 当前处理规则

- 本文只提供历史候选，不得直接据此删除 i18n key。
- 清理 i18n 必须复核动态 key、文档渲染、插件使用、后端 `$i18n:key` 消息与多语言 fallback。
- 发现 `window.$t/window.$i18n` 直用时，应先 warning 并迁移到 `useI18n` / `useLanguage` / `useI18nText`。
- 实际清理需最近路径 typecheck/lint 与 UI smoke。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `packages/utils/i18n/`
- `apps/core-app/src/renderer/src/modules/lang/`
