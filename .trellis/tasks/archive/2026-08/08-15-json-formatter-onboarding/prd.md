# json-formatter 引入与 SDK 适配

父任务：`08-15-local-store-three-plugins`。依赖 `08-15-local-nexus-publish-path`。

## Goal

把 `github.com/talex-touch/json-formatter` 引入本仓库 `plugins/json-formatter`，
补齐当前 SDK 与 `plugins/AGENTS.md` 的约定，并在本地完成发布、安装、使用。

## Background

该插件已引入本仓库并修复到 v1.0.8，sdkapi 260713，TypeScript；原独立仓库最后更新于
2026-06-19。本地 D1 旧 1.0.0 / 1.0.1 RELEASE 记录仅作为历史数据，不作为本次验收证据。

## Requirements

已识别的适配面：

1. **权限缺失**：manifest 没有 `permissions` / `permissionReasons` 块。
   `plugins/AGENTS.md` 要求权限必须声明且写明 reason，高风险能力必须过 permission gate。
   需按它实际用到的能力补齐（读写剪贴板、若推根搜索结果则加 `search.root-results`）。
2. **本机绝对路径**：`package.json` 的 `build` 与 `publish:nexus` 脚本硬编码了
   `/Users/talexdreamsoul/Workspace/Projects/talex-touch/packages/tuff-cli/bin/tuff.js`，进 monorepo 后必须改成工作区解析。
3. **包名**：当前 `"name": "json-formatter"`，规范要求 `@talex-touch/json-formatter-plugin`。
4. **`dev.enable: true`** 且 `address` 指向 `localhost:5555`，需按仓库内其它插件的约定处理。
5. **缺 `build.index`**：另两个插件都有 Prelude 构建声明，需确认它的 Prelude 形态（仓库根有 `index.js`）。
6. 独立仓库残留（`pnpm-lock.yaml` / `pnpm-workspace.yaml` / `.npmrc` / `.vscode`）按 monorepo 约定取舍。
7. **SDK 适配**：`sdkapi` 从 `260615` 提到 `260713`（`CURRENT_SDK_VERSION`）。该插件停更近两个月，
   是三个里调用面漂移风险最高的，需实际核对 `260626` / `260713` 两档能力与既有 API 的可用性，
   而不是只改 manifest 里的数字。

改造以「能在当前运行时正确加载并通过权限门」为准，不做功能重构。

## Acceptance Criteria

- [x] `plugins/json-formatter` 存在，`pnpm plugins:validate` 通过。
- [x] `pnpm -C plugins/json-formatter run lint` 与 `run build` 均通过。
- [x] manifest 声明了实际使用的全部权限，每项都有 reason；没有多余声明。
- [x] `package.json` 内不含任何本机绝对路径。
- [x] 本地发布后市场能搜到「json」「格式化」并命中该插件。
- [x] 安装启用后：合法 JSON 能格式化；非法 JSON 有明确错误反馈，不静默失败。
- [x] `manifest.sdkapi === 260713`，且在该版本下加载、权限门与格式化功能实测通过。

## Constraints

- 不为了「跑起来」而删权限声明或放宽 permission gate。
- 保留插件原有真实用途说明，不留 Vite starter 模板文案。
- 若改造量明显超出「引入 + 适配」（例如依赖的 SDK 面已大幅漂移），停下来汇报再决定是否继续。

## Non-Goals

- 重写它的 UI 或编辑器实现。
- 把它发布到生产 Nexus 或 npm。
- 同步回上游 GitHub 仓库。
