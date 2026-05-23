# 跨平台兼容、占位实现与架构健壮性自动化审计（2026-05-22）

> 关系：本文承接 `cross-platform-compat-placeholder-automation-audit-2026-05-20.md` 与 2026-05-21 live-tree 复核，基于当前工作树做增量扫描；不替代 Windows/macOS/Linux 真机 release evidence。

## 1. 总体结论

当前 live tree 没有呈现新的 P0 fixed fake-success、mock 成功响应、固定假业务 payload 或“平台能力伪装全支持”的生产主路径问题。跨平台兼容口径整体继续向好，核心原因是平台能力已经主要用 `supported / best_effort / unsupported` 和 `reason / issueCode / limitations` 表达，而不是在失败时静默返回成功。

本轮最重要的变化是：2026-05-20 报告里列为下一批的 `touch-snipaste`、`touch-window-presets` 与 `touch-browser-data` 已在当前树里出现真实 hardening 证据，不能再当作未开始事项重复排期。

剩余高信号风险已收敛为：

1. 系统 credential backend 仍未完成：CoreApp secure-store 已优先 Electron `safeStorage`，但不可用时仍降级到 `local-secret`；CLI token 仍是 POSIX `0700/0600` + Windows ACL warning 的过渡方案。
2. Windows/macOS/Linux 真机 evidence 仍未闭环：当前静态扫描只能证明 fail-closed / degraded contract，不能替代 release-blocking 人工回归。
3. Widget runtime sandbox 仍是受控动态执行边界：`new Function` 已被显式要求 sandbox context，但仍需要 regression、source cache 脱敏与真实示例 evidence。
4. 裸 `console.*` 与示例插件调试输出仍是“不优雅”治理面：多数不构成 fake-success，但会削弱生产日志、脱敏和结构化诊断。
5. SRP 大文件风险持续存在：Nexus governance、CoreApp file-provider/plugin/app-provider、transport events 等文件仍明显过大，后续应继续小切片拆分。

## 2. 当前跨平台兼容状态

### 2.1 平台能力合同

`apps/core-app/src/main/modules/platform/capability-adapter.ts` 仍是平台能力主口径：

- active app：macOS 依赖 Automation，Windows 依赖 PowerShell/Win32，Linux 依赖 `xdotool`；缺依赖时返回 `unsupported` 与 reason。
- selection capture：macOS 可 supported，Windows/Linux 走 simulated copy 的 best-effort，Linux 缺 `xdotool` 时 fail-closed。
- auto paste：跨平台都标为 focused-window keyboard automation 的 best-effort；Linux 缺 `xdotool` 时 unsupported。
- native share：macOS supported，Windows/Linux 明确 `MAIL_ONLY`，不是假装有系统分享。
- Everything：非 Windows 明确 unsupported；Windows 后端未 ready 时返回 `EVERYTHING_UNAVAILABLE` 或具体 error code。

结论：当前平台兼容总体是“诚实降级”，不是固定成功。

### 2.2 插件 shell / OS capability

当前树里的 shell 能力治理已经推进：

- `plugins/touch-snipaste/index.js`：执行前做 `system.shell` permission gate，非法 args 被 blocked，执行结果区分 `started / blocked / failed`。
- `plugins/touch-window-presets/index.js`：展示阶段使用 `permission.check()` 获取状态，执行 preset 时才 request；非 Windows 给明确 platform unsupported item。
- `plugins/touch-quick-actions/index.js`：safe-shell 缺失和非支持平台 fail-closed；动作执行前做权限、危险动作确认、unsafe payload 阻断，并返回 `started / blocked / failed / cancelled`。
- `plugins/touch-browser-data/index.js`：已经有 source-level diagnostics，区分 `available / not-found / read-failed / unsupported`、profile count、read failed reason。

剩余工作不是“首切还没做”，而是继续复核剩余 shell/OS surface 是否全部具备同等 metadata、permission state、audit 字段和 focused tests。

## 3. 占位、假的、不优雅实现判断

### 3.1 未发现新的生产 P0 假成功

本轮 broad scan 命中大量 `placeholder / fake / mock / stub / TODO / unsupported`，过滤后主要属于：

- UI input placeholder、空态文案、CSS `fake-background` 和 skeleton。
- docs/demo/playground/test fixture。
- `touch-snippets` 的用户模板 placeholders。
- 退休接口的 HTTP `410` / migration target。
- AI provider optional capability 默认 unsupported。
- native OCR unsupported stub 或 platform-specific fallback。

这些不应混成生产 fake-success。当前高信号生产路径未发现“失败仍返回可消费业务成功 payload”的新增问题。

### 3.2 仍需治理的不优雅点

1. Preload 裸日志
   `apps/core-app/src/preload/index.ts` 仍有 `console.warn/error` 和 debug 模式 `console.log`。debug guard 降低了风险，但质量基线已经禁止 CoreApp main/preload/renderer 新增裸 `console.*`，后续应收口到 preload-scoped logger 或最小 debug helper。

2. Widget 动态执行边界
   `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 在要求 sandbox 后仍通过 `new Function(...)` 执行 widget code。当前不是“无边界 eval”，但它仍是安全/可审计高价值区域：必须继续固定 allowed globals、blocked APIs、runtime source cache 脱敏、failure reason 与 regression。

3. 示例插件调试噪声
   `plugins/touch-music` 仍存在多处 `console.log`、旧组件和过时粒子组件文件。它更接近 example/plugin polish debt，不是 CoreApp 主路径 P0，但如果官方插件要进入发行面，需要按普通生产插件标准清理。

4. 大文件 SRP 风险
   当前大文件仍集中在：

   | 文件 | 行数 | 风险 |
   | --- | ---: | --- |
   | `apps/nexus/server/utils/tuffIntelligenceLabService.ts` | 4104 | provider routing、tool execution、ledger、serialization 混合 |
   | `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` | 3862 | scanner、index、watcher、thumbnail、diagnostics 混合 |
   | `apps/core-app/src/main/modules/plugin/plugin-module.ts` | 3825 | lifecycle、runtime repair、surface wiring、registry sync 混合 |
   | `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` | 3419 | app scanner、launch resolver、metadata、diagnostics 混合 |
   | `apps/nexus/app/pages/dashboard/admin/governance.vue` | 3621 | 多个 governance cockpit 状态和视图混合 |
   | `apps/nexus/app/components/dashboard/intelligence/IntelligenceAdminPanel.vue` | 3098 | Provider/Scene/Model 管理状态与交互混合 |
   | `apps/nexus/app/pages/docs/[...slug].vue` | 2850 | fetch、TOC、assistant、render helper 混合 |
   | `packages/utils/transport/events/index.ts` | 2752 | transport event registry 聚合过大 |

## 4. 文档与治理口径

当前 plan-prd 入口已有正确主线：`2.4.10` 为稳定基线，`2.4.11` 为债务退场与阻塞回归，`2.5.0` AI Stable 只承诺文本 + OCR。

本轮同步点：

- 新增本报告作为 2026-05-22 增量审计真相。
- 更新 `README / TODO / INDEX / Roadmap / PRD-QUALITY-BASELINE / CHANGES`，把 shell/browser-data hardening 已落地与剩余治理点拆开。
- 保持旧 compat registry / legacy allowlist / size allowlist 已退场的口径，不恢复为 live SoT。

## 5. 下一步建议

1. P0：补 Windows/macOS release-blocking 真机 evidence；Linux 只记录 best-effort smoke、桌面环境和缺依赖 reason。
2. P0：完成 credential backend evidence：Windows Credential Locker、Linux libsecret/Secret Service、遗留 secret 清理和 degraded/unavailable UI 路径。
3. P1：复核剩余 shell/OS capability surface，确保所有执行型插件都具备 non-mutating listing、execution-time request、blocked/started/failed/cancelled、reason 和 audit metadata。
4. P1：固化 Widget runtime sandbox regression：allowed globals、blocked APIs、storage/network facade、source cache 脱敏、失败 reason、真实示例插件 evidence。
5. P1：清理 CoreApp preload/renderer/main 新增裸 console；示例插件若要作为官方发行插件，也按同一标准收口。
6. P1：选一个 SRP 小切片，不做大重构。优先拆 `file-provider` diagnostics/service、`plugin-module` lifecycle helper、或 Nexus Data Governance composable/store。

## 6. 本轮验证与限制

已执行：

- 读取 automation memory、历史 compat 审计记忆和当前 plan-prd 活跃入口。
- `git status --short` 识别当前脏工作树，避免覆盖无关改动。
- 静态扫描 `placeholder / fake / mock / stub / TODO / unsupported`、平台关键字、shell/dynamic execution、裸 `console.*`。
- 抽样核验 `capability-adapter`、secure-store、Widget registry、preload、Snipaste、Window Presets、Quick Actions、Browser Data。
- 统计当前高风险大文件行数。

未执行：

- 未运行完整 `quality:release`。
- 未执行 Windows/macOS/Linux 真机验收。
- 未执行 Electron packaged release-signed smoke。
- 未提交 git commit / push。
