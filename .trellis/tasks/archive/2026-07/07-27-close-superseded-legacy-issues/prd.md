# 收口历史需求 #43 #46 #54

## Goal

用当前仓库可复核的现代等价实现更新并关闭 2023 年遗留需求，避免旧描述继续充当未定义的产品 backlog。

## Confirmed Facts

- #43 要求资源与代码加载期间显示启动动画；`apps/core-app/src/preload/index.ts` 已实现品牌动画、progress/indeterminate 模式、启动消息、ready/completing/hidden 状态与淡出，`renderer/src/main.ts` 上报 localization 等 boot steps。
- #46 要求多语言、GitHub/外部语言文件；当前 CoreApp/Nexus 使用 i18n，`packages/utils/i18n` 与插件 SDK 已支持规范 locale、localized metadata 与 lexicon；签名云端 Catalog 已由 `docs/plan-prd/03-features/i18n-lexicon-catalog-2.6.0-prd.md` 的现代安全路线承接。
- #54 要求聚合开发文档；Nexus 已通过 Nuxt Content 提供双语 developer docs、导航、搜索、prerender 与 docs APIs，入口与验证命令记录在 `apps/nexus/README.md`。
- 用户决定采用“证据关闭”，不把旧 Issue 重写为新增强需求。

## Requirements

- 分别在 #43/#46/#54 留下当前实现、关键路径、验证方式和后续专项链接。
- 对 #46 明确说明不直接加载任意外部语言文件；云端扩展走签名 Catalog，避免把“已替代”误写成原方案逐字完成。
- 评论成功后关闭三个 Issue；不修改业务代码，不扩大现有 i18n/Catalog 或 docs 范围。

## Acceptance Criteria

- [x] #43 评论引用 preload loading state machine 与 renderer boot progress，并关闭。
- [x] #46 评论引用 locale/localized/plugin SDK 现状和 2.6.0 Catalog 路线，并以 superseded/implemented 语义关闭。
- [x] #54 评论引用 Nexus 双语开发者文档、导航/搜索/API 与 README 验证入口，并关闭。
- [x] 最终 `gh issue view 43/46/54` 均显示 `CLOSED`，评论不声称未验证能力已完成。

## Verification Evidence

- `packages/utils`: 3 focused test files, 23 tests passed（locale/localized/plugin SDK/Catalog）。
- `apps/nexus`: 3 focused docs test files, 16 tests passed（prerender routes、SEO、docs path）。
- `apps/core-app`: preload 与 renderer boot 入口 focused ESLint passed。
- GitHub：#43、#46、#54 均于 2026-07-27 关闭；首次 close comment 因 shell quoting 丢失 Markdown 路径，已立即补发完整 correction comment。

## Out Of Scope

- 新增第三种语言、翻译后台、任意本地语言脚本加载或新文档 UI。
