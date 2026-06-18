# Tuff QuickOps：本地系统快捷工具集 PRD

> 状态：Proposal / Roadmap
> 更新时间：2026-06-19
> 推荐命名：`Tuff QuickOps`
> 中文名：本地系统快捷工具集
> 范围：CoreApp 内置、CoreBox 可触发、Local-first、跨平台可降级的高频小工具能力

## 0. 当前实现切片（2026-06-19）

已落地：

- QuickOps Developer P0/P1 能力先进入 `packages/utils/core-box/preview` 的 PreviewSDK：`QuickOpsDeveloperAbility` 支持 JSON 格式化 / 压缩 / 校验、URL 编解码、Base64 编解码、JWT 解码、Regex 受限测试、Markdown/CSV 表格转换、时间戳转换、日期 / 固定 UTC offset 时区转换、静态离线货币估算、UUID v4 / 短 ID 生成和大小写 / 命名风格转换。
- CoreApp `PreviewProvider` 已注册该能力，并声明支持 Text / HTML 输入；CoreBox 可以用 `json`、`url encode`、`base64 decode`、`timestamp`、`timezone 2024-03-09T16:00:00Z UTC+08:00`、`uuid v4`、`case snake` 等命令触发。
- CoreApp `PreviewProvider` 会为包含 `primaryValue` 的 preview item 暴露 `preview-copy-primary` host copy action，Action Panel 可直接复制预览主结果；这只覆盖 PreviewSDK 主结果复制入口，不等同于全量 QuickOps host copy-action / Flow action / 企业策略闭环。
- 当 `json` / `base64 decode` 这类命令没有显式输入时，CoreApp PreviewProvider 会读取本地文本剪贴板作为默认输入；错误以 preview payload 的 warning / error label 返回，不把原始内容写入日志。
- PreviewSDK 默认 registry 已把更多 QuickOps no-result 边界纳入 benchmark：`uuid history` 不再被误识别为 UUID 生成，未知货币代码不会进入静态汇率估算，缺少 `/pattern/` 字面量的 `regex hello world` 不触发 Regex 预览；CoreApp 剪贴板兜底检测也复用同一命令边界，避免非命令输入触发剪贴板读取。
- CoreApp 新增 `QuickOpsProvider` 最小状态型入口，CoreBox 可搜索 `keep awake 30m` / `禁止息屏 1小时` / `extend keep awake 15m` / `延长保持唤醒 15分钟` / `prevent system sleep 30m` / `禁止系统睡眠 30分钟` / `timer 10m` / `计时 25分钟` / `pause timer` / `暂停计时` / `resume timer` / `继续计时` / `extend timer 5m` / `延长计时 5分钟` / `pomodoro` / `番茄钟` / `pomodoro cycle` / `循环番茄钟` / `pomodoro cycle 4 rounds 25m 5m` / `循环番茄钟 4轮 25分钟 5分钟` / `pomodoro 25/5` / `长番茄钟` / `pomodoro custom 40/8` / `自定义番茄钟 45/10` / 设置中的自定义番茄钟模板名称或别名 / `pause pomodoro` / `暂停番茄钟` / `resume pomodoro` / `继续番茄钟` / `clean screen` / `清洁屏幕` / `白底清洁屏幕` / `stop clean screen` / `退出清洁屏幕` / `stopwatch` / `秒表` / `秒表分段`，并支持运行中会话查询、暂停、恢复、延长、停止、快速计时器到点通知、番茄钟 25/5 与 50/10 内置模板、命令式自定义专注/休息模板、设置驱动的自定义模板列表 schema / 别名解析、专注/休息循环、1-12 轮有限循环与阶段到点通知、清洁屏幕黑/白底全屏遮罩、秒表分段和到期自动清理。
- QuickOps Network 只读查询已接入 CoreBox：`local ip` / `本机 IP` 使用 Node `networkInterfaces()` 展示非 internal IPv4 / IPv6、网卡名与复制动作；`port 3000` / `端口 3000` 使用 Node TCP bind 探测本地端口可用 / 已占用状态，占用时 best-effort 通过 macOS/Linux `lsof` 或 Windows PowerShell `Get-NetTCPConnection` 追加 PID / 进程归因并提供复制动作，若已解析 PID，会额外提供 copy-only 终止命令（macOS/Linux `kill <pid>`、Windows `Stop-Process -Id <pid>`），但不直接执行 kill；`dns example.com` / `DNS 查询 example.com` 使用 Node DNS resolver 查询 A / AAAA / CNAME / MX 记录，`deep dns example.com` / `深度 DNS 查询 example.com` 追加 NS / TXT / SOA 记录并提供复制动作；`network status` / `网络状态` 汇总非 internal 本机地址、系统 DNS server 列表和 `HTTP(S)_PROXY` / `ALL_PROXY` / `NO_PROXY` 环境变量代理状态，代理 URL 凭据会脱敏；`proxy status` / `system proxy` / `系统代理` 只读读取 macOS `scutil --proxy`、Windows 当前用户 Internet Settings 与 Linux GNOME proxy mode，并复制脱敏系统代理摘要，探测失败时返回 degraded/fallback 摘要且不外联；`public ip` / `公网 IP` 默认关闭，只有用户在高级设置显式开启 `allowPublicIpLookup` 后才向 `https://api.ipify.org?format=json` 发起一次只读 GET，并在结果中标注来源。无可展示网卡、无效端口、端口不可绑定、非法域名、无可用 DNS 记录、系统代理探测失败、公网 IP 外部服务失败或返回非法地址时返回 degraded notification；真实公网外部服务、真实 kill / 二次确认 UI、真实平台网卡 / 端口归因 / DNS / 系统代理 evidence 仍后置。
- QuickOps Files 打开常用目录已接入 CoreBox：`open desktop` / `打开桌面`、`open downloads` / `打开下载`、`open documents` / `打开文档`、`open app data` / `打开应用数据`、`open logs` / `打开日志` 返回目录 open action 与复制路径动作；真实系统打开端到端 evidence 后置。
- QuickOps Files 本地只读文件 Hash 已接入 CoreBox：`hash "/path/to/file"` 支持单个普通文件 MD5 / SHA1 / SHA256 计算与复制动作；`文件 hash` + Files input 支持单文件或多文件 MD5 / SHA1 / SHA256 摘要复制；`file base64 "/path/to/file"` / `文件 base64` + Files input 支持 1MB 以内单文件 Base64 编码复制和多文件 Base64 摘要复制；`base64 decode file <payload>` / `base64 解码文件 <payload>` 支持把 1MB 以内 Base64 payload 解码到 Tuff 临时目录新文件，并返回打开所在文件夹与复制路径动作；目标不存在、目录、权限不足、读取失败、Base64 非法、写入失败或任一文件超过上限时返回 degraded notification，不输出部分成功摘要；文件搜索结果项已追加 Hash/Base64 execute 动作，分别复制 MD5 / SHA1 / SHA256 摘要和 1MB 上限内 Base64 内容。真实平台权限 / 大文件 / 解码写入 evidence 后置。
- QuickOps Files 复制路径格式已接入 CoreBox：`copy path "/path/to/file"` / `复制文件路径` + Files input 支持原始路径、Shell 转义路径、file URL、Windows 路径转 WSL `/mnt/<drive>/...` 与 WSL `/mnt/<drive>/...` 转 Windows 路径复制动作；文件搜索结果项已追加同一组路径 copy-only 动作，不改变原有 open file 主动作。
- QuickOps Files 临时工作区已接入 CoreBox：`scratch note` / `临时文本` 会在 `app.getPath('temp')/tuff-quickops` 下创建 `.txt` scratch note，支持命令尾随内容、64KB 上限、打开与复制路径动作；`temp dir` / `临时目录` 会在同一临时根目录下创建安全命名目录，支持打开与复制路径动作；写入权限不足、内容超限或创建失败时返回 degraded notification，不写入用户目录。
- QuickOps System 脱敏诊断信息复制已接入 CoreBox：`tuff diagnostics` / `复制诊断信息` 返回 schema version、版本、平台、OS、Node/Electron runtime、CPU/内存/uptime 摘要、脱敏 Home/userData/logs 路径、网络地址/DNS/proxy 计数和 QuickOps 默认参数摘要；不读取日志、不复制完整配置、不包含原始 Home 路径或代理凭据。
- QuickOps System 系统信息复制已接入 CoreBox：`system info` / `系统信息` 返回 OS type/release、platform/arch、CPU 型号/核心数、总内存/可用内存、uptime 与 load average；不读取敏感路径、不外联、不触碰系统状态。
- QuickOps System 磁盘空间与关键目录占用复制已接入 CoreBox：`disk space` / `磁盘空间` 使用 Node `statfs()` 只读汇总 Home 与 Tuff userData 所在文件系统的 free/used/total 和使用率，路径做 Home 脱敏；`directory usage` / `目录占用` 对 Desktop / Downloads / Documents / Tuff userData / Logs 做 bounded shallow scan，只统计每个目录首批直接子项的文件数、目录数、其他条目数与直接文件大小；`deep directory usage` / `深度目录占用` 对同一组关键目录执行 bounded recursive scan（深度 3、每目录 200 项、总 1000 项），复制递归文件大小和条目统计；读取失败返回 degraded notification。真实平台目录权限 evidence 后置。
- QuickOps System 电池状态已接入 CoreBox：`battery status` / `电池状态` 在 macOS 使用 `pmset -g batt`、Windows 使用 PowerShell/CIM、Linux 使用 `/sys/class/power_supply` 只读读取电量、充电状态和来源；不支持平台、无电池或读取失败时返回 degraded notification。低电量提示策略已接入主动查询触发的 20% 以下未充电系统提醒；真实平台 evidence 后置。
- `QuickOpsSessionManager` 已从 provider 中拆出到 `apps/core-app/src/main/modules/box-tool/addon/quick-ops/quick-ops-session-manager.ts`，集中管理 power blocker、倒计时、番茄钟、秒表、清洁屏幕 overlay、会话清理与 session change 订阅；`QuickOpsProvider` 聚焦 query parsing 与 CoreBox item 构建。
- `QuickOpsModule` 已接入 CoreApp 模块加载链路，作为 QuickOps 生命周期壳托管共享 provider/runtime，并在 module stop/destroy 时清理运行中会话；SearchEngine 仍只负责注册搜索 provider。
- 托盘菜单已接入首版 QuickOps 状态：无运行会话时显示 idle 项；有运行会话时显示运行数量、每个会话的运行/暂停状态与剩余/已用时，并提供“停止全部 QuickOps 会话”动作。
- `AppSetting.quickOps` 已补默认偏好字段，QuickOpsProvider 会只读解析全局启用开关、CoreBox 运行中状态展示开关、默认保持唤醒/系统睡眠阻止/计时器/番茄钟/休息/清洁屏幕时长、25/5 与 50/10 内置番茄钟模板启用状态、自定义番茄钟模板列表、清洁屏幕默认黑/白底，以及公网 IP 查询 opt-in 开关；设置页已提供对应默认偏好、内置番茄钟模板开关、高级设置中的公网 IP 查询开关和自定义模板摘要入口，并有 renderer focused test 覆盖控件可见性、非法旧配置归一化、模板开关保留、自定义模板归一化和高级设置可见性。
- 显示器保持唤醒首版使用 Electron `powerSaveBlocker.start('prevent-display-sleep')`；系统睡眠阻止使用 `powerSaveBlocker.start('prevent-app-suspension')`；停止或到期时调用 `powerSaveBlocker.stop()`，不修改系统电源计划。
- 清洁屏幕首版使用 Electron `BrowserWindow` 为每个 display 创建本地 `data:` 全屏遮罩窗口，默认 60 秒后自动退出，支持黑/白底、长按 Esc 退出、CoreBox 停止项、窗口关闭、provider deactivate/destroy 清理；当前不读取屏幕内容、不上传数据、不持久化配置。
- `SearchEngineCore.destroy()` 已清理已注册 provider，`QuickOpsProvider.onDestroy()` 会停止所有运行中 session；当前已有 regression test 覆盖 SearchEngine destroy 触发 provider cleanup。
- 已通过 `packages/utils` PreviewSDK focused test 与 CoreApp PreviewProvider focused test 覆盖命令输入、剪贴板输入、URL/Base64/JSON/JWT 解码/Regex 受限测试/Markdown/CSV 表格转换/时间戳/日期与固定 UTC offset 时区转换/静态离线货币估算/UUID v4/短 ID/大小写转换结果和 provider input passthrough；CoreApp 仍保留 Nexus / cache-backed 实时汇率 adapter，不把静态 fallback 等同于实时汇率完成。
- 已通过 CoreApp QuickOpsProvider focused test 覆盖保持唤醒动作生成、默认偏好解析、全局启用开关、运行中状态展示开关、延长会话、系统睡眠阻止、powerSaveBlocker 启停、到期清理、计时器会话、计时器暂停/恢复/延长、番茄钟首个专注段开始/查询/暂停/恢复/停止/通知、循环番茄钟专注到休息再回到下一轮专注的状态转换、有限轮数循环最终专注段完成后停止、每 N 轮长休息策略和有限循环最终轮不追加休息、25/5 与 50/10 内置模板解析、内置模板启用开关解析、`pomodoro custom 40/8` / `自定义番茄钟 45/10` 命令式自定义模板解析、设置驱动自定义模板名称/别名解析、禁用模板 fallback 与无效模板忽略、清洁屏幕黑/白底 overlay 创建/查询/停止/到期/销毁清理、overlay data URL 视觉合同（黑/白底、倒计时提示、隐藏光标、长按 Esc 退出、无外链资源）、秒表开始/暂停/继续/分段/重置、本机 IP 查询、无非 internal 网卡地址 degraded 结果、公网 IP 默认关闭不外联、显式开启后复制查询结果、外部服务失败和非法地址 degraded 结果、本地端口可用 / 已占用 / 无效端口探测、占用端口 PID / 进程归因与归因失败 fallback、网络状态地址/DNS server/环境变量代理摘要和空地址/空 DNS 摘要、macOS/Windows/Linux 系统代理只读探测、系统代理凭据脱敏和探测失败 degraded fallback、打开常用目录 open/copy action 与 appData/logs 映射、单文件 Hash 路径命令、Files input 单文件、多文件 Files input 摘要、缺失文件/目录/多文件任一非法路径 degraded 结果、复制路径格式路径命令、Files input、Windows/WSL 路径互转与无目标 degraded 结果、脱敏诊断信息复制且不泄露原始 Home 路径/完整配置、系统信息复制且不泄露原始 Home 路径、磁盘空间复制且不泄露原始 Home 路径和读取失败 degraded 结果、电池状态 macOS 输出、Windows/Linux 解析、无电池 degraded 结果、低电量未充电通知策略和充电/健康电量不通知、停止项和计时器到点通知；file provider utils focused test 覆盖文件搜索结果路径 copy-only actions、file URL 与 Windows/WSL 路径互转；SettingTools QuickOps renderer test 覆盖默认偏好设置入口、内置番茄钟模板开关、公网 IP 高级设置开关、非法旧配置归一化、自定义模板归一化/高级摘要和高级设置显示；QuickOpsModule focused test 覆盖模块 stop/destroy 清理共享 runtime；TrayManager focused test 覆盖托盘 idle 状态、运行中会话摘要与停止全部动作。

未落地：

- 清洁屏幕真实视觉截图/录屏 evidence、番茄钟联动保持唤醒等更复杂组合策略、packaged app quit 证据等 v1.0 完整状态型验收项仍按 Phase 1 继续推进。
- 公网 IP 真实外部服务 evidence、真实端口 kill、QuickOps Dashboard、Flow / AI action adapter、企业策略与高风险确认 UI 仍未进入实现。

## 1. 命名结论

推荐产品名：**Tuff QuickOps**。

命名含义：

- `Quick`：强调从 CoreBox、托盘、快捷面板一键触发，符合 Tuff “搜索 + 执行”的核心体验。
- `Ops`：代表本地操作、系统动作、自动化动作，不局限于开发运维语义。
- `Tuff QuickOps` 可自然扩展为 `QuickOps Tool`、`QuickOps Session`、`QuickOps Flow Action` 与 `QuickOps SDK`。

对外表达建议：

```text
Tuff QuickOps：从 CoreBox 一键触发的本地系统快捷工具集。
```

内部模块建议：

```text
quick-ops
QuickOpsModule
QuickOpsRegistry
QuickOpsRuntime
```

## 2. 产品定位

Tuff QuickOps 是 CoreApp 随应用内置的一组本地系统快捷工具，不依赖用户安装插件，默认覆盖高频、轻量、安全可控的日常操作。

目标不是做“大而全系统管家”，而是提供一批：

- **高频**：禁止息屏、清洁屏幕、计时、格式化 JSON、时间戳转换等。
- **轻量**：一次触发即可完成，避免复杂配置。
- **本地优先**：默认不依赖云服务，不上传用户内容。
- **可搜索**：CoreBox 输入自然语言或关键词即可触发。
- **可状态化**：防息屏、计时器、番茄钟等工具能展示运行状态并手动停止。
- **可编排**：后续可被 Flow / AI 调用，组合成会议模式、专注模式、演示模式。
- **可回滚**：涉及系统状态修改的能力必须能恢复，应用退出时自动清理。

## 3. 非目标

首版明确不做以下方向：

- 不做系统清理大师、杀毒、驱动管理、注册表优化等高风险能力。
- 不默认 kill 进程、批量删除文件、批量重命名或修改系统长期设置。
- 不绕过 Windows / macOS / Linux 的平台权限模型。
- 不把剪贴板、文件内容、网络请求内容写入日志或同步载荷。
- 不用 fake success 掩盖平台不支持；必须返回明确 unsupported / degraded reason。
- 不为了跨平台一致性降低目标能力；无法实现时展示降级原因和替代入口。

## 4. 典型场景

| 场景 | 用户意图 | QuickOps 响应 |
| --- | --- | --- |
| 演示 / 会议 | “不要让电脑黑屏 1 小时” | 开启保持唤醒，显示剩余时间，结束后自动恢复 |
| 屏幕清洁 | “我要擦屏幕” | 打开全屏清洁遮罩，禁用误触，倒计时或长按退出 |
| 专注工作 | “开始 25 分钟番茄钟” | 启动计时，可联动保持唤醒和提醒 |
| 开发调试 | “格式化剪贴板 JSON” | 读取剪贴板，校验并格式化，失败展示 parse error |
| 时间换算 | “把 1710000000 转成本地时间” | 展示本地时间、UTC、ISO，并支持复制 |
| 网络排查 | “查 3000 端口是谁占用” | 展示进程信息；结束进程作为后续确认型能力 |
| 演示准备 | “进入演示模式” | 后续组合：保持唤醒 + 勿扰 + 计时 + 隐藏敏感通知 |

## 5. 功能地图

### 5.1 电源与屏幕类

| 功能 | 优先级 | 平台 | 说明 |
| --- | --- | --- | --- |
| 禁止息屏 | P0 | Windows / macOS / Linux | 防止屏幕关闭，类似 Caffeine |
| 禁止系统睡眠 | P0 | Windows / macOS / Linux | 防止系统进入睡眠，适合下载、会议、长任务 |
| 临时保持唤醒 | P0 | Windows / macOS / Linux | 15m / 30m / 1h / 自定义，默认必须有超时 |
| 取消保持唤醒 | P0 | Windows / macOS / Linux | 停止当前 QuickOps 唤醒会话 |
| 屏幕清洁模式 | P0 | Windows / macOS / Linux | Electron 全屏遮罩，支持黑/白底、倒计时、长按 Esc 退出 |
| 立即锁屏 | P1 | Windows / macOS / Linux | 低风险系统调用，但需清晰区分锁屏 / 睡眠 / 关屏 |
| 立即关闭屏幕 | P1 | Windows / macOS / Linux | 只关闭显示器，不进入睡眠；平台差异较大 |
| 屏幕纯色 / 坏点测试 | P1 | Windows / macOS / Linux | 清洁屏幕能力延展，适合屏幕维护 |

### 5.2 时间与专注类

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
| 快速计时器 | P0 | CoreBox 输入 `计时 10 分钟` / `timer 25m` 直接启动 |
| 秒表 | P0 | 开始、暂停、复位、分段记录 |
| 番茄钟 | P0 | 25/5、50/10 内置模板和设置页开关已支持，命令式自定义模板、自定义模板列表 schema / 别名解析、1-12 轮有限循环，以及 `long break` / `长休息` 每 N 轮（2-12）触发的 1-60 分钟长休息策略已支持；联动保持唤醒等复杂组合策略后续补齐 |
| 到点提醒 | P0 | 系统通知 + 可选声音，支持延长 5 分钟 |
| 计时悬浮窗 | P1 | 小型 always-on-top 窗口展示剩余时间 |
| 休息提醒 | P1 | 每隔 N 分钟提醒站立、喝水、护眼 |
| 会议计时 | P1 | 30/45/60 分钟模板，结束前提醒 |
| 专注模式 | P2 | 番茄钟 + 保持唤醒 + 勿扰 + 状态提示的组合能力 |

### 5.3 剪贴板与文本类

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
| JSON 格式化 / 压缩 | P0 | 默认读取剪贴板，支持格式化、压缩、校验和错误定位 |
| URL 编码 / 解码 | P0 | 支持选中文本、剪贴板或 CoreBox 输入 |
| Base64 编码 / 解码 | P0 | 文本 Base64 已进入 PreviewSDK；文件 Base64 已支持 1MB 内单文件编码复制、多文件摘要复制和 1MB 内 Base64 解码到临时文件 |
| 时间戳 / 日期 / 时区转换 | P0 | 时间戳秒 / 毫秒、Unix / ISO / 本地时间互转已进入 PreviewSDK；日期命令支持本地时间、UTC 与固定 `UTC±HH[:MM]` offset 转换，不包含 IANA 地区名或夏令时规则 |
| 货币估算 | P1 | 静态离线 fallback 已进入 PreviewSDK，适合快速估算；CoreApp 仍保留 Nexus / cache-backed 实时汇率 adapter，不把静态结果当作实时行情 |
| UUID 生成 | P1 | UUID v4 与短 ID 已进入 PreviewSDK 展示；短 ID 支持 4-32 位 URL-safe 本地随机字符串；Preview 主结果已暴露复制动作 |
| 纯文本粘贴 | P1 | 清除富文本格式，适合跨应用粘贴 |
| 清空剪贴板 | P1 | 一键清除敏感内容，属于状态修改类，需要明确提示 |
| 大小写转换 | P1 | upper/lower/camelCase/snake_case/kebab-case 已进入 PreviewSDK |
| Markdown 表格整理 | P2 | 已进入 PreviewSDK；支持 Markdown 表格对齐、CSV 转 Markdown、Markdown 转 CSV，限制 100 行 / 20 列 |
| JWT 解码 | P2 | 已进入 PreviewSDK；仅本地解码 header/payload，不做签名验证、不接收密钥 |
| Regex 测试 | P2 | 已进入 PreviewSDK；仅本地 JS RegExp 受限测试，限制 pattern/target 长度、最多展示 20 个 match，并拒绝明显回溯风险 pattern |

### 5.4 文件与路径类

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
| 打开常用目录 | P1 | Desktop / Downloads / Documents / App Data / Logs 已接入 CoreBox open/copy action；真实系统打开 evidence 后置 |
| 文件 Hash / Base64 | P1 | Hash 已接入本地只读 MD5 / SHA1 / SHA256，支持单文件路径命令、Files input 单文件、多文件摘要和文件搜索结果 execute 动作；Base64 已接入 1MB 内单文件编码复制、多文件摘要、临时文件解码落盘和文件搜索结果 execute 动作 |
| 复制文件路径 | P1 | 已接入原始路径、Shell 转义路径、file URL 和 Windows/WSL 路径互转；文件搜索结果路径 copy-only 动作已接入 |
| 新建临时文本文件 | P2 | 已接入 `scratch note` / `临时文本`；仅写入 Tuff 临时目录，支持 64KB 内容上限、打开和复制路径动作 |
| 创建临时目录 | P2 | 已接入 `temp dir` / `临时目录`；仅写入 Tuff 临时目录，目录名会做安全清理，支持打开和复制路径动作 |
| 最近下载文件 | P2 | 打开、复制路径、移动到指定目录 |
| 清理空目录 / 批量重命名 | P3 | 高风险，后置且必须确认 |

### 5.5 网络与开发者类

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
| 本机 IP 查询 | P1 | 已接入本地只读查询；展示 IPv4 / IPv6 / 网卡名，一键复制 |
| 公网 IP 查询 | P1 | 已接入默认关闭的 opt-in 查询；高级设置开启后向 `https://api.ipify.org?format=json` 发起只读 GET 并标注来源；真实外部服务 evidence 后置 |
| 端口可用性探测 | P1 | 已接入本地只读 TCP bind 探测；`port 3000` / `端口 3000` 展示可用 / 已占用，占用时 best-effort 展示 PID / 进程归因，并提供 copy-only 终止命令 |
| QR Code 生成 | P1 | 文本 / URL 生成二维码，本地渲染 |
| DNS 查询 | P2 | 已接入本地只读 A / AAAA / CNAME / MX 查询；`deep dns example.com` / `深度 DNS 查询 example.com` 已追加 NS / TXT / SOA 记录；真实平台 DNS evidence 后置 |
| Ping 工具 | P2 | 简单连通性测试，不替代专业网络工具 |
| HTTP 快速请求 | P2 | 轻量 GET/POST，敏感 header 不落日志 |
| 端口释放辅助 | P3 | 已接入 copy-only 终止命令；真正 kill 进程仍后置且必须二次确认 |

### 5.6 窗口与桌面类

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
| 当前窗口置顶 | P2 | 平台权限和实现差异较大，先从 Tuff 自身窗口做起 |
| 取消全部置顶 | P2 | 恢复 QuickOps 设置过的窗口状态 |
| 窗口居中 / 左右分屏 | P2 | 类 Raycast window management，需平台能力验证 |
| 快速隐藏桌面 | P2 | 最小化窗口或显示桌面 |
| 演示模式 | P3 | 保持唤醒 + 勿扰 + 计时 + 隐藏敏感提示 |
| 获取当前窗口信息 | P3 | 给 Flow / AI 使用，涉及平台权限 |

### 5.7 声音、输入与设备类

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
| 静音 / 取消静音 | P2 | 系统音量控制，平台适配成本中等 |
| 音量设置 | P2 | 25% / 50% / 100% / 加减 10% |
| 白噪音 | P2 | 本地音频资源，可与番茄钟联动 |
| 麦克风静音 | P3 | 平台权限差异较大，后置 |
| 摄像头占用检测 | P3 | 后置能力 |
| 蓝牙 / 输入法切换 | P3 | 不建议首批，权限和平台差异复杂 |

### 5.8 系统状态与诊断类

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
| Tuff 诊断信息复制 | P1 | 已接入扩展脱敏诊断包，包含 schema、版本、平台/OS/runtime、CPU/内存/uptime、脱敏 Home/userData/logs、网络计数和 QuickOps 默认参数摘要；真实排障 evidence 后置 |
| 系统信息 | P1 | 已接入 OS type/release、platform/arch、CPU 型号/核心数、总内存/可用内存、运行时间和 load average |
| 磁盘空间 / 关键目录占用 | P1 | 已接入 Home 与 Tuff userData 所在文件系统 free/used/total 和使用率复制；已接入 Desktop / Downloads / Documents / Tuff Data / Logs 的 bounded shallow scan 与显式 deep bounded recursive scan |
| 电池状态 | P2 | 已接入 macOS/Windows/Linux 只读电量和充电状态查询；主动查询时低于 20% 且未充电会发系统提醒；真实平台 evidence 后置 |
| 网络状态 | P2 | 已接入非 internal 本机地址、系统 DNS server 列表、环境变量代理状态摘要和只读系统代理摘要；真实平台网卡 / 系统代理 evidence 后置 |

## 6. 功能风险分层

| 层级 | 定义 | 功能示例 | 默认策略 |
| --- | --- | --- | --- |
| Level 1：纯应用内工具 | 不触碰系统状态，无需权限 | 计时器、秒表、番茄钟、JSON、Base64、URL、UUID、时间戳、QR Code、清洁屏幕遮罩 | 默认开启 |
| Level 2：低风险系统调用 | 调用系统 API，但影响可控 | 禁止息屏、禁止系统睡眠、锁屏、打开目录、本机 IP、文件 Hash、系统通知 | 默认开启，失败展示 reason |
| Level 3：状态修改类工具 | 改变可感知系统状态，需要恢复 | 窗口置顶、音量调整、清空剪贴板、临时勿扰、隐藏桌面图标 | 状态可见，可一键停止 |
| Level 4：高风险工具 | 可能导致数据丢失或中断任务 | kill 端口进程、批量重命名、清理文件、修改长期系统设置 | 默认关闭，必须二次确认 |

## 7. v1 范围建议

### 7.1 QuickOps v1.0 MVP

首版建议控制在 12 个核心工具，覆盖日常办公、专注工作和开发者工具：

| 包 | 功能 | 验收重点 |
| --- | --- | --- |
| Power Tools | 禁止息屏、禁止系统睡眠、临时保持唤醒、取消保持唤醒 | 有剩余时间、有停止入口、退出自动清理、不可用时有 reason |
| Screen Tools | 屏幕清洁模式 | 全屏遮罩、黑/白底、倒计时、长按 Esc 退出 |
| Timer Tools | 快速计时器、秒表、番茄钟 | 支持暂停/恢复/停止，到点通知，状态可见 |
| Developer Tools | JSON 格式化、URL 编解码、Base64 编解码、时间戳转换 | 默认剪贴板输入，错误可读，不记录敏感内容 |

### 7.2 QuickOps v1.1 扩展

| 包 | 功能 |
| --- | --- |
| Developer Tools | UUID 生成、QR Code 生成、大小写转换 |
| Files Tools | 打开常用目录（Desktop / Downloads / Documents / App Data / Logs 已接入）、文件 Hash（单文件路径命令 / Files input 单文件 / Files input 多文件已接入）、文件 Base64（1MB 内单文件编码复制 / 多文件摘要复制 / 临时文件解码落盘已接入）、复制路径格式（原始路径 / Shell 路径 / file URL / Windows-WSL 互转已接入，文件搜索结果路径动作已接入）、临时文本文件与临时目录（Tuff 临时目录内创建已接入） |
| Network Tools | 本机 IP（已接入）、公网 IP（默认关闭 opt-in 查询已接入；真实外部服务 evidence 后置）、端口可用性探测（含占用 PID / 进程归因，已接入）、DNS 查询（A / AAAA / CNAME / MX 已接入；深度 NS / TXT / SOA 已接入）、网络状态摘要（地址 / DNS server / 环境变量代理已接入）、系统代理状态（macOS/Windows/Linux 只读探测已接入） |
| System Tools | 立即锁屏、Tuff 诊断信息复制（脱敏摘要已接入）、系统信息复制（OS/CPU/内存/运行时间/load average 已接入）、磁盘空间复制（Home/userData 文件系统容量已接入）、关键目录占用（Desktop / Downloads / Documents / Tuff Data / Logs bounded shallow/deep scan 已接入）、电池状态（电量/充电状态已接入） |
| UX | 托盘运行状态、计时悬浮窗、最近使用、常用工具固定 |

### 7.3 QuickOps v2 高级组合

| 模式 | 组合动作 |
| --- | --- |
| 会议模式 | 保持唤醒 + 会议计时 + 结束前提醒 + 可选勿扰 |
| 专注模式 | 番茄钟 + 保持唤醒 + 休息提醒 + 白噪音 |
| 演示模式 | 保持唤醒 + 隐藏敏感通知 + 计时 + 桌面清理提示 |
| 开发调试模式 | 打开项目目录 + 查询端口 + 本机 IP + 计时 |
| 屏幕维护模式 | 清洁屏幕 + 纯色测试 + 坏点测试 |

## 8. CoreBox 交互

CoreBox 是 QuickOps 的第一入口，而不是把首版做成复杂控制台。

输入示例：

```text
禁止息屏
keep awake
caffeine 1h
计时 25 分钟
timer 10m
清洁屏幕
json
base64 decode
timestamp
port 3000
```

结果展示示例：

```text
禁止息屏 1 小时
QuickOps · 防止屏幕关闭，1 小时后自动恢复
```

```text
开始 25 分钟计时
QuickOps Timer · 到点后发送系统通知
```

```text
JSON 格式化
QuickOps Developer · 使用剪贴板内容格式化
```

状态型工具应在 CoreBox 中提供二级操作：

- 停止保持唤醒
- 延长 15 分钟
- 暂停 / 继续计时器
- 停止番茄钟
- 打开 QuickOps 设置

## 9. 状态入口

### 9.1 托盘菜单

托盘显示正在运行的 QuickOps session：

```text
Tuff
- QuickOps
  - 保持唤醒中：剩余 42 分钟
  - 当前计时器：12:30
  - 番茄钟：专注中 18:20
  - 停止全部 QuickOps 会话
- 打开 CoreBox
- 设置
```

### 9.2 Dashboard / Tools 页面

后续可以提供 `QuickOps` 页面，分组展示：

- Power
- Screen
- Timer
- Clipboard
- Developer
- Files
- Network
- Window
- System

页面能力：

- 搜索工具
- 固定常用工具
- 最近使用
- 当前运行中 session
- 平台不可用工具置灰并展示原因
- 默认参数配置

## 10. 技术架构建议

建议在 CoreApp 主进程新增独立模块：

```text
apps/core-app/src/main/modules/quick-ops/
├── quick-ops-module.ts
├── registry.ts
├── runtime.ts
├── session-manager.ts
├── settings.ts
├── types.ts
├── tools/
│   ├── power/
│   ├── screen/
│   ├── timer/
│   ├── clipboard/
│   ├── developer/
│   ├── files/
│   ├── network/
│   ├── window/
│   └── system/
└── platform/
    ├── windows.ts
    ├── macos.ts
    └── linux.ts
```

核心抽象：

```ts
interface QuickOp {
  id: string
  title: string
  description: string
  category: QuickOpCategory
  keywords: string[]
  platforms: QuickOpPlatformSupport
  riskLevel: 'safe' | 'stateful' | 'confirm' | 'danger'
  inputSchema?: QuickOpInputSchema
  execute(input: QuickOpInput, context: QuickOpContext): Promise<QuickOpResult>
}

interface QuickOpSession {
  id: string
  toolId: string
  title: string
  startedAt: number
  expiresAt?: number
  state: 'running' | 'paused' | 'stopping' | 'stopped' | 'failed'
  stop(reason?: string): Promise<void>
  extend?(durationMs: number): Promise<void>
}
```

模块职责：

| 模块 | 职责 |
| --- | --- |
| `QuickOpsRegistry` | 注册工具、平台过滤、关键词搜索、能力描述 |
| `QuickOpsRuntime` | 执行工具、错误归一化、风险确认、日志脱敏 |
| `QuickOpsSessionManager` | 管理保持唤醒、计时器、番茄钟、白噪音等长运行状态 |
| `QuickOpsSettings` | 启用开关、默认时长、风险确认、托盘状态配置 |
| `QuickOpsCoreBoxProvider` | 把工具和运行中 session 暴露为 CoreBox 搜索结果 |
| `QuickOpsFlowAdapter` | 后续把 QuickOps 暴露为 Flow Action |

## 11. 跨平台实现方向

### 11.1 Windows 保持唤醒

优先目标：使用稳定 native helper 调用 Windows API：

- `SetThreadExecutionState`
- `ES_CONTINUOUS`
- `ES_SYSTEM_REQUIRED`
- `ES_DISPLAY_REQUIRED`

短期可评估 PowerShell / `powercfg`，但不应永久修改用户电源计划；若必须修改配置，必须记录原值并恢复。

### 11.2 macOS 保持唤醒

可使用系统命令：

```bash
caffeinate -d
caffeinate -i
caffeinate -t 3600
```

Tuff 需要管理子进程生命周期：

- 启动时保存 pid。
- 停止时终止对应子进程。
- 应用退出时清理。
- 子进程异常退出时更新 session 状态。

### 11.3 Linux 保持唤醒

按能力探测顺序降级：

1. `systemd-inhibit`
2. `gnome-session-inhibit`
3. `xdg-screensaver`
4. `xset`
5. 桌面环境特定 fallback

Linux 不假设桌面环境一致；每个 backend 必须返回明确 capability 和 degraded reason。

### 11.4 屏幕清洁模式

优先用 Electron 实现，不依赖系统 API：

- 创建全屏 overlay window。
- 默认黑色背景，可切换白色 / 灰色 / 纯色测试。
- 禁用普通点击触发退出，避免误触。
- 支持倒计时退出或长按 Esc 退出。
- 多显示器可选择当前屏 / 全部屏幕。

### 11.5 计时与开发者工具

- 计时器、秒表、番茄钟：应用内 runtime 管理，不依赖系统定时器。
- JSON / Base64 / URL / 时间戳：优先纯 TypeScript 实现。
- 剪贴板读取：走 Electron clipboard API，敏感内容不写日志。
- 通知：走系统 notification，失败时降级为 Tuff 内部提示。

## 12. 安全与可靠性规则

1. 所有状态型系统操作必须可停止、可恢复、可观测。
2. 保持唤醒默认必须带超时，避免永久改变系统行为。
3. 应用退出、窗口崩溃或模块销毁时必须清理 QuickOps session。
4. 平台能力不可用必须展示 unsupported / degraded reason，禁止 fake success。
5. 高风险操作必须确认，且默认不进入 v1.0。
6. 命令调用禁止拼接未转义用户输入，优先参数化执行。
7. 剪贴板、token、路径、网络请求 header 等敏感信息不得进入日志。
8. 端口 kill、文件清理、批量重命名等破坏性能力不进入首批。
9. 每个工具必须能被禁用，适配企业环境策略。
10. 运行中状态必须统一展示，避免用户不知道 Tuff 正在改变系统行为。
11. Linux / macOS / Windows 差异必须通过 capability 检测表达，不用兼容空实现冒充支持。
12. Flow / AI 调用 QuickOps 时必须复用同一风险确认和权限模型。

## 13. 配置设计

建议配置模型：

```ts
interface QuickOpsSettings {
  enabled: boolean
  enabledTools: Record<string, boolean>
  defaultKeepAwakeDurationMinutes: number
  defaultSystemAwakeDurationMinutes: number
  defaultTimerDurationMinutes: number
  defaultTimerExtendMinutes: number
  defaultPomodoroFocusMinutes: number
  defaultPomodoroBreakMinutes: number
  defaultScreenCleanDurationSeconds: number
  defaultScreenCleanMode: 'black' | 'white'
  defaultTimerNotificationSound: boolean
  showTrayStatus: boolean
  showRunningSessionsInCoreBox: boolean
  allowNetworkTools: boolean
  requireConfirmForStatefulTools: boolean
  requireConfirmForDangerTools: boolean
  cleanScreenExitMode: 'hold-esc' | 'countdown' | 'both'
}
```

默认建议：

- QuickOps 默认开启。
- 高风险工具默认关闭。
- 保持唤醒默认 60 分钟。
- 系统睡眠阻止默认 60 分钟。
- 计时器默认 25 分钟，延长默认 5 分钟。
- 番茄钟默认 25/5。
- 清洁屏幕默认 60 秒、黑底。
- 托盘状态默认开启。
- 网络工具可单独关闭。
- 清洁屏幕默认长按 Esc 退出，并显示低干扰提示。

## 14. Flow / AI 编排方向

QuickOps 后续应成为 Flow 的本地动作库。

建议 Flow Action：

- `quickOps.keepAwake`
- `quickOps.stopKeepAwake`
- `quickOps.startTimer`
- `quickOps.startPomodoro`
- `quickOps.cleanScreen`
- `quickOps.showNotification`
- `quickOps.copyToClipboard`
- `quickOps.formatText`
- `quickOps.openFolder`
- `quickOps.queryLocalIp`

AI 自然语言示例：

```text
我要开会 1 小时
```

解析结果：

1. 保持唤醒 1 小时。
2. 启动会议计时器。
3. 结束前 5 分钟提醒。
4. 可选开启勿扰。

## 15. Roadmap

### Phase 0：产品与架构定稿

- 锁定命名：`Tuff QuickOps`。
- 确认 v1.0 MVP 与 v1.1 扩展边界。
- 明确风险分层与确认策略。
- 明确跨平台 capability / degraded reason 合同。

### Phase 1：基础框架与 v1.0 MVP

目标：打通注册、搜索、执行、状态管理和最小 UI。

- `QuickOpsModule`
- `QuickOpsRegistry`
- `QuickOpsRuntime`
- `QuickOpsSessionManager`
- CoreBox provider
- 保持唤醒 / 取消保持唤醒
- 屏幕清洁模式
- 快速计时器 / 秒表 / 番茄钟
- JSON / URL / Base64 / JWT 解码 / Regex 受限测试 / Markdown/CSV 表格转换 / 时间戳 / 日期与固定 UTC offset 时区转换 / 静态离线货币估算 / UUID v4 / 短 ID / 大小写转换

### Phase 2：状态可视化与设置

目标：让用户明确知道 QuickOps 正在运行。

- 托盘状态显示
- 计时器悬浮窗
- 运行中 session 列表
- 工具设置页
- 最近使用
- 常用工具固定
- 应用退出自动恢复验证

### Phase 3：文件、网络与开发者扩展

- UUID v4 与短 ID 已进入 PreviewSDK；Preview 主结果复制动作已接入
- 日期 / 固定 UTC offset 时区转换已进入 PreviewSDK；仅做本地纯转换，不包含 IANA 地区名或夏令时规则
- 静态离线货币估算已进入 PreviewSDK；实时汇率 / Nexus / cache-backed adapter 仍保留在 CoreApp 路径
- QR Code
- 本机 IP 已接入；公网 IP 默认关闭 opt-in 查询已接入，真实外部服务 evidence 后置
- 端口可用性探测已接入；占用时 PID / 进程归因和 copy-only 终止命令已接入；真正 kill / 二次确认 UI 后置
- DNS 查询已接入 A / AAAA / CNAME / MX 只读查询，深度 DNS 查询已追加 NS / TXT / SOA；真实平台 DNS evidence 后置
- 系统代理状态已接入环境变量、macOS `scutil --proxy`、Windows 当前用户 Internet Settings 与 Linux GNOME proxy mode 只读摘要；真实平台系统代理 evidence 后置
- 打开常用目录已接入 Desktop / Downloads / Documents / App Data / Logs；真实系统打开 evidence 后置
- 文件 Hash 已接入单文件路径命令、Files input 单文件、Files input 多文件只读摘要与文件搜索结果 execute 动作；文件 Base64 已接入 1MB 内单文件编码复制、多文件摘要复制、临时文件解码落盘与文件搜索结果 execute 动作；临时文本文件与临时目录已接入 Tuff 临时目录内创建；真实平台写入 evidence 后置
- 复制路径格式已接入原始路径 / Shell 路径 / file URL / Windows-WSL 互转；文件搜索结果路径 copy-only 动作已接入
- Tuff 诊断信息复制已接入扩展脱敏诊断包；真实排障 evidence 后置

### Phase 4：窗口、设备与组合模式

- 当前窗口置顶
- 窗口居中 / 左右分屏
- 音量控制
- 白噪音
- 会议模式
- 专注模式
- 演示模式
- 屏幕维护模式

### Phase 5：Flow / AI / SDK 化

- QuickOps Flow Action
- AI 自然语言触发
- 插件可查询 QuickOps capability
- 企业策略控制工具启用状态
- Nexus 文档与开发者示例

## 16. 验收清单

### v1.0 功能验收

- [ ] CoreBox 能搜索并执行 v1.0 QuickOps 工具。部分完成：Developer P0 已经 PreviewSDK 接入；显示器保持唤醒、系统睡眠阻止、快速计时器、秒表、清洁屏幕黑/白底 overlay、托盘运行状态和停止全部动作、默认偏好只读解析与设置页编辑入口、本机 IP 查询、端口可用性探测、打开常用目录、单文件 Hash、单文件 / 多文件 Base64 编码复制、Base64 临时文件解码落盘、复制路径格式与 Windows/WSL 路径互转、Tuff 脱敏诊断信息复制、系统信息、磁盘空间、关键目录占用、番茄钟首个专注段、循环专注/休息、1-12 轮有限循环、每 N 轮长休息、25/5、50/10 内置模板、内置模板设置页开关、命令式自定义模板和设置驱动自定义模板名称/别名解析已接入；番茄钟联动保持唤醒等复杂组合策略仍待实现。
- [x] 保持唤醒支持开始、查询、延长、停止、到期自动恢复。
- [x] 系统睡眠阻止支持开始、查询、停止、到期自动恢复。
- [ ] 应用退出时能清理保持唤醒子进程或 native session。部分完成：Provider deactivate/destroy 会 stopAll，`QuickOpsModule` stop/destroy 会清理共享 runtime，SearchEngine destroy regression 已覆盖 provider cleanup；仍需 packaged app quit 证据。
- [ ] 屏幕清洁模式支持全屏、倒计时、长按退出。部分完成：首版已支持多 display 全屏遮罩、黑/白底、默认倒计时、长按 Esc 退出、停止项、到期、provider destroy 清理、托盘状态、默认黑/白底偏好读取与设置页编辑入口；overlay data URL 视觉合同已由 focused test 覆盖黑/白底、倒计时提示、隐藏光标、长按 Esc 和无外链资源；设置页回归 test 已覆盖 QuickOps 默认偏好控件与归一化；真实视觉截图/录屏 evidence 仍待补齐。
- [ ] 计时器、秒表、番茄钟支持暂停、恢复、停止和通知。部分完成：快速计时器已支持开始、查询、暂停、恢复、延长 5 分钟、停止、到点系统通知和到期清理；秒表已支持开始、查询、暂停、恢复、分段、重置；番茄钟已支持首个专注段开始、查询、暂停、恢复、停止、到点系统通知、到期清理、循环模式下专注段/休息段自动轮换、有限轮数循环最终完成通知、每 N 轮长休息、25/5、50/10 内置模板、内置模板设置页开关、命令式自定义模板和设置驱动自定义模板名称/别名解析；联动保持唤醒等复杂组合策略仍待实现。
- [x] JSON / URL / Base64 / JWT 解码 / Regex 受限测试 / Markdown/CSV 表格转换 / 时间戳 / 日期与固定 UTC offset 时区转换 / 静态离线货币估算 / UUID v4 / 短 ID / 大小写转换工具能处理 CoreBox 文本输入；文本剪贴板输入可作为需要输入的命令默认输入并返回可读错误，Preview 主结果可通过 host copy action 复制；日期 / 时区转换仅支持固定 UTC offset，不包含 IANA 地区名或夏令时规则；静态货币估算不代表实时汇率；JWT 仅解码 header/payload 且明确不验证签名；Regex 仅本地测试且有长度、match 数量和复杂度保护；Markdown/CSV 表格转换仅处理本地文本并限制表格大小。

### 平台验收

- [ ] Windows / macOS / Linux 都有 capability 检测结果。
- [ ] 不支持的平台或缺失命令会展示 degraded reason。
- [ ] 本机 IP 查询已有 Node `networkInterfaces()` mock 覆盖正常网卡与无非 internal 地址 degraded 结果；仍需真实平台网卡 evidence。
- [ ] 端口可用性探测已有 Node TCP bind focused test 覆盖可用、已占用和非法端口，并覆盖占用端口 PID / 进程归因、copy-only 终止命令与归因失败 fallback；仍需真实平台端口 / 防火墙 / 权限 / 归因 evidence。
- [ ] DNS 查询已有 Node DNS promises focused test 覆盖 A / AAAA / CNAME / MX 成功、深度 NS / TXT / SOA 成功、无记录 degraded、URL/中文命令解析和非法 hostname；仍需真实平台 DNS evidence。
- [ ] 系统代理状态已有 focused test 覆盖 macOS `scutil --proxy`、Windows 当前用户 Internet Settings、Linux GNOME proxy mode fallback、凭据脱敏和探测失败 degraded；仍需真实平台系统代理 evidence。
- [ ] 文件 Hash 已有 focused test 覆盖显式路径、Files input 单文件、多文件 Files input 摘要、缺失文件、目录、多文件任一非法路径 degraded 结果和文件搜索结果 execute action；仍需真实平台文件权限 / 大文件 evidence 与真实文件搜索结果动作 evidence。
- [ ] 文件 Base64 已有 focused test 覆盖显式路径、单个 Files input、多文件 Files input 摘要、Base64 解码到临时文件、非法 Base64 degraded、缺失文件、目录、多文件任一非法路径 degraded、1MB 编码/解码上限和文件搜索结果 execute action；仍需真实平台权限 / 大文件 / 解码写入 evidence 与真实文件搜索结果动作 evidence。
- [ ] 复制路径格式已有 focused test 覆盖显式路径、Files input、Windows/WSL 路径互转、无目标 degraded 结果和文件搜索结果路径 copy-only actions；仍需真实文件搜索结果动作 evidence。
- [ ] 打开常用目录已有 focused test 覆盖 Downloads open/copy action、App Data 与 Logs 路径映射；仍需真实系统打开 evidence。
- [ ] Tuff 诊断信息复制已有 focused test 覆盖 schema、版本/runtime、OS/CPU/内存/uptime、网络计数、脱敏路径、QuickOps 摘要和安全声明，且不复制原始 Home 路径、代理凭据或完整配置；真实排障 evidence 后置。
- [ ] 关键目录占用已有 focused test 覆盖 Desktop / Downloads / Documents / Tuff Data / Logs bounded shallow scan、显式 deep bounded recursive scan、Home 路径脱敏和权限失败 degraded；真实平台目录权限 evidence 后置。
- [ ] Windows 保持唤醒不永久污染电源计划。
- [ ] macOS `caffeinate` 子进程可被可靠清理。
- [ ] Linux backend 有明确探测顺序和 fallback 结果。

### 安全验收

- [ ] 敏感剪贴板内容不进入日志。
- [ ] 高风险工具默认不启用。
- [ ] 状态型工具都有停止入口。
- [ ] Flow / AI 调用复用同一确认模型。
- [ ] 无 legacy raw channel / SDK bypass。

### 文档验收

- [ ] PRD、README/INDEX 入口保持一致。
- [ ] 后续实现影响行为 / 接口 / 架构时同步 TODO、CHANGES 或 Roadmap。
- [ ] Nexus docs 在能力稳定后补用户指南与开发者说明。

## 17. 开放问题

1. Windows v1 是否直接上 native helper，还是先用短期命令方案验证体验？
2. Linux 是否把 `systemd-inhibit` 作为唯一 P0 backend，其他桌面环境作为 P1 fallback？
3. 屏幕清洁模式默认覆盖当前屏幕还是全部显示器？
4. 番茄钟是否在 v1.0 就联动保持唤醒，还是先只做独立计时？
5. 公网 IP 查询默认关闭已落地；是否需要企业策略统一禁止或审计外联查询？
6. QuickOps Dashboard 是否进入 v1.0，还是 v1.0 只做 CoreBox + 托盘状态？

## 18. 关联入口

- `docs/plan-prd/02-architecture/platform-capabilities-prd.md`
- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md`
- `docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
