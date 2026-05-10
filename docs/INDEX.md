# 文档索引

> 更新时间：2026-05-10
> 本页仅保留入口与高价值快照；历史细节以 `docs/plan-prd/01-project/CHANGES.md` 为准。

## 主要入口

- `docs/plan-prd/README.md` - PRD / 规划主索引（里程碑 + 未闭环能力）
- `docs/plan-prd/TODO.md` - 执行清单（含单一口径矩阵与优先级）
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` - 产品总览 + 路线图
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` - v2.4.7 Gate 清单（A~E）
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 质量基线与门禁约束
- `docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md` - 文档盘点历史快照（不承载当前路线权威）
- `docs/plan-prd/02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md` - Legacy/兼容/结构治理统一实施 PRD（单一蓝图）
- `docs/plan-prd/02-architecture/pilot-single-stream-runtime.md` - Pilot / DeepAgent 单流运行时权威说明（含完整流程图、seq 合同、审计结论）
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md` - Intelligence 能力路由与 Provider 抽象入口
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` - Nexus Provider 聚合与 Scene 编排重构 PRD
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` - Tuff 2.5.0 AI 桌面入口收口 Plan PRD
- `docs/plan-prd/report/cross-platform-compat-placeholder-audit-2026-05-10.md` - 跨平台兼容与占位/假实现审计报告
- `docs/plan-prd/01-project/CHANGES.md` - 全历史变更记录（唯一历史源）

## 文档盘点快照（2026-03-19）

- 全仓 Markdown：`396`；其中 `docs`：`146`。
- `docs` 内部分布：`plan-prd 110`、`engineering 20`、其他专题入口 `16`。
- `plan-prd` 子域：`03-features 32`、`docs 20`、`04-implementation 17`、`01-project 12`、`05-archive 11`、`02-architecture 8`、`06-ecosystem 4`。
- 统计口径历史快照：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`；当前路线以六主文档与 `TODO/CHANGES` 为准。

## 状态快照（2026-05-09，统一口径）

- **当前工作区基线**：`2.4.10-beta.18`（根包与 CoreApp 对齐）。
- **2.4.10 当前主线**：优先解决 Windows App 索引、Windows 应用启动体验与基础 legacy/compat 收口；不把全部跨平台回归压进 `2.4.10`。
- **2.4.11 必解门槛**：剩余 Windows/macOS 阻塞级人工回归、Linux best-effort 记录、Release Evidence 写入闭环、legacy/compat/size 清册退场项必须关闭或显式降权。
- **User-managed launcher foundation（2026-04-22）**：`appIndex` typed domain 已新增 `listEntries / upsertEntry / removeEntry / setEntryEnabled`，settings SDK 与 main channel handler 全链路接通；`app-provider` 复用现有 `files + file_extensions` 支持 user-managed launcher entry，并继续走搜索与启动链路。
- **应用搜索诊断与重建（2026-04-26）**：`settingsSdk.appIndex` 已新增 `diagnose / reindex`，高级设置中的应用索引区可按路径、bundleId 或名称查看单个应用的 `displayName / alternateNames / keywords` 与 precise / prefix / FTS / N-gram / subsequence 命中情况，并支持单项关键词重建或重新扫描。
- **Release Evidence API（2026-04-26）**：Nexus 新增 `/api/admin/release-evidence/*`，作为 CoreApp 回归、文档门禁与平台阻塞矩阵的 D1 证据入口；管理员登录态或 `release:evidence` API key 可写入。
- **macOS 中文应用名召回修复（2026-04-26）**：应用扫描会保留本地化名称为 `alternateNames`，关键词同步与搜索后处理都会使用中文、全拼与首字母，避免 Spotlight 英文显示名优先时漏召回“网易云音乐”等应用。
- **CoreApp 2.4.11 前置口径（2026-05-08）**：当前主线切换为 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`；剩余跨平台回归与清册退场项统一列入 `2.4.11` 必解清单。
- **CoreBox App 搜索排序修复（2026-05-10）**：跨 provider 排序优先可见标题命中，plugin feature 的隐藏 token/source 命中降为低置信召回信号；隐藏 token/fuzzy-token/source fallback 召回会限制 frequency/recency 行为信号上限，App 标题前缀/子串命中不再被极高频或异常 recency 的 feature token 抢占首位，同时保留可见标题命中的 feature 自学习前置能力。
- **Tuff 2.5.0 AI Plan PRD（2026-05-10）**：新增 AI 桌面入口收口 PRD，明确 2.5.0 主线不是大规模实现或单纯 Provider/Scene 底座，而是收口 CoreBox / OmniPanel 的用户可感知 AI 入口；Stable 只承诺文本 + OCR，Workflow / Pilot 联动为 Beta，Assistant、多模态生成与 Nexus Scene runtime 编排列为 Experimental / 2.5.x 后续。
- **复制 app path 加入应用索引回归（2026-05-10）**：SystemActionsProvider 覆盖 Files/text/file URL 中的 `.exe/.lnk/.appref-ms/.app` 路径识别，并支持复制未加引号、含空格且带参数的 Windows app 命令行、Windows UWP `shell:AppsFolder\\...` 虚拟路径或裸 `PackageFamily!App` AppID；动作执行会调用 `appProvider.addAppByPath()` 并进入应用索引链路，ClickOnce `.appref-ms` 已补 Start Menu 扫描、实时变更和单项解析回归。
- **Windows App 诊断证据导出（2026-05-10）**：Settings App Index diagnostic 可复制/保存 `app-index-diagnostic-evidence` JSON，记录路径、关键词、FTS/N-gram/subsequence 命中、reindex 状态、shortcut launchArgs/workingDirectory、`rawDisplayName/displayNameStatus` 与失败原因；新增 `app-index:diagnostic:verify` 可离线复核 target 命中、query stage、launchKind、launchTarget、launchArgs、workingDirectory、bundle/appIdentity、clean/fallback displayName、reindex 与 reusable caseId 门禁，Windows 真机应用验收仍需使用该证据入口补样本。
- **Windows 能力证据 CLI（2026-05-10）**：新增 `windows-capability-evidence/v1` 与 `pnpm -C "apps/core-app" run windows:capability:evidence`，可在 Windows 真机采集 PowerShell、Everything CLI、Everything 目标关键词查询、`Get-StartApps`、registry uninstall fallback、Start Menu `.lnk/.appref-ms/.exe`、`.lnk` target/arguments/workingDirectory 与目标应用命中摘要；`--installer <path>` 只输出 NSIS/MSI handoff dry-run 命令并保持 `unattendedAutoInstallEnabled: false`，`windows:capability:verify` 可把 Everything/UWP/registry/shortcut/`.appref-ms`/shortcut args/shortcut cwd/target/installer 要求升级为硬门禁，非 Windows 明确输出 `skipped`。
- **Windows 验收 Manifest 复核（2026-05-10）**：新增 `windows-acceptance-manifest/v1`、`windows:acceptance:template` 与 `windows:acceptance:verify`，用于生成 blocked 初始清单并汇总复核 Windows required caseId、单项 evidence path/verifier command、search trace、clipboard stress 与微信/Codex/Apple Music 启动样本；模板会写入 `verification.recommendedCommand`，便于真机证据补齐后直接跑最终强门禁；CLI 可用 `--requireExistingEvidenceFiles` 校验 case 与性能证据文件真实存在，并用 `--requireEvidenceGatePassed` 要求 case evidence、search trace stats 与 clipboard stress summary JSON 的 `gate.passed=true`，同时按 caseId 校验允许的 evidence schema/kind；acceptance 复核会按 case 重新执行 Windows capability、App Index、Everything、Update、search trace 与 clipboard stress 的关键硬门禁，search trace 固定 200 样本、first.result P95 ≤ 800ms、session.end P95 ≤ 1200ms、slowRatio ≤ 0.1，clipboard stress 固定 2 分钟 500/250ms、P95 ≤ 100ms、max scheduler ≤ 300ms、realtime queue peak ≤ 2、drop=0，且 `clipboard:stress:verify` 最终命令必须携带 `--strict` 强制 `clipboard-stress-summary/v1` schema，避免子证据用弱参数或非标准 schema 跑出 `gate.passed=true` 后被 manifest 误收；`--requireEvidenceGatePassed` 的失败项会带出具体复算原因，便于定位 launchKind、bundle/appIdentity、reindex、checksum 或性能阈值缺口；`--requireCaseEvidenceSchemas` 可进一步要求每个 required case 同时具备 Windows capability evidence 与对应专项 diagnostic evidence，`--requireVerifierCommandGateFlags` 会校验 manifest 内 verifier command 本身也携带 `--input` 与 release 固定门禁参数，`--requireRecommendedCommandGateFlags` 会校验 `verification.recommendedCommand` 也携带最终强门禁参数，`--requireRecommendedCommandInputMatch` 会校验 recommended command 的 `--input` 指回当前 manifest 文件；`--requireCommonAppLaunchDetails` 会要求微信/Codex/Apple Music 等 common app 样本逐项确认可搜索、显示名正确、图标正确、可启动且启动后 CoreBox 立即隐藏，避免命令字段漂移、漏项或弱证据假通过。
- **CoreBox 分时推荐加权修复（2026-05-10）**：推荐内存缓存开始校验 `timeSlot/dayOfWeek` 等 context cache key，跨早上/下午等不同上下文会重新计算推荐；同一 App 在当前时间段/星期有历史使用记录时会获得额外加权，候选去重会保留后续 time-based 统计，并已固定同一候选集在不同 `timeSlot` 下首位不同的回归。
- **DivisionBox detached widget 恢复链路修复（2026-05-10）**：插件 feature 分离窗口的 `pluginId` 改为真实 `meta.pluginName`，避免 `plugin-features` provider id 污染 session 元数据；widget 继续通过 `tuff://detached` 与 `detachedPayload` 恢复，并把 `detachedPayload` 前移到 `DivisionBoxConfig.initialState`，避免窗口启动时先读到空 session state 再回退搜索。
- **Windows 更新安装 handoff（2026-05-10）**：用户触发安装后，NSIS `*-setup.exe` 走 `/S`，MSI 走 `msiexec.exe /i ... /passive /norestart`，安装器启动后退出当前应用；下载完成后无人值守自动安装仍需确认权限提升和回滚策略。
- **更新自动下载默认开启（2026-05-10）**：UpdateService / UpdateSystem / renderer runtime / shared defaults 统一为 `autoDownload: true`；Windows 当前仍为下载完成后打开安装器，静默自动安装需另行确认安装器参数、权限提升与回滚策略。
- **Windows 更新诊断证据导出（2026-05-10）**：Settings Update 页可复制/保存 `update-diagnostic-evidence` JSON，记录更新设置、下载就绪状态、缓存版本、目标平台与安装接管模式；新增 `update:diagnostic:verify` 可离线复核 autoDownload、downloadReady、Windows installer handoff、用户确认、无人值守未开启、匹配资产与 checksum 门禁，并校验 `verdict` / suggested fields 与源状态一致；无人值守自动安装仍保持未开启。
- **Everything 图标预热背压（2026-05-10）**：Windows Everything 搜索结果图标预热在 app task 活跃时跳过，并将后台 icon worker 预热并发限制为 4、空闲等待限制为 250ms；搜索命中与排序不变，仍缺真实 Windows 设备体验证据。
- **Everything 诊断证据导出（2026-05-10）**：Settings Everything 页可复制/保存 `everything-diagnostic-evidence` JSON，记录 backend、health、fallbackChain、backendAttemptErrors 与错误码；新增 `everything:diagnostic:verify` 可离线复核 ready/enabled/available/backend/health/version/esPath/fallbackChain/caseId 门禁，并校验 `verdict` / suggested fields 与 `status` 一致，供 Windows 真机 Everything/文件搜索回归补证使用。
- **周期任务 idle gate 降载（2026-05-10）**：DeviceIdleService 先判断系统 idle，再按需读取电量；not-idle 时不再触发 Windows PowerShell 电量探测，并以 30 秒短 TTL 与 in-flight 去重复用电量状态，供电状态变化时立即重读，降低后台索引/同步轮询的额外进程开销。
- **DivisionBox 空闲轮询降载（2026-05-10）**：DivisionBoxManager 不再在单例创建时常驻注册 `division-box.memory-pressure`；仅在存在 active/cached session 时启用内存压力轮询，最后一个 session 销毁或缓存清空后注销任务，降低无 DivisionBox 窗口时的后台调度成本。
- **FileProvider worker snapshot 降载（2026-05-10）**：TuffDashboard 读取文件索引 worker 状态时新增 1 秒短 TTL 缓存与 in-flight 去重，短时间重复或并发刷新不会向 scan/index/reconcile/icon/thumbnail/search-index worker 重复发送 metrics 请求。
- **Search trace 性能统计口径（2026-05-10）**：新增 `search-trace-stats/v1`、`search:trace:stats` 与 `search:trace:verify` 本地脚本，可从现有 `search-trace/v1` 日志行聚合 `first.result/session.end` 的样本量、P50/P95/P99、慢查询数量、慢查询占比与 provider 慢源归因，并支持对归档 stats JSON 重新执行 200 样本/P95/slowRatio 硬门禁；真实 200 次 Windows 查询采样仍需单独产出证据。
- **Clipboard stress 复核口径（2026-05-10）**：新增 `clipboard:stress:verify`，可对 `clipboard:stress` 生成的 summary JSON 执行 2 分钟窗口、500/250ms interval、scheduler delay P95/max、realtime queue peak、drop/timeout/error 硬门禁；真实“全量索引 + 高频推荐 + 剪贴板图像轮询”压测仍需在目标设备产出证据。
- **Tray 运行态真实回显（2026-04-19）**：托盘初始化现在会同步主窗口真实可见性，并通过 transport snapshot 暴露 `trayReady / windowVisible`；静默启动和 macOS `hideDock + showTray` 组合不再回显错误首态。
- **Windows Store 元数据增强（2026-04-19）**：Windows `Get-StartApps` 扫描已补齐 UWP manifest `DisplayName / Description / logo` 富化，应用搜索结果继续保留 `Windows Store` 副标题，同时可展示真实标题、描述与图标。
- **下载中心视图模式持久化（2026-04-19）**：下载中心 `detailed / compact` 模式已统一走 `appSetting.downloadCenter.viewMode` 持久化，关闭页面与重启应用后都会按上次选择正确回显。
- **CoreBox Windows 应用扫描修复（2026-04-18）**：开始菜单 `.lnk` 扫描已保留 `target + args + cwd`，并补入 `Get-StartApps` 的 Windows Store / UWP 枚举，依赖快捷方式参数的桌面应用与 Windows Store 应用现在都可进入应用搜索与启动链路。
- **CoreBox 默认主唤起快捷键（2026-04-18）**：`core.box.toggle` 默认改为启用，仅影响新安装用户；`core.box.aiQuickCall` 继续保持默认关闭，历史快捷键配置不自动迁移。
- **Tray 直启（2026-04-18）**：托盘运行时不再依赖 `setup.experimentalTray` 门控，设置页与引导页已移除对应实验语义；托盘是否展示继续只由 `showTray / hideDock / startSilent / closeToTray` 控制。
- **2.4.9 主线 Gate（historical）**：插件完善主线收口完成；`Nexus 设备授权风控` 保留实施文档与历史入口，当前主线已转入 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`。
- **治理执行口径**：Legacy/兼容/结构治理切换为“统一实施 PRD + 五工作包并行验收”，不再按 Phase 1-3 分段决策。
- **CoreApp 兼容硬切（2026-03-23）**：`window.$channel` 业务调用为 `0`、legacy storage 事件协议（`storage:get/save/reload/save-sync/saveall`）为 `0`；插件权限 `sdkapi` 缺失/低版本改为阻断执行（`SDKAPI_BLOCKED`）。
- **Nexus 设备授权风控（2026-05-06）**：Phase 1 已接入设备码申请频控、连续失败/取消冷却、授权审计日志、长期授权后端时间窗与可信设备显式白名单。
- **Nexus Provider 聚合与 Scene 编排（2026-05-09）**：新增权威 PRD，后续汇率、AI 大模型、文本翻译、图片/截图翻译统一进入 Provider registry；Scene 通过 Capability、Strategy 与 Metering 组合能力，不再为每个场景维护孤立供应商模型。
- **跨平台兼容与占位实现审计（2026-05-10）**：新增报告并锁定下一步：Windows/macOS 人工证据、Linux best-effort 记录、Pilot 假值/支付 mock 门控、插件 localStorage 路径迁移、retained raw event definition 指标拆分与超长模块 SRP 拆分。
- **CoreApp 启动搜索卡顿治理（2026-03-24）**：已落地双库隔离（aux DB）、写入 QoS（priority/drop/circuit）、索引热路径 worker 单写者与启动期降载；可通过 `TUFF_DB_AUX_ENABLED/TUFF_DB_QOS_ENABLED/TUFF_STARTUP_DEGRADE_ENABLED` 灰度与回滚。
- **治理基线（主线代码域）**：`legacy 81/184`、raw `channel.send('x:y') 13/46`、超长文件（>=1200）`47`。
- **发布快照证据**：见 `CHANGES` 中 `v2.4.9-beta.4` 基线条目（含 commit/tag/CI run 链接）。
- **2.4.8 主线 Gate（historical）**：OmniPanel 稳定版 MVP 已落地（真实窗口 smoke CI + 失败路径回归 + 触发稳定性回归）。
- **v2.4.7 发布门禁**：Gate A/B/C/D/E 已完成（Gate E 为 historical，Gate D 已通过手动 `workflow_dispatch(sync_tag=v2.4.7)` 收口）。
- **Pilot Runtime 主路径**：Node Server + Postgres/Redis + JWT Cookie；Cloudflare runtime/D1/R2 仅保留历史归档。
- **Pilot Chat/Turn 新协议**：`/api/chat/sessions/:sessionId/stream` 为主入口；`/api/v1/chat/sessions/:sessionId/{stream,turns}` 已 hard-cut 下线（会话级串行队列、SSE 尾段 title、运行态回传保持不变）。
- **Pilot 标题自动生成修复**：首轮 turn 的 title 阶段改为直接基于 turn payload 生成，并在生成后同步回写 runtime + quota history，避免历史列表长期显示“新的聊天”。
- **Pilot 合并升级 V2**：`/` 作为统一入口，`/pilot` 兼容跳转；已接入渠道多模型发现、模型目录、路由组合、`Quota Auto` 速度优先自动路由与评比指标采集（TTFT/总耗时/成功率）。
- **Pilot 旧 UI 会话卡片化硬切**：保留 `ThChat/ThInput/History`，运行态统一改为会话内 `pilot_run_event_card` 推送（`intent/routing/memory/websearch/thinking`），不再使用全局运行态条。
- **Pilot 流式协议收敛**：旧 UI 执行器统一消费 `/api/chat/sessions/:sessionId/stream` 新事件族；legacy 事件（`turn.* / status_updated / completion / verbose / session_bound`）仅忽略告警。
- **Pilot 单流包级复用收口**：`@talex-touch/tuff-intelligence/pilot` 已成为 stream contract、trace/replay mapper、system projection、legacy run card projection、seq helper 的唯一权威源；前端不再为可恢复事件本地补 `seq`。
- **Pilot 执行入口硬切**：`/api/aigc/executor` 已物理删除，`/api/chat/sessions/:sessionId/stream` 为唯一执行入口（`/api/v1/chat/sessions/:sessionId/{stream,turns}` 仍保持下线态）。
- **Intelligence 多模态能力打通**：`image.generate/image.edit/audio.tts/audio.stt/audio.transcribe` 已接入统一能力配置、运行时分发与 fallback；`video.generate` 进入配置矩阵并保留“运行时未实现”提示。
- **Pilot 模型组能力开关重构**：`/admin/system/model-groups` 已升级为“模板预设 + 分层配置 + 联动校验”，并新增共享能力元数据模块统一前后端规则。
- **Pilot 附件交互修复**：聊天生成中不再禁用输入区粘贴与附件选择；支持粘贴图片/文件直传，并显式放开图片等常见文件类型选择。
- **Pilot 附件慢链路治理（URL/ID-first）**：入模策略统一为 `id > https url > base64`，并新增附件能力探测接口 `GET /api/chat/attachments/capability`。
- **Pilot 旧输入框附件出站硬切**：`ThInput` 附件上传改为会话级 `/api/chat/sessions/:sessionId/uploads`，发送链路强制 `message + attachments` 分离；历史 dataURL 附件发送前先转换为 session `attachmentId`，不再把 base64 拼进可见文本。
- **Pilot 后台设置入口升级**：管理主入口已迁移到 `/admin/*`，`/cms/*` 仅保留 Legacy 跳转层。
- **Legacy 聊天输入框附件修复**：`ThInput` 旧输入框已支持粘贴与选择文件附件（不再仅限图片，也不再提示“暂时不支持附件/文件分析”）。
- **Pilot/Legacy 附件可读性修复**：非图片附件在大小阈值内会内联为 `input_file.file_data` 传给模型，不再只传文件名/类型元信息。
- **Pilot 流式失败可见性修复**：前端已兼容 `event/session_id/[DONE]` 协议差异，并对 `turn.failed` 同时提供消息区可见失败消息与底部诊断详情。
- **Legacy 历史加载状态修复**：`GET /api/aigc/conversation/:id` 返回 JSON `value` 时，历史项点击流程已兼容对象解码并确保异常时也会退出 loading。
- **Pilot 历史存储格式**：`pilot_quota_history.value` 已统一为 JSON 字符串（旧 base64 记录已迁移，历史接口默认回包结构化 JSON）。
- **Pilot 会话兼容回填**：`GET /api/aigc/conversation/:id` 在 quota history 缺记录时，会自动从 runtime session 生成 snapshot 回填，避免刷新时误报 `conversation not found`。
- **Pilot 接口迁移（M2/M3）**：已完成收口；微信相关接口进入豁免模式，支付链路切换为本地 mock（下单 3 秒自动成功）。
- **Pilot channels 治理**：已新增 `POST /api/admin/channels/merge-ends` 与一次性脚本，执行“Pilot 优先、Ends 补缺”。
- **Pilot 自动部署**：仅在 `master` 的远端 `push`（非本地 `commit`）且命中 `pilot-image.yml` 路径过滤后触发；需同时满足 `ONEPANEL_WEBHOOK_URL/TOKEN` 已配置与 1Panel webhook 健康可达，否则需走 `ssh home` 手动部署兜底。
- **Pilot 设置入口收口**：`/admin/system/channels` 与 `/admin/system/storage` 为主入口；`/cms/*` 仅保留 Legacy 跳转。
- **执行顺序（锁定）**：先完成 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`，再在 `2.4.11` 关闭剩余跨平台回归、Release Evidence 与清册退场项；`Nexus 设备授权风控` 降为非当前主线但保留实施入口与历史证据。
- **质量边界**：Network 套件全仓硬禁生效，业务层 direct `fetch/axios` 继续保持 0 违规。

## 当前两周重点

- `2.4.10`：Windows App 索引与启动体验收口，包含 Start Menu、UWP、registry uninstall、`launchArgs/workingDirectory` 与真实 Windows 设备验证。
- `2.4.10`：基础 legacy/compat 收口，清册退场目标统一为 `2.4.11`，禁止新增 legacy/raw channel/旧 storage/旧 SDK bypass。
- `2.4.11`：Windows/macOS release-blocking 回归、Linux documented best-effort、Release Evidence 写入闭环与清册退场项关闭。

## 强制同步矩阵（单一口径）

| 文档 | 当前状态 | 下一动作 |
| --- | --- | --- |
| `docs/plan-prd/TODO.md` | 已同步到 2026-05-09 | 推进 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`，并维护 `2.4.11` 必解清单与 Nexus Provider 后续阶段 |
| `docs/plan-prd/README.md` | 已同步到 2026-05-09 | 维护 `2.4.10` 当前主线、`2.4.11` 未闭环能力与 Nexus Provider 架构蓝图口径 |
| `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` | 已同步到 2026-05-09 | 按锁定顺序推进 Windows App 索引、基础兼容治理、后续跨平台回归与 Provider 聚合规划 |
| `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` | Gate A/B/C/D/E 已完成（D/E historical，2026-03-16 已复核） | 保留证据链并切换到 `2.4.9` 后续主线 |
| `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` | 已同步到 2026-05-09 | `2.4.11` 前关闭或降权 legacy/compat/size 债务，Windows/macOS 为 release-blocking；活跃 PRD 保持目标/验收/质量/回滚结构 |
| `docs/plan-prd/01-project/CHANGES.md` | 已同步到 2026-05-09 | 持续记录 `2.4.10` 主线、`2.4.11` 必解清单与 Nexus Provider PRD 证据 |
| `docs/INDEX.md` | 本页（入口+快照）已压缩 | 仅维护导航与高价值快照 |

## 归档与降权

- `docs/plan-prd/next-edit/*`：降权为草稿池，不作为发布判定与状态口径来源。
- `docs/plan-prd/05-archive/*`：历史归档区，仅用于追溯，不参与当前里程碑状态统计。

## 高价值专题入口

- `docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md` - OmniPanel Feature Hub PRD
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` - Tuff 2.5.0 AI 桌面入口收口 Plan PRD
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md` - Intelligence 能力路由与 Provider 架构 PRD
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` - Nexus Provider 聚合与 Scene 编排重构 PRD
- `docs/plan-prd/04-implementation/LegacyChannelCleanup-2408.md` - Legacy Channel Cleanup 2.4.8
- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` - Nexus 设备授权风控实施方案（非当前主线，保留入口）
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - `v2.4.9` Gate D 发布资产核对（严格签名）
- `docs/plan-prd/docs/PLUGIN-STORE-MULTI-SOURCE-ACCEPTANCE-2026-03-15.md` - 插件市场多源验收结论
- `apps/pilot/deploy/README.zh-CN.md` - Pilot 在 1Panel 的标准部署手册（脚本 + env + 回滚 + cron + webhook 自动部署）
