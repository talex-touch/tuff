# Tuff 全仓系统审计报告（2026-02-26）

## 1. 审计范围与方法

- 目标：对 monorepo（`apps/*`、`packages/*`、`plugins/*`）做一次系统性健康检查，定位可复现的 bug 与不合理实现。
- 方法：执行质量门禁命令 + 静态规则扫描（i18n、sync 兼容、存储安全、模块耦合）。
- 本次执行命令：
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm typecheck:all`
  - `pnpm utils:test`
  - 多组 `rg` 静态扫描（`window.$t/$i18n`、`/api/sync`、`value_json`、`localStorage` 等）

## 2. 总体结论

- 当前仓库不满足“可复现质量门禁”目标：`lint`、`typecheck:all`、`utils:test` 均失败。
- 主要风险集中在：
  1) `apps/nexus` 的类型系统回归（大量 TS 错误）；
  2) AI SDK 测试被 Electron/Mica 运行时副作用污染；
  3) 遗留同步实现仍保留明文 `value_json` 逻辑（虽已禁用旧 API，但遗留代码仍在）。

## 3. 关键问题清单（按优先级）

## P0-1：`apps/nexus` 类型检查大面积失败，阻断全仓 typecheck

- 证据：`pnpm typecheck:all` 在 `apps/nexus` 退出码 1，出现多类 TS 错误（空值、事件签名、第三方类型、隐式 any、泛型深度等）。
- 代表性位置：
  - `apps/nexus/app/components/watermark/InvisibleWatermark.vue:53`
  - `apps/nexus/app/pages/device-auth.vue:294`
  - `apps/nexus/app/pages/dashboard/credits.vue:346`
  - `apps/nexus/app/pages/dashboard/credits.vue:666`
  - `apps/nexus/app/components/watermark/VisibleWatermark.vue:3`
  - `apps/nexus/app/composables/useCurrentUserApi.ts:40`
  - `apps/nexus/server/api/auth/[...].ts:380`
  - `apps/nexus/server/api/auth/[...].ts:569`
- 影响：
  - 全仓 `typecheck:all` 不可通过；
  - 相关页面（device-auth/credits/watermark/auth）存在运行时隐患（事件参数误用、空值访问）。
- 建议（最小改动）：
  - 先按错误类型批量修复：`noUncheckedIndexedAccess` 空值收敛、事件回调签名适配、补齐 `qrcode` 声明、去掉隐式 any。
  - 把 `apps/nexus` 设为单独必过门禁，再并回全仓门禁。

## P0-2：AI SDK 测试被主进程副作用污染，导致测试文件无法加载

- 证据：`pnpm utils:test` 失败，`src/aisdk/provider-test.test.ts` 在 collect 阶段报错：
  - `TypeError: Cannot read properties of undefined (reading 'commandLine')`
  - 来源：`talex-mica-electron/main.js:23`
- 触发链路（静态确认）：
  - `packages/test/src/aisdk/provider-test.test.ts:4` 引入 `intelligence-sdk`
  - `apps/core-app/src/main/modules/ai/intelligence-sdk.ts:66` 引入 `./agents`
  - `apps/core-app/src/main/modules/ai/agents/index.ts:7` `export * from './agent-channels'`
  - `apps/core-app/src/main/modules/ai/agents/agent-channels.ts:17` 引入 `genTouchApp`
  - `apps/core-app/src/main/core/touch-window.ts:10` 引入 `talex-mica-electron`，且模块加载即执行初始化（`21-24`）
- 影响：
  - AI 相关测试“0 用例执行”，失去回归保护。
- 建议（KISS）：
  - `intelligence-sdk.ts` 改为仅引入 `agent-manager` 具体文件，不走 `agents/index.ts` barrel；
  - 或把 `agent-channels` 从 barrel 拆出为 runtime-only 导出；
  - 测试侧补一层 `electron/talex-mica-electron` mock 兜底。

## P1-1：根 lint 门禁失败（tuff-native 代码风格错误）

- 证据：`pnpm lint` 失败，4 个可自动修复错误：
  - `packages/tuff-native/index.js:49`
  - `packages/tuff-native/native-loader.js:7`
  - `packages/tuff-native/native-loader.js:9`
  - `packages/tuff-native/native-loader.js:32`
- 影响：
  - 根门禁直接失败，影响 CI 合并效率。
- 建议：
  - 直接在该包执行 `eslint --fix`；
  - 将 `packages/tuff-native` 纳入 pre-commit 必过范围，避免重复回归。

## P1-2：遗留同步存储仍保留明文 `value_json` 路径（且已基本无调用）

- 证据：
  - `apps/nexus/server/utils/syncStore.ts:24-29` 创建 `value_json` 字段
  - `apps/nexus/server/utils/syncStore.ts:57/70/82` 直接 `JSON.parse/stringify`
  - `rg` 未发现 `pullSyncItems/pushSyncItems` 调用；旧路由已 410：
    - `apps/nexus/server/api/sync/push.post.ts:7`
    - `apps/nexus/server/api/sync/pull.get.ts:5`
- 影响：
  - 与仓库既定 Storage Rule（同步载荷需密文）冲突；
  - 死代码保留会误导后续开发继续依赖旧模型。
- 建议：
  - 显式标记 deprecated 并移除调用入口；
  - 迁移期结束后删除 `syncStore.ts` 与相关 schema 兼容逻辑；
  - 保留仅 `v1` 路径与加密载荷实现。

## P1-3：Nexus server auto-import 出现重复符号，构建噪音高

- 证据：`pnpm typecheck:all` 中出现多条 duplicated imports warning：
  - `registerBillingProvider/getBillingProvider/listBillingProviders`
  - `BillingProviderKey/PaymentMethod/CheckoutIntent/BillingProvider`
- 相关文件：
  - `apps/nexus/server/utils/billing/index.ts:1-2`
  - `apps/nexus/server/utils/billing/registry.ts:5-14`
  - `apps/nexus/server/utils/billing/types.ts:1-39`
- 影响：
  - 类型输出噪音大，掩盖真实错误；
  - 增加排障成本。
- 建议：
  - 避免在 auto-import 扫描目录内同时暴露聚合 `index.ts` 与原始模块；
  - 可将聚合导出迁出扫描路径或添加 ignore 规则。

## 4. 风险优先修复建议（72 小时）

1. **先恢复门禁可用性（P0）**
   - 修复 `apps/nexus` 现有 TS 错误到 `typecheck:all` 通过；
   - 修复 AI SDK 测试导入链路，保证 `utils:test` 可跑通。
2. **清理确定性工程债（P1）**
   - 修复 `tuff-native` lint；
   - 收口并下线 `syncStore.ts` 遗留明文路径；
   - 处理 billing duplicated imports。
3. **固化防回归**
   - 在 CI 增加 `pnpm typecheck:all` + `pnpm utils:test` 必过；
   - 增加一个“禁止引入 runtime-only barrel 到纯逻辑模块”的 lint 规则（或 import convention）。

## 5. 本次审计未覆盖项

- 未执行全量构建（`pnpm build` / `pnpm core:build` / `pnpm docs:build`）。
- 未进行线上环境联调与性能压测。
- 未对所有插件做 E2E 功能回归，仅做静态与单测层诊断。
