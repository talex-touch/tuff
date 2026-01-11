# 质量分析报告（环境判断/标志位抽离）

## 1. 目标

- 降低环境判断与 env flag 的重复代码
- 统一逻辑与语义，减少 renderer/main/SSR 分支不一致
- 为后续治理与审计提供清晰入口

## 2. 扫描范围

- `apps/core-app/`
- `packages/utils/`
- `packages/tuffex/`
- `apps/nexus/`

## 3. 关键发现

### 3.1 环境判断分散

存在大量 `typeof window/document/navigator` 直接判断，分布在：
- `packages/utils/*`（SDK、preload、analytics 等）
- `apps/core-app/src/renderer/*`（hooks/组件）
- `packages/tuffex/*`（UI 组件）
- `apps/nexus/*`（SSR/客户端混用）

问题：
- 逻辑重复、易遗漏
- SSR/预渲染场景下容易出现细微差异
- 语义不统一（有的判断 window，有的判断 document）

### 3.2 env flag 语义不一致

同时存在：
- `process.env.NODE_ENV / BUILD_TYPE / DEBUG`
- `import.meta.env.DEV / MODE`
- runtime 注入的 `setRuntimeEnv`

问题：
- 同一个“是否开发环境”的判断方式不一致
- renderer 端经常无法使用 process.env
- 维护成本高，容易出现“某处生效、某处失效”的情况

### 3.3 过度日志输出（产品环境噪声）

部分模块在 INFO 级别输出过密，尤其是文件索引/轮询相关日志。
这类日志在正式环境会淹没关键告警。

## 4. 抽离方案（已落地基础能力）

### 4.1 新增统一环境工具

位于：`packages/utils/env/index.ts`

提供：
- `hasWindow/hasDocument/hasNavigator`
- `isBrowserRuntime/isNodeRuntime`
- `isElectronRuntime/isElectronRenderer/isElectronMain`
- `isDevEnv/isProdEnv`
- `getEnv/getEnvOrDefault/getBooleanEnv`

并增强 `setRuntimeEnv`：支持布尔/数字 env 值注入。

### 4.2 已替换的典型位置（示例）

- `packages/utils/analytics/client.ts`
- `packages/utils/preload/renderer.ts`
- `packages/utils/plugin/channel.ts`
- `packages/utils/plugin/sdk/channel.ts`
- `packages/utils/plugin/sdk/intelligence.ts`
- `packages/utils/renderer/hooks/use-channel.ts`
- `packages/utils/common/utils/file.ts`
- `packages/utils/common/file-scan-utils.ts`

## 5. 建议继续迁移的重点区域

### 5.1 Renderer / UI

- `apps/core-app/src/renderer/src/modules/lang/useLanguage.ts`
- `apps/core-app/src/renderer/src/components/base/effect/GlassSurface.vue`
- `packages/tuffex/packages/components/*`

### 5.2 SDK / 插件工具

- `packages/utils/plugin/sdk/flow.ts`
- `packages/utils/plugin/channel.ts`（剩余 window 判断）

### 5.3 SSR / Nexus

- `apps/nexus/app/composables/*`
- `apps/nexus/app/components/*`

## 6. 后续治理建议

1. **统一入口**：新逻辑一律使用 `@talex-touch/utils/env`，禁止新增 `typeof window`。
2. **编码约束**：后续可加 ESLint 规则或 lint 检查拦截重复判断。
3. **文档化**：将 env 与 runtime 判断约定写入工程规范。
4. **灰度切换**：先在 utils + core-app 主链路迁移，保持风险可控。

