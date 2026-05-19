# 跨平台兼容、占位实现与架构健壮性增量审计（2026-05-19）

> 关系：本文承接 `cross-platform-compat-placeholder-deep-audit-2026-05-16.md`，基于当前 live tree（`2.4.11-beta.2`）做增量复核；不替代 Windows/macOS/Linux 真机 evidence。

## 1. 总体结论

当前项目仍不是“到处是假实现”的状态。生产主路径没有发现新的 P0 级固定假值成功、mock 成功响应、平台能力伪装全支持或可消费占位 payload。

从 2026-05-16 到 2026-05-19 的增量变化主要集中在 Everything 手动 CLI、App Index 管理、Browser Data / Emoji / Snippets 插件、CloudShare 内容包安装、图片翻译 DivisionBox 链路和 CLI/发布认证。整体方向是正向的：新增能力多数返回真实数据或显式失败原因，未把空结果伪装成成功业务载荷。

真正需要优先治理的是剩余 shell/OS capability surface、App Data 插件口径、widget runtime sandbox 证据和 SRP 大文件长尾。下一步不建议继续做泛化 placeholder 扫描，而应进入“按 surface 收口 + 真机 evidence + 小切片拆分”。

## 2. 跨平台兼容现状

CoreApp 平台能力合同继续保持清晰：`apps/core-app/src/main/modules/platform/capability-adapter.ts` 把 active app、selection capture、auto paste、native share、permission deep-link、Everything 和 Tuff CLI 统一表达为 `supported / best_effort / unsupported`，并携带 `issueCode / reason / limitations`。Linux `xdotool` 缺失、Windows Everything 不可用、非 macOS native share 等场景均是显式不可用，不是假成功。

Everything 近期改动也遵守平台边界：非 Windows 初始化直接跳过；非 Windows 配置 CLI path 会抛出明确错误；非 Windows 搜索返回空结果而不伪装 provider ready。Windows 侧新增 `configuredCliPath` / active `esPath` evidence 字段，有利于后续真机验收。

新增 App Data 插件的兼容性比“占位插件”更真实：`touch-browser-data` 读取 Chromium Bookmarks JSON，要求 `fs.read` 权限，权限拒绝时展示缺权 item；未找到文件时展示扫描状态，不返回假书签。但它当前仍有 P1 口径问题：manifest 和空态文案声明 Chrome / Edge / Brave / Arc，而 Linux 定义只覆盖 Chrome / Edge / Brave；后续应按平台展示 source availability，并补 clear/rebuild/disable/evidence 语义。

## 3. 占位、假实现与不优雅代码

### 3.1 未发现新的 P0 fake-success

本轮扫描过滤了 UI placeholder、测试 mock、fixture、`.fake-background` 样式 token、构建产物与显式退休接口。剩余高信号命中没有构成 P0：

- Nexus 旧 `/api/sync/*`、旧 app-auth sign-in-token、旧 intelligence lab/agent endpoint 返回 `410`，属于显式退休。
- Scene / provider adapter 不可用返回 `501` 或明确 unavailable reason，不是成功占位。
- `touch-intelligence` 的 `buildPlaceholderItem()` 是 CoreBox 空态 item，不是可消费 AI answer。
- `touch-snippets` 的 `{{date}} / {{time}} / {{uuid}} / {{clipboard}}` 是产品模板能力，不是伪实现；snippet pack export 还带敏感内容过滤。
- `encrypted-local-secret-placeholder` 只出现在测试 fixture。

### 3.2 P1 高信号治理点

1. `plugins/touch-snipaste/index.js` 仍是 shell capability 的首要剩余 surface。Manifest 声明 required `system.shell`，但运行路径没有显式 `permission.check/request`；用户配置 `snipastePath` 与 custom `args` 后会直接 `spawn()`。它不用 `shell: true`，注入风险低于裸 shell，但仍应 fail-closed、展示 permission/platform diagnostics，并把 `started/blocked` 结果纳入 audit metadata。
2. `plugins/touch-window-presets/index.js` 已限制 Windows 并使用 `execFile()` 调 PowerShell，执行前也会校验 `system.shell`；但展示阶段会直接 `permission.request()` 和枚举窗口。应改为展示阶段 non-mutating `permission.check()`，只在执行动作时请求授权，避免“看结果就弹权限”的不优雅体验。
3. `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 仍通过 `new Function` 执行 widget runtime code。PreviewSDK 首批表达式/单位换算已收口，不再是主要动态执行风险；当前剩余动态执行边界应聚焦 widget sandbox 的 allowed globals、storage facade、failure reason、audit 与 regression。
4. Browser Data 插件需要补 source-level health。当前扫描真实，但没有把 Chrome/Edge/Brave/Arc 的平台差异、profile count、read-failed reason、clear/rebuild/disable 作为统一 App Data diagnostics surface 暴露。
5. Runtime console 与超长文件仍是架构韧性问题。`search-logger`、部分 renderer/Nexus/插件仍有裸 `console.*`；大文件继续集中在 Intelligence admin/service、FileProvider、PluginModule、AppProvider、SearchCore 等跨域 orchestration。

## 4. 架构健壮性与 SRP 风险

过滤 `out/`、`.wrangler/`、`dist/` 后，当前最大生产源文件集中在跨域 orchestration 与大型 UI 管理页：

| 文件 | 行数 | 风险 |
| --- | ---: | --- |
| `apps/nexus/server/utils/tuffIntelligenceLabService.ts` | 4021 | provider routing、usage ledger、tool execution、serialization 混合 |
| `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` | 3862 | scanner、index runtime、watcher、thumbnail、diagnostics 混合 |
| `apps/core-app/src/main/modules/plugin/plugin-module.ts` | 3825 | lifecycle、runtime repair、surface wiring、registry sync 混合 |
| `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` | 3419 | source scanner、launch resolver、metadata、diagnostics 混合 |
| `apps/nexus/app/components/dashboard/intelligence/IntelligenceAdminPanel.vue` | 3098 | Provider/Scene/Model 管理状态与交互混合 |
| `apps/nexus/app/pages/docs/[...slug].vue` | 2850 | fetch state、TOC、assistant、render helper 混合 |
| `packages/utils/transport/events/index.ts` | 2752 | transport event registry 聚合过大 |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | 2488 | provider orchestration、merge/ranking、telemetry 混合 |

建议继续走小切片：只移动纯 helper、diagnostics mapper、storage adapter、UI state composable 或 provider-specific adapter，不在同批改变业务语义。

## 5. 建议下一步

1. 先做 `P0-SHELL-CAP` 剩余 surface：`touch-snipaste` fail-closed + diagnostics + tests；随后把 `touch-window-presets` 展示阶段改为 non-mutating permission check。
2. 给 `touch-browser-data` 补 source-level diagnostics：按平台展示 Arc 支持状态，补 read-failed reason、profile count、disable/clear/rebuild 语义，并准备 macOS/Windows/Linux 真实书签 evidence。
3. 固化 widget runtime sandbox 清单：记录 allowed globals、storage facade、blocked APIs、runtime source cache 脱敏与失败 reason，补 focused regression。
4. 继续 Windows/macOS release-blocking evidence；Linux 只做 best-effort smoke 与桌面环境限制说明。
5. SRP Wave C 选一个切口：优先 `file-provider` diagnostics/service 拆分或 `IntelligenceAdminPanel` composable 拆分，避免和功能变更混批。

## 6. 本轮验证与限制

已执行：

- 读取 2026-05-15 / 2026-05-16 兼容审计、当前 README/TODO/Roadmap/Quality Baseline/INDEX。
- 查看 2026-05-16 之后涉及 `apps`、`packages`、`plugins`、`docs/plan-prd` 的提交变化。
- 静态扫描平台分支、placeholder/fake/mock/stub/TODO、`new Function`、`shell: true`、`spawn/execFile`、secret/token/localStorage、retired endpoint、raw console 和大文件。
- 抽样核验 `capability-adapter`、Everything provider、Browser Data、Browser Open、Snippets、Snipaste、Window Presets、Widget Registry、Preview Provider。

未执行：

- 未运行完整 `pnpm quality:release`。
- 未执行 Windows/macOS/Linux 真机验证。
- 未写入 Nexus Release Evidence。
- 未执行 git commit / push。
