# 跨平台兼容、占位实现与架构健壮性自动化审计（2026-05-20）

> 关系：本文承接 `cross-platform-compat-placeholder-incremental-audit-2026-05-19.md`，基于当前 live tree 与自动化扫描做增量复核；不替代 Windows/macOS/Linux 真机 evidence。

## 1. 总体结论

当前仓库仍未呈现“生产主路径大量假实现”的状态。平台能力合同、旧接口退休口径、Everything 非 Windows 降级、Browser Data 真实书签扫描、PreviewSDK 算式/单位换算收口等方向继续保持正向。

本轮没有发现新的 P0 fixed fake-success、mock 成功响应、固定假业务 payload 或平台能力伪装全支持。真正影响架构健壮性的仍是边界一致性和可审计性：插件 shell/OS capability、App Data source-level diagnostics、widget runtime sandbox、secret backend、裸 console 与 SRP 大文件。

需要注意：当前 `master` 相比 `origin/master` 仅新增 `fix(corebox): stabilize Windows first show and scrollbar layout`，该改动集中在 Windows CoreBox 首次显示与结果区 scrollbar 稳定性；它不改变本轮兼容/占位治理结论。

## 2. 跨平台兼容现状

`apps/core-app/src/main/modules/platform/capability-adapter.ts` 仍是平台能力合同的核心事实来源：active app、selection capture、auto paste、native share、permission deep-link、Everything 与 Tuff CLI 均通过 `supported / best_effort / unsupported` 表达，并携带 `issueCode / reason / limitations`。

当前判断：

- macOS：Automation / Accessibility / native share 等能力大多可表达为 supported 或 best-effort，但 release-blocking 仍需要真实设备 evidence。
- Windows：Everything、PowerShell/Win32 前台窗口、CoreBox 首显等能力边界更清楚；最新 CoreBox 首显修复属于体验稳定性正向增量。
- Linux：`xdotool`、desktop environment、Everything unavailable 等路径继续显式 best-effort/unsupported；不应承诺与 Windows/macOS 等价能力。
- App Data：`touch-browser-data` 确认读取 Chromium Bookmarks JSON，不是 fake 数据；但 source availability、profile count、read-failed reason、clear/rebuild/disable 仍未形成统一 diagnostics surface。

结论：跨平台“合同表达”已经可维护，缺口主要是 evidence 与插件级 capability surface 没完全统一。

## 3. 占位、假实现与不优雅代码

### 3.1 未发现新的 P0 fake-success

本轮复核过滤了 UI placeholder、测试 mock、fixture、构建产物、demo 代码和显式退休接口。高信号扫描未发现新生产路径把失败伪装成成功业务结果。

已确认不应误报的项：

- `placeholder` 大量来自输入框文案、UI 空态、测试 fixture 或 snippets 模板能力。
- Nexus 旧 `/api/sync/*`、旧 auth/intelligence 迁移路径继续以 `410`、`501`、unavailable reason 或 migration target 表达，不是成功占位。
- `touch-snippets` 的 `{{date}} / {{time}} / {{uuid}} / {{clipboard}}` 是用户模板能力，不是 fake implementation。
- `packages/tuff-native/native/src/platform/stub/ocr_stub.cpp` 是 native build unsupported stub，不等于运行时 OCR 假成功。

### 3.2 仍需优先治理的 P1

1. `plugins/touch-snipaste/index.js`
   - Manifest 声明 required `system.shell`，运行路径通过 `spawn(command, args)` 启动 Snipaste。
   - 当前不是 `shell: true`，注入面低于裸 shell；但执行前缺少显式 `permission.check/request`、safe-shell capability 诊断、platform support status、blocked/started audit metadata。
   - 建议作为下一批 `P0-SHELL-CAP` 首切，做到 fail-closed、展示阶段 capability 可见、执行阶段返回 `started / blocked / cancelled`。

2. `plugins/touch-window-presets/index.js`
   - 展示阶段调用 `ensurePermission('system.shell', ...)` 后才枚举窗口。
   - 这会让“查看候选项”也触发授权请求，不够优雅；应改为展示阶段 non-mutating `permission.check()`，仅在执行 preset 时请求授权。

3. `plugins/touch-browser-data/index.js`
   - 真实扫描 Chrome/Edge/Brave/Arc Bookmarks JSON，但当前口径仍偏 feature-level。
   - 需要补 source-level diagnostics：每个 browser/source 的 supported/unsupported、profile count、lastError、read-failed reason、disable/clear/rebuild，以及 Linux Arc 差异说明。

4. `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
   - Widget runtime 仍通过 `new Function` 执行编译后的组件代码。
   - 当前已有 sandbox context 参数与受控 facade，但仍需形成文档化 allowed globals、blocked APIs、runtime source cache 脱敏、失败 reason 与 focused regression。

5. Secret backend 与裸 console
   - CLI POSIX `0700/0600` 与插件 secret health 只是过渡缓解；OS Keychain / Credential Locker / libsecret 仍是最终目标。
   - `search-logger`、部分 renderer/Nexus/插件仍有裸 `console.*`，不是 release blocker，但会削弱生产日志治理、脱敏与结构化诊断。

## 4. 架构健壮性与 SRP 风险

过滤 `out/`、`.wrangler/`、`dist/` 后，当前最大生产源文件仍集中在跨域 orchestration 和大型 UI 管理页：

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

SRP 治理建议继续小切片推进：只移动纯 helper、diagnostics mapper、storage adapter、provider-specific adapter 或 UI state composable，不在同批改变业务语义。

## 5. 下一步建议

1. 立即推进 `touch-snipaste` shell capability 首切：补 permission check/request、safe-shell/fail-closed diagnostics、platform support、audit metadata 与 focused tests。
2. 紧接着处理 `touch-window-presets`：展示阶段改 non-mutating permission check，执行阶段才 request，并保留 Windows-only reason。
3. 为 `touch-browser-data` 建 source-level diagnostics schema，并补 macOS/Windows/Linux 真实书签 evidence。
4. 固化 widget runtime sandbox 清单：allowed globals、blocked APIs、storage/network facade、runtime source cache 脱敏、failure reason 与 regression。
5. 选一个 SRP Wave C 切口：优先 `file-provider` diagnostics/service 拆分，或 `IntelligenceAdminPanel` composable 拆分。
6. 继续把 Windows/macOS release-blocking evidence 与 Linux best-effort smoke 写入 release evidence，不用继续做泛化 placeholder 扫描。

## 6. 本轮验证与限制

已执行：

- 读取 2026-05-16 深度审计、2026-05-19 增量审计、当前 README/TODO/CHANGES/Roadmap/Quality Baseline/INDEX。
- 查看 2026-05-19 以来涉及 `apps`、`packages`、`plugins`、`docs/plan-prd` 的提交变化。
- 静态扫描 shell/exec/new Function、placeholder/fake/mock/stub/TODO、raw console 与大文件。
- 抽样核验 `capability-adapter`、`touch-snipaste`、`touch-window-presets`、`touch-browser-data`、`widget-registry`。
- 执行 `node --check` 验证 `touch-snipaste`、`touch-window-presets`、`touch-browser-data` 语法有效。

未执行：

- 未运行完整 `pnpm quality:release`。
- 未执行 Windows/macOS/Linux 真机验证。
- 未写入 Nexus Release Evidence。
- 未执行 git commit / push。
