# 质量扫描报告（Lint / Typecheck）

## 1. 扫描信息

- 扫描时间：2026-02-26T14:34:54.700Z
- 仓库路径：`/Users/talexdreamsoul/Workspace/Projects/talex-touch`
- Node.js：`v24.9.0`
- pnpm：`10.24.0`
- 扫描策略：`--no-bail`，尽可能收集全量错误，不因首个失败中断。

## 2. 执行命令与结果

| 检查项 | 命令 | 退出码 | 耗时 | 结论 |
| --- | --- | ---: | ---: | --- |
| ESLint 全量扫描 | `pnpm -r --no-bail --filter "./apps/*" --filter "./packages/*" --filter "./plugins/*" exec eslint --cache --no-warn-ignored "**/*.{js,jsx,ts,tsx,vue,mjs,cjs,cts,mts}"` | 1 | 205s | 失败（存在 error） |
| Intelligence 标记检查 | `pnpm intelligence:check` | 0 | 1s | 通过 |
| Typecheck 全量扫描 | `pnpm -r --if-present --no-bail run typecheck` | 1 | 127s | 失败（apps/nexus 存在 TS error） |

## 3. 总览

- Lint：共 **116** 条问题（error **5**，warning **111**）。
- Lint 失败 workspace：`packages/tuff-native`、`apps/nexus`。
- Typecheck：共 **36** 条 TS error，全部位于 `apps/nexus`。
- Typecheck 其余 workspace：`apps/core-app`、`plugins/touch-translation` 执行通过。
- apps/nexus typecheck 额外警告：8 条（Sentry sourcemap + duplicated imports）。

## 4. Lint 明细

### 4.1 阻断错误（error）

| 文件 | 位置 | 规则 | 信息 |
| --- | --- | --- | --- |
| `packages/tuff-native/index.js` | 49:45 | `style/comma-dangle` | Missing trailing comma |
| `packages/tuff-native/native-loader.js` | 7:43 | `style/arrow-parens` | Unexpected parentheses around single function argument having a body with no curly braces |
| `packages/tuff-native/native-loader.js` | 9:118 | `style/comma-dangle` | Missing trailing comma |
| `packages/tuff-native/native-loader.js` | 32:47 | `style/arrow-parens` | Unexpected parentheses around single function argument having a body with no curly braces |
| `apps/nexus/server/utils/__tests__/intelligence-agent-graph-runner.test.ts` | 114:1 | `import/first` | Import in body of module; reorder to top |

### 4.2 Warning 分布（Top）

**按规则**

| 规则 | 数量 |
| --- | ---: |
| warning / `prettier/prettier` | 79 |
| warning / `@typescript-eslint/no-explicit-any` | 32 |
| error / `style/comma-dangle` | 2 |
| error / `style/arrow-parens` | 2 |
| error / `import/first` | 1 |

**按文件（Top 10）**

| 文件 | error | warning | total |
| --- | ---: | ---: | ---: |
| `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceChannelsPage.vue` | 0 | 31 | 31 |
| `apps/core-app/src/main/modules/ai/intelligence-agent-graph-runner.ts` | 0 | 21 | 21 |
| `apps/core-app/src/main/modules/ai/intelligence-config.ts` | 0 | 13 | 13 |
| `apps/core-app/src/main/modules/ai/intelligence-module.ts` | 0 | 13 | 13 |
| `apps/core-app/src/main/modules/ai/tuff-intelligence-runtime.ts` | 0 | 8 | 8 |
| `apps/core-app/src/main/modules/ocr/ocr-service.test.ts` | 0 | 5 | 5 |
| `packages/tuff-native/native-loader.js` | 3 | 0 | 3 |
| `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts` | 0 | 3 | 3 |
| `apps/core-app/src/main/modules/plugin/widget/widget-manager.ts` | 0 | 3 | 3 |
| `apps/core-app/src/main/modules/ai/intelligence-sdk.ts` | 0 | 2 | 2 |

## 5. Typecheck 明细（apps/nexus）

### 5.1 按错误码统计

| TS 错误码 | 数量 |
| --- | ---: |
| `TS2322` | 10 |
| `TS18048` | 9 |
| `TS2339` | 3 |
| `TS2345` | 3 |
| `TS2769` | 2 |
| `TS7006` | 2 |
| `TS7031` | 2 |
| `TS7016` | 1 |
| `TS2589` | 1 |
| `TS2344` | 1 |
| `TS2349` | 1 |
| `TS2739` | 1 |

### 5.2 按文件统计

| 文件 | 数量 |
| --- | ---: |
| `server/utils/watermarkDecode.ts` | 7 |
| `server/api/auth/[...].ts` | 5 |
| `app/components/watermark/InvisibleWatermark.vue` | 4 |
| `app/composables/useWatermarkDecode.ts` | 3 |
| `app/pages/dashboard/credits.vue` | 3 |
| `app/plugins/watermark-risk.client.ts` | 3 |
| `app/utils/watermark.ts` | 3 |
| `server/utils/watermarkQr.ts` | 3 |
| `app/pages/dashboard/watermark.vue` | 2 |
| `app/components/watermark/VisibleWatermark.vue` | 1 |
| `app/composables/useCurrentUserApi.ts` | 1 |
| `app/pages/device-auth.vue` | 1 |

### 5.3 全量错误列表

- `app/components/watermark/InvisibleWatermark.vue`
  - 53:34 TS18048 - 'layerStyle' is possibly 'undefined'.
  - 54:26 TS18048 - 'layerStyle' is possibly 'undefined'.
  - 54:52 TS18048 - 'layerStyle' is possibly 'undefined'.
  - 79:7 TS2322 - Type 'number | undefined' is not assignable to type 'number'.
- `app/components/watermark/VisibleWatermark.vue`
  - 3:20 TS7016 - Could not find a declaration file for module 'qrcode'. '/Users/talexdreamsoul/Workspace/Projects/talex-touch/node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/index.js' implicitly has an 'any' type.
- `app/composables/useCurrentUserApi.ts`
  - 40:11 TS2589 - Type instantiation is excessively deep and possibly infinite.
- `app/composables/useWatermarkDecode.ts`
  - 21:38 TS18048 - 'r' is possibly 'undefined'.
  - 21:50 TS18048 - 'g' is possibly 'undefined'.
  - 21:62 TS18048 - 'b' is possibly 'undefined'.
- `app/pages/dashboard/credits.vue`
  - 346:50 TS2769 - No overload matches this call.
  - 373:58 TS2769 - No overload matches this call.
  - 666:59 TS2322 - Type '(opts?: AsyncDataExecuteOptions | undefined) => Promise<void>' is not assignable to type '(event: MouseEvent) => any'.
- `app/pages/dashboard/watermark.vue`
  - 196:34 TS2339 - Property 'sessionId' does not exist on type '{ userId: string | null; deviceId: string; trackedAt: number; lastSeenAt: number; }'.
  - 204:34 TS2339 - Property 'shotId' does not exist on type '{ userId: string | null; deviceId: string; trackedAt: number; lastSeenAt: number; }'.
- `app/pages/device-auth.vue`
  - 294:74 TS2339 - Property 'navigateTo' does not exist on type '{ state: "error" | "cancelled" | "loading" | "approved" | "ready" | "expired"; t: ComposerTranslation<{ en: LocaleMessage<VueMessageType>; zh: LocaleMessage<VueMessageType>; }, ... 4 more ..., string>; ... 29 more ...; FNotification: Install<...>; }'.
- `app/plugins/watermark-risk.client.ts`
  - 10:52 TS2344 - Type '{}' does not satisfy the constraint '(...args: any) => any'.
  - 17:20 TS2349 - This expression is not callable.
  - 32:3 TS2739 - Type '{}' is missing the following properties from type '$Fetch<unknown, NitroFetchRequest>': raw, create
- `app/utils/watermark.ts`
  - 70:7 TS2322 - Type 'number | undefined' is not assignable to type 'number'.
  - 71:7 TS2322 - Type 'number | undefined' is not assignable to type 'number'.
  - 72:7 TS2322 - Type 'number | undefined' is not assignable to type 'number'.
- `server/api/auth/[...].ts`
  - 380:23 TS7006 - Parameter 'credentials' implicitly has an 'any' type.
  - 380:36 TS7006 - Parameter 'req' implicitly has an 'any' type.
  - 516:15 TS2322 - Type '(context: OAuthTokenRequestContext) => Promise<{ tokens: Record<string, unknown>; }>' is not assignable to type 'EndpointRequest<{ params: CallbackParamsType; checks: OAuthChecks; }, { tokens: TokenSetParameters; }, UrlParams>'.
  - 569:41 TS7031 - Binding element 'identifier' implicitly has an 'any' type.
  - 569:53 TS7031 - Binding element 'url' implicitly has an 'any' type.
- `server/utils/watermarkDecode.ts`
  - 77:7 TS2322 - Type 'number | undefined' is not assignable to type 'number'.
  - 127:35 TS2345 - Argument of type 'number | undefined' is not assignable to parameter of type 'number'.
  - 131:22 TS18048 - 'patternValue' is possibly 'undefined'.
  - 133:21 TS18048 - 'patternValue' is possibly 'undefined'.
  - 133:36 TS18048 - 'patternValue' is possibly 'undefined'.
  - 159:38 TS2345 - Argument of type 'WatermarkBandConfig | undefined' is not assignable to parameter of type 'WatermarkBandConfig'.
  - 181:43 TS2345 - Argument of type 'number | undefined' is not assignable to parameter of type 'number'.
- `server/utils/watermarkQr.ts`
  - 8:5 TS2322 - Type 'number | undefined' is not assignable to type 'number'.
  - 9:5 TS2322 - Type 'number | undefined' is not assignable to type 'number'.
  - 10:5 TS2322 - Type 'number | undefined' is not assignable to type 'number'.

## 6. 原始日志

- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/tmp/quality-scan/lint-full.log`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/tmp/quality-scan/typecheck-all-nobail.log`
- `/Users/talexdreamsoul/Workspace/Projects/talex-touch/tmp/quality-scan/intelligence-check.log`

## 7. 备注

- 当前环境 Node.js 为 `v24.9.0`；仓库文档建议 Node.js `22.16.0+`（Volta）。如需与 CI 严格一致，建议切换到项目锁定版本后复扫。