# 跨平台系统能力与本地数据源专项

> 日期：2026-05-22
> 范围：Raycast / Alfred / uTools 的跨平台系统能力、本地数据源策略，与 Tuff 当前 live tree 对齐。
> 任务：9/10
> 非目标：不改代码、不扩大到完整 App Data 实现、不把源码存在等同于发布闭环。

## 1. 结论

Tuff 当前跨平台基础能力的真实状态是：Windows 能力面最主动，macOS 能力面最依赖系统权限，Linux 必须维持 documented best-effort。和 Raycast / Alfred / uTools 对比，Tuff 缺的不是单个“启动器”或“文件搜索”实现，而是三个更硬的发布前提：

1. 平台差异必须变成用户可见的 `supported` / `best_effort` / `unsupported` / `permission-missing` / `degraded` reason。
2. 本地数据源必须先做只读、显式授权、可禁用、可清理、可诊断；不能默认扫描浏览器历史、系统 Notes / Calendar / Reminders / Contacts / Mail 或跨设备同步明文。
3. 2.4.11 必须补 Windows/macOS 真机 evidence；2.5.0 再推进 App Data Source 合同和 Browser History / Obsidian / VSCode / macOS App Data 调研切片。

竞品模式可以归纳为：

| 产品 | 平台策略 | 本地数据源策略 | 对 Tuff 的直接启发 |
| --- | --- | --- | --- |
| Raycast | macOS 成熟，Windows 正在扩展；Root Search 承载 app、files、clipboard、window、calendar、notes 等核心能力 | 内建 Clipboard History、File Search、Window Management、Notes、Calendar；更像“系统能力 + 自有数据源”组合 | Tuff 要把 CoreBox 基础源做成一眼可懂的健康状态和失败 reason，不能只靠插件散落 |
| Alfred | macOS-only；深度依赖 Spotlight / macOS metadata / Universal Actions / Powerpack | File Search、Clipboard、Snippets、System Commands、Web Search 都可配置；本地能力强但平台不扩张 | Tuff 的 macOS 侧应尊重 TCC 和用户配置，不应默认读取系统 App 数据库 |
| uTools | Windows / macOS / Linux 跨平台；插件生态与超级面板是核心 | 通过输入框、插件指令、超级面板把文本/图片/文件/文件夹等上下文映射到插件 | Tuff 的 `acceptedInputTypes` 和 Clipboard / Context signals 应收敛成 Context Actions 合同，而不是复制桌面鼠标面板 |

## 2. 竞品横向分析

| 能力域 | Raycast | Alfred | uTools | 共同产品规律 |
| --- | --- | --- | --- | --- |
| App Launcher | Root Search 直接启动应用，Windows 页面也把 App Launcher 放进核心能力 | Default Results / Applications 是 Alfred 主入口能力 | 搜索框可启动软件、系统设置、自定义本地启动文件 | 应用启动是基础源，需支持别名、常用项、最近项、失败诊断 |
| File Search | Manual 说明可搜索文件/文件夹，并配合 Action Panel 做 Quick Look / Reveal / Open 等动作 | File Search 支持关键词和文件动作，是 Alfred 核心功能 | 本地搜索 / 文件启动中心用于直达文件、文件夹 | 文件源必须有范围、性能、权限和不可用提示 |
| Clipboard | Clipboard History 保存文本、图片、文件、链接等，并可按类型过滤 | Powerpack Clipboard History 支持文本、图片、文件链接、保存时长和清理 | 剪贴板插件是高频基础插件 | 剪贴板历史必须有保留策略、清理入口、多类型回贴失败态 |
| Window Management | 内建 Window Management，支持窗口布局和快捷命令 | 非内建同级核心，通常靠 Universal Actions / Workflows 扩展 | 依赖插件或超级面板触发窗口类动作 | 窗口能力高度平台相关，必须显式权限和真机多屏 evidence |
| System Actions | 可执行系统命令和快捷动作 | System Commands 是独立功能类 | 搜索系统设置、插件指令、自动化动作 | 系统动作要区分只读展示、危险操作确认、shell/native 权限 |
| Browser Data | 以 Quicklinks / Search Links / 扩展生态为主，不默认承诺完整浏览器历史索引 | Web Search / Web Bookmarks / Workflows 组合，不做跨浏览器历史默认扫描 | 插件生态可扩展网页快开、浏览器相关能力 | 书签可只读起步；历史、Safari、账号数据不能默认读 |
| Notes / Calendar / Reminders | 有 Notes 与 Calendar 等自有能力；Calendar 涉及日程数据权限 | 可通过 Workflows/AppleScript 等方式扩展系统 App 数据 | 备忘、日程等多靠插件 | 这类数据高敏，首版只能调研权限和降级 reason |
| Local App Data | 以官方内建源和扩展源并存 | 依赖 macOS metadata、Workflows、用户配置 | 插件可读取本地数据并匹配上下文 | 所有 App Data 都应 source 化、可禁用、可清理、可审计 |

### 2.1 官方事实复核

- Raycast File Search 明确只匹配文件名，不索引文件内容；默认索引 home folder，文件索引保存在本机，不同步或上传到 Raycast server。这意味着 Tuff 的 FileProvider 内容索引、Everything 全盘召回和 App Data 索引都必须有更严格的 scope / ignore / evidence。
- Alfred File Search 用 `open` / `find` / `in` 扩展文件、Finder reveal 和内容搜索；Clipboard History 默认因隐私关闭，需要用户启用、设置保留期，并授予 macOS Accessibility 权限。这是 Tuff Clipboard 和 Context Actions 不能默认后台抓取的直接参考。
- uTools 超级面板面向选中文本、图片、文件、文件夹匹配功能；本地搜索作为插件化基础能力存在。Tuff 不需要复制鼠标面板形态，但需要把 `TuffInputType.Text/Image/Files/Html` 和插件能力声明收敛为可审计的 Context Actions。

## 3. Tuff 当前证据快照

| 能力域 | 当前状态 | Tuff 代码证据 | 判断 |
| --- | --- | --- | --- |
| App Launcher | 已落地，证据不足 | `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`；Windows scanner `win.ts`；macOS scanner `darwin.ts`；Linux scanner `linux.ts` | Windows 覆盖 Start Menu / UWP / shortcut / registry 等复杂来源；macOS 用 `mdfind` 和 localized display name；Linux 解析 `.desktop`。缺真机样本和失败 reason 汇总 |
| Windows Everything | 已落地，发布策略未最终收口 | `everything-provider.ts` 具备 `sdk-napi -> cli -> unavailable` fallback、status snapshot、manual CLI path、unavailable notice、diagnostics、path filtering | 能力较完整，但 SDK 是否随包、CLI-only 是否作为正式策略、P50/P95 和 watch-root 过滤仍需 Windows evidence |
| macOS Native File Search | 部分落地 | `native-file-search-provider.ts` 的 `MacSpotlightFileProvider` 使用 `mdfind`，限制在 Documents / Downloads / Desktop / Music / Pictures / Videos 与用户额外路径 | 适合对齐 Raycast/Alfred 文件名搜索；不能扩大成默认全文或系统 App 数据扫描 |
| Linux Native File Search | best-effort | `native-file-search-provider.ts` 的 `LinuxNativeFileProvider` 依赖 `locate` / `tracker3` / `tracker` / `baloosearch` | 只能声明 best-effort；缺后端时必须 degraded/unsupported |
| Clipboard | 已落地，隐私和 evidence 仍需补 | `clipboard-capture-pipeline.ts` 读取 text / files / image / HTML 并写入 `clipboard_history`；`clipboard-history-persistence.ts` 支持查询、favorite、delete、cleanup；`plugins/clipboard-history` 提供 UI | 功能接近竞品基础项；还需多类型真机回贴、保留策略、自动粘贴失败态 |
| Window Management | 部分落地 | `plugins/touch-window-manager/index.js`；`plugins/touch-window-presets/index.js` | Windows/macOS shell-backed；presets 当前 Windows-only，Linux unsupported；必须保留 `system.shell` gate |
| System Actions | 部分落地 | `plugins/touch-system-actions/index.js` 支持关机、重启、锁屏、音量、亮度、主窗口，含危险确认和 capability meta | Windows/macOS 可用，Linux 明确 unsupported；危险操作已弹确认，但仍需真机 evidence |
| Browser Data | 首版只读落地 | `plugins/touch-browser-data/index.js` 只读扫描 Chrome / Edge / Brave / Arc Chromium `Bookmarks` JSON；需 `fs.read`；输出 supported / unsupported / not-found / read-failed diagnostics | 书签首版方向正确；History SQLite、Safari、持久索引、disable/clear/rebuild UI 后置 |
| Notes / Calendar / Reminders | 仅规划/调研 | `APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md` 的 MAC-010 / MAC-020 | 涉及 TCC、PII、系统数据库格式变化，不能默认扫描 |
| Storage / Sync / Security | 规则明确，仍需执行一致性 | permission registry 定义 `fs.read` / `fs.write` / `clipboard.*` / `system.shell`；`cloud-sync-sdk.ts` 使用 `/api/v1/sync/*`；`types/cloud-sync.ts` 限定 `payload_enc` / `payload_ref`；SQLite schema 承载 clipboard、usage、plugin data | App Data 和 Clipboard 不应以明文 JSON dump 同步；`deviceId` 只能标识设备，不能派生密钥 |

## 4. 平台矩阵

| 能力域 | 竞品对照 | Windows 现状 | macOS 现状 | Linux 现状 | Tuff 代码证据 | unsupported / degraded / fail-closed reason | 最小 evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| App Launcher | 三者都把 app 启动当基础入口 | 支持 Start Menu、UWP、shortcut、exe、Steam/registry 等路径；需要常用 app 真机证据 | 通过 `mdfind` 发现 `.app`，读取 localized name / plist / icon | 解析 `.desktop`，依赖桌面文件质量 | `app-provider.ts`、`win.ts`、`darwin.ts`、`linux.ts` | Windows shortcut/UWP 解析失败要暴露 source；macOS localized name 可能为空；Linux `.desktop` 缺 Exec/NoDisplay 时跳过 | 每平台 10 个常用 app 搜索/启动样本，记录 source、displayName、launchKind、launchTarget、失败 reason |
| File Search | Raycast/Alfred 文件搜索是基础；uTools 有本地搜索 | Everything 为主，FileProvider fallback；需要 SDK/CLI 策略和路径过滤 evidence | Spotlight native + FileProvider 索引；默认限定用户目录和 extra paths | native backend best-effort + FileProvider；`locate/tracker/baloo` 不存在时 degraded | `everything-provider.ts`、`native-file-search-provider.ts`、`file-provider.ts` | Everything 非 Windows unsupported；Windows backend missing degraded；Linux backend missing degraded；watch-root 外结果必须丢弃 | Windows SDK/CLI/unavailable 三场景；macOS `mdfind` scoped sample；Linux backend available/missing sample；P50/P95 |
| Clipboard | Raycast/Alfred 都支持 searchable history；uTools 通过插件 | Electron clipboard + SQLite history；需验证 text/image/files/html | 同左，sourceApp best-effort 更有价值 | 同左，自动粘贴依赖桌面自动化 | `clipboard-capture-pipeline.ts`、`clipboard-history-persistence.ts`、`plugins/clipboard-history` | 自动粘贴属于 best-effort；图片/HTML 大对象和敏感内容不能默认云同步 | text/image/files/html capture、search、copy、apply、delete、cleanup；paste blocked/failure UI |
| Window Management | Raycast 内建；Alfred/uTools 多靠扩展 | `touch-window-manager` + Windows-only presets，PowerShell/user32 路径 | `osascript` / System Events 路径，依赖 Automation/Accessibility | 当前 shell capability unsupported | `touch-window-manager/index.js`、`touch-window-presets/index.js`、`capability-adapter.ts` | Linux unsupported；macOS Automation denied best_effort/blocked；Windows PowerShell/Win32 failure degraded | Windows 多屏 preset、窗口列表、permission missing、执行失败；macOS activate/hide/quit permission denied |
| System Actions | Raycast/Alfred 都有系统命令；uTools 可搜系统设置/插件动作 | 关机/重启/锁屏/音量/主窗口；危险操作需确认 | 同类能力 + 亮度；依赖 shell/AppleScript | 当前插件明确 unsupported | `touch-system-actions/index.js`、`permission/registry.ts` | `system.shell` missing blocked；safe-shell missing fail-closed；Linux `platform:linux` unsupported | 展示期 capability meta、拒权、取消、执行成功、管理员/危险确认截图或日志 |
| Browser Data | 竞品不默认承诺全浏览器历史；多用 quicklinks/bookmarks/workflows/plugins | Chrome/Edge/Brave/Arc Bookmarks JSON 只读；Arc UWP path | Chrome/Edge/Brave/Arc Bookmarks JSON 只读 | Chrome/Edge/Brave，Arc unsupported | `plugins/touch-browser-data/index.js` | 缺 `fs.read` blocked；Bookmarks not-found/read-failed；Safari unsupported；History 不进入默认 | `fs.read` denied、not-found、read-failed、Chrome/Edge/Brave/Arc sample、open URL、copy URL |
| Notes / Calendar / Reminders | Raycast 有 Notes/Calendar；Alfred/uTools 可扩展 | 暂不默认读取 Windows 日历/便签类数据库 | 仅调研 Notes / Reminders / Calendar；必须 TCC 授权 | 暂不默认扫描各桌面环境 PIM 数据 | Roadmap MAC-010 / MAC-020 | PII 高敏、系统数据库格式变化、权限不可解释时 unsupported | 只产出权限/路径/降级 reason 调研表；无索引、无同步 |
| Local App Data | uTools 插件生态最接近；Alfred Workflows 可读本地数据 | Browser Data、VSCode/Obsidian/Epic 需用户选源 | macOS App Data 必须单 source 授权 | Linux app data 路径碎片化，best-effort | `APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md` | 未配置 source 不扫描；禁用后不搜索；清理后不保留索引；远端同步仅密文 payload | `AppDataSource` health、lastIndexedAt、itemCount、lastError、disable/clear/rebuild evidence |

## 5. 授权、只读与禁止默认扫描边界

### 5.1 必须显式授权

| 能力 | 必要授权 | 原因 |
| --- | --- | --- |
| Browser Data Bookmarks / History | `fs.read` + source enable | 浏览器 profile 可包含私密 URL、账号工作流、企业内网页 |
| File Index extra paths | `fs.index` 或等价目录选择确认 | 用户目录外扫描范围不可隐式扩大 |
| Clipboard History / Auto Paste | `clipboard.read` / `clipboard.write`，自动粘贴另需平台自动化能力 | 剪贴板是高敏上下文；回贴会修改前台应用 |
| Window/System shell actions | `system.shell`，危险操作再二次确认 | 关机、重启、窗口移动、shell 命令均有破坏性或隐私风险 |
| macOS active app / selection capture / Calendar / Reminders / Contacts | macOS Automation / Accessibility / TCC 对应授权 | 不应绕过系统权限，也不能把空结果伪装成成功 |
| Sync key / secret / provider credential | secure store 可用或显式 degraded | `deviceId` 不能作为密钥材料，secret 不能写明文 JSON/localStorage/log |

### 5.2 只能只读起步

| 数据源 | 首版允许 | 首版禁止 |
| --- | --- | --- |
| Chromium Bookmarks | 读取 `Bookmarks` JSON、搜索、打开 URL、复制 URL | 写回书签、读取账号同步数据、默认读取 History |
| Chromium History | 复制 SQLite 到临时只读副本、限制最近 N 天/N 条、展示 source diagnostics | 直接打开 live SQLite、无限历史索引、后台默认开启 |
| Obsidian / VSCode | 用户选择 root / workspace 后索引 title/path/tag/recent workspace | 未授权扫描全家目录、解析私密 vault 全文并同步 |
| macOS Notes / Calendar / Reminders | 权限与格式调研、降级 reason、可行性验证 | 默认读取系统数据库、默认写索引、默认同步 |
| Clipboard | 本地 SQLite history、用户可清理、按类型查询 | 默认跨设备同步完整 clipboard 明文 |

### 5.3 绝不应默认扫描或同步

- 浏览器 History、Cookies、Sessions、Login Data、Safari 历史/书签数据库。
- macOS Notes、Calendar、Reminders、Contacts、Mail 本地数据库。
- 剪贴板完整历史、图片原图、HTML 富文本、文件路径列表。
- Obsidian vault 全文、VSCode 最近项目、企业内网链接、token/config/secrets。
- Everything / native file search 的 watch-root 外路径结果。
- 任何业务明文 JSON dump。同步载荷只能使用 `payload_enc` / `payload_ref`，本地 SoT 仍以 SQLite 或受控本地索引为准。

## 6. 2.4.11 真机 evidence 清单

| Evidence | 平台 | 验收点 | 产物 |
| --- | --- | --- | --- |
| App Launcher release-blocking sample | Windows/macOS，Linux best-effort | 每平台 10 个 app；Windows 覆盖 shortcut/UWP/exe/registry；macOS 覆盖 localized display name；Linux 覆盖 `.desktop` 成功和跳过 | JSON + 截图/录屏；字段含 query、source、launchKind、launchTarget、CoreBox hidden evidence |
| Everything backend matrix | Windows | `sdk-napi`、CLI、unavailable；manual CLI path；settings diagnostics；unavailable notice | `windows-everything-file-search-capability.json` + Settings 截图 |
| Everything path filtering | Windows | watch-root 外结果 dropped，watch-root 内目标命中 | raw/filtered/dropped count、sample path 脱敏 |
| File Search native | macOS/Linux | macOS `mdfind -onlyin` scope 生效；Linux `locate/tracker/baloo` available/missing 两态 | provider health、query sample、duration、empty/degraded reason |
| Clipboard multi-type | Windows/macOS/Linux | text/image/files/html capture、search、copy、apply、delete、cleanup；自动粘贴失败有 UI reason | SQLite row count + UI 截图/录屏 + failure log excerpt |
| Browser Data bookmarks | Windows/macOS/Linux | `fs.read` denied、available、not-found、read-failed、unsupported；open/copy URL | 每 browser source diagnostics + CoreBox item 截图 |
| System Actions | Windows/macOS/Linux | Windows/macOS 执行前 capability meta；危险操作取消；Linux unsupported | shell permission denied/allowed、cancelled、blocked、unsupported evidence |
| Window Management | Windows/macOS/Linux | Windows 多屏 preset；macOS Automation denied；Linux unsupported | window list count、preset result、permission state、error reason |
| Storage / Sync guard | 全平台 | 不产生明文同步 payload；App Data/Clipboard 无默认 cloud push | sync payload sample 只含 `payload_enc`/`payload_ref`；日志无明文 URL/clipboard |

## 7. 2.5.0 可落地切片

| 切片 | 范围 | 验收 |
| --- | --- | --- |
| `AppDataSource.v1` | 定义 source id、displayName、platform、permissionState、health、lastIndexedAt、itemCount、lastError、disable、clearIndex、rebuildIndex | Settings 与 CoreBox 都能展示 source diagnostics；禁用后不搜索，清理后无索引残留 |
| `BrowserHistory.readonly.v1` | Chromium History 复制到临时只读副本；限制最近 N 天/N 条；默认关闭 | 无 live DB lock；无 cookies/sessions/login 读取；denied/not-found/read-failed 清楚 |
| `Safari.research.reason` | 只调研 Safari 书签/历史位置、TCC 和可行性 | 输出 unsupported/degraded reason，不写索引 |
| `Obsidian.vault.v1` | 用户选择 vault；索引 path/title/heading/tag/frontmatter alias；打开 `obsidian://` | 多 vault、disable/clear/rebuild、忽略 `.obsidian` 缓存 |
| `VSCode.local.v1` | 读取本地 extensions 和 recent workspaces；无联网 marketplace | CLI availability reason、workspace open evidence |
| `macOS-AppData.research` | Notes / Reminders / Calendar / Contacts 权限与格式调研 | 明确不默认扫描；只产出 permission / degraded / unsupported matrix |
| `ContextActions.v1` | selected text、clipboard image、clipboard file paths -> plugin action list | 不后台抓取；只在用户触发时读取；写入类 action 必须二次确认 |

## 8. 执行优先级

| 优先级 | 内容 | 理由 |
| --- | --- | --- |
| P0 / 2.4.11 | App Launcher、Everything、native file search、Clipboard、Browser Data bookmarks、System/Window permission evidence | 当前代码已存在，缺的是发布可信度 |
| P1 / 2.4.11 后续 | Quicklinks 合同、Context Actions v1、Browser Data disable/clear/rebuild UI | 统一用户心智，避免继续散落插件 |
| P1 / 2.5.0 | Browser History readonly、Obsidian、VSCode local data | 高价值且可做到用户显式授权 |
| P2 | macOS Notes / Calendar / Reminders / Contacts | 高敏数据，必须先调研，不抢稳定化 |
| P3 | Mail、Cookies、Sessions、跨设备 App Data 全量同步 | 风险过高，当前不进入主线 |

## 9. 10 轮 enforce/review 摘要

| 轮次 | 检查点 | 结果 | 调整 |
| --- | --- | --- | --- |
| 1 | 范围 enforce：只输出任务 9 指定文档 | 通过 | 不改代码、不改 TODO/INDEX/CHANGES |
| 2 | 竞品事实 review：优先官方来源 | 通过 | 使用 Raycast Manual、Alfred Help、uTools 帮助中心；避免第三方推测 |
| 3 | 仓库证据 enforce：不信旧 Done | 通过 | 逐项核对 AppProvider、Everything、native file、Clipboard、Browser Data、System/Window 插件 |
| 4 | 平台矩阵 review：Windows/macOS/Linux 均覆盖 | 通过 | 每个能力域都写现状、reason、最小 evidence |
| 5 | 隐私 enforce：是否默认扫描敏感 App Data | 通过 | Notes/Calendar/Reminders/Contacts/Mail 全部降为调研或禁止默认 |
| 6 | Storage/Sync review：是否违反 SQLite SoT / 密文同步规则 | 通过 | 明确业务明文 JSON dump 禁止，sync 仅 `payload_enc` / `payload_ref` |
| 7 | KISS/YAGNI enforce：是否提出大而全重写 | 通过 | 2.5.0 切片以 source 合同和只读数据源为主 |
| 8 | fail-closed review：是否把缺权限写成空结果成功 | 已避免 | Browser Data、System/Window、Everything、Linux backend 均要求 reason |
| 9 | Evidence enforce：是否把源码存在等同发布闭环 | 已避免 | 所有已落地能力仍要求真机截图/日志/JSON 样本 |
| 10 | 文档完整性 review：是否满足任务 9 六项要求 | 通过 | 含横向分析、Tuff 对照、平台矩阵、权限边界、2.4.11/2.5.0 evidence、review 摘要 |

## 10. 引用来源

### Raycast

- Raycast Manual - Search Bar: https://manual.raycast.com/search-bar
- Raycast Manual - File Search: https://manual.raycast.com/file-search
- Raycast Manual - Clipboard History: https://manual.raycast.com/clipboard-history
- Raycast Manual - Window Management: https://manual.raycast.com/window-management
- Raycast Manual - Calendar: https://manual.raycast.com/calendar
- Raycast Manual - Notes: https://manual.raycast.com/notes
- Raycast Manual - Settings: https://manual.raycast.com/settings
- Raycast Windows: https://www.raycast.com/windows

### Alfred

- Alfred Help - Features Overview: https://www.alfredapp.com/help/overview/
- Alfred Help - File Search: https://www.alfredapp.com/help/features/file-search/
- Alfred Help - Clipboard History: https://www.alfredapp.com/help/features/clipboard/
- Alfred Help - System Commands: https://www.alfredapp.com/help/features/system/
- Alfred Help - Web Search: https://www.alfredapp.com/help/features/web-search/
- Alfred Help - Universal Actions: https://www.alfredapp.com/help/features/universal-actions/
- Alfred Help - Workflows: https://www.alfredapp.com/help/workflows/

### uTools

- uTools 官网: https://www.u-tools.cn/
- uTools 帮助中心 - 为什么使用 uTools: https://www.u-tools.cn/docs/guide/about-uTools.html
- uTools 帮助中心 - 超级面板: https://www.u-tools.cn/docs/guide/uTools-super-panel.html
- uTools 帮助中心 - 功能指令: https://www.u-tools.cn/docs/guide/what-is-keyword.html
- uTools 帮助中心 - 本地搜索: https://www.u-tools.cn/docs/guide/plugin-local-search.html
- uTools 帮助中心 - 剪贴板: https://www.u-tools.cn/docs/guide/plugin-clipboard.html

### Tuff 仓库证据

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
- `docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md`
- `docs/plan-prd/TODO.md`
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/win.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/darwin.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/linux.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/native-file-search-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-capture-pipeline.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-history-persistence.ts`
- `plugins/clipboard-history/src/views/ClipboardManagerView.vue`
- `plugins/touch-browser-data/index.js`
- `plugins/touch-system-actions/index.js`
- `plugins/touch-window-manager/index.js`
- `plugins/touch-window-presets/index.js`
- `apps/core-app/src/main/modules/platform/capability-adapter.ts`
- `packages/utils/permission/registry.ts`
- `packages/utils/cloud-sync/cloud-sync-sdk.ts`
- `packages/utils/types/cloud-sync.ts`
- `apps/core-app/src/main/db/schema.ts`
