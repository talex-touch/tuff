# TYPECHECK 修复记录

## Summary
- 基线（2026-02-21）：简单 315 / 中等 137 / 困难 18（去重 470）。
- 本次完成：简单问题清零（简单 0）。
- 当前剩余（2026-02-21）：中等 138 / 困难 18（去重 156）。
- 分类规则：
  - 简单：TS7006 / TS7016 / TS7031 / TS2578 / TS2305 / TS2488 + demo 目录内 TS2339
  - 中等：TS2339（非 demo）、TS2322 / TS2345 / TS2532 / TS18048 / TS18047 / TS2551
  - 困难：TS2352 / TS2677 / TS2769 / TS2561 / TS2353 / TS2304

## Fix Log
| 日期 | 文件 | 错误码 | 修复摘要 | typecheck 命令 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 2026-02-21 | `apps/nexus/app/components/content/demos/AgentsAgentsListDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/AutoSizerAutoSizerHeightDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/AutoSizerAutoSizerHeightForDialogDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/AutoSizerAutoSizerHeightForDropdownDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/AutoSizerAutoSizerTextTransformerDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/AutoSizerAutoSizerWidthInFlexDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/AvatarVariantsAvatarVariantsGalleryDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/CardInertialDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/FusionFusionTwoButtonsDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/FusionFusionTwoChipsDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/FusionFusionTwoIconButtonsDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/FusionFusionTwoOptionsDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/FusionFusionTwoStatusDotsDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/RadioRadioGroupPlaygroundDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/ScrollScrollPullDownPullUpDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/SearchInputSearchInputDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/SearchInputSearchInputRemoteDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/StaggerStaggerDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/TextTransformerAutoSizerTextTransformerDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/TextTransformerStatusTextDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/TextTransformerTextTransformerDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/TransitionTransitionContentDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/TransitionTransitionListDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/TxChatListDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/TxSortableListDemo.vue` | TS2339/TS7006 | 补齐 demo 状态/回调定义与基础类型，消除模板属性不存在与隐式 any。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/DocApiTable.vue` | TS2488/TS7006 | 修正解构空值与 ref 回调类型。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/ui/Tag.vue` | TS7006 | 补齐 click 事件参数类型并抽出 handler。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `packages/utils/types/path-browserify.d.ts` | TS7016 | 提供 path-browserify 声明以消除缺失类型。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `packages/utils/types/index.ts` | TS7016 | 引入 path-browserify 声明引用。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `packages/utils/intelligence/client.ts` | TS7006 | 补齐 transport send 参数类型。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `plugins/touch-translation/src/pages/multi-translate.vue` | TS2305/TS7031 | 调整 SDK 导入路径并补齐回调参数类型。 | `pnpm -C "plugins/touch-translation" run typecheck` | done |
| 2026-02-21 | `plugins/touch-translation/vite.config.ts` | TS2578 | 移除无效的 ts-expect-error。 | `pnpm -C "plugins/touch-translation" run typecheck` | done |

## Remaining（中等/困难）
- 中等 138：主要集中在 `apps/nexus/app/components/DocsOutline.vue`、`apps/nexus/app/composables/useGlobalSearch.ts`、`apps/nexus/app/components/content/DocApiTable.vue` 等。
- 困难 18：主要集中在 `apps/nexus/server/*` 与 `packages/tuffex` 组件类型。

### Core-app typecheck 结果（仅记录）
- `apps/core-app` 当前 `pnpm -C "apps/core-app" run typecheck` 失败，均为 TS2322：
  - `apps/core-app/src/renderer/src/components/base/sonner/SonnerDialogToast.vue`
  - `apps/core-app/src/renderer/src/components/intelligence/config/IntelligencePromptSelector.vue`
  - `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatureDetailCard.vue`
  - `apps/core-app/src/renderer/src/composables/usePermissionStartup.ts`
  - `apps/core-app/src/renderer/src/modules/layout/preset/usePresetExport.ts`
  - `apps/core-app/src/renderer/src/views/base/styles/LayoutAtomEditor.vue`
  - `apps/core-app/src/renderer/src/views/test/MemoryLeakTest.vue`

### Top Files (by remaining errors)
- `apps/nexus/app/components/DocsOutline.vue` (38)
- `apps/nexus/app/composables/useGlobalSearch.ts` (23)
- `apps/nexus/app/components/content/DocApiTable.vue` (14)
- `apps/nexus/server/utils/dashboardStore.ts` (8)
- `apps/nexus/app/pages/docs/[...slug].vue` (5)
- `apps/nexus/server/api/auth/[...].ts` (5)
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts` (5)
- `apps/nexus/server/utils/webauthn.ts` (5)
