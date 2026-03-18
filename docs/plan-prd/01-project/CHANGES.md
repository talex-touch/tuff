# 变更日志

> 更新时间: 2026-03-18
> 说明: 主文件仅保留近 30 天（2026-02-24 ~ 2026-03-18）详细记录；更早历史已按月归档。

## 阅读方式

- 当前主线：`2.4.9-beta.4` 基线下，下一动作统一为 `Nexus 设备授权风控`。
- 历史主线：`2.4.8 OmniPanel Gate`、`v2.4.7 Gate A/B/C/D/E` 均已收口（historical）。
- 旧记录入口：见文末“历史索引导航”。

---

## 2026-03-18

### feat(pilot-graph): 新建会话可选 Pilot 模式（Graph 优先，DeepAgent 回退）

- 前端主聊天页（`/`）新建会话新增模式选择：
  - 可选择“启用 Pilot 模式（Graph 优先）”或“普通模式”；
  - 会话级持久化字段新增 `pilotMode`，并在聊天头部展示当前会话模式标签。
- v1 链路透传补齐：
  - `POST /api/v1/chat/sessions/:sessionId/turns` 入队 payload 新增 `pilotMode`；
  - `POST /api/v1/chat/sessions/:sessionId/stream` 代理 executor 时透传 `pilotMode`。
- 执行器编排决策增强：
  - `executor` 在 `pilotMode=true` 时向 orchestrator 传入 `preferLangGraph=true`；
  - orchestrator 会优先选择可用且绑定 `langgraphAssistantId` 的 route combo；
  - 若本地 Graph 服务不可用或无可用 Graph combo，保持自动回退 `deepagent`，不影响现有稳定性。

### feat(pilot-tools): 通用工具调用提示 + AI 数据源抓取（V1 双线并行）

- 新增 `PilotToolGateway` 与 `websearch` connector 抽象（`search/fetch/extract`），并接入可配置网关主路径。
- 新增 `datasource.websearch` 配置（`gatewayBaseUrl/apiKeyRef/allowlistDomains/timeoutMs/maxResults/crawlEnabled/ttlMinutes`）并纳入 Admin settings 聚合读写。
- 新增工具审批票据存储与 API：
  - `GET /api/v1/chat/sessions/:sessionId/tool-approvals?status=pending`
  - `POST /api/v1/chat/sessions/:sessionId/tool-approvals/:ticketId`
- 工具生命周期统一输出 `run.audit`（`tool.call.started/approval_required/approved/rejected/completed/failed`），payload 固定字段对齐 `callId/toolId/toolName/riskLevel/status/inputPreview/outputPreview/durationMs/ticketId/sources/errorCode/errorMessage`。
- `legacy executor` 与 `v1 chat stream` 打通工具事件透传：已清理 `status_updated(calling/result)` 的工具兼容映射，统一以 `run.audit` 作为工具卡片唯一事件源，并对高风险场景启用阻塞式审批。
- 前端补齐统一解析：
  - Tool 卡片统一由 `run.audit` 驱动（不再消费 legacy `status_updated(calling/result)` 生成工具卡）；
  - 增加 `PilotToolCard` 渲染组件，展示工具状态、输入/输出预览、来源链接、审批 ticket 信息。

### feat(pilot-approval): 审批通过自动续跑 + Legacy 工具事件 Phase 2 收口

- 旧聊天页 `$completion` 增加审批自动续跑：
  - 收到 `turn.approval_required` 后自动轮询 `GET /api/v1/chat/sessions/:sessionId/tool-approvals`；
  - 票据 `approved` 后复用原 `request_id` 自动恢复 `stream` 执行；
  - 票据 `rejected` 或轮询超时时，统一写入 Tool 卡片失败态并落错误消息。
- 新增运行时公共配置（含回滚开关）：
  - `pilotToolApprovalAutoResume`（默认 `true`）
  - `pilotToolApprovalPollIntervalMs`（默认 `1500`）
  - `pilotToolApprovalPollTimeoutMs`（默认 `600000`）
  - `pilotEnableLegacyExecutorEventCompat`（默认 `false`）
- 补充审批自动续跑回归测试：
  - 新增 completion flow 单测，覆盖 `request_id` 复用（跳过 turn 创建）与审批 `approved/rejected/timeout` 三条分支状态映射。
- Legacy Phase 2（工具提示相关）：
  - `$completion` 默认关闭 legacy `completion/verbose/status_updated(tool)` 兼容分支；
  - 主链路统一为 `turn.* + run.audit`；
  - 通过 `NUXT_PUBLIC_PILOT_ENABLE_LEGACY_EXECUTOR_EVENT_COMPAT=true` 可回滚兼容旧事件解析。

### feat(pilot-intent-image): Intent 图像路由 + image.generate 工具闭环（V1）

- 新增 `PilotIntentResolver`（混合策略）：
  - 显式命令优先：`/image`、`/img`；
  - 规则命中：中英文图像生成语义匹配；
  - nano 分类兜底：结构化 JSON 输出 `intent/confidence/reason/prompt`，失败默认回退 `chat`（fail-open）。
- 路由能力扩展：
  - `PilotRoutingPolicy` 新增 `intentNanoModelId/intentRouteComboId/imageGenerationModelId/imageRouteComboId`；
  - `PilotModelCatalogItem` 新增 `allowImageGeneration`；
  - `resolvePilotRoutingSelection` 新增 `intentType`（`chat | image_generate | intent_classification`）并按 intent 选择模型与 route combo。
- 运行时模型接口增强：
  - `GET /api/runtime/models` 新增 `allowImageGeneration`；
  - Admin 模型组与路由策略页面同步支持新字段编辑与展示。
- 工具网关新增 `image.generate`：
  - 生命周期统一发 `run.audit`（`tool.call.started/.../completed/failed`）；
  - V1 仅支持 `openai` 适配器执行图像生成，非支持适配器返回明确错误码并写入 `tool.call.failed`。
- 新旧两条会话链路并行接入：
  - `legacy executor` 与 `chat sessions stream` 均支持意图命中后图像短路执行，返回 Markdown 图片内容并同步 Tool 卡片审计事件。
- Legacy 收口（Phase 1）：
  - 前端工具卡状态仅由 `run.audit + tool.call.*` 驱动；
  - `turn.approval_required` 统一映射为标准工具审计 payload；
  - 去除 tool parser 中 `websearch` 硬编码兜底（改为通用 `tool/tool.unknown`）。

### feat(pilot-ui): 主聊天 Markdown 流式增量渐变显示

- 仅在 Pilot 主聊天链路生效：`ThChat -> ChatItem -> RenderContent -> ThContent -> MilkContent`。
- `RenderContent` 新增可选属性 `streamingGradient`（默认关闭），仅在 `dotEnable=true` 且 markdown 内容持续增量时触发节流渐变 pulse。
- 新增独立 overlay 扫光动画，保留原有 `Generating-Dot` 光标行为，并在组件卸载时清理 pulse/dot 相关计时器。
- 增加 `prefers-reduced-motion` 自动降级：系统开启“减少动态效果”时不触发渐变 pulse。
- `ChatItem` 仅对 `block.type === 'markdown'` 主聊天渲染接入 `streaming-gradient`，不影响分享图、后台 Prompt 预览和其他产品线。

### fix(pilot-markdown): Milkdown 渲染兼容修复与版本核验

- 修复 `refractor` 语言模块导入路径兼容性：统一为 `refractor/*`，避免 `refractor/lang/*` 在 Bundler 模式下触发模块解析失败。
- 修复 `MilkdownRenderStashed` 的 prism 插件导入错误：从 `@milkdown/kit/plugin/prism` 更正为 `@milkdown/plugin-prism`。
- 修复 `MilkdownEditor` 上传器类型签名不兼容：对齐 `Uploader` 新签名参数，移除错误的 DOM `Node[]` 强类型约束。
- 优化主聊天流式 markdown 刷新策略：改为“优先按换行边界增量刷出 + 超时强制刷出”，减少有序/无序列表在流式阶段的半截语法重排抖动。
- 清理 `MilkdownRenderStashed` 的重复实现，改为复用 `MilkdownRender` 薄封装，降低后续配置漂移与维护成本。
- 新增开发态专用测试路由：`/test/markdown-stream`，用于可视化验证主聊天 Markdown 流式渐变与列表稳定性（非 dev 环境访问返回 404）。
- 测试页新增 `autoplay/speed` 查询参数（示例：`/test/markdown-stream?autoplay=1&speed=70`），便于稳定复现实录与截图对比。
- 测试页默认回放速度调整为 `16ms`，并将速度滑块/查询参数下限同步为 `16`，便于高频流式回归。
- 根据主聊天体验回归进一步微调：
  - 渐变效果收敛为“底部横线扫光”，并改为仅在增量包含换行（行完成）时触发；
  - `Generating-Dot` 跟随节流从 `80ms` 提升至 `24ms`，并增加 `requestAnimationFrame` 持续追踪，减少光标滞后；
  - 进一步将 `Generating-Dot` 改为帧级即时定位（去除位置过渡拖影），并将无换行场景 markdown 强制刷出窗口从 `320ms` 下调到 `64ms`，提升“贴尾”感；
  - 修复 `Generating-Dot` 在代码块场景的横向偏移：定位改为“最后可见文本节点末尾的折叠 Range”，并排除无文本尾节点（如 copy 按钮）锚点污染；
  - `Generating-Dot` 定位继续增强：改为“文本节点优先 + 列表/段落/代码块兜底锚点”，避免在半结构态（如仅出现列表 marker）时回跳到上一个标题行；
  - 修正 `Generating-Dot` 锚点优先级：仅在无法取得文本尾锚点时才使用兜底锚点，避免 dot 被列表节点覆盖导致错位；
  - `Generating-Dot` 定位坐标改为基于 `cursor.offsetParent` 统一换算，并在空列表项（仅 marker）场景允许兜底锚点前置，降低列表阶段横向偏移；
  - `Generating-Dot` 闪烁动画改为 CSS 常驻，不再在每次位置刷新时重置 animation，避免高频更新下出现“看起来跟不上”的视觉滞后；
  - `Generating-Dot` 进一步修正列表中间态锚点抢占：当已有有效文本尾锚点时，后续空 `LI` 不再抢占 fallback，避免 dot 回跳到列表起始位；
  - `Generating-Dot` 纵向基线下调 `+3px`，贴近中文正文基线，减少“看起来偏上”的观感误差；
  - `MilkContent` 流式渲染 flush 间隔从 `80ms` 下调到 `16ms`，减少可见内容与光标跟随的时间差；
  - 主聊天 Markdown 代码块改为组件化头部：新增 `RenderCodeHeader`，统一承载语言类型标签、复制按钮与 `html/svg` 预览入口，并通过 `useRichArticle` 在只读渲染链路按代码块增量挂载；
  - 移除嵌套列表伪元素圆点，避免与默认 marker 叠加导致“双圆点”；
  - 表格样式改为轻边框、单行分隔、柔和表头与 hover，整体更简洁。
- 对 `@milkdown/*` 执行最新稳定版本核验：当前 `core/kit` 最新为 `7.19.0`，`plugin-math` 最新为 `7.5.9`，`plugin-diagram` 最新为 `7.7.0`（上游已标记 deprecated），本次未引入额外版本漂移。

### feat(pilot): 增加会话记忆管理（用户开关 + 清空当前/全部）

- 新增用户侧记忆配置接口：
  - `GET /api/v1/chat/memory/settings`
  - `POST /api/v1/chat/memory/settings`
  - `POST /api/v1/chat/memory/clear`
- 记忆配置与后台 `memoryPolicy` 打通：
  - `allowUserDisable=false` 时，用户端不允许切换记忆开关；
  - `allowUserClear=false` 时，用户端不允许清空记忆。
- `executor` 链路新增 `memoryEnabled` 透传与策略收敛：
  - 支持前端显式传入 `memoryEnabled`；
  - 未显式传入时读取用户偏好，并回退到后台默认策略。
- runtime 记忆加载改造：`memoryEnabled=false` 时，本轮不加载历史消息上下文（仅当前输入参与推理），但仍保留会话日志落库能力。
- 前端聊天页（`/`）新增记忆管理入口：
  - 记忆开关（持久化到服务端偏好）；
  - “清空当前”“清空全部”动作（带二次确认与执行态保护）。

### feat(pilot-admin): Channels 支持模型同步与按模型配置格式

- `Channels` 管理页新增“同步渠道模型”按钮，复用 `POST /api/admin/channel-models/sync`，同步后自动刷新渠道配置。
- 渠道模型配置新增 `format` 字段（每个模型独立），支持在管理页直接配置并持久化到数据库设置。
- 路由解析新增“模型级格式覆盖”能力：当模型 `format` 为 `responses/chat.completions` 时，优先覆盖渠道级 `transport`。
- 模型同步时为新发现模型回填默认 `format`（继承渠道当前 `transport`），避免新增模型缺省格式为空。
- `Channels` 新增按渠道拉取模型接口：`POST /api/admin/channel-models/discover`（支持编辑态复用已保存 API Key，新增态可用表单 API Key 直接拉取）。
- 渠道编辑 UI 从弹窗改为右侧 Drawer，模型列表支持更长内容；“拉取渠道模型”入口迁移到编辑面板内。
- 渠道列表中的模型展示改为“共计 x 个模型 + 编辑按钮”，避免首页表格被超长模型字符串撑开。
- 渠道列表模型区按钮文案调整为“总览”，并恢复操作区独立“编辑”入口，降低误解成本。
- 管理端移除“管理总览”入口：`AdminSideNav` 不再展示该菜单；`/admin/system/pilot-settings` 改为自动跳转到 `Channels`；Pilot 侧边栏管理入口同步指向 `Channels`。
- 管理页顶部右侧移除 `Legacy CMS 已进入退场阶段` 提示标签，替换为用户头像组件 `AccountAvatar`。
- `Channels` 列表支持直接操作：状态可在列表一键开关、新增删除渠道操作、新增优先级字段（列表与编辑态均可配置）。
- 渠道“设为默认”入口移除，后台改为按渠道优先级参与自动调度（同分时按渠道 ID 稳定排序）。

### feat(pilot-runtime): Runtime 模型改为仅返回 ModelGroup，并补齐 image/file 能力开关

- `GET /api/runtime/models` 不再直接透出渠道发现的全量 provider models，改为仅返回 `routing.modelCatalog` 中启用且可见的模型组（ModelGroup）。
- Runtime 模型响应新增能力字段：
  - `allowImageAnalysis`
  - `allowFileAnalysis`
- 管理端 `Model Groups` 编辑页新增上述两项能力开关，并在列表新增能力摘要列，便于核对组能力配置。
- 输入区能力与模型组配置对齐：
  - `ThInputPlus` 新增独立“分析文件”入口，并支持按模型组能力禁用 `thinking/websearch/image/file`；
  - `ThInput` 在上传、粘贴、发送前增加能力约束：不支持图片/文件时阻止附件进入，不支持 `thinking/websearch` 时发送前强制关闭对应开关。

### refactor(pilot-admin): 管理首页移除“我的应用/工作日历”并下线运势功能

- 管理首页（`/admin`）移除以下模块：
  - “我的应用”卡片（`lazy-cms-application`）
  - “工作日历”卡片（`el-calendar`）
  - 运势卡片（`ChorePersonalFortuneCard`）
- 个人中心账号页移除运势入口与弹窗打开逻辑：
  - 删除 `fortuneList` 拉取与展示标签
  - 删除 `AccountModuleFortune` 调起链路
- 前后端运势接口统一下线：
  - 前端移除 `$endApi.v1.account.dailyFortune()`
  - 后端 `GET /api/dummy/fortune` 返回 `410 fortune feature removed`
- 聊天附件渲染移除星座运势映射：
  - `QuotaVeTool` 删除 `xingzuoyunshi-star` 组件映射，避免继续渲染运势卡片。

### refactor(pilot-admin): 下线部门/指南/监控/微信管理并移除 Legacy CMS 路由

- 管理导航精简，移除以下入口：
  - 部门管理（`/admin/system/dept`）
  - 系统指南（`/admin/system/guide`）
  - 系统监控（`/admin/system/monitor`）
  - LiveChat（`/admin/wechat/livechat`）
  - 微信公众号菜单（`/admin/wechat/menu`）
- 管理首页继续裁剪：
  - 删除“系统监控”卡片（不再渲染 `monitor` 模块）。
- 页面路由已物理删除（直接 404）：
  - `apps/pilot/app/pages/admin/system/dept.vue`
  - `apps/pilot/app/pages/admin/system/guide.vue`
  - `apps/pilot/app/pages/admin/system/monitor.vue`
  - `apps/pilot/app/pages/admin/wechat/livechat.vue`
  - `apps/pilot/app/pages/admin/wechat/menu.vue`
- Legacy CMS 兼容层彻底移除：
  - 删除 `apps/pilot/app/pages/cms/index.vue`
  - 删除 `apps/pilot/app/pages/cms/[...path].vue`
- 同步清理配套残留：
  - `weChat.ts` 移除对已删除页面组件的错误导入；
  - `pilot-compat-seeds` 删除 `menu_system_dept` 种子，避免新环境继续回填该入口。

## 2026-03-17

### Docs：文档盘点与下一步路线执行锚点固化

- 新增统一执行文档：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`。
- 固化盘点统计口径：全仓 Markdown `396`、`docs` `146`、`docs/plan-prd` `110`，并记录子域分布。
- 六主文档补齐锚点同步：`INDEX/README/TODO/Roadmap/Quality Baseline/CHANGES` 全部指向同一执行口径。
- 锁定优先级保持：先 `Nexus 设备授权风控`，再推进文档 strict 化与 Wave A/B/C 并行治理。

### refactor(pilot): CMS Admin 化 + `/api/pilot/*` 路径硬切

- 页面路由完成迁移：`/admin/**` 成为管理主入口，`/cms/**` 降级为 Legacy 跳转层。
- 管理导航切换为静态分组导航（系统管理/内容运营/AIGC/App 管理），不再依赖 CMS 动态菜单作为主链路导航来源。
- `channels/storage` 统一为列表页 + 添加/编辑弹框，主入口：
  - `/admin/system/channels`
  - `/admin/system/storage`
- API 路径完成硬切（不保留 `/api/pilot/*` 兼容别名）：
  - `/api/pilot/admin/*` -> `/api/admin/*`
  - `/api/pilot/chat/*` -> `/api/chat/*`
  - `/api/pilot/runtime/*` -> `/api/runtime/*`
- Pilot 附件预览路径改为 `/api/chat/sessions/:sessionId/attachments/:attachmentId/content`，并同步更新对应测试断言。
- Nexus OAuth 统一路径：
  - `/api/pilot/oauth/authorize` -> `/api/oauth/authorize`
  - `/api/pilot/oauth/token` -> `/api/oauth/token`
  - Pilot 登录回调链路已同步切换到新 OAuth 路径。

### refactor(pilot-admin): App 管理按功能独立拆页

- 修复 Admin 左侧导航不可滚动问题：侧栏容器改为 `flex + overflow hidden`，菜单区单独 `el-scrollbar` 承担滚动。
- App 管理入口进一步拆分为独立页面：
  - `/admin/system/channels`
  - `/admin/system/storage`
  - `/admin/system/model-groups`
  - `/admin/system/route-combos`
  - `/admin/system/routing-policy`
  - `/admin/system/routing-metrics`
- `/admin/system/pilot-settings` 调整为“管理总览页”，仅保留分功能入口跳转，不再承载聚合编辑表单。
- `Channels` 管理增强为“每渠道多模型”：
  - 每渠道可配置模型列表、默认模型、模型启用状态（不再是单一模型字符串）；
  - 列表页展示“模型列表 + 启用模型列表”。
- `Model Groups` 独立页新增 icon 配置与分组维度字段（icon type/value、质量/速度/成本评分、渠道模型映射）。
- 系统管理导航精简：默认隐藏 `角色管理 / 菜单管理 / 字典项` 入口（页面文件保留，后续按退场窗口统一下线）。

### feat(pilot): Pilot 合并升级 V2（渠道负载均衡 + 模型目录 + 路由组合）

- 执行链路统一接入 `resolvePilotRoutingSelection`：
  - `POST /api/aigc/executor`
  - `POST /api/v1/chat/sessions/:sessionId/stream`
  - `POST /api/pilot/chat/sessions/:sessionId/stream`
- 请求参数扩展并兼容旧字段：
  - `modelId`（兼容旧 `model`）
  - `internet`
  - `thinking`
  - `routeComboId`
  - `queueWaitMs`
- 路由评比与负载均衡落地：
  - 新增 `pilot_routing_metrics` 指标落库；
  - 新增 `ChannelModelScorer`（成功率 + TTFT + 总耗时综合评分）；
  - `Quota Auto` 速度优先选路 + 小流量探索；
  - 新增熔断/恢复（失败阈值、冷却窗口、半开探测）。
- 模型与渠道能力：
  - 每渠道支持多模型列表与默认模型；
  - 新增渠道模型发现与同步（OpenAI-compatible `/v1/models`）；
  - 新增全局模型目录（名称/描述/icon/thinking/websearch/成本速度质量标记）；
  - 新增路由组合管理（候选渠道模型、优先级、权重、降级链）。
- 运行时与前端：
  - 新增 `GET /api/pilot/runtime/models`；
  - gptview（`/`）模型选择改为后端动态目录驱动；
  - 输入区新增 `thinking` 开关并与 `internet` 一起透传后端；
  - `/pilot` 改为兼容跳转到 `/`。
- LangGraph 编排联动第一阶段：
  - 新增 `pilot-langgraph-orchestrator` 可用性探测；
  - 路由组合绑定 `langgraphAssistantId/graphProfile` 时优先探测本地服务，不可用自动回退 deepagent。
- LangGraph 编排联动第二阶段：
  - 新增 `pilot-langgraph-engine`，`createPilotRuntime` 支持 `langgraph-local` 主引擎直连 `/runs/stream`；
  - 执行链路改为“LangGraph 主执行 + deepagent 自动回退（启动错误/空流）”，`executor` 与 `pilot chat stream` 双入口复用；
  - `pilot-settings` 后台升级为统一控制台：渠道多模型、模型目录（icon/thinking/websearch）、路由组合（含 LangGraph 绑定）、LB/Memory 策略、渠道模型同步与评比看板。
- 测试：
  - 新增 `pilot-route-health.test.ts`；
  - 新增 `pilot-channel-scorer.test.ts`；
  - `pnpm -C apps/pilot run test -- server/utils/__tests__/pilot-route-health.test.ts server/utils/__tests__/pilot-channel-scorer.test.ts` 通过。

### fix(pilot): 移除 CMS 第三方内容源板块，避免外部接口导致前台崩溃

- 移除 `apps/pilot/app/pages/cms/index.vue` 中对 `https://api.vvhan.com` 的 3 处请求：
  - `dailyEnglish`
  - `hotlist/woShiPm`
  - `visitor.info`
- 同步删除对应展示区块：
  - 访客信息提示
  - 推荐阅读（产品经理）
  - 今日精彩
- 目的：消除第三方接口抖动/断连触发的页面运行时异常（`Cannot read properties of undefined (reading 'location')`），确保 CMS 基础功能稳定可用。

### fix(pilot): 恢复 App 管理下 Channels/Storage 菜单入口（含存量数据补齐）

- 菜单种子新增 `App 管理` 目录与子项：
  - `Channels` -> `/cms/system/channels`
  - `Storage` -> `/cms/system/storage`
- 新增存量菜单补齐逻辑：`ensureSystemMenuSeed` 在已有数据库场景下会自动补缺失菜单 ID，不再依赖“空库一次性初始化”。
- `Channels` / `Storage` 页面改为“列表 + 添加/编辑弹框”交互：
  - `Channels` 支持列表浏览、添加渠道、编辑渠道、切换默认渠道
  - `Storage` 支持配置列表浏览、新增配置、编辑配置
- 新增页面文件：
  - `apps/pilot/app/pages/cms/system/channels.vue`
  - `apps/pilot/app/pages/cms/system/storage.vue`
- 两个页面统一复用 `/api/pilot/admin/settings` 读写设置，保持后端配置权威源一致。

### Docs：新增治理看板（Legacy / Compat / Size）

- 新增单页治理看板：`docs/plan-prd/docs/DEBT-GOVERNANCE-BOARD-2026-03-17.md`。
- 新增执行清单：`docs/plan-prd/docs/DEBT-GOVERNANCE-EXECUTION-CHECKLIST-2026-03-17.md`（owner/ticket/验收命令对齐）。
- 看板固定按 `domain / owner / ticket / expiresVersion` 汇总当前债务与增长豁免：
  - registry 总量 `120`（`legacy-keyword 79` / `compat-file 26` / `raw-channel-send 13` / `size-growth-exception 2`）；
  - 超长文件基线 `46`，增长豁免 `2`。
- 明确“只减不增”执行口径：新增债务必须先入清册，`growthExceptions` 变更必须同步 `CHANGES + registry`，默认清退门槛维持 `v2.5.0`。

### refactor(pilot): 首批 growth-exception 清退动作（1+2）

- `apps/pilot/app/composables/usePilotChatPage.ts` 抽离工具函数到 `app/composables/pilot-chat.utils.ts`，行数 `1366 -> 1175`（退出超长文件集合）。
- `apps/pilot/server/api/aigc/executor.post.ts` 抽离执行器工具到 `server/utils/pilot-executor-utils.ts`，行数 `1666 -> 1370`（仍在治理窗口，继续压降）。
- 清退 `SIZE-GROWTH-2026-03-16-PILOT-CHAT-PAGE`：
  - 从 `scripts/large-file-boundary-allowlist.json` 移除该文件 baseline + growth exception；
  - 从 `docs/plan-prd/docs/compatibility-debt-registry.csv` 移除对应 `size-growth-exception` 条目。

## 2026-03-16

### Docs：第三轮治理压缩收口（已完成）

- 主文档口径继续维持 `2026-03-16`；下一动作统一指向 `Nexus 设备授权风控`。
- 完成主入口压缩：`CHANGES/TODO/README/INDEX` 均压缩到目标行数。
- 完成长文档分层：Telemetry/Search/Transport/DivisionBox 原文下沉到 `*.deep-dive-2026-03.md`。
- 完成历史文档降权：Draft/实验文档补齐“状态/更新时间/适用范围/替代入口”头标。

### feat(pilot): 附件慢链路治理 + CMS 设置合并（稳定优先）

- 新旧链路统一附件投递：`provider file id > public https url > base64`（仅兜底时读取对象，不再无条件内联）。
- `apps/pilot/server/utils/pilot-attachment-delivery.ts` 接入 `pilot stream` 与 `aigc executor`，并发固定 `3`，失败错误码统一：
  - `ATTACHMENT_UNREACHABLE`
  - `ATTACHMENT_TOO_LARGE_FOR_INLINE`
  - `ATTACHMENT_LOAD_FAILED`
- `POST /api/pilot/chat/sessions/:sessionId/uploads` 新增 `multipart/form-data`（兼容保留 `contentBase64`）。
- 新增附件能力探测：`GET /api/pilot/chat/attachments/capability`，Pilot 与 legacy 输入框统一使用。
- 新增聚合后台设置 API：`GET/POST /api/pilot/admin/settings`；旧 `channels/storage-config` 接口保留兼容并转调。
- 新增 CMS 系统页：`/cms/system/pilot-settings`（Channels + Storage 同页编辑）；旧 `/pilot/admin/*` 页面增加迁移提示。
- 配置权威源保持 `pilot_admin_settings`，密钥字段脱敏返回；空值不覆写，需显式 clear 才会删除。

### fix(plugin-dev): watcher 止血 + CLI 依赖环切断

- `DevPluginWatcher` 改为“受控监听目标”：仅监听插件顶层关键文件（`manifest.json/index.js/preload.js/index.html/README.md`），不再递归监听整目录。
- chokidar 选项增强：`followSymlinks: false`、`depth: 1`、`ignorePermissionErrors: true`，并显式忽略 `node_modules/.git/.vite/dist/logs`，降低符号链接与深层目录导致的句柄风暴风险。
- watcher 增加 fatal 降级：命中 `EMFILE/ENOSPC/ENAMETOOLONG` 后记录高优先级日志并自动停用 dev watcher，避免日志雪崩与开发进程异常退出。
- `change` 回调增加全链路 `try/catch`，reload 失败只记录日志，不再向上冒泡成未处理异常。
- 切断 `@talex-touch/unplugin-export-plugin` 与 `@talex-touch/tuff-cli` 的双向 workspace 依赖：移除前者对后者的直接依赖，打断 `node_modules` 递归链。
- 旧 CLI 入口兼容策略更新：从 `@talex-touch/unplugin-export-plugin` 调用 `tuff` 时，若未安装 `@talex-touch/tuff-cli`，改为“显式报错 + 安装指引 + 非 0 退出”。
- 插件安装复制链路新增 `node_modules` 自动剔除：`PluginResolver` 与 `DevPluginInstaller` 在目录复制时过滤 `node_modules`，并在解包后做一次递归清理，防止历史残留再次落盘到运行态插件目录。

### feat(pilot): Chat/Turn 新协议与单 SSE 尾段 Title

- 新增 `POST /api/v1/chat/sessions/:sessionId/turns`（会话入队，返回 `request_id/turn_id/queue_pos`）。
- 新增 `POST /api/v1/chat/sessions/:sessionId/stream`（`turn.*` 事件流 + 尾段 `title.generated/title.failed` + `[DONE]`）。
- 新增 `GET /api/v1/chat/sessions/:sessionId/messages`（返回 `messages + run_state + active_turn_id + pending_count`）。
- 服务端补齐 `chat-turn-queue`（会话级串行执行与状态持久化）。
- 历史会话链路改为 JSON：`pilot_quota_history.value` 完成一次性 base64 -> JSON 迁移，后续读写统一 JSON 字符串并回包结构化 `value/messages`。

### fix(pilot): run_state 查询故障降级，避免会话读取 500

- `aigc/conversation`、`aigc/conversations`、`aigc/history` 与 `v1/chat/sessions/:id/messages` 在运行态查询失败时统一降级为 `run_state=idle`，确保历史消息可读。
- 新增 `getSessionRunStateSafe` 兜底方法，避免队列表异常导致前端刷新误判“分析失败”。

### fix(chat-ui): 输入区 loading 与发送解耦

- 输入区状态拆分为 `send_state=idle|sending_until_accepted`，仅“等待受理”阶段显示 loading。
- 发送链路支持连续发送，不再每次发送前强制 abort 上一个请求。
- 修复 `verbose` 状态映射与 `ChatItem` 结束态误判。

### refactor(prompt): 标题生成 prompt 收敛

- 抽取 `apps/pilot/server/utils/pilot-title.ts`，统一标题生成逻辑。
- `pilot-runtime` 默认系统提示压缩为更短、更稳的执行导向文案。

### CI/CD：Pilot webhook 自动部署恢复

- `pilot-image.yml` 在 GHCR 推送成功后自动触发 `POST /deploy`。
- 安全约束：`X-Pilot-Token` / `Authorization: Bearer` 校验、仓库/分支白名单。
- 文档与运维说明同步至：`.github/workflows/README.md`、`apps/pilot/deploy/README*.md`。
- 自动触发口径澄清：仅远端 `master` push（命中 workflow path）会触发，**本地 commit 不会触发 1Panel 自动更新**。
- 排障与兜底路径固化：当 webhook secrets 缺失或 1Panel webhook 不可达时，统一走 `ssh home` 手动执行部署脚本。

### fix(pilot): 流式失败可见性 + CMS 设置收口修复

- 前端 SSE 解析新增兼容层：支持 `event/session_id/[DONE]` 到 `type/sessionId/done` 统一映射，并补齐 `turn.accepted/queued/started/delta/completed/failed` 处理。
- `turn.failed` 改为“双通道可见”：消息区强制追加 assistant 失败消息，底部保留带 `code/status_code/request_id` 的诊断信息。
- `v1/chat/sessions/:sessionId/stream` 的失败语义增强：`turn.failed` 增加可选 `code/status_code/detail`，并对 502/503/504 返回可操作文案（兼容保留 `message`）。
- CMS 收口补丁：`/cms/system/pilot-settings` 页面独立滚动；Pilot 侧设置入口统一到该页；旧 `/pilot/admin/channels|storage` 改为直接跳转。
- `/cms` 防御性修复：CMS 路径 browser-only API 增加客户端守卫，`router.back()` 增加无历史记录 fallback，降低 500 风险。

### Docs：文档治理门禁脚本落地

- 新增 `scripts/check-doc-governance.mjs`。
- 新增命令：`pnpm docs:guard`（report-only）与 `pnpm docs:guard:strict`（严格模式）。
- CI 已接入 `docs:guard` 报告步骤（本轮仍不阻塞发布流水线）。

### feat(quality): legacy debt 冻结门禁（Phase 0）

- 新增 `scripts/check-legacy-boundaries.mjs`，冻结两类新增债务：
  - 新增 `legacy` 关键词命中（视为新增兼容分支）；
  - 新增 `channel.send('x:y')` raw event 字符串调用。
- 新增基线白名单 `scripts/legacy-boundary-allowlist.json`：
  - 存量债务按文件 + 命中次数备案；
  - 每条债务强制要求 `expiresVersion`（当前统一 `2.5.0`）。
- root scripts 新增 `pnpm legacy:guard`，并接入 `lint/lint:fix` 作为默认门禁。
- Phase 1 最小收口落地（兼容不改行为）：
  - `packages/utils/plugin/sdk/channel.ts`：`sendSync` fallback 一次性退场告警；
  - `packages/utils/renderer/storage/base-storage.ts` 与 `storage-subscription.ts`：legacy storage channel 通路一次性退场告警。

### feat(governance): 统一实施 PRD 与五工作包并行口径

- 新增统一蓝图文档：`02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md`，明确“单一蓝图 + 五工作包并行 + 统一里程碑验收”。
- 新增兼容债务清册 SoT：`docs/plan-prd/docs/compatibility-debt-registry.csv`，固定字段：
  - `domain / symbol_or_path / reason / compatibility_contract / expires_version / removal_condition / test_case_id / owner`
- 新增清册门禁：`scripts/check-compatibility-debt-registry.mjs`（覆盖校验 + 过期校验）。
- 新增超长文件门禁：`scripts/check-large-file-boundaries.mjs` + `scripts/large-file-boundary-allowlist.json`（阈值 `>=1200` 冻结增长）。
- `legacy:guard` 升级为统一门禁入口：
  - `check-legacy-boundaries` + `compat:registry:guard` + `size:guard`。
- `check-legacy-boundaries` 新增规则：
  - 冻结新增 `transport/legacy` 与 `permission/legacy` 导入扩散。
- `pnpm-workspace.yaml` 与 root `lint/lint:fix` 默认范围改为主线：
  - `apps/core-app`、`apps/nexus`、`apps/pilot`、`packages/*`、`plugins/*`；
  - 影子应用 `apps/g-*`、`apps/quota-*` 从默认 workspace 扫描隔离。
- 退场窗口标注补齐：
  - `packages/utils/transport/legacy.ts`
  - `packages/utils/permission/legacy.ts`
  - 明确 `v2.5.0` 前清退，不允许新增引用。
- 新增定向回归命令：`pnpm test:targeted`（utils/core-app/nexus 三段稳定用例）。
- 新增聚合门禁命令：`pnpm quality:gate`（`legacy:guard + network:guard + test:targeted + typecheck(node/web) + docs:guard`）。
- 新增 Sync 兼容壳自动化断言：
  - `apps/nexus/server/api/sync/__tests__/sync-routes-410.test.ts`
  - 固化 `/api/sync/pull|push` 必须返回 `410`，并断言 `statusMessage/data.message` 含 v1 迁移目标路径。
- 债务扫描口径升级为“显式白名单 + 漏扫报错 + scanScope 输出”：
  - `check-legacy-boundaries.mjs`
  - `check-compatibility-debt-registry.mjs`
- 超长文件门禁升级：
  - `--write-baseline` 不再允许自动上调 `maxLines`；
  - 引入 `growthExceptions` 显式增长豁免并校验 `CHANGES + compatibility registry` 同步。
- 本次临时增长豁免登记：
  - `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR` -> `apps/pilot/server/api/aigc/executor.post.ts`
  - `SIZE-GROWTH-2026-03-16-DEEPAGENT` -> `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
  - `SIZE-GROWTH-2026-03-16-PILOT-CHAT-PAGE` -> `apps/pilot/app/composables/usePilotChatPage.ts`
- 兼容债务清册清理：
  - 移除 2 条主线扫描口径外的陈旧条目（`apps/pilot/shims-compat.d.ts`、`apps/nexus/i18n.config.ts`）。
  - `size-growth-exception` 调整为 registry-only domain，不再触发误判式 cleanup warning。
- 结构治理补丁：
  - 修复 Nexus 异常文件名：`apps/nexus/ sentry.server.config.ts` → `apps/nexus/sentry.server.config.ts`。
  - 同步扫描脚本豁免路径，移除异常路径分支。
- Transport legacy 第一轮收口（非破坏式）：
  - `packages/utils/plugin/preload.ts`、`packages/utils/renderer/storage/base-storage.ts` 改为从 `@talex-touch/utils/transport` 统一入口取类型，不再直连 `transport/legacy`。
  - `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 改为注入 `@talex-touch/utils/transport` 命名空间，同时保持 `@talex-touch/utils/transport/legacy` 兼容映射键。
  - `packages/utils/index.ts` 由 `export * from './transport/legacy'` 改为从 `./transport` 重导出兼容符号。
  - 结果：`legacy-transport-import` 从 `4 files / 4 hits` 降至 `0 files / 0 hits`（主线扫描口径）。
  - 同步清理 `compatibility-debt-registry.csv` 中 4 条 `legacy-transport-import` 条目与 2 条陈旧 `legacy-keyword` 条目。
- 大文件增长豁免上限更新（同 ticket 续期内）：
  - `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR`：`apps/pilot/server/api/aigc/executor.post.ts` 上限 `1642 -> 1666`。
  - `SIZE-GROWTH-2026-03-16-DEEPAGENT`：`packages/tuff-intelligence/src/adapters/deepagent-engine.ts` 上限 `1919 -> 1924`。
  - `SIZE-GROWTH-2026-03-16-PILOT-CHAT-PAGE`：`apps/pilot/app/composables/usePilotChatPage.ts` 新增上限 `1366`（baseline 仍为 `1362`）。
  - 目的：恢复 `size:guard` 基线一致性，后续仍按 `v2.5.0` 前拆分退场执行。

---

## 2026-03-15

### Release：`v2.4.9-beta.4` 基线快照固化

- 基线事实：
  - commit: `d93e4bec599bed2c0793aa8602ba6462a39bfbbe`
  - tag: `v2.4.9-beta.4`
- 关键 CI：
  - Build and Release: [23106614270](https://github.com/talex-touch/tuff/actions/runs/23106614270)
  - Contributes: [23106610206](https://github.com/talex-touch/tuff/actions/runs/23106610206)
  - Pilot Image Publish: [23106610203](https://github.com/talex-touch/tuff/actions/runs/23106610203)
  - CodeQL: [23106609938](https://github.com/talex-touch/tuff/actions/runs/23106609938)

### CLI：Phase1+2 完整迁移收口

- `@talex-touch/tuff-cli` 成为唯一推荐 CLI 主入口。
- `@talex-touch/tuff-cli-core` 承接 `args/config/auth/publish/validate/runtime-config/device/repositories` 等核心能力。
- `@talex-touch/unplugin-export-plugin` CLI 降级为兼容 shim（保留转发 + 弃用提示）。
- 三包构建入口补齐，修复 `No input files` 构建失败。

### Plugin Gate：`2.4.9` 插件完善主线收口

- 权限中心 Phase5 完成：`PermissionStore` 切换 SQLite 主存储，JSON 仅保留迁移备份。
- 安装权限确认闭环：`always/session/deny` 三分支明确反馈，无 silent failure。
- View Mode 安全闭环 + Phase4 落地：协议/path/hash/dev-prod 一致性回归完成。
- CLI 兼容策略固化：`2.4.x` 保留 shim，`2.5.0` 退场。

### Docs：第二轮遗留清债收口

- `OMNIPANEL-FEATURE-HUB-PRD` 改为 historical done（2.4.8 Gate）。
- `PILOT-NEXUS-OAUTH-CLI-TEST-PLAN` 重写为“已落地 vs 未启动”。
- `TUFFCLI-INVENTORY` 改为 `tuff-cli` 主入口口径。
- `NEXUS-SUBSCRIPTION-PRD`、`NEXUS-PLUGIN-COMMUNITY-PRD` 增加历史/待重写标识。

---

## 2026-03-14

### v2.4.7 Gate D/E 历史闭环（不重发版）

- Gate D：通过 `workflow_dispatch(sync_tag=v2.4.7)` 执行历史资产回填。
- 关键 run：Build and Release [23091014958](https://github.com/talex-touch/tuff/actions/runs/23091014958)。
- 回填结果：`manifest + sha256` 补齐，签名缺口按历史豁免（仅 `v2.4.7`）。
- Gate E：按 historical done 关闭，不重发 `v2.4.7`。

### SDK Hard-Cut E~F 收口

- renderer 侧 `tryUseChannel/window.$channel/window.electron.ipcRenderer` 直连点完成收口。
- typed transport 事件与兼容层边界进一步清晰。

---

## 2026-03-12 ~ 2026-03-13

### Pilot Runtime 主路径收敛

- 主路径统一为 `Node Server + Postgres/Redis + JWT Cookie (+ MinIO)`。
- Cloudflare runtime / wrangler / D1/R2 降为历史归档语境。
- 会话与流式能力继续补齐（`fromSeq` 补播、pause/trace、运行态回传）。

### Core App 稳定性治理

- 生命周期与退出链路收敛、模块卸载幂等增强。
- Tray 实验特性开关化，默认入口回归更稳路径。

---

## 2026-03-09 ~ 2026-03-11

### Pilot M0/M1 高优先级收口

- Chat-first 页面与 SSE 协议稳定运行。
- 多模态输入链路与附件策略补齐（`dataUrl > previewUrl > ref` 优先级统一）。
- 兼容 API 迁移推进：`/api/aigc/*`、`/api/auth/status`、`/api/account/*` 等关键链路可用。

### 兼容阻塞修复

- `@element-plus/nuxt` 依赖归位到生产依赖，避免生产启动失败。
- 注入 `__BuildTime__` 与 `__THISAI_VERSION__`，修复 SSR 常量缺失。
- 修复 Milkdown 渲染阻塞路径，减少 Chat 页面 500/渲染异常。

---

## 2026-03-01 ~ 2026-03-08

### 文档主线收口（第一轮）

- 六主文档完成统一口径：状态、日期、下一动作对齐。
- 统一事实：`2.4.9-beta.4` 当前工作区、`2.4.8 OmniPanel historical`、`v2.4.7 Gate historical`。
- `next-edit` 与过期规划文档降权，减少“进行中/已完成”冲突叙述。

### Pilot API 批次迁移与运维能力补齐

- M2/M3 接口迁移覆盖运营常用域。
- 渠道合并能力落地：`POST /api/pilot/admin/channels/merge-ends` + 一次性脚本。
- 支付/微信相关路径按“协议兼容 + 本地 mock/豁免”策略收口。

---

## 2026-02-23 ~ 2026-02-28

### 发布链路与质量治理

- `build-and-release` 继续作为桌面发版主线；Nexus release 同步链路稳定。
- 质量门禁持续推进（typecheck/lint/test/build）并补齐文档证据。
- 插件市场多源、SDK 收口与历史 Gate 文档持续对齐。

---

## 历史索引导航（按月归档）

- [2026-03 月度归档](./archive/changes/CHANGES-2026-03.md)
- [2026-02 月度归档](./archive/changes/CHANGES-2026-02.md)
- [2025-11 月度归档](./archive/changes/CHANGES-2025-11.md)
- [归档索引 README](./archive/changes/README.md)
- [压缩前全量快照（legacy）](./archive/changes/CHANGES-legacy-full-2026-03-16.md)

---

## 说明

- 主文件只承担“当前可执行事实 + 近 30 天详细记录 + 历史索引入口”。
- 历史细节未删除，统一通过月度归档追溯。
- 后续新增记录遵循“同日同主题合并表达”规则，避免重复堆叠。
