# 跨平台兼容、占位实现与治理口径总结（2026-05-15）

> 关系：本文承接 `cross-platform-compat-placeholder-followup-2026-05-14.md`，基于当前工作树重新复核，不替代 Windows/macOS/Linux 真机 evidence。

## 1. 总体结论

当前代码兼容性整体处在“显式能力合同 + 证据门禁”阶段，不是“到处是假实现”的状态。生产主路径未发现新的 P0 级固定假值成功、占位成功响应或平台能力伪装全支持。

真正需要关注的是三类风险：

1. `2.4.10` release readiness 仍卡在 Windows 真机 evidence 与 Nexus Release Evidence，不能用 macOS 本机静态扫描代替。
2. `2.4.11` 仍需把 AI 兼容占位、CLI/插件 secret、插件 shell capability、renderer/Nexus/插件 raw console 与动态执行边界继续收口。
3. 文档治理口径有漂移：旧 `compatibility-debt-registry.csv`、`legacy-boundary-allowlist.json`、`large-file-boundary-allowlist.json` 和 `docs:guard/legacy:guard/compat:registry:guard` 已不在当前 live tree；活跃文档应以 `quality:pr`、`quality:release`、Windows acceptance verifier、最近路径测试与人工清单为准。

## 2. 跨平台兼容现状

### 已具备的健壮性

- CoreApp 平台能力通过 `apps/core-app/src/main/modules/platform/capability-adapter.ts` 返回 `supported / best_effort / unsupported`，并附带 `issueCode / reason / limitations`。
- macOS active-app 明确依赖 Automation permission；Windows active-app 明确依赖 PowerShell / Win32 前台窗口探测；Linux active-app、selection capture、auto-paste 均依赖 `xdotool`，缺失时返回 `unsupported`，不是静默成功。
- Windows Everything 搜索被限定为 Windows-only；非 Windows 返回 `PLATFORM_UNSUPPORTED`。Everything 后端不可用时返回 explicit unavailable reason。
- Native Share 在 macOS 是真实原生能力；Windows/Linux 明确为 `MAIL_ONLY` unsupported，不再伪装系统分享成功。
- Terminal capability 当前标记为 `best_effort`，明确只执行 child-process command，不承诺 PTY 状态同步。
- `file-provider.ts` 已恢复完整导出，当前不再是编译 blocker；仍需补最近路径和 Windows fallback evidence。

### 仍需真机补证的部分

- Windows：Everything target probe、App Index diagnostic、common app launch、copied app path、UWP/Store、Steam、update install、DivisionBox detached widget、time-aware recommendation、search trace `200` 样本、clipboard stress `120000ms`。
- macOS：首次权限、OmniPanel / active-app / share / tray / dock / update 等 release-blocking 人工回归。
- Linux：继续按 best-effort smoke，重点记录 `xdotool`、桌面环境、permission deep-link 和 launcher 限制。

## 3. 占位、假实现与不优雅代码

### 未发现新的 P0 假实现

本轮按生产 runtime 重新扫描 `placeholder / fake / mock / stub / TODO / 未实现` 后，主要命中仍是：

- UI 输入框 placeholder。
- `.fake-background` 等视觉 token。
- Vitest / fixture / playground mock。
- 显式测试或开发工具路径。

这些不应直接算作生产假实现。当前没有发现新的“用户路径返回固定假成功”的 P0。

### P1 仍需治理

- AI 兼容占位：历史报告里的 `livechat/random`、prompt detail、catch-all 未实现接口仍应按 `2.4.11` 退场或改为明确 HTTP status / `unavailable + reason`。
- CLI token：已进入 `CliCredentialStore` 并做 POSIX `0700/0600` 缓解，Windows 用户目录外会给 ACL warning；但还不是 Keychain / Credential Locker / libsecret。
- 插件 provider secret：`touch-translation` 已迁入 `usePluginSecret()`，普通 `providers_config` 会剥离 legacy secret；但 CoreApp `secure-store` 仍需系统 backend 与 degraded health evidence。
- 插件 shell capability：`touch-workspace-scripts` 仍以 `spawn(..., { shell: true })` 跑用户配置命令，虽然有确认弹窗和 unsafe pattern 拦截，但应进入统一 platform/permission/audit capability 模型。
- 动态执行边界：widget sandbox 仍使用 `new Function` 执行 widget runtime code；这是功能边界，不是普通假实现，但需要持续靠 sandbox facade、权限与审计约束。
- 日志出口：CoreApp main 已明显收敛，但 renderer、Nexus 和部分插件仍有裸 `console.*`。这不是 release blocker，但属于不优雅运行时模式，适合分批迁入 scoped logger。

## 4. 架构健壮性

当前 SRP 风险仍集中在大文件，而不是某个单点兼容错误：

| 文件 | 当前行数 | 主要风险 |
| --- | ---: | --- |
| `apps/nexus/server/utils/tuffIntelligenceLabService.ts` | 4021 | provider routing、usage ledger、tool execution、serialization 混合 |
| `apps/core-app/src/main/modules/plugin/plugin-module.ts` | 3810 | lifecycle、runtime repair、surface wiring、registry sync 混合 |
| `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` | 3821 | scanner、index runtime、watcher、thumbnail、diagnostics 混合 |
| `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` | 3384 | source scanner、launch resolver、metadata、diagnostics 混合 |
| `apps/nexus/app/pages/docs/[...slug].vue` | 2850 | fetch state、TOC、assistant、render helper 混合 |
| `packages/utils/transport/events/index.ts` | 2743 | 事件定义聚合过大，后续 domain shard 更稳 |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | 2488 | provider orchestration、merge/ranking、telemetry 混合 |

建议继续走小切片：只移动纯 helper / mapper / service，不在同批修改业务语义。

## 5. 文档与计划同步结论

活跃文档应更新为：

- 当前基线：`2.4.10-beta.25`。
- `2.4.10` 下一步只认 Windows acceptance plan/evidence/final gate 与 Nexus Release Evidence。
- `2.4.11` 第一优先级：AI 占位退场、secret/credential backend、插件 shell capability 诊断、runtime console/dynamic execution 边界、SRP 小切片。
- 旧 guard / registry / allowlist 文件已不再是 live SoT。若后续要恢复自动治理，应重新立项，不能继续在主入口引用不存在的脚本或清册。

## 6. 本轮验证与限制

已执行：

- 读取 2026-05-13 / 2026-05-14 兼容报告与 CoreApp compatibility scan。
- 静态扫描平台分支、系统命令、secret/localStorage、placeholder/fake/mock/stub、raw console、`new Function`、`shell:true`。
- 核对 `package.json`、`apps/core-app/package.json`、Windows acceptance scripts 与平台能力实现。
- 核对当前治理脚本与已退场清册文件是否仍存在。

未执行：

- 未运行完整 `pnpm quality:release`。
- 未执行 Windows/macOS/Linux 真机验证。
- 未写入 Nexus Release Evidence。
- 未执行 git commit / push。
