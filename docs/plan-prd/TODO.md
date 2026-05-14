# Tuff TODO

> 更新时间：2026-05-14
> 定位：当前 2 周执行清单。历史完整清单已归档到 `docs/plan-prd/docs/archive/TODO-pre-compression-2026-05-14.md`；长期债务见 `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`。

## 当前执行窗口

- 当前基线：`2.4.10-beta.22`。
- 当前主线：`2.4.10` 聚焦 Windows App 索引、Windows 应用启动体验、基础 legacy/compat 收口与 release evidence。
- 下一版本门槛：`2.4.11` 关闭或显式降权剩余 legacy/compat/size 债务，补齐 Windows/macOS 阻塞级回归；Linux 保持 documented best-effort。
- 执行约束：PR lint 已收敛为 changed-file lint，但 `quality:release` 仍保留全仓 lint；Windows 真机 evidence 与 Nexus Release Evidence 未闭环前，不宣称正式 `2.4.10` gate 通过；`2.5.0` AI/Provider 高级策略不得抢占当前 release gate。

## P0 - 2.4.10 Release Blockers

| ID | 事项 | 状态 | 验收/证据 |
| --- | --- | --- | --- |
| P0-WIN-PLAN | 生成 Windows acceptance collection plan | 待执行 | 在 Windows 真机执行 `pnpm -C "apps/core-app" run windows:acceptance:template -- --writeManualEvidenceTemplates --writeCollectionPlan`，产出 manifest、manual evidence templates 与 collection plan。 |
| P0-WIN-CASE | 补齐 Windows case/manual evidence | 待执行 | 覆盖 capability evidence、Everything target probe、App Index diagnostic、common app launch、copied app path、本地启动区索引、应用索引管理页手动条目、UWP/Store、Steam、update install、DivisionBox detached widget、time-aware recommendation。 |
| P0-WIN-PERF | 补齐性能 evidence | 待执行 | `search-trace` 真实查询 `200` 样本生成 `search-trace-stats/v1`；执行 `clipboard:stress` `120000ms` 并用 `clipboard:stress:verify --strict` 复核。 |
| P0-WIN-VERIFY | Windows final gate | 待执行 | 执行 `pnpm -C "apps/core-app" run windows:acceptance:verify`；case evidence、manual evidence、performance evidence 均非空、非占位且 gate 通过。 |
| P0-REL-EVIDENCE | 写入 Nexus Release Evidence | 阻塞中 | 需要 `release:evidence` API key 或管理员登录态；写入 documentation review、platform matrix、CoreApp targeted tests、Windows 真机 evidence 与性能 evidence。凭证缺失时保持 blocked。 |
| P0-FILE-PROVIDER | 恢复 FileProvider 编译边界 | 已恢复 | `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 已恢复到完整 `fileProvider` 导出；`pnpm -C "apps/core-app" run typecheck:node` 已通过。仍需按发版节奏补文件搜索最近路径验证。 |
| P0-QUALITY | 发版前最小质量复核 | 未完成 | 至少复跑 `git diff --check`、`pnpm quality:release` 或最近路径替代命令。当前 `typecheck:node` 已恢复通过；CoreApp 仍有既有 lint debt（restricted global、renderer console、raw IPC guard 等）。 |

## P1 - 2.4.11 必须收口

| ID | 事项 | 状态 | 验收/证据 |
| --- | --- | --- | --- |
| P1-COMPAT | legacy/compat/size 债务关闭或降权 | 进行中 | 清册内 `2.4.11` 项关闭或记录降权理由；禁止新增 legacy/raw channel/旧 storage protocol/旧 SDK bypass。 |
| P1-PLATFORM | Windows/macOS 阻塞级人工回归 | 待执行 | Windows/macOS 完成 release-blocking 手工回归；Linux 仅记录 best-effort smoke 与桌面环境限制。 |
| P1-AI-COMPAT | AI 兼容占位成功响应退场 | 待执行 | `livechat/random`、prompt detail、catch-all 未实现接口改为明确 HTTP status、`unavailable + reason` 或迁移目标。 |
| P1-SECRET | CLI 与插件 secret storage 收口 | 进行中 | CLI token 已通过 `CliCredentialStore` 做 POSIX `0700/0600` 权限缓解与 Windows ACL warning；`touch-translation` provider secret 已迁入 `usePluginSecret()` 并清理普通配置，配置弹窗已展示 secure-store available/degraded/unavailable health；插件侧已新增只读 `plugin.secret.health()` / `usePluginSecret().health()` 以暴露 secure-store degraded/unavailable 状态。仍需 OS Keychain/Credential Locker/libsecret backend 与遗留 secret 清理 evidence。 |
| P1-SHELL-CAP | 插件 shell capability 统一诊断 | 待执行 | 系统动作、快捷动作、窗口管理、workspace scripts 等能力暴露 platform/permission/unsupported reason 与审计字段。 |
| P1-TRANSPORT | Transport Wave A retained aliases 继续收口 | 进行中 | 已完成 sync/terminal/opener/auth/CoreBox UI、beginner shortcut、input focus、ui resume、forward key event、input command、input visibility/value request、input monitoring、clipboard allow、provider management、recommendation、preview history/copy、action panel、MetaOverlay bridge、layout control、uiMode enter/exit 等 alias 迁移切片；继续按 canonical event + legacy alias registry + dual listen 策略推进，禁止改变 wire name 语义。 |
| P1-STARTUP | CoreApp 启动异步化补证 | 进行中 | P0/P1/P2/P3 代码切片已推进；仍需真实设备冷/热启动 benchmark、WAL/health 长尾与 UI 观感证据。 |

## P2 - 近期推进但不阻塞 2.4.10

| ID | 事项 | 状态 | 验收/证据 |
| --- | --- | --- | --- |
| P2-AI-250 | Tuff 2.5.0 AI 桌面入口 | 进行中 | CoreBox AI Ask 与 OmniPanel Writing Tools MVP 已落地；继续 Workflow `Use Model` 节点、完整 Review Queue 与 3 个 P0 模板。Stable 只承诺文本 + OCR。 |
| P2-PROVIDER | Nexus Provider Registry / Scene 编排 | 进行中 | 已有 D1 secure store、Scene run、Dashboard dry-run/execute、AI mirror、health/usage ledger 与最小策略路由；后续补旧 `intelligence_providers` 表退场、user-scope OCR 自动绑定、success rate/配额/dynamic pricingRef。 |
| P2-NATIVE | Native transport V1 真机 smoke | 待执行 | 补 macOS 屏幕录制授权、Windows 多屏、Linux X11/Wayland best-effort；打包预览确认 `sharp` 与 ffmpeg/ffprobe 可执行。 |
| P2-QUICK-LAUNCH | Quick Launch 真机验收 | 待执行 | macOS/Windows/Linux 验证默认浏览器打开、`network.internet` 授权/拒绝、suggestion 超时降级、URL 打开与网页搜索互不抢占。 |
| P2-PUBLISHER | 插件发布管理端到端证据 | 进行中 | CoreApp `/store/publisher` 与 Nexus assets/API key 流程已接入；补 package policy/security scan 与真实 `.tpex` 上传端到端证据。 |

## 已完成/历史不再重复开发

- `2.4.10-beta.22` beta notes 与 tag-push pre-release 准备已完成；真实 commit/push/tag 仍需用户确认。
- Widget production precompile gate 已完成。
- CoreApp 启动异步化 P0/P1/P2/P3 主要代码切片已完成，剩余为真机补证。
- Quick Launch 搜索引擎模式、补全隔离、图标与旧结果清理已完成。
- 插件禁用后 CoreBox push items 门禁已完成。
- 2.4.8 OmniPanel Gate、v2.4.7 Gate A/B/C/D/E、2.4.9 插件完善主线为 historical done。

## 长期债务入口

长尾事项统一维护在 `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`，包括：Transport MessagePort 高频通道、AI lint/typecheck 存量债务、SRP 大文件拆分、AttachUIView/Multi Attach View、Widget Sandbox、Flow Transfer、DivisionBox、Build Signature、Nexus 支付与 TuffEx docs/build 门禁等。

## 文档同步规则

行为/接口/架构/目标变化时至少同步以下入口之一；目标或质量门禁变化时同时同步 Roadmap 与 Quality Baseline：

- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
