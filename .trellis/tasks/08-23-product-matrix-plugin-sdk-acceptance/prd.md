# 官网功能矩阵与插件 SDK 升级

## Goal

对照 Nexus 官网/文档公开承诺、官方插件 manifest、Plugin SDK 当前版本和上游 SDK 迁移约束，建立可执行矩阵；逐插件升级到可证明的最新兼容 SDK，并完成跨平台 smoke 证据。

## Confirmed Facts

- Nexus 公开入口已经列出插件、SDK、能力接入文档；`apps/nexus/app/data/tuffSdkItems.ts` 当前暴露 31 个 SDK/能力卡片。
- `packages/utils/plugin/sdk-version.ts` 是插件 SDK 版本事实源；当前最新 marker 为 `260817`。
- 仓库内 23 个 `plugins/*/manifest.json` 均在受支持 SDK allowlist 内；只有 `clipboard-history` 使用 `260817`，`json-formatter`、`touch-intelligence`、`touch-translation` 使用 `260713`，其余 19 个仍在 `260428`。
- 插件文档目录当前覆盖 14 个插件；`clipboard-history`、`json-formatter`、`touch-browser-data`、`touch-dictation`、`touch-emoji-symbols`、`touch-quickops`、`touch-snipaste`、`touch-snippets`、`touch-text-tools` 缺少对应中英文官网文档页或未被目录纳入。
- `packages/test/src/plugins/manifest-boundary.test.ts` 已守住 npm 包名、SDK allowlist、permission reason、root result provider、forceMax surface 等边界；但它故意允许多数插件停留旧 SDK，并且不证明官网矩阵完整。
- 上游 LangChain.js v1 迁移把 React agent prebuilt 迁到 `langchain` 的 `createAgent`，旧 `langchain/*` 经典路径转到 `@langchain/classic/*`；这是破坏性迁移，不能直接混入当前验收批次。
- MCP TypeScript SDK 当前使用 `@modelcontextprotocol/sdk` 1.29.0；真实 MCP smoke 仍按 AI 任务要求保持 opt-in，不用 mock 代替。
- Electron Builder 官方 auto-update 支持 macOS DMG、Windows NSIS、Linux AppImage/DEB/Pacman/RPM；macOS 直接分发需要 Developer ID 与 notarization 证据，和 release/OTA 子任务保持同一约束。

## Requirements

- R1：官网能力矩阵必须以代码事实源为准，覆盖功能入口、文档路径、owner、平台、稳定级别、SDK/API、权限、数据/隐私分类、smoke 命令和证据状态。
- R2：公开站、docs、manifest、package、SDK README、typed SDK exports 和测试必须同向；任何一处宣称可用而代码/测试/运行证据缺失时，矩阵标为 `partial` 或 `unavailable`。
- R3：每个官方插件必须声明明确 runtime id、SDK marker、权限 reason、root result/search/indexed source 策略、UI surface 类型、暗色/浅色和 degraded state；高风险权限必须 fail-closed。
- R4：逐插件升级 SDK marker 时只在真实使用新 API 后升级；不得为了“最新”批量改 `sdkapi`。升级必须包含 manifest、package、build output、文档和 focused smoke。
- R5：`260428 -> 260713 -> 260817` 迁移要按插件能力拆分：localization、Intelligence facade、application resolution、tfile scope 等能力只开放给实际需要者。
- R6：官网矩阵必须显式列出未实现/未验证项，不得把 mock、static-only、manifest-only、docs-only 或 memory/local-only 证据计为完成。
- R7：上游 SDK 更新只接受两类路径：补丁级安全/兼容升级可进入当前批次；破坏性迁移必须先有独立设计、兼容层、负向测试和回滚点。
- R8：跨平台 smoke 至少覆盖 macOS 当前宿主；Windows/Linux 需要 runner 或真机证据。无法运行的平台保持 blocked/static-only，并说明具体缺的证据。
- R9：矩阵和证据不保存 Token、API key、用户 prompt/response、真实路径、完整日志、设备指纹或下载签名 URL 查询参数。

## Acceptance Criteria

- [ ] 官网功能矩阵列出每个公开功能/SDK/plugin 的 owner、代码入口、文档入口、平台、稳定级别、权限/隐私分类、smoke 和状态。
- [ ] 23 个官方/示例插件均有 manifest/package/docs/SDK marker 一致性检查；缺文档或未升级项被明确标记并进入 backlog。
- [ ] 所有 package CI/publish workflow 对应包真实依赖图、build/typecheck/test/publish 脚本和 dist-tag，并被自动化合同覆盖。
- [ ] 插件 `sdkapi` 升级仅发生在实际使用新 SDK 能力的插件上；升级后 `pnpm plugins:validate`、package plugin tests、插件自身 lint/build/typecheck 全绿。
- [ ] `packages/utils/plugin/sdk/README.md`、Nexus dev API docs、插件目录和 `tuffSdkItems` 对同一 SDK 能力没有互相矛盾的承诺。
- [ ] LangChain.js v1、MCP SDK、Electron Builder、OpenAI/Anthropic/Pi SDK 的“最新版本适配”有官方资料、兼容性判断和迁移任务；破坏性迁移不得无设计落地。
- [ ] macOS 官方插件 smoke 覆盖安装、启用、权限允许/拒绝、Light/Dark、核心功能和卸载/重载；Windows/Linux 有 runner/真机证据或 blocked 标记。
- [ ] 公开官网不展示未实现为 available 的能力；Pricing/Billing、production sync、real MCP、cross-platform OTA 等缺证据项保持 `partial/blocked`。
- [ ] Nexus/CoreApp/package/plugin focused tests、`plugins:validate`、`lint:changed`、`quality:release`、`git diff --check` 按风险全绿。

## Current Acceptance Matrix

| Area | Status | Evidence / Remaining Gate |
| --- | --- | --- |
| 官网 SDK 卡片 | partial | 31 个 SDK/能力卡片存在；`featureIndex.test.ts` 已要求每项绑定双语 docs 路由或显式 SDK owner；仍需 smoke/status 矩阵。 |
| 插件文档目录 | partial | 14/23 插件被目录覆盖；9 个插件缺官网目录/中英文页映射；缺口已由 `manifest-boundary.test.ts` 显式 guard 锁定。 |
| Plugin SDK marker | partial | 23/23 manifest 处于 allowlist；1/23 到 `260817`，3/23 到 `260713`，19/23 仍在 `260428`。 |
| Manifest 安全边界 | pass | `manifest-boundary.test.ts` 覆盖包名、SDK allowlist、permission reason、provider 策略、forceMax surface 和插件文档覆盖缺口。 |
| 上游 SDK modernization | partial | MCP 1.29.0 已对齐；LangChain v1 为破坏性迁移，需独立设计。Electron Builder 约束由 release/OTA 任务承接。 |
| 跨平台插件 smoke | blocked | 当前只有本地/静态/manifest 证据；Windows/Linux 与完整插件 UI runtime 仍缺 runner/真机证据。 |

## Out of Scope

- 不为了矩阵全绿批量提升 `sdkapi` 或伪造插件新能力。
- 不在本任务中完成 LangChain 1.x 全面迁移、真实支付接入、生产发布部署或远端 D1/R2 变更。
- 不把官网营销文案作为产品完成证据；公开承诺必须能追到代码和 smoke。
