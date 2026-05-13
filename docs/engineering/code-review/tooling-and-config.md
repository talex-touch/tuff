# Tooling & Config 质量分析

## 根级脚本现状
- `package.json:11-24`：存在 `lint` / `typecheck` / `build`  
  - `lint` 使用 `pnpm -r --filter ./apps/* --filter ./packages/* --filter ./plugins/*`  
  - **缺少 root `test` 脚本**（`package.json` 未发现 `test`）

## CI 工作流一致性
- `ci.yml` 具备 typecheck 任务（`run: pnpm typecheck`）
- `package-ci.yml` 通过输入参数决定 `run-test/run-lint/run-typecheck`，默认 `pnpm test/lint/typecheck`
- **问题：包级 CI 默认关闭测试/ lint**
  - `package-tuffex-ci.yml:25-27` → `run-typecheck/lint/test: false`
  - `package-utils-ci.yml:23-25` → `run-typecheck/lint/test: false`
  - `package-unplugin-ci.yml` 仅启用 lint，test 仍为 false

## 风险与建议
- **P2**：包级 CI 默认关闭测试，导致已有测试无法作为质量门禁  
  **建议**：为具备 tests 的包（`packages/utils`、`packages/tuffex`、`packages/unplugin-export-plugin`）显式开启 `run-test` 并提供 `pnpm -C <pkg> test` 入口。

- **P2**：缺少根级 `test` 脚本，不利于统一 CI 执行  
  **建议**：补充根级 `test`（可聚合执行或分包执行）。

- **P3**：lint/typecheck 脚本存在，但对新增包的自动覆盖需要明确策略  
  **建议**：在新增包模板中强制包含 `lint/test/typecheck` 脚本。

## 附：workspace 配置观察
- `pnpm-workspace.yaml` 使用 `catalog` 管理依赖版本（利于一致性）
- 仍建议在 CI 中验证 catalog 与实际依赖同步策略
