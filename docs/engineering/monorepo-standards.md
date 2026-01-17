# Monorepo 标准（talex-touch）

目标：在不牺牲开发效率的前提下，让 monorepo 的**根目录更干净**、**各 workspace 更自洽**、**工具链一致可预期**。

## 设计原则

- **Root Keep Clean**：根目录只保留“全局必需”的配置与入口脚本；子项目优先本地化其构建/运行配置。
- **单一事实来源**：版本、提交规范、质量门禁尽量只维护一份；需要差异化时才做 workspace 局部覆盖。
- **KISS/DRY/YAGNI**：不引入新的工具（如 Commitizen/Changesets）除非已有明确需求。

## Workspace 划分与职责

- `apps/core-app/`：Electron 主应用（主进程 + 渲染进程），拥有自己独立的 ESLint/Prettier 配置与 typecheck。
- `apps/nexus/`：Nuxt 文档/站点，ESLint 配置组合 `@antfu/eslint-config` + `./.nuxt/eslint.config.mjs`。
- `packages/`：可复用包（`utils`、`tuffex`、`tuff-intelligence`、`unplugin-export-plugin`、`test`）。
- `plugins/`：插件示例/样例项目（Vite + Vue）。

## 根目录约定（保持简洁）

根目录建议只长期保留：

- workspace 必需：`package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`
- 统一质量门禁：`eslint.config.js`、`commitlint.config.cts`、`.husky/`
- 工具脚本：`scripts/`
- 文档：`docs/`、`plan-prd/`、`AGENTS.md`

其余“仅某个 workspace 使用”的配置，优先放到对应 workspace 内（例如 `apps/core-app/.prettierrc.yaml`）。

## 代码质量与提交流程（标准化）

### ESLint

- 根级 `eslint.config.js` 用于覆盖没有专属 eslint 配置的 workspace。
- 已有专属配置的 workspace：
  - `apps/core-app/eslint.config.mjs`
  - `apps/nexus/eslint.config.js`
  - `plugins/touch-translation/eslint.config.js`

### lint-staged

- 统一在根目录维护（`package.json#lint-staged`）。
- 仅在 pre-commit 对**已暂存文件**执行修复（`eslint --fix`），避免把全仓库 lint 作为提交门禁。

### Commit 规范（commitlint + husky）

- 根级 `commitlint.config.cts` 为唯一提交规范来源。
- husky hooks：
  - `pre-commit`：同步 core-app 元信息后自动 `git add`，再运行 `lint-staged`
  - `commit-msg`：执行 `commitlint`

## Workspace 脚本约定（建议）

每个 workspace 至少具备：

- `lint`：只 lint 当前 workspace
- `lint:fix`：只 fix 当前 workspace
- `typecheck`（可选）：TS/Vue 项目建议提供
- `test`（可选）：存在测试时提供

根目录保留“聚合入口”（如 `pnpm core:dev`、`pnpm lint`、`pnpm typecheck` 等）。

## Typecheck 策略（门禁范围）

- 根目录 `pnpm typecheck`：只检查 **`apps/core-app`**（作为默认门禁，保证主应用开发体验与稳定性）。
- 全量检查（开发自查）：`pnpm typecheck:all`（等价于 `pnpm -r --if-present run typecheck`）。
  - 说明：如果某个 workspace 存在历史类型债务（例如 Nuxt 项目），该命令可能失败；建议单独起收敛任务，不阻塞主应用迭代。

## 依赖升级策略（建议）

- **优先修复兼容性债务**：先解决明显的版本分裂（例如 `packages/unplugin-export-plugin` 仍使用 ESLint 8 / Vitest 0.x）。
- **分层升级**：
  - 先升级工具链（eslint/vitest/ts）→ 再升级构建（vite/electron-vite/nuxt）→ 最后升级业务依赖。
- **有风险的升级不自动做**：Electron、Nuxt、Vite 大版本升级需单独 PRD/验证计划。

## 当前扫描结果（重点建议）

- `plugins/touch-translation/` 之前通过 `simple-git-hooks` 写入 `.git/hooks`，可能与根级 husky 冲突；已改为仅在“在该目录单独安装依赖”时执行。
- `packages/unplugin-export-plugin/` 工具链明显偏旧（ESLint 8、Vitest 0.31、esno 0.16）；建议对齐到当前 monorepo 主版本（ESLint 9 / Vitest 3+ / esno 4+）。
- `pnpm -r outdated` 显示部分依赖可做小版本升级；另外 `xterm`/`xterm-addon-fit` 在 registry 标记为 Deprecated，需要评估替代/迁移策略（不建议直接盲升）。
- 仓库内存在 workspace 私有 `pnpm-lock.yaml`（如 `apps/nexus/`、`plugins/touch-translation/`）；若这些 workspace 已完全纳入 pnpm workspace，建议后续统一到根级 lockfile（需要单独确认与回归验证）。
  - 注：已为 `plugins/touch-image/`、`plugins/touch-music/` 增加本地 `eslint.config.js`，用于在不影响根级 lint 的前提下实现 workspace 自洽。

## 可升级项（建议优先级）

按“收益/风险”综合排序（不自动执行）：

- **高优先级（小版本，收益明确）**
  - `apps/core-app/`：`drizzle-orm`、`drizzle-kit`、`electron-log`（beta → stable 需额外验证）、`esbuild`、`iconv-lite`
  - `apps/nexus/`：`@clerk/nuxt`、`@nuxt/*`（小版本仍需跑一次 `nuxt typecheck` + 站点构建）
- **中优先级（版本分裂/一致性）**
  - `@vueuse/core`：workspace 内存在 13.x 与 14.x 并存，建议在“核心应用验证通过”后再全仓统一
  - `eslint`：workspace 内已基本对齐到 9.x，但 `packages/unplugin-export-plugin/` 仍停留在 8.x
- **需要方案评估（标记 Deprecated）**
  - `xterm` / `xterm-addon-fit`：registry 标记为 Deprecated，需先确认上游替代包/迁移路径与 Electron 兼容性

## 推荐命令

- 全仓库 lint（可能受历史代码影响）：`pnpm lint`
- 按 workspace 执行（更可控）：`pnpm -r --if-present run lint`（当前 `plugins/touch-music/` 存在历史 lint/type 问题，可能需要临时 filter 或先修复）
- 类型检查：`pnpm -r --if-present run typecheck`
- 升级扫描：`pnpm -r outdated`
