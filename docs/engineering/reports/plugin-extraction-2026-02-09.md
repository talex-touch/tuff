# Plugin 抽离与文档整理记录（2026-02-09）

## 背景
本轮目标是把 CoreBox 里原本内置的部分 Provider/能力抽离成插件，并补齐用户引导文档。

## 本轮落地内容

### 1) 核心能力抽离（代码侧）
- 移除内置实现：
  - `url-provider`
  - `system-provider`
  - `intelligence-provider`
  - `internal-ai`（internal plugin）
- 新增插件：
  - `touch-browser-open`
  - `touch-intelligence`
  - `touch-system-actions`
  - `touch-workspace-scripts`
  - `touch-browser-bookmarks`
  - `touch-quick-actions`
  - `touch-window-presets`
- `touch-dev-toolbox` 收敛为“链接导航”，脚本执行拆到 `touch-workspace-scripts`。

### 2) 测试体系调整
- 新增 `packages/test/src/plugins/plugin-loader.ts`，统一加载 CJS 插件做测试。
- 新增/更新插件测试，覆盖抽离后的插件能力、命令构建与分组行为。
- 结果：插件测试通过（`packages/test` 下 `src/plugins` 全通过）。

### 3) 用户文档（Nexus Guide）
- 新增用户引导页：`recommended-plugins`（中英）。
- 新增内置插件目录页：`features/plugins/index`（中英）。
- 新增“一个插件一篇文档”页面（中英）覆盖以下插件：
  - browser-open
  - browser-bookmarks
  - intelligence
  - code-snippets
  - text-snippets
  - batch-rename
  - workspace-scripts
  - dev-toolbox
  - window-manager
  - window-presets
  - system-actions
  - quick-actions
- 更新 Guide 入口文案（`guide/index`、`guide/start`、`plugin-ecosystem`），把推荐插件与目录挂到新手路径。

## 关键提交（当前分支）
分支：`codex/plugins-2256`

- `a304911e` ref(core-app): remove built-in url system and internal ai providers
- `17c48a79` feat(plugins): add browser open intelligence and system actions
- `6c2b7320` feat(plugins): split workspace scripts from dev toolbox
- `30ba3518` feat(plugins): add browser bookmarks plugin
- `ea78dbd2` test(plugins): add shared loader and extraction plugin tests
- `2b898e26` docs(plugins): refresh docs for provider plugin extraction
- `9fd6ca5f` feat(plugins): add quick actions plugin
- `67c4a001` feat(plugins): add window presets plugin
- `7f192b16` test(plugins): add quick actions and window presets tests

## 后续建议
- 若要对外发布，建议在 Nexus Guide 再补一页“权限排查与常见报错”汇总。
- 如果后续继续扩展插件，建议把插件文档模板沉淀成脚手架，避免中英双份手工维护。
