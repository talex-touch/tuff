# Windows 启动优化 PRD

> 更新时间：2026-06-18
> 状态：规划 / 待真实 Windows benchmark 验证
> 适用范围：`apps/core-app` 在 Windows 上的冷启动、热启动、首窗显示、CoreBox 可交互与后台模块 ready。
> 关联文档：`./CoreAppPerformanceBaseline-2026-05-28.md`、`../../report/coreapp-startup-async-blocking-analysis-2026-05-13.md`

## 1. 问题定义

Windows 启动慢通常不是单点缺陷，而是 Electron 冷启动、Windows Defender / 杀软扫描、小文件 I/O、主进程模块串行初始化、插件目录扫描、文件搜索状态检测和 renderer 首屏依赖叠加造成。优化目标不是“让所有能力都在启动前完成”，而是把非首屏能力移出启动关键路径，让用户更早看到窗口、更早唤起 CoreBox，并让插件、文件索引、Terminal、同步等能力在后台渐进 ready。

## 2. 目标

### 用户目标

- Windows 首窗尽快显示，避免双击后长时间无反馈。
- CoreBox 尽快可唤起，基础命令、应用、缓存结果先可用。
- 插件、文件搜索、索引、更新、同步等后台能力 ready 状态可解释，不阻塞首屏。

### 工程目标

- 用可复现数据区分 Electron runtime、主进程模块、窗口创建、renderer 首屏和后台 provider 长尾。
- 保持 SDK hard-cut、插件权限、secure-store、Storage hydration、Onboarding 判定和 typed transport 约束不降级。
- 优先做低风险异步化、缓存化、懒加载；高风险重排必须有回滚点和 Windows 实机证据。

## 3. 非目标

- 不为了启动速度跳过 Storage hydration 或首次引导判定。
- 不绕过插件 SDK / permission / capability gate。
- 不把 dev benchmark、mock 数据或 macOS 体感作为 Windows 完成证据。
- 不在启动阶段强制完成全部插件 runtime、文件索引、Terminal runtime 或同步任务。
- 不把临时 compatibility-only 实现当作正式优化方案。

## 4. 启动阶段拆分

| 阶段 | 起点 | 终点 | 用途 |
| --- | --- | --- | --- |
| Process start | 用户启动 exe | main bundle 开始执行 | 判断包体、签名、杀软扫描、顶层 import 成本 |
| Electron ready | main entry | `app.whenReady()` | 判断 Electron / Chromium runtime 冷启动成本 |
| Critical main init | `app.whenReady()` | 最小主进程服务可用 | 只保留窗口、storage/channel/file protocol 必需依赖 |
| First window | BrowserWindow 创建 | `ready-to-show` / show | 判断窗口创建、Mica、preload、loadURL/loadFile 成本 |
| Renderer first usable | renderer script start | Vue mounted / first interactive | 判断首屏 bundle、store hydration、路由和 UI 成本 |
| CoreBox interactive | Shortcut ready | 首批搜索结果可返回 | 判断 launcher 是否可用，不等待全部 provider |
| Full ready | 后台模块开始 | plugins/providers/watchers ready | 只作为健康完成，不阻塞首屏 |

## 5. Windows 高风险启动源

| 来源 | 风险 | 优化方向 |
| --- | --- | --- |
| Windows Defender / 杀软 | 更新后或未签名包首次启动扫描 exe、asar、native modules、unpacked 资源 | 正式包签名、减少 unpacked 文件和启动时小文件遍历、避免启动扫描插件/索引目录 |
| 主进程串行模块 | Database、Storage、ExtensionLoader、Plugin、FileSystemWatcher、Terminal 等排队进入 critical path | 模块分级：critical / after-window / idle / lazy |
| 插件加载 | manifest 扫描、SDK 校验、prelude 执行、图标/资源读取造成小文件 I/O 长尾 | 插件摘要缓存、manifest mtime/hash 增量刷新、prelude 按需执行、图标懒加载 |
| 文件搜索 | Everything 状态检测、File Provider 索引、watch roots 注册过早 | Everything 后台检测，File Provider / watcher idle 后启动，搜索先返回 fast providers |
| Renderer 首屏 | App.vue / store / route / dashboard 全量 import 和 hydration | 路由 lazy import、首屏 shell 最小化、非首屏 store 延迟 hydration、图标按需 |
| Windows 窗口效果 | Mica / transparent window / GPU 初始化影响首帧 | profiling 证实后再考虑首帧后启用或 performance mode |

## 6. 推荐启动架构

```text
app ready
  ↓
critical: storage minimal / channel / file protocol / window shell
  ↓
create and show main window
  ↓
renderer first interactive
  ↓
after-window: shortcut / tray / CoreBox shell / app commands
  ↓
idle: plugin scan / file watcher / Everything status / Terminal / update / sync
  ↓
lazy: plugin runtime / heavy providers / deep index / optional surfaces
```

### 模块分级建议

| Stage | 模块 / 能力 | 要求 |
| --- | --- | --- |
| critical | Database minimal handle、Storage minimal config、CommonChannel、FileProtocol、TouchWindow | 必须短、可观测、失败 fail-closed |
| after-window | Shortcut、Tray、CoreBox shell、AddonOpener、Clipboard minimal | 窗口显示后并行或小批启动 |
| idle | ExtensionLoader 深度扫描、Plugin manifest refresh、PluginLog 历史处理、FileSystemWatcher、Everything status、Update/Download/SystemUpdate background work | 不阻塞首窗，状态通过事件更新 |
| lazy | Plugin prelude/runtime、Terminal runtime、文件内容索引、同步长任务、非首屏 Dashboard data | 由用户打开或 provider 首次命中触发 |

## 7. 指标与验收

### 必采指标

| 指标 | 目标口径 |
| --- | --- |
| `main.entry.to.whenReady` | Electron ready 前成本 |
| `whenReady.to.firstWindowCreate` | critical main init 成本 |
| `firstWindowCreate.to.readyToShow` | BrowserWindow / preload / load 成本 |
| `renderer.scriptStart.to.mounted` | renderer 首屏成本 |
| `firstWindow.show` | Time to First Window |
| `corebox.shortcutReady` | CoreBox 可唤起时间 |
| `corebox.firstResult` | 首批搜索结果时间 |
| `modules.fullReady` | 后台能力完成时间 |
| `provider.<name>.ready/degraded` | provider ready、降级原因和耗时 |

### 建议目标

| 场景 | 目标 |
| --- | --- |
| Windows 冷启动首窗显示 | ≤ 2.5s |
| Windows 热启动首窗显示 | ≤ 1.2s |
| CoreBox 可唤起 | ≤ 1.5s |
| 基础搜索首批结果 | ≤ 300ms |
| 插件 / 文件 / Terminal full ready | 后台 3-8s 可接受，必须可解释 |

### 完成证据

- 至少一台 Windows 真实设备冷/热启动各 10 次 summary。
- dev 与 packaged 分开记录，不混用结论。
- 输出包含 git sha、dirty 状态、Windows 版本、CPU、磁盘类型、Defender 状态说明。
- 记录首窗、CoreBox、providers、modules full ready 的 p50 / p95 / max。
- 若引入模块重排，必须有启动失败、权限拒绝、Everything unavailable、插件 manifest 异常的 degraded evidence。

## 8. 分阶段落地

### P0：观测先行

- 在 startup profiler 中补齐 Windows 关键阶段：process start、Electron ready、critical init、window ready、renderer mounted、CoreBox first result。
- 模块生命周期输出 construct / ensureDir / created / init / start 分段耗时。
- provider 输出 ready / degraded / skipped 与原因，不记录敏感路径或原始查询内容。

### P1：首窗提前

- 保持 critical path 只包含首窗和基础交互必需依赖。
- 将明确非首屏模块继续移到 after-window / idle：插件深度扫描、watcher、update/download/system refresh、Everything status、Terminal runtime。
- 对 Windows Mica / window effects 增加可观测指标，只有证据显示影响首帧时再延迟启用。

### P1：插件缓存化

- 引入插件摘要缓存，包含 plugin id、manifest mtime/hash、sdkapi、features summary、icon reference。
- 启动先读取缓存注册可搜索摘要，后台增量扫描 manifest。
- prelude/runtime 按需或 idle 执行，执行前保持权限和 SDK 校验不降级。

### P1：Windows 搜索后台化

- Everything 状态检测不阻塞启动；初始状态为 `unknown`，后台探测 PATH / 默认位置 / service。
- 搜索时 Everything ready 才进入 fast path；unknown/unavailable 明确跳过或降级。
- File Provider 不在 Windows 启动时做目录扫描；FileSystemWatcher idle 后注册。

### P2：Renderer 首屏拆包

- 检查 `main.ts`、`App.vue`、router、Pinia stores、Dashboard/Settings/Terminal/Flow 是否进入首屏 bundle。
- 非首屏页面使用路由级 lazy import；非首屏 store 延迟 hydration。
- 当前语言以外的 i18n、重图标、大型图表和非首屏组件按需加载。

### P3：发布包与系统信誉

- 正式 Windows 包保持代码签名，降低 Defender 冷启动扫描概率。
- 审计 asar / unpack 配置，减少启动相关 unpacked 小文件。
- 对 native modules、资源目录和插件目录建立包体/文件数量基线。

## 9. 风险与回滚

| 风险 | 防线 |
| --- | --- |
| 模块后移导致 handler 未注册 | after-window 前保留 handler-first，runtime 后台启动 |
| 插件摘要缓存过期 | 使用 manifest mtime/hash 校验，异常时单插件刷新并降级 |
| Everything 状态 unknown 导致搜索缺结果 | Fast providers 先返回，Everything ready 后增量更新 |
| Storage hydration 被绕过 | 首屏只允许 soft timeout 展示 skeleton，不改变 SoT 和 onboarding 判定 |
| 后台任务抢占首屏资源 | idle 分批、限并发、记录 event-loop lag |
| Windows-only 优化破坏跨平台 | 用 platform gate 和 macOS/Linux smoke 确认行为不变 |

## 10. 下一步执行清单

1. 补 Windows startup trace 字段与报告模板。
2. 采集当前 packaged hot/cold baseline，确认最大瓶颈是模块、renderer、窗口还是系统扫描。
3. 将剩余非首屏后台任务逐项标注 stage，并为每项写明 handler-first 或 lazy contract。
4. 设计插件摘要缓存 schema 与失效策略。
5. 将 Everything status / FileSystemWatcher / File Provider Windows 路径全部纳入 idle/lazy 验证。
6. 对 renderer 首屏 import 做一次 dependency review，只记录候选，不直接大拆。
