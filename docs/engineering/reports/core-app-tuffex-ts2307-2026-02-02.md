# Core App @talex-touch/tuffex TS2307 分析（2026-02-02）

## 现象
- `apps/core-app` 在执行 `typecheck:web`（`vue-tsc --noEmit -p tsconfig.web.json`）时，出现大量 `TS2307: Cannot find module '@talex-touch/tuffex' or its corresponding type declarations`。
- 错误集中于渲染进程 Vue 组件及 `src/renderer/src/modules/tuffex/index.ts` 的动态导入。

## 结论（根因）
`@talex-touch/tuffex` 是 workspace 包，但其 `package.json` 的 `types/exports` 指向 `dist/es/...`。在 CI 或干净环境中 `dist/` 不存在（被 `.gitignore` 忽略且未在构建前产出），导致 TypeScript 无法解析模块类型。与此同时，`core-app` 的 `tsconfig.web.json` 未为 `@talex-touch/tuffex` 配置源码别名，TypeScript 只能走包解析路径，因此报 `TS2307`。

## 关键证据
- `packages/tuffex/package.json` 指定 `types: dist/es/index.d.ts` 且 `exports` 也指向 `dist/es/...`（类型与入口均依赖 dist）。
- 根 `.gitignore` 包含 `dist/`，`packages/tuffex/dist` 在干净环境不会存在。
- `apps/core-app/tsconfig.web.json` 仅配置 `~/` 路径别名，未包含 `@talex-touch/tuffex` 的 `paths` 映射。
- `apps/core-app/electron.vite.config.ts` 的 `tuffexAliases` 仅在非生产模式启用；生产构建时别名为空，仍依赖包的 dist 输出。
- `apps/nexus/nuxt.config.ts` 提供了可参考的 `@talex-touch/tuffex` 源码别名与 `transpile` 配置，说明已有可用模式。
- `apps/core-app/src/renderer/src/types/tuffex.d.ts` 仅声明了 `TxFlipOverlay`，不足以作为完整模块声明。

## 触发条件
- CI 或全新拉取仓库后未执行 `@talex-touch/tuffex` 构建。
- 本地清理 `packages/tuffex/dist` 后直接运行 `pnpm -C "apps/core-app" run typecheck:web`。

## 影响范围
- `apps/core-app` 渲染进程类型检查与构建失败（生产构建最明显）。
- 其他依赖 `@talex-touch/tuffex` 且未配置源码别名、又未先构建 `tuffex` 的 workspace 任务也可能受影响。

## 可选解决方向（未执行）
1) **构建前置**：在 `core-app` 构建/CI 流水线中显式先执行 `@talex-touch/tuffex` 的 build，确保 `dist` 存在。
2) **tsconfig 路径映射**：在 `apps/core-app/tsconfig.web.json` 增加 `paths` 指向 tuffex 源码与 utils/style（可参照 `apps/nexus/nuxt.config.ts` 的路径组织）。
3) **生产别名策略调整**：允许生产构建阶段仍使用源码别名（需评估构建产物体积与 tree-shaking 行为）。
4) **发布/锁定成品包**：改为依赖已发布的 `@talex-touch/tuffex` 版本（非 workspace），避免 dist 缺失，但会增加版本同步成本。

## 建议验证清单
- 确认 CI 构建时 `packages/tuffex/dist/es/index.d.ts` 是否存在。
- 在本地删除 `packages/tuffex/dist` 后，复现 `pnpm -C "apps/core-app" run typecheck:web` 的报错。
- 在本地先构建 `@talex-touch/tuffex` 后，再运行 `typecheck:web`，确认错误是否消失。

