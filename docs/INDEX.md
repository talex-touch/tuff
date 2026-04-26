# 文档索引

> 更新时间：2026-04-26
> 本页仅保留入口与高价值快照；历史细节以 `docs/plan-prd/01-project/CHANGES.md` 为准。

## 主要入口

- `docs/plan-prd/README.md` - PRD / 规划主索引（里程碑 + 未闭环能力）
- `docs/plan-prd/TODO.md` - 执行清单（含单一口径矩阵与优先级）
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` - 产品总览 + 路线图
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` - v2.4.7 Gate 清单（A~E）
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 质量基线与门禁约束
- `docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md` - 文档盘点与下一步路线（执行锚点）
- `docs/plan-prd/02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md` - Legacy/兼容/结构治理统一实施 PRD（单一蓝图）
- `docs/plan-prd/02-architecture/pilot-single-stream-runtime.md` - Pilot / DeepAgent 单流运行时权威说明（含完整流程图、seq 合同、审计结论）
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md` - Intelligence 能力路由与 Provider 抽象入口
- `docs/plan-prd/01-project/CHANGES.md` - 全历史变更记录（唯一历史源）

## 文档盘点快照（2026-03-19）

- 全仓 Markdown：`396`；其中 `docs`：`146`。
- `docs` 内部分布：`plan-prd 110`、`engineering 20`、其他专题入口 `16`。
- `plan-prd` 子域：`03-features 32`、`docs 20`、`04-implementation 17`、`01-project 12`、`05-archive 11`、`02-architecture 8`、`06-ecosystem 4`。
- 统计口径与下一步路线统一锚点：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`。

## 状态快照（2026-04-26，统一口径）

- **User-managed launcher foundation（2026-04-22）**：`appIndex` typed domain 已新增 `listEntries / upsertEntry / removeEntry / setEntryEnabled`，settings SDK 与 main channel handler 全链路接通；`app-provider` 复用现有 `files + file_extensions` 支持 user-managed launcher entry，并继续走搜索与启动链路。
- **应用搜索诊断与重建（2026-04-26）**：`settingsSdk.appIndex` 已新增 `diagnose / reindex`，高级设置中的应用索引区可按路径、bundleId 或名称查看单个应用的 `displayName / alternateNames / keywords` 与 precise / prefix / FTS / N-gram / subsequence 命中情况，并支持单项关键词重建或重新扫描。
- **macOS 中文应用名召回修复（2026-04-26）**：应用扫描会保留本地化名称为 `alternateNames`，关键词同步与搜索后处理都会使用中文、全拼与首字母，避免 Spotlight 英文显示名优先时漏召回“网易云音乐”等应用。
- **2.5.0 前置口径（2026-04-20）**：当前主线切换为 `CoreApp legacy 清理 + Windows/macOS 2.5.0 阻塞级适配`；先关闭或显式降权 CoreApp 剩余 legacy/compat 债务，再完成 Windows/macOS release-blocking 回归。Linux 保留 `xdotool` / desktop environment 限制说明与非阻塞 smoke，不作为 `2.5.0` blocker。
- **Tray 运行态真实回显（2026-04-19）**：托盘初始化现在会同步主窗口真实可见性，并通过 transport snapshot 暴露 `trayReady / windowVisible`；静默启动和 macOS `hideDock + showTray` 组合不再回显错误首态。
- **Windows Store 元数据增强（2026-04-19）**：Windows `Get-StartApps` 扫描已补齐 UWP manifest `DisplayName / Description / logo` 富化，应用搜索结果继续保留 `Windows Store` 副标题，同时可展示真实标题、描述与图标。
- **下载中心视图模式持久化（2026-04-19）**：下载中心 `detailed / compact` 模式已统一走 `appSetting.downloadCenter.viewMode` 持久化，关闭页面与重启应用后都会按上次选择正确回显。
- **CoreBox Windows 应用扫描修复（2026-04-18）**：开始菜单 `.lnk` 扫描已保留 `target + args + cwd`，并补入 `Get-StartApps` 的 Windows Store / UWP 枚举，依赖快捷方式参数的桌面应用与 Windows Store 应用现在都可进入应用搜索与启动链路。
- **CoreBox 默认主唤起快捷键（2026-04-18）**：`core.box.toggle` 默认改为启用，仅影响新安装用户；`core.box.aiQuickCall` 继续保持默认关闭，历史快捷键配置不自动迁移。
- **Tray 直启（2026-04-18）**：托盘运行时不再依赖 `setup.experimentalTray` 门控，设置页与引导页已移除对应实验语义；托盘是否展示继续只由 `showTray / hideDock / startSilent / closeToTray` 控制。
- **2.4.9 主线 Gate**：插件完善主线收口完成；`Nexus 设备授权风控` 保留实施文档与历史入口，当前主线转入 CoreApp `2.5.0` 前置治理。
- **治理执行口径**：Legacy/兼容/结构治理切换为“统一实施 PRD + 五工作包并行验收”，不再按 Phase 1-3 分段决策。
- **CoreApp 兼容硬切（2026-03-23）**：`window.$channel` 业务调用为 `0`、legacy storage 事件协议（`storage:get/save/reload/save-sync/saveall`）为 `0`；插件权限 `sdkapi` 缺失/低版本改为阻断执行（`SDKAPI_BLOCKED`）。
- **CoreApp 启动搜索卡顿治理（2026-03-24）**：已落地双库隔离（aux DB）、写入 QoS（priority/drop/circuit）、索引热路径 worker 单写者与启动期降载；可通过 `TUFF_DB_AUX_ENABLED/TUFF_DB_QOS_ENABLED/TUFF_STARTUP_DEGRADE_ENABLED` 灰度与回滚。
- **治理基线（主线代码域）**：`legacy 81/184`、raw `channel.send('x:y') 13/46`、超长文件（>=1200）`47`。
- **当前工作区基线**：`2.4.9-beta.4`（tag `v2.4.9-beta.4`，发布相关 CI 已通过）。
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
- **执行顺序（锁定）**：先 `CoreApp legacy 清理`，再完成 `Windows/macOS 2.5.0 阻塞级适配`；`Nexus 设备授权风控` 降为非当前主线但保留实施入口与历史证据。
- **质量边界**：Network 套件全仓硬禁生效，业务层 direct `fetch/axios` 继续保持 0 违规。

## 当前两周重点

- CoreApp legacy/compat 清册闭环：`2.5.0` 项关闭或显式降权，禁止新增 legacy/raw channel/旧 storage/旧 SDK bypass。
- Windows/macOS release-blocking 回归：搜索、应用扫描、托盘、更新、插件权限、安装卸载、退出释放。
- Linux documented best-effort：记录 `xdotool` / desktop environment 限制与非阻塞 smoke。

## 强制同步矩阵（单一口径）

| 文档 | 当前状态 | 下一动作 |
| --- | --- | --- |
| `docs/plan-prd/TODO.md` | 已同步到 2026-04-26 | 推进 `CoreApp legacy 清理 + Windows/macOS 2.5.0 阻塞级适配` |
| `docs/plan-prd/README.md` | 已同步到 2026-04-20 | 维护 CoreApp `2.5.0` 前置治理与未闭环能力口径 |
| `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` | 已同步到 2026-04-20 | 按锁定顺序推进 CoreApp legacy 清理与 Windows/macOS 阻塞级回归 |
| `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` | Gate A/B/C/D/E 已完成（D/E historical，2026-03-16 已复核） | 保留证据链并切换到 `2.4.9` 后续主线 |
| `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` | 已同步到 2026-04-20 | Windows/macOS 为 release-blocking；Linux 保持 documented best-effort |
| `docs/plan-prd/01-project/CHANGES.md` | 已同步到 2026-04-26 | 持续记录 CoreApp `2.5.0` 前置治理口径与证据 |
| `docs/INDEX.md` | 本页（入口+快照）已压缩 | 仅维护导航与高价值快照 |

## 归档与降权

- `docs/plan-prd/next-edit/*`：降权为草稿池，不作为发布判定与状态口径来源。
- `docs/plan-prd/05-archive/*`：历史归档区，仅用于追溯，不参与当前里程碑状态统计。

## 高价值专题入口

- `docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md` - OmniPanel Feature Hub PRD
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md` - Intelligence 能力路由与 Provider 架构 PRD
- `docs/plan-prd/04-implementation/LegacyChannelCleanup-2408.md` - Legacy Channel Cleanup 2.4.8
- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` - Nexus 设备授权风控实施方案（非当前主线，保留入口）
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - `v2.4.9` Gate D 发布资产核对（严格签名）
- `docs/plan-prd/docs/PLUGIN-STORE-MULTI-SOURCE-ACCEPTANCE-2026-03-15.md` - 插件市场多源验收结论
- `apps/pilot/deploy/README.zh-CN.md` - Pilot 在 1Panel 的标准部署手册（脚本 + env + 回滚 + cron + webhook 自动部署）
