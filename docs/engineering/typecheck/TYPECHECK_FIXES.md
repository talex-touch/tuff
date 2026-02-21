# TYPECHECK 修复记录

## Summary
- 基线（2026-02-21）：简单 315 / 中等 137 / 困难 18（去重 470）。
- 本次完成：简单问题清零；中等问题清理至仅剩 2 条（auth 配置内 TS2345）。
- 当前剩余（2026-02-21）：中等 2 / 困难 11（去重 13）。
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
| 2026-02-21 | `apps/nexus/app/components/content/demos/SplitterSplitterDemo.vue` | TS2551 | ratio 改为 ref 并统一访问，修复属性不存在。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/TransitionTransitionListDemo.vue` | TS2532 | list last 判空，避免 undefined 访问。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/demos/TreeSelectTreeSelectDemo.vue` | TS2551/TS2345 | 重写 demo 状态/类型定义，统一 value/multiple 约束。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/content/DocApiTable.vue` | TS2532/TS2339 | 增加 typeInfo 安全 getter，模板改为受控访问。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/DocsOutline.vue` | TS2532/TS18048 | gaps 合并逻辑判空，避免数组末项 undefined。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/composables/useGlobalSearch.ts` | TS2677/TS18047/TS2345 | map/filter 明确类型守卫并移除 null。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/search/GlobalSearch.vue` | TS2322 | 引入 CommandPaletteItem 类型并收窄 onSelect。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/components/landing/StarField.vue` | TS2322 | 颜色池索引增加默认值，避免 undefined。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/data/search/featureIndex.ts` | TS2322/TS2677 | map/filter 显式类型守卫，排除 null。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/dashboard/admin/reviews.vue` | TS2322 | 按钮 type 调整为受支持值。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/dashboard/admin/credits.vue` | TS2322 | click handler 包装为无参函数。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/dashboard/admin/intelligence.vue` | TS2322 | click handler 包装为无参函数。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/dashboard/team.vue` | TS2322 | click handler 包装为无参函数。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/dashboard/admin/subscriptions.vue` | TS2345 | toast 提示改为明确字符串，避免 null。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/dashboard/api-keys.vue` | TS2322 | 过期选项改为 TxSelectValue 并处理 never。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/dashboard/storage.vue` | TS2322 | 按钮 size 统一为 mini。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/dashboard/updates.vue` | TS2322 | DELETE 方法显式断言以通过类型校验。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/docs/[...slug].vue` | TS2322/TS18048 | 明确 analytics 选项类型并 guard 末节点。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/market.vue` | TS2339 | 抽出 handleSignIn，避免模板直接调用 navigateTo。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/app/pages/verify-waiting.vue` | TS2769 | i18n 参数顺序调整，匹配签名。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/api/admin/intelligence/chat.ts` | TS2322 | history 构建改为 push + splice，保证类型一致。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/api/admin/users/[id]/status.patch.ts` | TS2345 | status 归一化并断言为允许值。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/api/dashboard/intelligence/audits.get.ts` | TS18048 | pageRaw 判空后再计算页码。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/api/dashboard/intelligence/ip-bans.get.ts` | TS2345 | limitRaw 判空并设默认。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/api/dashboard/intelligence/overview.get.ts` | TS2345 | limitRaw 判空并设默认。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/api/dashboard/intelligence/usage.get.ts` | TS2345 | limitRaw 判空并设默认。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/api/docs/assistant.post.ts` | TS2322/TS2304/TS2345 | toolChoice 返回类型化，补 mergeUsage 与 endpoint 判空。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/api/passkeys/verify.post.ts` | TS2345 | resolvedUserId 判空并收窄为 string。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/api/updates/[id]/payload.get.ts` | TS2345 | Content-Length 使用 number 以匹配类型。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/utils/dashboardStore.ts` | TS2322/TS2345 | UpdateInput 正常化类型并允许 payloadVersion 为 null。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/utils/intelligenceModels.ts` | TS2322 | fallback URL 保证返回 string。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/utils/intelligenceStore.ts` | TS2532 | keyLength 与 byte 读取加默认值。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `apps/nexus/server/utils/webauthn.ts` | TS18048/TS2532 | DER 长度读取判空，避免越界访问。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `packages/tuffex/packages/components/src/flat-radio/src/TxFlatRadio.vue` | TS2345/TS2322 | 键盘导航 fallback 判空，避免 undefined。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `packages/tuffex/packages/components/src/flat-select/src/TxFlatSelect.vue` | TS18048 | next 项判空后再读取 label。 | `pnpm -C "apps/nexus" run typecheck` | done |
| 2026-02-21 | `packages/tuffex/packages/components/src/scroll/src/runtime-capabilities.ts` | TS2345 | 解析版本号时 guard 空 segment。 | `pnpm -C "apps/nexus" run typecheck` | done |

## Remaining（中等/困难）
- 中等 2：
  - `apps/nexus/server/api/auth/[...].ts`（TS2345 ×2）：GitHub/Email provider 类型与 AuthOptions 不匹配，需调整 provider 类型或升级/对齐 auth 类型定义。
- 困难 11：
  - `apps/nexus/server/api/auth/[...].ts`（TS2352/TS2561/TS2353）：Request headers、OAuth 配置字段与 AuthOptions 类型不兼容。
  - `apps/nexus/server/api/docs/feedback.get.ts`（TS2304）：缺失 D1Database 声明。
  - `apps/nexus/server/api/docs/feedback.post.ts`（TS2304）：缺失 D1Database 声明。
  - `apps/nexus/server/utils/tuffIntelligenceLabService.ts`（TS2352 ×5）：Error 到 Record 的序列化需要更明确的转换策略。
  - `apps/nexus/server/utils/webauthn.ts`（TS2769）：Crypto.verify 参数 BufferSource 类型不兼容。

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
- `apps/nexus/server/api/auth/[...].ts` (5)
- `apps/nexus/server/utils/tuffIntelligenceLabService.ts` (5)
- `apps/nexus/server/api/docs/feedback.get.ts` (1)
- `apps/nexus/server/api/docs/feedback.post.ts` (1)
- `apps/nexus/server/utils/webauthn.ts` (1)
