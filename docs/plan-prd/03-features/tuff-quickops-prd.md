# Tuff QuickOps：本地系统快捷工具集 PRD

> 状态：Proposal / Roadmap
> 更新时间：2026-06-19
> 推荐命名：`Tuff QuickOps`
> 中文名：本地系统快捷工具集
> 范围：CoreBox 入口已由官方 `plugins/touch-quickops` 插件承接；目标继续把可迁移业务逻辑抽离为 Local-first、跨平台可降级高频小工具能力，CoreApp 只保留必要 host capability、Flow confirmation、policy/evidence gate 与迁移期 typed bridge

## 0. 当前实现切片（2026-06-19）

已落地：

- QuickOps Developer P0/P1 能力先进入 `packages/utils/core-box/preview` 的 PreviewSDK：`QuickOpsDeveloperAbility` 支持 JSON 格式化 / 压缩 / 校验、URL 编解码、Base64 编解码、JWT 解码、Regex 受限测试、Markdown/CSV 表格转换、时间戳转换、日期 / 固定 UTC offset 时区转换、静态离线货币估算、UUID v4 / 短 ID 生成、QR Code SVG 生成和大小写 / 命名风格转换。
- CoreApp `PreviewProvider` 已注册该能力，并声明支持 Text / HTML 输入；CoreBox 可以用 `json`、`url encode`、`base64 decode`、`timestamp`、`timezone 2024-03-09T16:00:00Z UTC+08:00`、`uuid v4`、`qr code https://tuff.talex.app`、`case snake` 等命令触发。
- CoreApp `PreviewProvider` 会为包含 `primaryValue` 的 preview item 暴露 `preview-copy-primary` host copy action，Action Panel 可直接复制预览主结果；这只覆盖 PreviewSDK 主结果复制入口，不等同于全量 QuickOps host copy-action / Flow action / 企业策略闭环。
- 当 `json` / `base64 decode` 这类命令没有显式输入时，CoreApp PreviewProvider 会读取本地文本剪贴板作为默认输入；错误以 preview payload 的 warning / error label 返回，不把原始内容写入日志。
- PreviewSDK 默认 registry 已把更多 QuickOps no-result 边界纳入 benchmark：`uuid history` 不再被误识别为 UUID 生成，未知货币代码不会进入静态汇率估算，缺少 `/pattern/` 字面量的 `regex hello world` 不触发 Regex 预览；CoreApp 剪贴板兜底检测也复用同一命令边界，避免非命令输入触发剪贴板读取。
- 官方 `plugins/touch-quickops` 插件已承接 QuickOps CoreBox root-results 入口，CoreBox 可搜索 `keep awake 30m` / `禁止息屏 1小时` / `extend keep awake 15m` / `延长保持唤醒 15分钟` / `prevent system sleep 30m` / `禁止系统睡眠 30分钟` / `timer 10m` / `计时 25分钟` / `pause timer` / `暂停计时` / `resume timer` / `继续计时` / `extend timer 5m` / `延长计时 5分钟` / `pomodoro` / `番茄钟` / `pomodoro cycle` / `循环番茄钟` / `pomodoro cycle 4 rounds 25m 5m` / `循环番茄钟 4轮 25分钟 5分钟` / `pomodoro 25/5` / `长番茄钟` / `pomodoro custom 40/8` / `自定义番茄钟 45/10` / 设置中的自定义番茄钟模板名称或别名 / `pause pomodoro` / `暂停番茄钟` / `resume pomodoro` / `继续番茄钟` / `clean screen` / `清洁屏幕` / `白底清洁屏幕` / `red screen test` / `screen color test` / `蓝色屏幕测试` / `stop clean screen` / `退出清洁屏幕` / `stopwatch` / `秒表` / `秒表分段`，并通过 CoreApp `QuickOpsRuntimeHost` / Flow target 支持运行中会话查询、暂停、恢复、延长、停止、快速计时器到点通知、番茄钟 25/5 与 50/10 内置模板、命令式自定义专注/休息模板、设置驱动的自定义模板列表 schema / 别名解析、专注/休息循环、1-12 轮有限循环、阶段到点通知、会话级显示器保持唤醒联动、清洁屏幕黑/白底全屏遮罩、红/绿/蓝纯色屏幕测试遮罩、秒表分段和到期自动清理。
- QuickOps Network 只读查询已接入 CoreBox：`local ip` / `本机 IP` 使用 Node `networkInterfaces()` 展示非 internal IPv4 / IPv6、网卡名与复制动作；`port 3000` / `端口 3000` 使用 Node TCP bind 探测本地端口可用 / 已占用状态，占用时 best-effort 通过 macOS/Linux `lsof` 或 Windows PowerShell `Get-NetTCPConnection` 追加 PID / 进程归因并提供复制动作，若已解析 PID，会额外提供 copy-only 终止命令（macOS/Linux `kill <pid>`、Windows `Stop-Process -Id <pid>`），但不直接执行 kill；`dns example.com` / `DNS 查询 example.com` 使用 Node DNS resolver 查询 A / AAAA / CNAME / MX 记录，`deep dns example.com` / `深度 DNS 查询 example.com` 追加 NS / TXT / SOA 记录并提供复制动作；`network status` / `网络状态` 汇总非 internal 本机地址、系统 DNS server 列表和 `HTTP(S)_PROXY` / `ALL_PROXY` / `NO_PROXY` 环境变量代理状态，代理 URL 凭据会脱敏；`proxy status` / `system proxy` / `系统代理` 只读读取 macOS `scutil --proxy`、Windows 当前用户 Internet Settings 与 Linux GNOME proxy mode，并复制脱敏系统代理摘要，探测失败时返回 degraded/fallback 摘要且不外联；`public ip` / `公网 IP` 默认关闭，只有用户在高级设置显式开启 `allowPublicIpLookup` 后才向 `https://api.ipify.org?format=json` 发起一次只读 GET，并在结果中标注来源。无可展示网卡、无效端口、端口不可绑定、非法域名、无可用 DNS 记录、系统代理探测失败、公网 IP 外部服务失败或返回非法地址时返回 degraded notification；关闭本地 `allowNetworkTools` 策略时，上述网络类 CoreBox 命令统一返回 `network-tools-disabled-by-policy`，且公网 IP 查询即使开启 `allowPublicIpLookup` 也不会外联；真实公网外部服务、真实 kill / 二次确认 UI、真实平台网卡 / 端口归因 / DNS / 系统代理 evidence 仍后置。
- QuickOps Files 打开常用目录已接入 CoreBox：`open desktop` / `打开桌面`、`open downloads` / `打开下载`、`open documents` / `打开文档`、`open app data` / `打开应用数据`、`open logs` / `打开日志` 返回目录 open action 与复制路径动作；真实系统打开端到端 evidence 后置。
- QuickOps Files 最近下载文件已接入 CoreBox：`recent download` / `latest download` / `最近下载文件` 只读扫描 Downloads 首层普通文件，按修改时间返回最新文件的打开文件、打开所在文件夹和复制路径动作；`move recent download to "/target"` / `移动最近下载到 "/target"` 支持把最新下载普通文件移动到显式绝对目标目录，执行动作带危险确认，不覆盖同名文件且源文件必须仍位于 Downloads 目录内；空目录、无权限、目标缺失、目标非目录或目标已存在同名文件返回 degraded notification。真实系统打开 evidence 和真实平台移动 evidence 后置。
- QuickOps Files 本地只读文件 Hash 已接入 CoreBox：`hash "/path/to/file"` 支持单个普通文件 MD5 / SHA1 / SHA256 计算与复制动作；`文件 hash` + Files input 支持单文件或多文件 MD5 / SHA1 / SHA256 摘要复制；`file base64 "/path/to/file"` / `文件 base64` + Files input 支持 1MB 以内单文件 Base64 编码复制和多文件 Base64 摘要复制；`base64 decode file <payload>` / `base64 解码文件 <payload>` 支持把 1MB 以内 Base64 payload 解码到 Tuff 临时目录新文件，并返回打开所在文件夹与复制路径动作；目标不存在、目录、权限不足、读取失败、Base64 非法、写入失败或任一文件超过上限时返回 degraded notification，不输出部分成功摘要；文件搜索结果项已追加 Hash/Base64 execute 动作，分别复制 MD5 / SHA1 / SHA256 摘要和 1MB 上限内 Base64 内容。真实平台权限 / 大文件 / 解码写入 evidence 后置。
- QuickOps Files 复制路径格式已接入 CoreBox：`copy path "/path/to/file"` / `复制文件路径` + Files input 支持原始路径、Shell 转义路径、file URL、Windows 路径转 WSL `/mnt/<drive>/...` 与 WSL `/mnt/<drive>/...` 转 Windows 路径复制动作；文件搜索结果项已追加同一组路径 copy-only 动作，不改变原有 open file 主动作。
- QuickOps Files 临时工作区已接入 CoreBox：`scratch note` / `临时文本` 会在 `app.getPath('temp')/tuff-quickops` 下创建 `.txt` scratch note，支持命令尾随内容、64KB 上限、打开与复制路径动作；`temp dir` / `临时目录` 会在同一临时根目录下创建安全命名目录，支持打开与复制路径动作；写入权限不足、内容超限或创建失败时返回 degraded notification，不写入用户目录。
- CoreBox PreviewResultCard 已为 QuickOps QR payload 提供 SVG 图片预览；主结果仍是 SVG data URL，可通过现有 preview copy action 复制，并可通过 `preview-save-qr-svg` / `preview-save-qr-png` execute action 保存 SVG 或 PNG 到 `app.getPath('temp')/tuff-quickops` 临时目录后复制路径。当前 QR 生成限定本地 Byte mode、ECC-L、版本 1-9 和 230 bytes 输入上限。
- QuickOps System 脱敏诊断信息复制已接入 CoreBox：`tuff diagnostics` / `复制诊断信息` 返回 schema version、版本、平台、OS、Node/Electron runtime、CPU/内存/uptime 摘要、脱敏 Home/userData/logs 路径、网络地址/DNS/proxy 计数和 QuickOps 默认参数摘要；不读取日志、不复制完整配置、不包含原始 Home 路径或代理凭据。
- QuickOps System 系统信息复制已接入 CoreBox：`system info` / `系统信息` 返回 OS type/release、platform/arch、CPU 型号/核心数、总内存/可用内存、uptime 与 load average；不读取敏感路径、不外联、不触碰系统状态。
- QuickOps System 磁盘空间与关键目录占用复制已接入 CoreBox：`disk space` / `磁盘空间` 使用 Node `statfs()` 只读汇总 Home 与 Tuff userData 所在文件系统的 free/used/total 和使用率，路径做 Home 脱敏；`directory usage` / `目录占用` 对 Desktop / Downloads / Documents / Tuff userData / Logs 做 bounded shallow scan，只统计每个目录首批直接子项的文件数、目录数、其他条目数与直接文件大小；`deep directory usage` / `深度目录占用` 对同一组关键目录执行 bounded recursive scan（深度 3、每目录 200 项、总 1000 项），复制递归文件大小和条目统计；读取失败返回 degraded notification。真实平台目录权限 evidence 后置。
- QuickOps System 电池状态已接入 CoreBox：`battery status` / `电池状态` 在 macOS 使用 `pmset -g batt`、Windows 使用 PowerShell/CIM、Linux 使用 `/sys/class/power_supply` 只读读取电量、充电状态和来源；不支持平台、无电池或读取失败时返回 degraded notification。低电量提示策略已接入主动查询触发的 20% 以下未充电系统提醒；真实平台 evidence 后置。
- `QuickOpsSessionManager` 已从 legacy provider 中拆出到 `apps/core-app/src/main/modules/quick-ops/quick-ops-session-manager.ts`，集中管理 power blocker、倒计时、番茄钟、秒表、清洁屏幕 overlay、会话清理与 session change 订阅；CoreApp 当前仅通过 `apps/core-app/src/main/modules/quick-ops/quick-ops-runtime-host.ts` 暴露 runtime host boundary，旧 `box-tool/addon/quick-ops` 目录不再承载 QuickOps runtime。
- `QuickOpsModule` 已接入 CoreApp 模块加载链路，作为 QuickOps 生命周期壳托管共享 runtime、typed transport 和 Flow target，并在 `BEFORE_APP_QUIT` / `WILL_QUIT`、module stop/destroy 时清理运行中会话；SearchEngine 已不再默认注册 QuickOps CoreBox provider，CoreBox QuickOps 入口改由官方 `plugins/touch-quickops` root-results 插件承接。CoreApp 生产路径已改为 `QuickOpsRuntimeHost` / `quickOpsRuntime` host boundary，旧 `QuickOpsProvider` legacy CoreBox 搜索/执行兼容壳已移除。
- 托盘菜单已接入首版 QuickOps 状态：无运行会话时显示 idle 项；有运行会话时显示运行数量、每个会话的运行/暂停状态与剩余/已用时，并提供“停止全部 QuickOps 会话”动作。
- `AppSetting.quickOps` 已补默认偏好字段，`QuickOpsRuntimeHost` / capability helper 会只读解析全局启用开关、运行中状态展示开关、有状态工具本地策略开关、网络工具本地策略开关、文件工具本地策略开关、系统工具本地策略开关、开发者工具本地策略开关、高风险工具本地策略开关、默认保持唤醒/系统睡眠阻止/计时器/番茄钟/休息/清洁屏幕时长、25/5 与 50/10 内置番茄钟模板启用状态、自定义番茄钟模板列表、清洁屏幕默认黑/白底，以及公网 IP 查询 opt-in 开关；设置页已提供对应默认偏好、内置番茄钟模板开关、高级设置中的有状态工具策略开关、网络工具策略开关、文件工具策略开关、系统工具策略开关、开发者工具策略开关、高风险工具策略开关、公网 IP 查询开关和自定义模板摘要入口，并有 renderer focused test 覆盖控件可见性、非法旧配置归一化、模板开关保留、自定义模板归一化和高级设置可见性。
- QuickOps 已落地本地 `allowStatefulTools` 策略基线：默认开启以保持既有行为；关闭后 CoreBox 不再暴露保持唤醒、系统睡眠阻止、计时器/番茄钟/秒表、清洁屏幕、临时文本/目录写入和最近下载移动等会改变本机状态的工具，并在能力摘要中把 `stateful` / `confirm` 条目标记为 `disabled` + `stateful-tools-disabled-by-policy`；Flow 对同类内建 target fail-closed 返回 `quickops.policyBlocked`，只读 capability / sessions / diagnostics / system/network/file 查询仍保留。该切片是本地策略基线，不等同于完整企业策略下发、审计或真实 evidence。
- QuickOps 已落地本地 `allowNetworkTools` 策略基线：默认开启以保持既有行为；关闭后 CoreBox 不再暴露本机 IP、端口状态、DNS、网络状态、系统代理和公网 IP 查询，并在能力摘要中把 `quickops.network.local` / `quickops.network.publicIp` / `quickops.network.systemProxy` / `quickops.network.portKill` 标记为 `disabled` + `network-tools-disabled-by-policy`；Flow 对 `network-status`、`system-proxy`、`public-ip`、`query-local-ip`、`port-status` 和 `dns-query` 内建 target fail-closed 返回 `quickops.policyBlocked`。该切片是本地策略基线，不等同于完整企业策略下发、审计、组织级锁定或真实平台 evidence。
- QuickOps 已落地本地 `allowFileTools` 策略基线：默认开启以保持既有行为；关闭后 CoreBox 不再暴露文件 Hash、文件 Base64、Base64 解码到临时文件、路径格式、常用目录、最近下载、临时文本/目录和最近下载移动等 Files 工具，并在能力摘要中把 `quickops.files.readOnly` / `quickops.files.writeTemp` / `quickops.files.moveRecentDownload` 标记为 `disabled` + `file-tools-disabled-by-policy`；Flow 对 `file-hash`、`file-base64`、`recent-download`、`common-directory`、`path-format`、`temp-text-file`、`temp-directory` 和 `open-folder` 内建 target fail-closed 返回 `quickops.policyBlocked`。该切片是本地策略基线，不等同于完整企业策略下发、审计、组织级锁定或真实文件平台 evidence。
- QuickOps 已落地本地 `allowSystemTools` 策略基线：默认开启以保持既有行为；关闭后 CoreBox 不再暴露系统信息、Tuff 诊断、磁盘空间、目录占用和电池状态等 System 工具，并在能力摘要中把 `quickops.system.diagnostics` / `quickops.system.storage` / `quickops.system.battery` 标记为 `disabled` + `system-tools-disabled-by-policy`；Flow 对 `system-info`、`tuff-diagnostics`、`disk-space`、`directory-usage` 和 `battery-status` 内建 target fail-closed 返回 `quickops.policyBlocked`。该切片是本地策略基线，不等同于完整企业策略下发、审计、组织级锁定或真实系统平台 evidence。
- QuickOps 已落地本地 `allowDeveloperTools` 策略基线：默认开启以保持既有行为；关闭后 CoreApp PreviewProvider 会在调用 PreviewSDK 和读取剪贴板 fallback 之前阻断 `json`、URL/Base64/JWT/Regex/Markdown/CSV、时间戳/日期、UUID/短 ID、QR Code 和大小写转换等 QuickOps Developer 命令，返回 `developer-tools-disabled-by-policy`；能力摘要把 `quickops.developer.preview` 标记为 `disabled` + `developer-tools-disabled-by-policy`；Flow 对 `format-text` 内建 target fail-closed 返回 `quickops.policyBlocked`。该切片只覆盖 CoreBox PreviewProvider / PreviewSDK 开发者工具入口和现有 `format-text` Flow target，不等同于完整企业策略下发、审计、组织级锁定或完整 Flow / AI action adapter。
- QuickOps 已落地本地 `allowHighRiskTools` 策略基线：默认关闭；旧配置缺失或非法值会归一化为关闭；设置页高级开关只作为高风险能力总闸；能力摘要会把 `quickops.network.portKill` 等 `danger` 条目标记为 `disabled` + `high-risk-tools-disabled-by-policy`。即使本地策略显式开启，当前真实端口 kill 仍保持 `copy-only-command`，不开放执行 API；该切片只证明“高风险工具默认不启用”的本地策略基线，不等同于真实 kill、批量文件操作、长期系统设置修改、企业策略下发、审计、组织级锁定或真实高风险确认 evidence。
- QuickOps 已落地本地 Flow 审计摘要基线：`QuickOpsModule` 会把 Flow delivery 的 `targetId`、决策结果、策略阻断/降级 reason、是否需要确认、payload key 列表和时间戳写入仅内存 ring buffer；`QuickOpsEvents.audit.get`、`createQuickOpsSdk().auditRecent()`、插件 `quickOps.auditRecent()` / `plugin.quickOps.auditRecent()` 可只读获取最近摘要。审计记录不落盘、不写 SQLite、不保存 payload 内容或剪贴板/文件正文；该切片只覆盖本地最近 Flow delivery 可观测性，不等同于企业集中审计、组织级锁定、durable job history、真实 evidence 或完整 Flow / AI action adapter。
- Nexus QuickOps 用户文档与开发者文档已补：`apps/nexus/content/docs/guide/features/quickops.*.mdc` 覆盖 CoreBox 使用入口、常用命令、Ops 场景速查、Tools / QuickOps 设置、本地策略、安全边界、插件扩展边界、何时写插件和未完成项；`apps/nexus/content/docs/dev/api/quickops.*.mdc` 覆盖插件 `quickOps` 只读 facade、transport domain SDK、扩展路径选择、Flow 扩展模式、插件自有 Ops checklist、内置 QuickOps 贡献落点和扩展建议；Guide / Dev / API / Plugin Context 入口已接入对应链接与全局 `quickOps` 上下文说明。该文档切片不替代真实平台 evidence、packaged quit evidence、真实 AI UI 自然语言编排、高风险执行治理或企业集中策略 / 审计 / 组织级锁定。
- `plugins/touch-quickops` 官方迁移插件已新增：manifest 显式声明 `search.root-results` 与 root provider，并已收紧为显式 QuickOps / system / network / file / disk / diagnostics / session control 触发词；当前已承接 QuickOps CoreBox root-result 入口和结果渲染，包括 capability、sessions、auditRecent、system info、tuff diagnostics、disk space、directory usage / deep directory usage、network status、local ip、port status、DNS query、file hash、file Base64、recent download、common directory、path format、format text、battery status、system proxy，以及低风险状态控制入口 `stop-all-sessions`、`stop/pause/resume timer`、`stop/pause/resume pomodoro`、`stop clean screen`、`stop keep-awake`、`stop system-awake`、`pause/resume/lap/reset stopwatch`。只读结果通过 `globalThis.quickOps` 过渡 facade 取数；低风险状态控制通过注入的 `flow.dispatch()` 发送到已有 QuickOps Flow target；`keep-awake`、`system-awake`、`start timer`、`start pomodoro`、`clean-screen`、`start stopwatch`、`copy-to-clipboard`、`show-notification`、`open-folder`、`temp-text-file`、`temp-directory`、`public-ip` 等确认型动作只展示需要 App UI `confirmationToken` 的提示，不执行、不自行生成 token、不绕过 Flow confirmation，也不 fallback 到私有 IPC。CoreApp 保留 QuickOps runtime host、host capability、typed bridge、Flow confirmation 和 evidence gate；后续应继续把业务 runtime、session manager、settings/tray 入口、插件侧状态/诊断面板与可扩展编排逐步迁入官方插件或插件专属 runtime boundary。
- 显示器保持唤醒首版使用 Electron `powerSaveBlocker.start('prevent-display-sleep')`；番茄钟启动时也持有会话级 `prevent-display-sleep` blocker，手动停止、替换或自然完成时随番茄钟释放；系统睡眠阻止使用 `powerSaveBlocker.start('prevent-app-suspension')`；停止或到期时调用 `powerSaveBlocker.stop()`，不修改系统电源计划。
- 清洁屏幕 / 屏幕测试首版使用 Electron `BrowserWindow` 为每个 display 创建本地 `data:` 全屏遮罩窗口，默认 60 秒后自动退出，支持黑/白底、红/绿/蓝纯色测试、长按 Esc 退出、插件/Flow 停止入口、窗口关闭、runtime deactivate/destroy 清理；当前不读取屏幕内容、不上传数据、不持久化配置。
- `quickops capability` / `quickops 能力` 已接入 CoreBox 只读能力摘要，返回平台、QuickOps enabled 状态、supported/degraded/disabled 计数和能力条目（含 riskLevel 与 reason），可复制为文本；QuickOps 全局禁用时仍可查询诊断状态，但普通工具命令保持不可用。QuickOpsModule 同步暴露 `QuickOpsEvents.capabilities.get`、`QuickOpsEvents.sessions.get`、`QuickOpsEvents.audit.get`、`QuickOpsEvents.systemInfo.get`、`QuickOpsEvents.tuffDiagnostics.get`、`QuickOpsEvents.diskSpace.get`、`QuickOpsEvents.directoryUsage.get`、`QuickOpsEvents.queryLocalIp.get`、`QuickOpsEvents.portStatus.get`、`QuickOpsEvents.dnsQuery.get`、`QuickOpsEvents.fileHash.get`、`QuickOpsEvents.fileBase64.get`、`QuickOpsEvents.recentDownload.get`、`QuickOpsEvents.commonDirectory.get`、`QuickOpsEvents.pathFormat.get`、`QuickOpsEvents.formatText.get`、`QuickOpsEvents.networkStatus.get`、`QuickOpsEvents.batteryStatus.get` 与 `QuickOpsEvents.systemProxy.get` typed transport 只读事件，`packages/utils` 提供 `createQuickOpsSdk().capabilities()` / `createQuickOpsSdk().sessions()` / `createQuickOpsSdk().auditRecent()` / `createQuickOpsSdk().systemInfo()` / `createQuickOpsSdk().tuffDiagnostics()` / `createQuickOpsSdk().diskSpace()` / `createQuickOpsSdk().directoryUsage()` / `createQuickOpsSdk().queryLocalIp()` / `createQuickOpsSdk().portStatus()` / `createQuickOpsSdk().dnsQuery()` / `createQuickOpsSdk().fileHash()` / `createQuickOpsSdk().fileBase64()` / `createQuickOpsSdk().recentDownload()` / `createQuickOpsSdk().commonDirectory()` / `createQuickOpsSdk().pathFormat()` / `createQuickOpsSdk().formatText()` / `createQuickOpsSdk().networkStatus()` / `createQuickOpsSdk().batteryStatus()` / `createQuickOpsSdk().systemProxy()`，插件 SDK 暴露顶层 `quickOps.capabilities()` / `quickOps.sessions()` / `quickOps.auditRecent()` / `quickOps.systemInfo()` / `quickOps.tuffDiagnostics()` / `quickOps.diskSpace()` / `quickOps.directoryUsage()` / `quickOps.queryLocalIp()` / `quickOps.portStatus()` / `quickOps.dnsQuery()` / `quickOps.fileHash()` / `quickOps.fileBase64()` / `quickOps.recentDownload()` / `quickOps.commonDirectory()` / `quickOps.pathFormat()` / `quickOps.formatText()` / `quickOps.networkStatus()` / `quickOps.batteryStatus()` / `quickOps.systemProxy()` 与 `plugin.quickOps.capabilities()` / `plugin.quickOps.sessions()` / `plugin.quickOps.auditRecent()` / `plugin.quickOps.systemInfo()` / `plugin.quickOps.tuffDiagnostics()` / `plugin.quickOps.diskSpace()` / `plugin.quickOps.directoryUsage()` / `plugin.quickOps.queryLocalIp()` / `plugin.quickOps.portStatus()` / `plugin.quickOps.dnsQuery()` / `plugin.quickOps.fileHash()` / `plugin.quickOps.fileBase64()` / `plugin.quickOps.recentDownload()` / `plugin.quickOps.commonDirectory()` / `plugin.quickOps.pathFormat()` / `plugin.quickOps.formatText()` / `plugin.quickOps.networkStatus()` / `plugin.quickOps.batteryStatus()` / `plugin.quickOps.systemProxy()` 只读 facade；Flow 已注册内建 target `quickops.capabilities`、`quickops.sessions`、`quickops.stop-all-sessions`、`quickops.system-info`、`quickops.tuff-diagnostics`、`quickops.disk-space`、`quickops.directory-usage`、`quickops.network-status`、`quickops.battery-status`、`quickops.system-proxy`、`quickops.public-ip`、`quickops.query-local-ip`、`quickops.port-status`、`quickops.dns-query`、`quickops.file-hash`、`quickops.file-base64`、`quickops.recent-download`、`quickops.common-directory`、`quickops.path-format`、`quickops.temp-text-file`、`quickops.temp-directory`、`quickops.keep-awake`、`quickops.stop-keep-awake`、`quickops.system-awake`、`quickops.stop-system-awake`、`quickops.start-timer`、`quickops.pause-timer`、`quickops.resume-timer`、`quickops.stop-timer`、`quickops.start-pomodoro`、`quickops.pause-pomodoro`、`quickops.resume-pomodoro`、`quickops.stop-pomodoro`、`quickops.clean-screen`、`quickops.stop-clean-screen`、`quickops.start-stopwatch`、`quickops.pause-stopwatch`、`quickops.resume-stopwatch`、`quickops.lap-stopwatch`、`quickops.reset-stopwatch`、`quickops.show-notification`、`quickops.copy-to-clipboard`、`quickops.format-text` 与 `quickops.open-folder`，可通过现有 Flow dispatch 返回 capability 摘要、当前 QuickOps 运行会话只读快照、在确认后停止全部 QuickOps 运行会话并返回停止前的脱敏快照、本地系统信息摘要、脱敏 Tuff 诊断摘要、本地磁盘空间摘要、关键目录 bounded shallow/deep 占用摘要、本地网络状态摘要、本地电池状态摘要、本地脱敏系统代理摘要、显式 opt-in 公网 IP 查询结果、本机非 internal 地址文本 / 结构化 payload、本地 TCP 端口可用 / 占用 / degraded 状态和 copy-only 终止命令文本、通过本地 resolver 返回 DNS 基础 / 深度记录或 degraded 详情、单个本地文件 MD5 / SHA1 / SHA256 hash 或 degraded 详情、1MB 上限内单个本地文件 Base64 编码或 degraded 详情、Downloads 首层最近普通文件元数据或 degraded 详情、受限常用目录元数据、原始 / Shell / file URL / Windows-WSL 路径格式、在确认后仅于 Tuff 临时工作区创建文本文件或目录并返回路径、在确认后启动/替换显示器保持唤醒会话、停止当前显示器保持唤醒会话、在确认后启动/替换系统睡眠阻止会话、停止当前系统睡眠阻止会话、在确认后启动/替换本地计时器、暂停/恢复/停止当前本地计时器、在确认后启动/替换本地番茄钟会话、暂停/恢复/停止当前本地番茄钟会话、在确认后启动/替换本地清洁屏幕 / 纯色测试 overlay、停止当前本地清洁屏幕 / 纯色测试 overlay、在确认后启动/替换本地秒表、暂停/恢复/分段/重置当前本地秒表、在确认后发送有界本地系统通知、在确认后写入有界文本到本地剪贴板、返回有界文本大小写 / 命名风格转换结果，或在确认后打开受限常用本地目录；当前不包含高风险 QuickOps Flow API，也不等同于完整 Flow / AI action adapter。
- `SearchEngineCore.destroy()` 仍清理已注册 provider；QuickOps 不再注册 CoreApp provider，运行中 session 清理由 `QuickOpsRuntimeHost` / `QuickOpsModule` 的 stop/destroy/app quit 路径负责，并由 focused runtime/module tests 覆盖。
- QuickOps evidence gate 已新增独立 `quickops-evidence/v1` manifest/template/strict verify：`pnpm -C "apps/core-app" run quickops:evidence:template -- --writeChecklist --writePlan` 会写入默认 `evidence/quickops/quickops-evidence-manifest.json`、`QUICKOPS_EVIDENCE_CHECKLIST.md` 和 `QUICKOPS_EVIDENCE_COLLECTION_PLAN.md`，也可用 `--output` 指定 manifest 路径；`pnpm -C "apps/core-app" run quickops:evidence:verify -- --input "evidence/quickops/quickops-evidence-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts` 严格校验 packaged session cleanup、screen-clean 视觉、三平台只读 network/system、files/temp、真实确认/高风险/企业策略、SDK/transport surface、Flow/AI adapter 六类七个 evidence case；packaged cleanup case 现在要求 `quickops-packaged-session-cleanup/v1` JSON artifact，并解析 packaged build、manifest version、isolated userData、正常 quit、session 覆盖、清理后 power blocker / overlay / timer / stopwatch 归零和 runtime object / raw userData redaction；`pnpm -C "apps/core-app" run quickops:surface:audit -- --output "evidence/quickops/sdk-transport-surface.json" --strict` 可生成 SDK/transport surface JSON artifact，覆盖 QuickOpsModule typed transport、Flow registry、transport/plugin SDK facade 与 TouchPlugin runtime 注入 facade；`pnpm -C "apps/core-app" run quickops:flow-ai:audit -- --output "evidence/quickops/flow-ai-adapter-audit.json"` 可生成 Flow/AI adapter JSON artifact，源级校验 Flow target 目录、`requireConfirm` 集合、结构化 dispatch 覆盖、策略阻断 ACK、audit/clipboard 脱敏、degraded ACK、Flow confirmation token 路径和 QuickOps natural-language resolver / runtime dispatch bridge 合同；strict verifier 会解析 `quickops-packaged-session-cleanup/v1`、`quickops-surface-audit/v1` 与 `quickops-flow-ai-adapter-audit/v1` artifact，要求 `gate.passed=true`、runtime facade 方法集匹配且只调用 `QuickOpsEvents.*`，并要求自然语言 resolver、request-target-confirmation-result trace、高风险阻断和 runtime dispatch bridge evidence。当前 `quickops:flow-ai:audit --strict` 可通过 source-level Flow/AI adapter gate，证明 resolver 可生成 / 阻断 dispatch plan，runtime bridge 对只读 plan 调用 FlowBus，确认型 plan 必须携带一次性 `confirmationToken`；默认 manifest 全部 pending，不会把 focused test、Flow metadata、source resolver / runtime bridge 或 mock 截图当作真实 UI / packaged / platform evidence 完成。
- QuickOps platform readonly evidence gate 已补 `quickops-platform-readonly/v1` JSON artifact 内容校验：strict verifier 要求 macOS / Windows / Linux 三份平台 artifact 分离且来自当前平台，`localNetworkOnly=true`、`externalHttpRequestCount=0`、端口状态不执行 kill、DNS 查询只使用本地 resolver 且不修改系统 DNS、系统代理凭据已脱敏，并要求 battery / disk / directory degraded 或 unsupported 结果带稳定 reason、不得 fake success；该切片只防止三平台 evidence 被伪造或混用，不代表真实三平台 artifact 已采集完成。
- QuickOps files/temp evidence gate 已补 `quickops-files-and-temp/v1` JSON artifact 内容校验：strict verifier 要求文件 Hash / Base64 覆盖普通文件、目录输入、缺失路径、权限失败和 Base64 大小上限，确认 Hash 不写文件、Base64 不携带原始 payload、不提供 decode-to-temp-file；最近下载 evidence 必须覆盖 found、空 Downloads、权限失败、重复移动目标和显式绝对目标且不覆盖已有文件；常用目录只允许 Desktop / Downloads / Documents / App Data / Logs，路径格式必须包含 raw / shell / file URL / Windows-WSL 且不要求文件存在、不打开路径、不写剪贴板；临时文本文件和临时目录必须写入 Tuff QuickOps temp workspace 且不打开、不写剪贴板；该切片只强化文件/temp evidence 防伪，不代表真实平台文件/temp artifacts 已采集完成。
- QuickOps confirmation/policy evidence gate 已补 `quickops-confirmation-policy/v1` JSON artifact 内容校验：strict verifier 要求真实用户确认面存在且不是 metadata-only，必须引用截图或录屏 visual artifact；`capturedRequireConfirmTargets` 必须精确覆盖当前 Flow `requireConfirm` target；state/file 操作必须分别覆盖 confirm、cancel、beforeExecution、confirmation token 和 cancel 不 dispatch；高风险 `truePortKill` 必须保持未执行且只能 copy-only 或 policy-gated，批量重命名、文件清理、长期系统设置修改默认不可用且有稳定 reason；策略 disabled reason 必须覆盖 stateful/network/file/system/developer/high-risk，capability/degraded/readonly diagnostics 必须可见，并要求 payload、剪贴板、文件内容、Home/userData 原始路径脱敏。该切片只强化真实确认/高风险/企业策略 evidence 防伪，不代表真实确认 UI 截图/录屏、企业集中策略或组织级锁定 artifact 已采集完成。
- Flow dispatcher 已把 `requireConfirm=true` 从纯 metadata 提升为一次性确认 token 门禁：`FlowSelector` 由 app UI 发放 `confirmationToken`，`FlowBus.dispatch()` 对所有 requireConfirm target 消费 token 后才交付 payload；持久 sender consent 不能绕过本次确认，token 复用会 fail-closed 为 `flow-confirmation-required`。`FlowSelector` 已区分普通授权、本次执行确认、授权并确认三类文案与按钮，focused renderer test 覆盖 `requiresConfirmation` 不直发、取消不发 token/不 dispatch、确认后携带 token 选择目标。该切片仍不替代真实确认 UI 截图/录屏 evidence，也不开放端口 kill、批量文件操作或长期系统设置变更。
- TouchPlugin focused test 已覆盖插件运行时 `featureUtil.quickOps` / `featureUtil.plugin.quickOps` 完整只读 facade 方法集，包含 `auditRecent()`，并断言每个入口都通过 `QuickOpsEvents.*` typed transport invoke；该切片不替代真实 packaged plugin SDK runtime probe、全仓 legacy channel 复扫或发布包 evidence。
- 已通过 `packages/utils` PreviewSDK focused test 与 CoreApp PreviewProvider focused test 覆盖命令输入、剪贴板输入、URL/Base64/JSON/JWT 解码/Regex 受限测试/Markdown/CSV 表格转换/时间戳/日期与固定 UTC offset 时区转换/静态离线货币估算/UUID v4/短 ID/QR Code SVG/大小写转换结果和 provider input passthrough；CoreApp 仍保留 Nexus / cache-backed 实时汇率 adapter，不把静态 fallback 等同于实时汇率完成。
- 已通过 CoreApp QuickOps runtime-host focused test 覆盖 `QuickOpsProvider` export 已移除、runtime session 启停与 cleanup、默认偏好解析、能力摘要、诊断脱敏、命令解析、本机 IP、DNS、端口探测、文件 Hash/Base64/路径 helper、最近下载移动边界、系统代理凭据脱敏、macOS/Windows/Linux 电池解析、磁盘空间、目录占用、系统信息与 Home 路径脱敏；file provider utils focused test 覆盖文件搜索结果路径 copy-only actions、file URL 与 Windows/WSL 路径互转；SettingTools QuickOps renderer test 覆盖默认偏好设置入口、内置番茄钟模板开关、公网 IP 高级设置开关、非法旧配置归一化、自定义模板归一化/高级摘要和高级设置显示；QuickOpsModule focused test 覆盖模块 stop/destroy 清理共享 runtime、`QuickOpsEvents.capabilities.get` / `QuickOpsEvents.sessions.get` / `QuickOpsEvents.systemInfo.get` / `QuickOpsEvents.tuffDiagnostics.get` / `QuickOpsEvents.diskSpace.get` / `QuickOpsEvents.directoryUsage.get` / `QuickOpsEvents.queryLocalIp.get` / `QuickOpsEvents.portStatus.get` / `QuickOpsEvents.dnsQuery.get` / `QuickOpsEvents.fileHash.get` / `QuickOpsEvents.fileBase64.get` / `QuickOpsEvents.recentDownload.get` / `QuickOpsEvents.commonDirectory.get` / `QuickOpsEvents.pathFormat.get` / `QuickOpsEvents.formatText.get` / `QuickOpsEvents.networkStatus.get` / `QuickOpsEvents.batteryStatus.get` / `QuickOpsEvents.systemProxy.get` handler、脱敏 session snapshot、本地 systemInfo transport response、脱敏 diagnostics transport response、本地 diskSpace transport response、bounded directoryUsage transport response、本地 queryLocalIp transport response、本地 portStatus transport response、本地 dnsQuery transport response、单文件 fileHash / fileBase64 transport response、recentDownload transport response、commonDirectory 只读元数据 response、pathFormat copy-only / degraded response、formatText formatted/skipped response、本地 networkStatus transport response、本地 batteryStatus transport response 与本地 systemProxy transport response；`packages/utils` transport domain SDK test 覆盖 `quick-ops:capabilities:get` / `quick-ops:sessions:get` / `quick-ops:system-info:get` / `quick-ops:tuff-diagnostics:get` / `quick-ops:disk-space:get` / `quick-ops:directory-usage:get` / `quick-ops:query-local-ip:get` / `quick-ops:port-status:get` / `quick-ops:dns-query:get` / `quick-ops:file-hash:get` / `quick-ops:file-base64:get` / `quick-ops:recent-download:get` / `quick-ops:common-directory:get` / `quick-ops:path-format:get` / `quick-ops:format-text:get` / `quick-ops:network-status:get` / `quick-ops:battery-status:get` / `quick-ops:system-proxy:get` 事件与 `createQuickOpsSdk()` 映射；TrayManager focused test 覆盖托盘 idle 状态、运行中会话摘要与停止全部动作。

未落地：

- 清洁屏幕 / 纯色屏幕测试真实视觉截图/录屏 evidence、packaged app quit 证据等 v1.0 完整状态型验收项仍按 Phase 1 继续推进。
- QuickOps 完整抽离为官方独立插件仍未完成：CoreBox root-results 入口、更多只读面板和低风险状态控制触发已迁到 `plugins/touch-quickops`；CoreApp 当前仍承载 `QuickOpsRuntimeHost` / `quickOpsRuntime`、`QuickOpsSessionManager` / `QuickOpsModule`、设置页、托盘、Flow target、host capability 和 evidence gate 的主要运行逻辑。后续需要继续把业务 runtime、状态/诊断面板、settings/tray 入口与可扩展编排迁到 `plugins/touch-quickops` 或插件专属 runtime boundary，CoreApp 只保留必要 platform capabilities、Flow confirmation、policy/evidence gate 与迁移期 typed bridge。
- `quickops-confirmation-policy/v1` strict artifact 校验已进入 QuickOps evidence gate，但当前仍只是确认/策略证据采集合约；真实确认 UI 截图/录屏、真实策略禁用态采集、高风险治理运行证据、企业集中策略 / 审计 / 组织级锁定 artifact 仍未采集完成。
- 公网 IP 真实外部服务 evidence、真实端口 kill、QuickOps Dashboard、完整 AI UI 编排落地、企业策略和真实高风险确认 UI evidence 仍未进入实现；QuickOps evidence gate 只提供可执行采集清单与严格校验，不替代真实 artifact 采集；Flow `requireConfirm` dispatcher 门禁已 fail-closed，FlowSelector 已区分授权 / 本次确认 / 授权并确认文案，focused renderer test 已覆盖取消不发 token / 不 dispatch 和确认后携带 token，`quickops:flow-ai:audit --strict` 已能证明当前 Flow target 目录、确认集合、策略阻断、ACK/degraded/audit 脱敏、confirmation token 路径、bounded QuickOps natural-language resolver 与 runtime dispatch bridge 的源级覆盖（resolver 生成 Flow dispatch plan、脱敏 trace 和高风险 blocked 结果；runtime bridge 只对 read-only plan 或带一次性 `confirmationToken` 的 confirmed plan 调用 FlowBus，不会静默执行确认型或高风险请求）；真实 AI UI 接入、真实确认 UI 截图 / 录屏 evidence 仍未完成；插件侧当前仅完成 capability / sessions / systemInfo / tuffDiagnostics / diskSpace / directoryUsage / queryLocalIp / portStatus / dnsQuery / fileHash / fileBase64 / recentDownload / commonDirectory / pathFormat / formatText / networkStatus / batteryStatus / systemProxy 只读 facade，Flow 侧当前完成 capability、`sessions` 只读运行会话快照 action、`stopAllSessions` 确认型停止全部运行会话 action、`systemInfo` 只读本地系统摘要 action、`tuffDiagnostics` 只读脱敏本地诊断摘要 action、`diskSpace` 只读本地磁盘空间摘要 action、`directoryUsage` 只读 bounded 关键目录占用摘要 action、`networkStatus` 只读本地网络摘要 action、`batteryStatus` 只读本地电池状态 action、`systemProxy` 只读本地脱敏代理摘要 action、`publicIp` 确认型显式 opt-in 公网 IP 查询 action、`queryLocalIp` 只读 action、`portStatus` 只读本地端口状态 action、`dnsQuery` 只读本地 DNS resolver action、`fileHash` 只读单文件 hash action、`fileBase64` 只读单文件 Base64 编码 action、`recentDownload` 只读最近下载文件元数据 action、`commonDirectory` 只读受限常用目录元数据 action、`pathFormat` 只读路径字符串格式化 action、`tempTextFile` 确认型 Tuff 临时工作区文本写入 action、`tempDirectory` 确认型 Tuff 临时工作区目录创建 action、`formatText` 只读纯转换 action、`keepAwake` 确认型状态 action、`stopKeepAwake` 低风险停止 action、`systemAwake` 确认型状态 action、`stopSystemAwake` 低风险停止 action、`startTimer` 确认型状态 action、`pauseTimer` 低风险状态 action、`resumeTimer` 低风险状态 action、`stopTimer` 低风险停止 action、`startPomodoro` 确认型状态 action、`pausePomodoro` 低风险状态 action、`resumePomodoro` 低风险状态 action、`stopPomodoro` 低风险停止 action、`cleanScreen` 确认型状态 action、`stopCleanScreen` 低风险停止 action、`startStopwatch` 确认型状态 action、`pauseStopwatch` / `resumeStopwatch` / `lapStopwatch` / `resetStopwatch` 低风险状态 action、`showNotification` 确认型本地通知 action、`copyToClipboard` 确认型本地剪贴板写入 action 与 `openFolder` 确认型受限常用目录打开 action，不包含高风险执行编排；当前 source-level `quickops:flow-ai:audit --strict` 已可通过；`sessions` / `stopAllSessions` Flow target 仍不替代 packaged quit / 真实运行状态 / 真实确认 UI evidence，`systemInfo` SDK/Flow target 仍不替代真实平台 system-info evidence，`queryLocalIp` / `networkStatus` SDK/Flow target 仍不替代真实平台网络 evidence，`portStatus` SDK/Flow target 仍不替代真实端口 kill / 二次确认 UI evidence，`batteryStatus` SDK/Flow target 仍不替代真实平台电池 evidence，`systemProxy` SDK/Flow target 仍不替代真实平台系统代理 evidence，`cleanScreen` Flow target 仍不替代真实视觉截图/录屏 evidence，`dnsQuery` SDK/Flow target 仍不替代真实平台 DNS evidence，`fileHash` / `fileBase64` Flow target 仍不替代真实平台文件权限 / 大文件 evidence，`tempTextFile` / `tempDirectory` Flow target 仍不替代真实平台临时写入 / 打开 evidence，`recentDownload` Flow target 仍不替代最近下载文件真实平台打开 / 移动 evidence，`commonDirectory` SDK/Flow target 仍不替代真实平台系统打开 evidence，`pathFormat` SDK/Flow target 仍不替代真实文件搜索结果动作 evidence，`formatText` SDK/Flow target 仍不替代完整 AI 自然语言 UI 编排 evidence，`tuffDiagnostics` SDK/Flow target 仍不替代真实排障 evidence，`diskSpace` / `directoryUsage` SDK/Flow target 仍不替代真实平台目录权限 evidence。
- 插件侧运行时 facade 已补 `auditRecent()` 并由 focused test 覆盖完整只读方法集与 typed transport invoke 映射；真实 packaged plugin SDK runtime probe、全仓 legacy channel 复扫和发布包 evidence 仍未闭环。

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
| 屏幕纯色 / 坏点测试 | P1 | Windows / macOS / Linux | 已复用清洁屏幕 overlay 接入红 / 绿 / 蓝纯色测试，支持 `screen color test` / `red screen test` / `蓝色屏幕测试`；真实视觉 evidence 后置 |

### 5.2 时间与专注类

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
| 快速计时器 | P0 | CoreBox 输入 `计时 10 分钟` / `timer 25m` 直接启动 |
| 秒表 | P0 | 开始、暂停、复位、分段记录 |
| 番茄钟 | P0 | 25/5、50/10 内置模板和设置页开关已支持，命令式自定义模板、自定义模板列表 schema / 别名解析、1-12 轮有限循环，以及 `long break` / `长休息` 每 N 轮（2-12）触发的 1-60 分钟长休息策略已支持；启动后自动联动显示器保持唤醒，并在手动停止、替换或自然完成时释放 |
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
| 最近下载文件 | P2 | 已接入最近普通下载文件打开、打开所在文件夹、复制路径，以及带危险确认的移动到显式绝对目标目录；目标缺失 / 非目录 / 同名文件返回 degraded，真实平台移动 evidence 后置 |
| 清理空目录 / 批量重命名 | P3 | 高风险，后置且必须确认 |

### 5.5 网络与开发者类

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
| 本机 IP 查询 | P1 | 已接入本地只读查询；展示 IPv4 / IPv6 / 网卡名，一键复制 |
| 公网 IP 查询 | P1 | 已接入默认关闭的 opt-in 查询；高级设置开启后向 `https://api.ipify.org?format=json` 发起只读 GET 并标注来源；真实外部服务 evidence 后置 |
| 端口可用性探测 | P1 | 已接入本地只读 TCP bind 探测；`port 3000` / `端口 3000` 展示可用 / 已占用，占用时 best-effort 展示 PID / 进程归因，并提供 copy-only 终止命令 |
| QR Code 生成 | P1 | 已进入 PreviewSDK；支持短文本 / URL 本地 SVG QR Code 生成、CoreBox 图片预览、SVG data URL 复制，以及 SVG / PNG 保存到 Tuff 临时目录，当前限制 Byte mode、ECC-L、版本 1-9 和 230 bytes 输入上限 |
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
| Screen Tools | 屏幕清洁模式、屏幕纯色 / 坏点测试 | 全屏遮罩、黑/白底、红/绿/蓝纯色、倒计时、长按 Esc 退出 |
| Timer Tools | 快速计时器、秒表、番茄钟 | 支持暂停/恢复/停止，到点通知，状态可见 |
| Developer Tools | JSON 格式化、URL 编解码、Base64 编解码、时间戳转换 | 默认剪贴板输入，错误可读，不记录敏感内容 |

### 7.2 QuickOps v1.1 扩展

| 包 | 功能 |
| --- | --- |
| Developer Tools | UUID 生成、QR Code 生成（本地 SVG 预览、SVG/PNG 保存已接入）、大小写转换 |
| Files Tools | 打开常用目录（Desktop / Downloads / Documents / App Data / Logs 已接入）、最近下载文件（Downloads 首层普通文件按修改时间打开 / 打开所在文件夹 / 复制路径 / 危险确认后移动到显式绝对目标目录已接入）、文件 Hash（单文件路径命令 / Files input 单文件 / Files input 多文件已接入）、文件 Base64（1MB 内单文件编码复制 / 多文件摘要复制 / 临时文件解码落盘已接入）、复制路径格式（原始路径 / Shell 路径 / file URL / Windows-WSL 互转已接入，文件搜索结果路径动作已接入）、临时文本文件与临时目录（Tuff 临时目录内创建已接入） |
| Network Tools | 本机 IP（已接入）、公网 IP（默认关闭 opt-in 查询已接入；真实外部服务 evidence 后置）、端口可用性探测（含占用 PID / 进程归因，已接入）、DNS 查询（A / AAAA / CNAME / MX 已接入；深度 NS / TXT / SOA 已接入）、网络状态摘要（地址 / DNS server / 环境变量代理已接入）、系统代理状态（macOS/Windows/Linux 只读探测已接入） |
| Screen Tools | 屏幕纯色 / 坏点测试（红 / 绿 / 蓝纯色 overlay 已接入；真实视觉 evidence 后置） |
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

当前实现仍在 CoreApp 主进程内；目标形态是抽离为官方 `plugins/touch-quickops` 插件。CoreApp 最终只保留必要 host capability 边界（power blocker、overlay、通知、受限文件/网络/系统 helper、Flow confirmation、policy/evidence gate 与迁移期 typed bridge），QuickOps 业务 runtime、CoreBox 入口、状态面板、settings/tray 入口和可扩展编排迁入官方插件或插件专属 runtime boundary。

当前 CoreApp 内置结构：

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

插件化迁移边界：

| 层级 | 目标 |
| --- | --- |
| 官方插件 | `plugins/touch-quickops` 承载 CoreBox 入口、工具目录、业务 runtime、session surface、插件侧状态/诊断面板、settings/tray 入口与后续插件自有 UI / 可扩展编排 |
| Host capability | CoreApp 保留 Electron / OS 绑定能力，例如 power blocker、BrowserWindow overlay、通知、受限文件 / 网络 / 系统 helper，并通过 typed SDK / Flow target 暴露给官方插件 |
| Flow / confirmation | 继续通过统一 Flow target、一次性 confirmation token 与 App UI 确认，不允许插件私有 IPC 绕过 |
| Policy / audit | 本地策略、disabled reason、redaction、audit summary 与未来企业策略必须对插件和 host 能力统一生效 |
| Evidence | `quickops:evidence:*`、`quickops:surface:audit`、`quickops:flow-ai:audit` 需要新增 packaged plugin runtime probe，不得只验证 CoreApp 内置路径 |

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

- `quickOps.sessions`（已接入 Flow 只读 target `quickops.sessions`，仅返回当前运行会话快照，不启动、不停止、不泄露 window/timeout runtime 对象）
- `quickOps.keepAwake`（已接入 Flow target `quickops.keep-awake`，`requireConfirm=true`）
- `quickOps.stopKeepAwake`（已接入 Flow target `quickops.stop-keep-awake`）
- `quickOps.systemAwake`（已接入 Flow target `quickops.system-awake`，`requireConfirm=true`，仅复用系统睡眠阻止 runtime，不修改系统电源计划）
- `quickOps.stopSystemAwake`（已接入 Flow target `quickops.stop-system-awake`）
- `quickOps.startTimer`（已接入 Flow target `quickops.start-timer`，`requireConfirm=true`）
- `quickOps.pauseTimer`（已接入 Flow target `quickops.pause-timer`）
- `quickOps.resumeTimer`（已接入 Flow target `quickops.resume-timer`）
- `quickOps.stopTimer`（已接入 Flow target `quickops.stop-timer`）
- `quickOps.startPomodoro`（已接入 Flow target `quickops.start-pomodoro`，`requireConfirm=true`，仅结构化参数）
- `quickOps.pausePomodoro`（已接入 Flow target `quickops.pause-pomodoro`）
- `quickOps.resumePomodoro`（已接入 Flow target `quickops.resume-pomodoro`）
- `quickOps.stopPomodoro`（已接入 Flow target `quickops.stop-pomodoro`）
- `quickOps.cleanScreen`（已接入 Flow target `quickops.clean-screen`，`requireConfirm=true`，仅结构化参数）
- `quickOps.stopCleanScreen`（已接入 Flow target `quickops.stop-clean-screen`）
- `quickOps.startStopwatch`（已接入 Flow target `quickops.start-stopwatch`，`requireConfirm=true`）
- `quickOps.pauseStopwatch`（已接入 Flow target `quickops.pause-stopwatch`）
- `quickOps.resumeStopwatch`（已接入 Flow target `quickops.resume-stopwatch`）
- `quickOps.lapStopwatch`（已接入 Flow target `quickops.lap-stopwatch`）
- `quickOps.resetStopwatch`（已接入 Flow target `quickops.reset-stopwatch`）
- `quickOps.showNotification`（已接入 Flow target `quickops.show-notification`，`requireConfirm=true`，仅本地系统通知，payload 有界）
- `quickOps.copyToClipboard`（已接入 Flow target `quickops.copy-to-clipboard`，`requireConfirm=true`，仅有界文本写入本地剪贴板）
- `quickOps.formatText`（已接入 SDK facade 与 Flow 只读 target `quickops.format-text`，本地纯转换，支持 upper/lower/camel/snake/kebab）
- `quickOps.openFolder`（已接入 Flow target `quickops.open-folder`，`requireConfirm=true`，仅打开 Desktop/Downloads/Documents/App Data/Logs 等受限常用目录）
- `quickOps.queryLocalIp`（已接入 SDK facade 与 Flow 只读 target `quickops.query-local-ip`，仅返回本机非 internal 地址，不外联）
- `quickOps.portStatus`（已接入 SDK facade 与 Flow 只读 target `quickops.port-status`，仅返回本地 TCP 端口可用/占用/degraded 状态和 copy-only 终止命令文本，不执行 kill）
- `quickOps.dnsQuery`（已接入 SDK facade 与 Flow 只读 target `quickops.dns-query`，复用本地 resolver，支持基础 / deep DNS 查询与 degraded 详情）
- `quickOps.fileHash`（已接入 SDK facade 与 Flow 只读 target `quickops.file-hash`，仅支持单文件路径输入，返回 MD5 / SHA1 / SHA256 或 degraded 详情）
- `quickOps.fileBase64`（已接入 SDK facade 与 Flow 只读 target `quickops.file-base64`，仅支持 1MB 上限内单文件路径输入，返回 Base64 或 degraded 详情，不包含 decode-to-temp-file）
- `quickOps.recentDownload`（已接入 SDK facade 与 Flow 只读 target `quickops.recent-download`，仅返回 Downloads 首层最近普通文件元数据，不打开、不移动）
- `quickOps.commonDirectory`（已接入 SDK facade 与 Flow 只读 target `quickops.common-directory`，仅返回 Desktop/Downloads/Documents/App Data/Logs 等受限常用目录元数据，不打开目录、不写剪贴板）
- `quickOps.pathFormat`（已接入 SDK facade 与 Flow 只读 target `quickops.path-format`，仅返回原始路径 / Shell 路径 / file URL / Windows-WSL 互转，不检查文件存在）
- `quickOps.tempTextFile`（已接入 Flow target `quickops.temp-text-file`，`requireConfirm=true`，仅在 Tuff 临时工作区创建有界文本文件，不打开目录、不写剪贴板）
- `quickOps.tempDirectory`（已接入 Flow target `quickops.temp-directory`，`requireConfirm=true`，仅在 Tuff 临时工作区创建安全命名目录，不打开目录、不写剪贴板）
- `quickOps.systemInfo`（已接入 Flow 只读 target `quickops.system-info`，仅返回本地系统摘要，不外联）
- `quickOps.tuffDiagnostics`（已接入 Flow 只读 target `quickops.tuff-diagnostics`，仅返回脱敏本地诊断摘要，不读取日志）
- `quickOps.diskSpace`（已接入 Flow 只读 target `quickops.disk-space`，仅返回本地磁盘空间摘要，读取失败返回 degraded）
- `quickOps.directoryUsage`（已接入 SDK facade 与 Flow 只读 target `quickops.directory-usage`，默认 bounded shallow scan，`deep: true` 时 bounded recursive scan，读取失败返回 degraded）
- `quickOps.networkStatus`（已接入 Flow 只读 target `quickops.network-status`，仅返回本地地址、DNS server 与环境变量代理摘要，不外联）
- `quickOps.batteryStatus`（已接入 Flow 只读 target `quickops.battery-status`，仅返回平台本地电池状态，读取失败返回 degraded）
- `quickOps.systemProxy`（已接入 Flow 只读 target `quickops.system-proxy`，仅返回脱敏环境变量代理与系统代理摘要，探测失败返回 degraded）
- `quickOps.publicIp`（已接入 Flow target `quickops.public-ip`，`requireConfirm=true`，payload 必须显式 `allowLookup: true` 才会外联，否则返回 `public-ip-disabled`）

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
- QR Code 已进入 PreviewSDK；支持短文本 / URL 本地 SVG 生成、CoreBox 图片预览、SVG data URL 复制、SVG/PNG 保存到 Tuff 临时目录和 v1-v9 / 230 bytes 输入
- 本机 IP 已接入；公网 IP 默认关闭 opt-in 查询已接入，真实外部服务 evidence 后置
- 端口可用性探测已接入；占用时 PID / 进程归因和 copy-only 终止命令已接入；真正 kill / 二次确认 UI 后置
- DNS 查询已接入 A / AAAA / CNAME / MX 只读查询，深度 DNS 查询已追加 NS / TXT / SOA；真实平台 DNS evidence 后置
- 系统代理状态已接入环境变量、macOS `scutil --proxy`、Windows 当前用户 Internet Settings 与 Linux GNOME proxy mode 只读摘要；真实平台系统代理 evidence 后置
- 打开常用目录已接入 Desktop / Downloads / Documents / App Data / Logs；真实系统打开 evidence 后置
- 文件 Hash 已接入单文件路径命令、Files input 单文件、Files input 多文件只读摘要与文件搜索结果 execute 动作；文件 Base64 已接入 1MB 内单文件编码复制、多文件摘要复制、临时文件解码落盘与文件搜索结果 execute 动作；临时文本文件与临时目录已接入 Tuff 临时目录内创建；真实平台写入 evidence 后置
- 复制路径格式已接入原始路径 / Shell 路径 / file URL / Windows-WSL 互转；文件搜索结果路径 copy-only 动作已接入
- Tuff 诊断信息复制已接入扩展脱敏诊断包；真实排障 evidence 后置
- QuickOps evidence gate 已接入模板、采集计划与严格校验脚本，覆盖 packaged session cleanup、screen-clean 视觉、三平台只读 network/system、files/temp、真实确认/高风险/企业策略、SDK/transport surface、Flow/AI adapter 六类七个验收清单；`quickops:evidence:template --writeChecklist --writePlan` 会生成 manifest、checklist 和 `QUICKOPS_EVIDENCE_COLLECTION_PLAN.md`，把 source-level audit、真实 packaged quit、真实视觉、真实平台与真实确认 UI evidence 分开采集；packaged cleanup strict verifier 已要求并解析 `quickops-packaged-session-cleanup/v1` artifact，拒绝 dev-only、external kill、session 覆盖不足、清理后 blocker/window/timer 未归零或 evidence 泄露 runtime/userData 的 artifact；SDK/transport surface 已有 `quickops:surface:audit` JSON 采集命令，Flow/AI adapter 已有 `quickops:flow-ai:audit` JSON 采集命令；strict verifier 会解析 artifact 内容，要求 surface audit gate 通过并纳入 TouchPlugin runtime 注入 facade 方法集与 typed transport invoke 映射，同时要求 Flow/AI adapter audit gate 通过、存在自然语言 resolver、request-target-confirmation-result trace、高风险阻断和 runtime dispatch bridge evidence；当前 Flow 源级覆盖、bounded natural-language resolver 与 runtime dispatch bridge 可审计，但真实 UI / packaged / platform artifacts 仍需按清单采集。
- 三平台只读 network/system evidence strict verifier 已要求 `quickops-platform-readonly/v1` artifact 集合覆盖 macOS / Windows / Linux，并解析 local-only 网络约束、端口不 kill、DNS 不改系统设置、代理脱敏、battery/disk/directory degraded reason 与 redaction 字段；真实平台 artifact 仍需在对应系统上采集后才能把 platform evidence case 标记 passed。
- files/temp evidence strict verifier 已要求 `quickops-files-and-temp/v1` artifact 解析 Hash / Base64 / recent download / common directory / path format / temp workspace / redaction 字段，拒绝缺少 degraded reason、Base64 原始 payload、decode-to-temp-file、任意目录、路径打开/剪贴板副作用、temp workspace 越界或未脱敏 artifact；真实平台文件权限、最近下载移动与临时写入 artifact 仍需采集后才能把 files/temp evidence case 标记 passed。

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
- CoreBox QuickOps capability 摘要、插件 SDK 只读 capability / sessions / auditRecent / systemInfo / tuffDiagnostics / diskSpace / directoryUsage / queryLocalIp / portStatus / dnsQuery / fileHash / fileBase64 / recentDownload / commonDirectory / pathFormat / formatText / networkStatus / batteryStatus / systemProxy facade 与结构化 Flow targets 已覆盖 capability、`sessions`、`systemInfo`、`tuffDiagnostics`、`diskSpace`、`directoryUsage`、`queryLocalIp`、`portStatus`、`dnsQuery`、`networkStatus`、`batteryStatus`、`systemProxy`、`publicIp`、`fileHash`、`fileBase64`、`recentDownload`、`commonDirectory`、`pathFormat`、`tempTextFile`、`tempDirectory`、`keepAwake`、`stopKeepAwake`、`systemAwake`、`stopSystemAwake`、`startTimer`、`pauseTimer`、`resumeTimer`、`stopTimer`、`startPomodoro`、`pausePomodoro`、`resumePomodoro`、`stopPomodoro`、`cleanScreen`、`stopCleanScreen`、`startStopwatch`、`pauseStopwatch`、`resumeStopwatch`、`lapStopwatch`、`resetStopwatch`、`showNotification`、`copyToClipboard`、`formatText` 和 `openFolder`；Flow dispatcher 已对 `requireConfirm=true` target 强制一次性 confirmation token；QuickOps 本地 Flow 审计摘要基线已通过内存 ring buffer 和 `quick-ops:audit:get` 暴露最近 delivery 决策，但不落盘且不记录 payload 内容；QuickOps 本地 `allowStatefulTools` 策略基线已能禁用 stateful/confirm 工具并让 Flow fail-closed；QuickOps 本地 `allowNetworkTools` 策略基线已能禁用网络工具并让 Flow 网络 target fail-closed；QuickOps 本地 `allowFileTools` 策略基线已能禁用文件工具并让 Flow 文件 target fail-closed；QuickOps 本地 `allowSystemTools` 策略基线已能禁用系统工具并让 Flow 系统 target fail-closed；QuickOps 本地 `allowDeveloperTools` 策略基线已能禁用 PreviewSDK 开发者工具并让 Flow `format-text` target fail-closed；QuickOps 本地 `allowHighRiskTools` 策略基线已默认禁用 `danger` 能力摘要条目；`quickops:flow-ai:audit` 已把 Flow target 目录、确认集合、策略阻断、ACK/degraded/audit 脱敏、confirmation token 路径、bounded natural-language resolver 和 runtime dispatch bridge 合同纳入结构化 artifact 校验；QuickOps evidence template/strict verify/collection plan 已覆盖真实 Flow/AI adapter evidence 要求和真实 evidence 采集顺序，source-level AI runtime dispatch bridge 已接入并通过 strict audit；真实 AI UI 接入、真实确认 UI 截图/录屏、高风险执行治理与完整企业策略后续补齐。
- 企业策略控制工具启用状态（部分完成：本地 `allowStatefulTools`、`allowNetworkTools`、`allowFileTools`、`allowSystemTools`、`allowDeveloperTools` 与默认关闭的 `allowHighRiskTools` 策略基线已落地；本地内存审计摘要已覆盖最近 QuickOps Flow delivery 决策可观测性；集中策略下发、集中审计、组织级锁定和真实 evidence 仍待补齐）
- Nexus 文档与开发者示例（部分完成：Nexus 用户指南、开发者 API、Guide / Dev / API 索引和插件全局上下文说明已补；用户指南已明确 Ops 场景速查、官方 `touch-quickops` 插件已承接首批只读入口、插件可基于 QuickOps 做能力摘要读取、已有 Flow target 组合和插件自有 Ops 扩展，但不能绕过本地策略或私有 IPC；开发者 API 已补 `quickops.*` Flow target 目录、扩展路径选择、第三方扩展模式、插件自有 Ops checklist、内置 QuickOps 贡献落点和变更 checklist；后续仍需随真实 evidence、企业策略、高风险治理和完整 AI 编排继续更新）

## 16. 验收清单

### v1.0 功能验收

- [ ] CoreBox 能搜索并执行 v1.0 QuickOps 工具。部分完成：Developer P0 已经 PreviewSDK 接入；显示器保持唤醒、系统睡眠阻止、快速计时器、秒表、清洁屏幕黑/白底 overlay、托盘运行状态和停止全部动作、默认偏好只读解析与设置页编辑入口、本机 IP 查询、端口可用性探测、DNS 查询、打开常用目录、最近下载文件打开 / 复制 / 危险确认后移动到显式绝对目标目录、临时文本文件、临时目录、单文件 Hash、单文件 / 多文件 Base64 编码复制、Base64 临时文件解码落盘、复制路径格式与 Windows/WSL 路径互转、Tuff 脱敏诊断信息复制、系统信息、磁盘空间、关键目录占用、番茄钟首个专注段、循环专注/休息、1-12 轮有限循环、每 N 轮长休息、25/5、50/10 内置模板、内置模板设置页开关、命令式自定义模板、设置驱动自定义模板名称/别名解析、番茄钟联动显示器保持唤醒、Flow `capabilities` 只读 target、Flow `sessions` 只读运行会话快照 action、Flow `systemInfo` 只读本地系统摘要 action、Flow `tuffDiagnostics` 只读脱敏本地诊断摘要 action、Flow `diskSpace` 只读本地磁盘空间摘要 action、Flow `directoryUsage` 只读 bounded 关键目录占用摘要 action、Flow `networkStatus` 只读本地网络摘要 action、Flow `batteryStatus` 只读本地电池状态 action、Flow `systemProxy` 只读本地脱敏代理摘要 action、Flow `publicIp` 确认型显式 opt-in 公网 IP 查询 action、Flow `queryLocalIp` 只读 action、Flow `portStatus` 只读本地端口状态 action、Flow `dnsQuery` 只读本地 DNS resolver action、Flow `fileHash` 只读单文件 hash action、Flow `fileBase64` 只读单文件 Base64 编码 action、Flow `recentDownload` 只读最近下载文件元数据 action、Flow `commonDirectory` 只读受限常用目录元数据 action、Flow `pathFormat` 只读路径字符串格式化 action、Flow `tempTextFile` 确认型 Tuff 临时工作区文本写入 action、Flow `tempDirectory` 确认型 Tuff 临时工作区目录创建 action、Flow `keepAwake` 确认型状态 action、Flow `stopKeepAwake` 低风险停止 action、Flow `startTimer` 确认型状态 action、Flow `pauseTimer` 低风险状态 action、Flow `resumeTimer` 低风险状态 action、Flow `stopTimer` 低风险停止 action、Flow `startPomodoro` 确认型状态 action、Flow `pausePomodoro` 低风险状态 action、Flow `resumePomodoro` 低风险状态 action、Flow `stopPomodoro` 低风险停止 action、Flow `cleanScreen` 确认型状态 action、Flow `stopCleanScreen` 低风险停止 action、Flow `startStopwatch` 确认型状态 action、Flow `pauseStopwatch` / `resumeStopwatch` / `lapStopwatch` / `resetStopwatch` 低风险状态 action、Flow `showNotification` 确认型本地通知 action、Flow `copyToClipboard` 确认型本地剪贴板写入 action、Flow `formatText` 只读纯转换 action 和 Flow `openFolder` 确认型受限常用目录 action 已接入；Flow requireConfirm target 已强制一次性 confirmation token；source-level natural-language resolver / runtime dispatch bridge 已接入 strict audit；真实 AI UI 自然语言编排、真实确认 UI 截图/录屏、高风险执行治理、企业策略和真实 evidence 项仍待实现。
- [x] 保持唤醒支持开始、查询、延长、停止、到期自动恢复。
- [x] 系统睡眠阻止支持开始、查询、停止、到期自动恢复。
- [ ] 应用退出时能清理保持唤醒子进程或 native session。部分完成：`QuickOpsRuntimeHost` / `QuickOpsModule` 已在 runtime deactivate/destroy、`BEFORE_APP_QUIT` / `WILL_QUIT`、module stop/destroy 时清理共享 runtime；QuickOpsModule focused test 已覆盖 app quit event 触发 cleanup 与 stop 后解绑 handler，runtime-host focused test 已覆盖 runtime cleanup；QuickOps evidence gate 已要求 packaged session cleanup/quit artifact；仍需采集真实 packaged app quit 证据。
- [ ] 屏幕清洁模式支持全屏、倒计时、长按退出。部分完成：首版已支持多 display 全屏遮罩、黑/白底、默认倒计时、长按 Esc 退出、停止项、到期、runtime destroy/module cleanup、托盘状态、默认黑/白底偏好读取与设置页编辑入口；overlay data URL 视觉合同已由 focused test 覆盖黑/白底、倒计时提示、隐藏光标、长按 Esc 和无外链资源；设置页回归 test 已覆盖 QuickOps 默认偏好控件与归一化；QuickOps evidence gate 已要求黑/白/红/绿/蓝真实截图或录屏；真实视觉截图/录屏 evidence 仍待采集。
- [ ] 计时器、秒表、番茄钟支持暂停、恢复、停止和通知。部分完成：快速计时器已支持开始、查询、暂停、恢复、延长 5 分钟、停止、到点系统通知和到期清理；秒表已支持开始、查询、暂停、恢复、分段、重置；番茄钟已支持首个专注段开始、查询、暂停、恢复、停止、到点系统通知、到期清理、循环模式下专注段/休息段自动轮换、有限轮数循环最终完成通知、每 N 轮长休息、25/5、50/10 内置模板、内置模板设置页开关、命令式自定义模板、设置驱动自定义模板名称/别名解析和会话级显示器保持唤醒联动；QuickOpsModule app quit event cleanup focused test 已覆盖运行时清理触发路径；真实 packaged quit 与端到端 evidence 仍待补齐。
- [x] JSON / URL / Base64 / JWT 解码 / Regex 受限测试 / Markdown/CSV 表格转换 / 时间戳 / 日期与固定 UTC offset 时区转换 / 静态离线货币估算 / UUID v4 / 短 ID / QR Code SVG / 大小写转换工具能处理 CoreBox 文本输入；文本剪贴板输入可作为需要输入的命令默认输入并返回可读错误，Preview 主结果可通过 host copy action 复制；日期 / 时区转换仅支持固定 UTC offset，不包含 IANA 地区名或夏令时规则；静态货币估算不代表实时汇率；JWT 仅解码 header/payload 且明确不验证签名；Regex 仅本地测试且有长度、match 数量和复杂度保护；Markdown/CSV 表格转换仅处理本地文本并限制表格大小；QR Code 当前限定短文本 / URL、本地 SVG、Byte mode、ECC-L、版本 1-9 和 230 bytes 输入上限，支持 SVG / PNG 保存到 Tuff 临时目录。

### 平台验收

- [ ] Windows / macOS / Linux 都有 capability 检测结果。部分完成：`quickops capability` / `quickops 能力` 已提供 host/CoreBox 只读能力摘要，插件 SDK 已提供 capability / sessions / systemInfo / tuffDiagnostics / diskSpace / directoryUsage / queryLocalIp / portStatus / dnsQuery / fileHash / fileBase64 / recentDownload / commonDirectory / pathFormat / formatText / networkStatus / batteryStatus / systemProxy 只读 facade，Flow 已补 `systemInfo` 只读本地系统摘要 action、`diskSpace` 只读本地磁盘空间摘要 action、`directoryUsage` 只读 bounded 关键目录占用摘要 action、`publicIp` 确认型显式 opt-in 公网 IP 查询 action、`queryLocalIp` 只读 action、`portStatus` 只读本地端口状态 action、`dnsQuery` 只读本地 DNS resolver action、`fileHash` 只读单文件 hash action、`fileBase64` 只读单文件 Base64 编码 action、`recentDownload` 只读最近下载文件元数据 action、`commonDirectory` 只读受限常用目录元数据 action、`pathFormat` 只读路径字符串格式化 action、`tempTextFile` 确认型 Tuff 临时工作区文本写入 action、`tempDirectory` 确认型 Tuff 临时工作区目录创建 action、`formatText` 只读纯转换 action、`keepAwake` 确认型状态 action、`stopKeepAwake` 低风险停止 action、`startTimer` 确认型状态 action、`pauseTimer` 低风险状态 action、`resumeTimer` 低风险状态 action、`stopTimer` 低风险停止 action、`startPomodoro` 确认型状态 action、`pausePomodoro` 低风险状态 action、`resumePomodoro` 低风险状态 action、`stopPomodoro` 低风险停止 action、`cleanScreen` 确认型状态 action、`stopCleanScreen` 低风险停止 action、`startStopwatch` 确认型状态 action、`pauseStopwatch` / `resumeStopwatch` / `lapStopwatch` / `resetStopwatch` 低风险状态 action、`showNotification` 确认型本地通知 action、`copyToClipboard` 确认型本地剪贴板写入 action 与 `openFolder` 确认型受限常用目录 action，focused test 覆盖 macOS/Windows/Linux/unsupported 平台 reason 归一化；QuickOps evidence gate 已要求 macOS/Windows/Linux artifact 分离；仍需采集真实平台 evidence、真实 AI UI 自然语言编排、真实确认 UI / evidence、高风险执行治理和企业策略。
- [ ] 不支持的平台或缺失命令会展示 degraded reason。部分完成：能力摘要会把 unsupported platform 标记为 degraded，并保留 `public-ip-disabled`、`copy-only-command`、`quickops-disabled` 等 disabled reason；仍需真实平台 evidence。
- [ ] 本机 IP 查询已有 Node `networkInterfaces()` mock 覆盖正常网卡与无非 internal 地址 degraded 结果；仍需真实平台网卡 evidence。
- [ ] 端口可用性探测已有 Node TCP bind focused test 覆盖可用、已占用和非法端口，并覆盖占用端口 PID / 进程归因、copy-only 终止命令与归因失败 fallback；仍需真实平台端口 / 防火墙 / 权限 / 归因 evidence。
- [ ] DNS 查询已有 Node DNS promises focused test 覆盖 A / AAAA / CNAME / MX 成功、深度 NS / TXT / SOA 成功、无记录 degraded、URL/中文命令解析和非法 hostname；仍需真实平台 DNS evidence。
- [ ] 系统代理状态已有 focused test 覆盖 macOS `scutil --proxy`、Windows 当前用户 Internet Settings、Linux GNOME proxy mode fallback、凭据脱敏和探测失败 degraded；仍需真实平台系统代理 evidence。
- [ ] 文件 Hash 已有 focused test 覆盖显式路径、Files input 单文件、多文件 Files input 摘要、缺失文件、目录、多文件任一非法路径 degraded 结果和文件搜索结果 execute action；Flow `fileHash` 已覆盖结构化单文件路径、命令文本路径解析和缺失文件 degraded ack；仍需真实平台文件权限 / 大文件 evidence 与真实文件搜索结果动作 evidence。
- [ ] 文件 Base64 已有 focused test 覆盖显式路径、单个 Files input、多文件 Files input 摘要、Base64 解码到临时文件、非法 Base64 degraded、缺失文件、目录、多文件任一非法路径 degraded、1MB 编码/解码上限和文件搜索结果 execute action；Flow `fileBase64` 已覆盖结构化单文件路径、命令文本路径解析、缺失路径 degraded 和超限 degraded ack，仅包含编码，不包含 decode-to-temp-file；仍需真实平台权限 / 大文件 / 解码写入 evidence 与真实文件搜索结果动作 evidence。
- [ ] 临时文本文件 / 临时目录已有 focused test 覆盖 CoreBox Tuff 临时工作区创建、内容上限 degraded、安全命名、Flow `tempTextFile` / `tempDirectory` 成功 ack 与 degraded ack；Flow 路径只返回 ack，不打开目录、不写剪贴板；仍需真实平台临时写入 / 打开 evidence。
- [ ] 复制路径格式已有 focused test 覆盖显式路径、Files input、Windows/WSL 路径互转、无目标 degraded 结果和文件搜索结果路径 copy-only actions；仍需真实文件搜索结果动作 evidence。
- [ ] 打开常用目录已有 focused test 覆盖 Downloads open/copy action、App Data 与 Logs 路径映射；仍需真实系统打开 evidence。
- [ ] Tuff 诊断信息复制已有 focused test 覆盖 schema、版本/runtime、OS/CPU/内存/uptime、网络计数、脱敏路径、QuickOps 摘要和安全声明，且不复制原始 Home 路径、代理凭据或完整配置；真实排障 evidence 后置。
- [ ] 关键目录占用已有 focused test 覆盖 Desktop / Downloads / Documents / Tuff Data / Logs bounded shallow scan、显式 deep bounded recursive scan、Home 路径脱敏和权限失败 degraded；真实平台目录权限 evidence 后置。
- [ ] Windows 保持唤醒不永久污染电源计划。
- [ ] macOS `caffeinate` 子进程可被可靠清理。
- [ ] Linux backend 有明确探测顺序和 fallback 结果。

### 安全验收

- [ ] 敏感剪贴板内容不进入日志。部分完成：QuickOps Flow `copyToClipboard` focused test 已覆盖敏感文本只写入本地剪贴板，ACK 只返回 `charCount` / `truncated`，本地 QuickOps audit 只记录 `targetId`、decision、requiresConfirmation 和 payload key，不包含剪贴板正文；Flow 全局 audit logger 也只写 payload size 与 `[redacted]` metadata。仍需补完整系统日志/持久化审计路径复扫与真实 evidence。
- [x] 高风险工具默认不启用。当前已落地本地 `allowHighRiskTools=false` 策略基线，旧配置缺失或非法值会归一化为关闭，能力摘要把 `danger` 条目标记为 `high-risk-tools-disabled-by-policy`；真实 kill、批量文件操作、长期系统设置修改、企业集中策略、审计、组织级锁定和真实高风险确认 evidence 仍未闭环。
- [x] 网络工具可单独关闭。当前已落地本地 `allowNetworkTools` 策略基线，关闭后 CoreBox / Flow 网络类工具 fail-closed，能力摘要标记 `network-tools-disabled-by-policy`；企业集中策略、审计和组织级锁定仍未闭环。
- [x] 文件工具可单独关闭。当前已落地本地 `allowFileTools` 策略基线，关闭后 CoreBox / Flow 文件类工具 fail-closed，能力摘要标记 `file-tools-disabled-by-policy`；企业集中策略、审计和组织级锁定仍未闭环。
- [x] 系统工具可单独关闭。当前已落地本地 `allowSystemTools` 策略基线，关闭后 CoreBox / Flow 系统类工具 fail-closed，能力摘要标记 `system-tools-disabled-by-policy`；企业集中策略、审计和组织级锁定仍未闭环。
- [x] 开发者工具可单独关闭。当前已落地本地 `allowDeveloperTools` 策略基线，关闭后 CoreBox PreviewProvider / PreviewSDK 开发者命令 fail-closed，且不会读取剪贴板 fallback；能力摘要标记 `developer-tools-disabled-by-policy`，Flow `format-text` target fail-closed；企业集中策略、审计和组织级锁定仍未闭环。
- [x] QuickOps Flow 本地审计摘要不记录 payload 内容。当前 `quick-ops:audit:get` / `auditRecent()` 只返回最近 Flow delivery 的 target、decision、reason、requiresConfirmation 与 payload key 列表，保存在内存 ring buffer 中；企业集中审计、长期留存、组织级锁定和真实 evidence 仍未闭环。
- [x] 状态型工具都有停止入口。官方 `plugins/touch-quickops` CoreBox root-result 入口已对 keep-awake、system-awake、timer、pomodoro、screen-clean 与 stopwatch 运行会话分别暴露 stop / reset 主操作；Flow 侧已提供对应 stop/reset target 与 `stopAllSessions` 确认型聚合入口。该验收只覆盖插件入口合同与 focused regression，不替代 packaged quit cleanup、真实运行状态或真实确认 UI evidence。
- [ ] Flow / AI 调用复用同一确认模型。部分完成：FlowBus 已对所有 `requireConfirm=true` target 强制一次性 `confirmationToken`，持久 sender consent 不能绕过本次执行确认；QuickOpsModule focused test 已聚合断言 `stop-all-sessions`、`public-ip`、`temp-text-file`、`temp-directory`、`keep-awake`、`system-awake`、`start-timer`、`start-pomodoro`、`clean-screen`、`start-stopwatch`、`show-notification`、`copy-to-clipboard` 与 `open-folder` 等会改变状态、外联、写入剪贴板/文件或打开本地目录的 Flow target 必须 `requireConfirm=true`；`quickops:flow-ai:audit` 已把 Flow target 目录、确认集合、策略阻断 ACK、audit/clipboard 脱敏、degraded ACK、Flow confirmation token 路径、bounded natural-language resolver 和 runtime dispatch bridge 合同输出为 `quickops-flow-ai-adapter-audit/v1` artifact；runtime bridge 对只读 plan 可调用 FlowBus，对确认型 plan 必须携带一次性 `confirmationToken`，对高风险、degraded、unsupported plan 不 dispatch。当前 source-level strict audit 可证明桥接合同，但仍需真实 AI UI 接入、真实确认 UI 截图/录屏 evidence 和高风险治理 evidence。
- [ ] 无 legacy raw channel / SDK bypass。部分完成：QuickOpsModule focused test 已锁定当前对外注册面只通过 `QuickOpsEvents.*` typed transport event 注册只读 SDK facade，并且 Flow target 统一经 `flowTargetRegistry.registerTarget('quickops', ...)` 与单一 `flowBus.registerDeliveryHandler('quickops', ...)` 暴露；QuickOps evidence gate 已新增 `quickops-sdk-transport-surface` required case，且 `quickops:surface:audit --strict` 可生成当前 SDK/transport surface 审计 JSON，覆盖 typed transport 注册面、Flow registry、单一 delivery handler、transport/plugin SDK 只读 facade、TouchPlugin runtime 注入 facade 和 forbidden raw channel pattern；未发现 QuickOps 模块内新增 `regChannel` / `ipcMain` / legacy raw channel 入口。仍需全仓 legacy alias/raw channel 复扫、真实 packaged plugin SDK 调用 evidence 和发布包 runtime evidence。

插件运行时 focused test 已额外锁定 `featureUtil.quickOps` / `featureUtil.plugin.quickOps` 暴露完整只读方法集，并确认每个入口都通过 `QuickOpsEvents.*` typed transport invoke；这仍不替代真实 packaged plugin SDK runtime probe 或发布包 evidence。

### 文档验收

- [x] PRD、README/INDEX 入口保持一致。当前 `docs/plan-prd/README.md` 与 `docs/INDEX.md` 已同时暴露 QuickOps PRD，并补充 Nexus QuickOps 用户指南与开发者 API 入口；后续 QuickOps 行为、接口或架构继续按文档同步规则更新。
- [ ] 后续实现影响行为 / 接口 / 架构时同步 TODO、CHANGES 或 Roadmap。
- [x] Nexus docs 已补用户指南与开发者说明：用户侧覆盖 CoreBox 使用入口、常用命令、Ops 场景速查、设置 / 策略、安全边界、插件扩展边界、何时写插件和未完成项；开发者侧覆盖插件 `quickOps` 只读 facade、transport domain SDK、Flow 扩展模式、`quickops.*` target 目录、扩展路径选择、第三方扩展模式、插件自有 Ops checklist、内置 QuickOps 贡献 checklist、扩展建议和 `globalThis.quickOps` 上下文入口。该验收只代表文档入口与扩展边界落地，不替代真实平台 evidence、packaged quit evidence、完整 AI 编排、高风险治理或企业集中策略 / 审计 / 组织级锁定。

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
