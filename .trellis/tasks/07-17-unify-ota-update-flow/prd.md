# 统一 OTA 更新链路

## Goal

建立一条可解释、可验证、可恢复的桌面 OTA 更新链路：统一版本发现、渠道选择、下载状态、安全校验与用户提示；各平台只保留一条明确的安装交付路径，不再把“下载安装包”和“应用内重启更新”混为同一种能力。

## Confirmed Background

- CoreApp 默认启用更新、每天检查、自动下载；默认不在下载完成后自动接管安装，Release/Beta/Snapshot 渠道、30 分钟缓存、条件请求、限频与失败退避已存在。
- 启动后约 5 秒执行首次检查，后续由轮询服务按设置频率检查；默认更新源是 Nexus Releases。
- 当前安装存在两套路径：macOS 打包产物中存在 `app-update.yml` 时走 `electron-updater`；否则与 Windows/Linux 一样走 DownloadCenter + `UpdateSystem`。
- 通用路径在 Windows 启动 NSIS 安装器，在 macOS 通过脚本替换当前 `.app`，在 Linux 仅打开已下载包。三平台最终交付语义并不一致。
- macOS 基础 builder 配置目前是 `dir` + `arm64`；release workflow 使用 `BUILD_PUBLISH=never`，清理步骤只保留 dmg/zip，会删除 updater metadata。当前配置尚未形成可证明可用的 `electron-updater` 元数据发布闭环。
- 发布流水线已要求每个 CoreApp 资产具备 SHA-256、detached signature 与唯一 manifest 映射；CoreApp 包内也固定了 release signing 公钥。
- 运行时对“签名存在但验证失败”已 fail closed，但“签名 URL 缺失”默认仍只告警并继续安装，除非额外设置 `TUFF_UPDATE_REQUIRE_SIGNATURE=true`；这与当前发布门禁不一致。
- 现有发布阻断任务明确不改 OTA 业务运行时，因此本任务独立规划。
## Requirements

### R1 — 单一状态机与平台能力声明

- 检查、可用、下载中、待安装、安装交接、失败与恢复必须共享同一状态模型。
- 第一阶段采用“平台原生可靠交付”：统一检查、状态、安全、下载和提示，但不自研跨平台静默安装器。
- Windows 交付已验证的 NSIS 并由系统安装器接管；Linux 打开已验证的 AppImage/deb 并提供明确引导；macOS 只在实际能力满足时展示“重启更新”。
- macOS 继续采用 `macos-apply-update.sh` 自替换：只有 SHA-256 与 pinned detached signature 全部通过后才允许退出并替换 `.app`；UI 与诊断从 typed build verification status 投影 native trust，官方 attested package 为 `pass`，缺失/失败为 `unverified`。
- 每个平台只能选择一条生效的安装路径；UI 必须按实际能力描述“重启更新”“启动安装器”或“打开安装包”，禁止虚假承诺。

### R2 — 发布契约与运行时安全一致

- Runtime 必须以已验证 manifest 选择当前 `platform/arch` 的唯一 CoreApp 资产。
- CoreApp 安装前必须同时通过 SHA-256 与包内固定公钥的 detached signature；缺失、错配或验签失败一律禁止安装。
- 运行时不得把网络下载的公钥作为信任根。

### R3 — 保留现有版本发现能力

- 官方更新发现采用 Nexus 主用、GitHub Releases 自动回退；两条来源必须输出同一标准化 release/manifest/asset contract，不得让 renderer 或安装层感知来源差异。
- 只有 Nexus 网络不可达、超时、限频或服务端故障时才允许 GitHub 回退；Nexus 的有效“无更新”、渠道约束、撤回/禁用结果不得被回退绕过。
- GitHub 回退必须继续要求官方仓库、已验证 manifest、唯一平台资产、SHA-256 与 pinned detached signature；不能降级到仅凭文件名或 TLS 选择资产。
- 保留 Release/Beta/Snapshot 渠道、缓存、条件请求、限频、失败退避、忽略版本与手动强制检查能力；两来源缓存必须按 source/channel 隔离。
- 第一阶段只支持普通可忽略更新，保留 `ignoredVersions`；不新增最低版本门禁、强制更新或灰度分桶。
- 自动检查或下载失败不得阻塞应用启动。

### R4 — 可恢复的下载与安装交接

- 已完成下载必须在重启后可恢复识别；过期版本与失效文件必须可清理。
- 自动检查与自动下载保持默认开启；验证完成后进入“待安装”，同时提供“立即安装”。若用户未立即安装，则仅在用户主动触发的正常退出、业务状态已落盘后自动执行安装交接。
- 提供跨平台 `installOnNormalQuit` 设置并默认开启；用户关闭后不再在普通退出时自动交接，只保留“立即安装”。该设置替代当前仅 Windows 的 `autoInstallDownloadedUpdates` 语义，不保留双开关。
- 崩溃、强制终止、系统关机/重启或启动尚未稳定时不得触发自动安装；退出原因必须可区分、可审计。
- 安装交接失败不得误报为已开始安装；只有平台接管已确认后才记录交接成功，失败时保留可重试状态和可定位错误。
- macOS 自替换必须保留事务式 backup/restore；现有脚本已具备替换失败时恢复旧 `.app` 的基础能力，后续设计需明确备份生命周期与新版本启动后的清理时机。
- 三平台统一“恢复契约”而非承诺原子无交互回滚：共同定义新版本首启健康确认、上一版已验证资产保留、失败状态、恢复入口、防回滚循环与数据迁移兼容；macOS helper 可自动恢复，Windows/Linux 尽量启动上一版原生安装流程，但允许 UAC、包管理器或用户确认。
- 本地始终只保留上一版已验证恢复资产：版本 N 健康运行后以 N-1 作为恢复目标；升级到 N+1 并健康确认后删除 N-1、改为保留 N，磁盘占用固定为一个历史全量包/应用备份。
- 允许自动安装/恢复的 release 必须保证持久化数据对 N-1 向后兼容；优先 additive migration，旧版本必须能安全读取或忽略新结构。破坏性 migration 必须在发布门禁中失败或把该 release 降级为明确的手动更新，禁止通过静默恢复旧 profile 丢弃用户变更。

### R5 — 可验证的跨平台交付

- 每个平台必须有与其实际安装策略匹配的发布资产、元数据和最小验收场景。
- 第一阶段固定支持现有 `win32/x64`、`darwin/arm64`、`linux/x64`；新增 Intel Mac、Windows ARM64 或 Linux arm64 不与本次 OTA 闭环绑定。
- 不能在 macOS 上仅凭静态资产推断 Windows/Linux 安装闭环成功。
## Acceptance Criteria

- [ ] **AC1 / R1** — `win32/x64`、`darwin/arm64`、`linux/x64` 各自只有一条生效安装路径，并准确展示“重启更新”“启动安装器”或“打开安装包”；第一阶段 macOS 不再根据 `app-update.yml` 隐式切换 `electron-updater`。
- [ ] **AC2 / R1-R4** — shared types、transport、main service、DownloadCenter 引用与 renderer 共同消费一个持久化 lifecycle snapshot；非法转换被拒绝，旧 revision 不能覆盖新状态。
- [ ] **AC3 / R2** — manifest 缺失/身份错配/pair 重复、SHA-256 缺失/不匹配、signature URL 缺失、包内固定公钥缺失或验签失败时，任何平台都不会进入待安装、触发安装或打开更新包。
- [ ] **AC4 / R2** — Runtime 不再接受网络公钥 fallback，也不再通过环境变量把签名验证从可选切换为强制；安装门禁默认且始终 fail closed。
- [ ] **AC5 / R3** — Nexus 正常结果具有权威性；仅网络不可达、超时、限频或 5xx 触发 GitHub fallback。GitHub fallback 仍要求官方仓库和完整 manifest/signature 契约，两来源缓存按 source/channel 隔离。
- [ ] **AC6 / R3** — Release/Beta/Snapshot、默认自动检查/自动下载、缓存、条件请求、限频、退避、忽略版本、手动强制检查与断网不阻塞启动行为保持可用。
- [ ] **AC7 / R4** — `installOnNormalQuit` 默认开启且可关闭；只有“立即安装”或用户主动正常退出能执行 handoff，崩溃、强制终止、系统关机/重启、重复实例与启动失败不会安装。
- [ ] **AC8 / R4** — 下载与待安装状态可跨重启恢复；平台接管未确认时不误报成功，版本过期、文件丢失、handoff 失败均有确定的清理或重试结果。
- [ ] **AC9 / R4** — 新版本完成 startup health 后轮换并只保留一个上一版本恢复资产；首启失败进入统一恢复契约，每个 attempt 最多自动恢复一次，Windows/Linux 所需 UAC/包管理器/用户确认被如实报告。
- [ ] **AC10 / R4** — 自动安装 release 通过 N/N-1 SQLite/config 向后兼容门禁；不兼容 release 不会通过恢复旧 profile 静默丢弃用户变更。
- [ ] **AC11 / R5** — workflow、Nexus、GitHub fallback 与 Runtime 使用同一 manifest/asset contract，并产出当前三组 platform/arch 所需的全量包与 signature sidecar。
- [ ] **AC12 / R5** — 三个平台分别完成真实宿主的检查、下载、验证、退出 handoff、startup health 与 recovery smoke；非宿主平台只标记 static-only。
## Constraints

- 不回退已落地的 Nexus manifest、SHA-256、detached signature 与包内固定信任根。
- Apple Developer 已成为官方 macOS release 强制门禁；renderer 不得从平台硬编码 trust，非官方或 attestation 验证失败必须 fail closed 为 `unverified`。
- SQLite 是 lifecycle 与恢复状态业务真源；helper marker 只承担跨进程协调，不得发展为第二状态库。
- clean cutover 旧字段和旧路径，不保留 `autoInstallDownloadedUpdates`、网络公钥 fallback 或 macOS 双 updater 兼容层。

## Out of Scope

- 增量/差分更新。
- 最低版本门禁、强制更新和灰度分桶。
- macOS Intel/universal、Windows ARM64、Linux arm64 等新增构建矩阵。
- renderer override、插件或 extension 更新。
- 生成或配置 Apple Developer / notarization 凭据；凭据完成后重新采用 `electron-updater` 需要独立规划。
