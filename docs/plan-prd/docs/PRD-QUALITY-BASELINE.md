# PRD 最终目标与质量约束基线

> 更新时间：2026-04-07  
> 适用范围：`docs/plan-prd/02-architecture`、`docs/plan-prd/03-features`、`docs/plan-prd/04-implementation`、`docs/plan-prd/06-ecosystem`

## 1. 目的

统一活跃 PRD 的编写与验收标准，避免“有方案无目标、有实现无质量门禁”。  
从本文件生效后，新增或继续推进的 PRD 均应满足下述最小结构。

## 1.1 文档治理执行锚点（2026-03-17）

- 文档盘点与优先级路线统一参考：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`。
- 主线动作必须同步六文档：`INDEX / README / TODO / CHANGES / Roadmap / Quality Baseline`。
- 文档门禁升级前置保持不变：连续 5 次 `pnpm docs:guard` 零告警 + 连续 2 周无口径漂移。

## 2. 每个活跃 PRD 必须包含的章节（MUST）

1. **最终目标（Final Goal / North Star）**
   - 以可测量结果表达，而不是泛化描述；
   - 至少给出 1 个业务目标 + 1 个工程目标。

2. **范围与非目标（Scope / Non-goals）**
   - 明确本期做什么、不做什么；
   - 防止需求膨胀与任务漂移。

3. **质量约束（Quality Constraints）**
   - 至少包含：类型安全、错误处理、性能预算、回归验证。

4. **验收标准（Acceptance Criteria）**
   - 以可验证结果描述；
   - 建议“功能验收 + 质量验收 + 文档验收”三段式。

5. **回滚与兼容策略（Rollback / Compatibility）**
   - 失败时如何退回；
   - 对旧接口、旧数据、旧行为影响说明。

## 3. PRD 质量约束最小集合（MUST）

### 3.1 类型与调用约束
- 不得新增未类型化的跨层通信。
- 优先复用 domain SDK，禁止新增 raw event 字符串分发。
- 强制启用 `legacy:guard`：禁止新增 `channel.send('x:y')` 与新增 `legacy` 分支命中；新增兼容债务必须进入白名单并附退场版本（当前基线 `2.5.0`）。
- 强制启用 `compat:registry:guard`：兼容债务清册（`docs/plan-prd/docs/compatibility-debt-registry.csv`）必须完整覆盖存量命中，缺字段/缺条目/过期未清理均失败。
- 强制启用 `size:guard`：超长文件阈值 `>=1200` 基线冻结，禁止新增和增长；仅允许通过 `growthExceptions` 临时豁免，并要求同步 `CHANGES + compatibility registry`。
- 强制启用统一 guard 基础库：`legacy/compat/size/network` 脚本必须复用 `scripts/lib/*` 公共扫描/版本能力，禁止重复实现目录遍历与版本比较逻辑。
- CoreApp 硬切补充门禁：业务层 `window.$channel` 调用、legacy storage 旧协议（`storage:get/save/reload/save-sync/saveall`）与 legacy `sdkapi` 放行路径必须保持为 `0`；占位能力必须返回真实状态或显式 `unavailable + reason`，禁止固定假值“成功”。

### 3.2 可靠性约束
- 关键路径需有显式错误处理与用户可见反馈。
- 对异步流程必须定义超时与失败回退。
- Pilot 路由链路必须具备可观测指标（至少含 `queue wait`、`TTFT`、`total duration`、`success/error`），并支持熔断恢复策略。
- 启动高峰期涉及 SQLite 高频写入的链路，必须满足“单写者或物理分库隔离 + QoS 优先级 + 可降级策略（drop/backoff/latest-wins）”至少两项，禁止无上限重试灌队列。

### 3.3 性能约束
- 为关键路径提供预算（如启动、搜索响应、任务执行耗时）。
- 避免在主线程引入长时间同步阻塞。
- 对启动期性能治理，必须至少输出以下指标：队列分级深度、标签等待时间、drop 数、熔断状态、`SQLITE_BUSY` 比例、event-loop lag 分布。

### 3.4 安全与数据约束
- 遵守 Storage/Sync 规则：SQLite 本地 SoT，JSON 仅同步载荷。
- 禁止敏感信息明文落地到 localStorage/JSON/日志。

### 3.5 文档约束
- PRD 状态变化（进行中/完成/归档）必须同步 `README.md` 与 `TODO.md`。
- 对外行为变化必须同步 Nexus 对应开发文档。
- 推荐统一验收入口：`pnpm quality:gate`（`legacy:guard + network:guard + test:targeted + typecheck(node/web) + docs:guard`）。

## 4. 验收执行模板（建议复制到 PRD）

```md
## 验收清单
- [ ] 功能验收：核心功能按场景通过
- [ ] 质量验收：typecheck/lint/test 通过（或明确既有失败项）
- [ ] 性能验收：关键指标在预算范围内
- [ ] 安全验收：敏感数据与权限路径符合规则
- [ ] 文档验收：README/PRD/TODO/Nexus docs 已同步
```

## 5. 与现有文档的关系

- 产品层目标与节奏：`docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 项目索引与未闭环能力：`docs/plan-prd/README.md`
- 执行任务清单：`docs/plan-prd/TODO.md`
- 变更归档：`docs/plan-prd/01-project/CHANGES.md`

## 6. 项目质量执行记录（示例）

### 6.1 Nexus 组件文档迁移（2026-02-21）

**统计口径**
- 源文档：`packages/tuffex/docs/components/*.md`（不含 `index.md`）。
- 目标文档：`apps/nexus/content/docs/dev/components/*.(zh|en).mdc`（不含 `index.*.mdc`）。
- 状态来源：组件文档 Frontmatter 中的 `syncStatus`、`verified`。

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 源组件总数 | 95 | 基线 |
| Nexus 双语覆盖（zh+en 同时存在） | 104/104 | 100%（含扩展项） |
| `syncStatus: migrated`（zh/en） | 104/104 | 已完成 |
| `verified: true` | 1/104 | 仅 `button` 已验证 |
| 扩展项 | 9 | `foundations`、`flat-*`、`base-*`、`error/guide-state` |

**已解决**
- 迁移覆盖：源组件缺失为 0，双语成对齐全。
- 缺口补齐：`code-editor`、`flip-overlay` 中英文文档已新增并纳入索引。
- 扩展项已识别：9 个扩展文档已被纳入清单管理。

**待解决（未验收）**
- 验证覆盖率过低：`verified` 仅 1/104。
- 联调清单未闭环：入口/看板/双语一致性/新增项验证/扩展项核对/导航检索/lint/收口确认仍待执行。

### 6.2 发布链路收敛（2026-02-25）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 桌面发版主线 | `build-and-release.yml` | 已统一 |
| 失败构建创建 Release | 禁止 | 已收敛 |
| Nexus Release 同步 | 自动（tag push） | 已上线 |
| CLI 四包 npm 发布 | 自动（版本变化触发） | 已上线 |
| Nexus 官网部署 | Cloudflare Pages 平台侧 Git 自动部署 | 已上线 |

**质量约束落地**
- 发布 workflow 必须幂等，重复执行不得产生重复 release 资产记录。
- 预发布不得覆盖 npm 默认安装通道（`next` 与 `latest` 分离）。
- 发布后需同步 Nexus 可观测入口（release 或 update news）。

### 6.3 Intelligence Agent 一次切换（2026-02-25）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| Core IPC 命名空间 | `intelligence:agent:*` | 已切换 |
| Nexus Admin API | `/api/admin/intelligence-agent/*` | 已切换 |
| 旧入口 | `/api/admin/intelligence-lab/*` | 返回 `410` |
| Prompt Schema | `promptRegistry + promptBindings` | Core/Nexus 对齐 |
| Trace 合约版本 | `contractVersion = 3` | 已升级 |

**质量约束落地**
- 高频会话链路必须包含 `SSE stream.heartbeat / pause / recoverable / history / trace` 的显式契约能力（其中 heartbeat 通过流内事件提供，不再单独开放 API）。
- Prompt 渲染来源必须优先走 registry binding，缺失时允许回退并记录可迁移默认值。
- 高风险工具调用必须走审批票据，不得绕过 `high/critical` 审批门禁。

### 6.4 v2.4.7 发版门禁跟踪（2026-03-14）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 版本基线 | 历史 `v2.4.7` 发布窗口已满足；当前工作区为 `2.4.9-beta.4` | 作为历史 Gate 记录，不再阻塞当前主线 |
| 发布链路 | `build-and-release` + Nexus release + CLI npm 自动发布 | 已完成 |
| 质量门禁 | lint/typecheck 阻塞项已清零（C1~C4） | 已完成 |
| 发布资产结构 | notes/notesHtml `{ zh, en }` + assets manifest + sha256 | Gate D 已完成（run `23091014958`）；`signature` 对 `v2.4.7` 按历史豁免 |
| tag 发布动作 | `v2.4.7` | 历史已执行（tag 存在，release 已 published，latest 命中） |

**质量约束落地**
- 发布前必须完成 Gate C（阻塞级 lint/typecheck 清零或豁免清单显式备案）。
- 发布资产必须满足多语言结构约束（`notes`/`notesHtml` 仅 `zh|en`）。
- 发布执行以 `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` 作为单一追踪入口，避免口径分叉。
- Gate D/E 统一预检命令：`node scripts/check-release-gates.mjs --tag v2.4.7 --stage gate-d|gate-e --base-url https://tuff.tagzxia.com`。
- Gate D 收口证据：GitHub Actions `Build and Release` run `23091014958`（`workflow_dispatch + sync_tag=v2.4.7`）成功。
- 历史豁免边界：`v2.4.7` 允许 `signature` 缺口豁免；`>=2.4.8` 必须恢复 `manifest + sha256 + signatureUrl` 严格门禁。

### 6.5 Pilot × Intelligence（2026-03-07）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 新应用 | `apps/pilot`（Nuxt Node Server + Postgres/Redis） | 已创建并作为主路径运行 |
| Runtime 收口 | `packages/tuff-intelligence`（protocol/runtime/registry/policy/store） | 已落地 |
| 流式 API | `POST /api/chat/sessions/:sessionId/stream`（2026-03-17 从 `/api/pilot/*` 硬切） | 已上线 |
| 事件契约 | `assistant.delta/final`、`run.metrics`、`session.paused`、`error`、`done` | 已实现 |
| 补播机制 | `fromSeq` trace replay + checkpoint | 已实现（基础版） |
| 校验 | `apps/pilot` lint/typecheck/build | 已通过 |

**质量约束落地**
- 长对话必须具备 pause/resume 语义，断线场景不得“吞消息”。
- SSE 必须提供 keepalive 与显式结束事件（`done`），避免前端状态悬挂。
- 所有 Intelligence 核心类型与 Runtime 实现统一来源为 `@talex-touch/tuff-intelligence`，禁止新增 `@talex-touch/utils/intelligence*` 外部依赖。

### 6.6 Network 套件全仓硬切（2026-03-12）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 统一入口 | `@talex-touch/utils/network`（request/file/guard） | 已落地 |
| 覆盖范围 | `apps/core-app + apps/nexus + apps/pilot + packages + plugins` | 已收口 |
| 业务层 direct `fetch/axios` | 0（network 套件内部除外） | 已达标 |
| root 门禁 | `pnpm run network:guard`（全仓） | 已硬禁 |
| ESLint 规则 | `no-restricted-imports(axios)` + `no-restricted-syntax(fetch)` | 已补齐关键 workspace |

**质量约束落地**
- Renderer（Electron）网络请求必须通过 Main 网关或统一 NetworkSDK，不允许直连扩散。
- 本地文件读取统一走 network file API（`readText/readBinary/toTfileUrl`），避免分散路径解析策略。
- 任意 workspace 新增 direct `fetch/axios` 视为门禁失败（CI fail），不得以临时 allowlist 作为长期方案。

### 6.7 2.4.9 插件完善主线（2026-03-15）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 权限中心 Phase 5 | SQLite 主存储 + JSON 一次性迁移 + 失败只读回退 | 已完成 |
| 安装权限确认 | `always/session/deny` 三分支 | 已完成 |
| View Mode 安全闭环 | 协议/path/hash/dev-prod 边界用例补齐 | 已完成 |
| CLI 收口 | `tuff` 主入口 + `tuff validate` + 兼容入口提示 | 已完成 |
| 校验门禁 | `typecheck:node`/`typecheck:web`/定向 vitest/CLI smoke | 已通过 |

**质量约束落地**
- 安装失败路径必须可见（拒绝授权、异常、超时均不得 silent failure）。
- 事件/类型变更仅允许可选字段追加，禁止破坏既有语义与兼容性。
- `@talex-touch/tuff-cli` 为命令主入口，旧入口仅兼容 shim + deprecation，不承载新命令逻辑。
- 下一动作已统一为 `Nexus 设备授权风控`，不再把 CLI 分包迁移视为待办主线。

### 6.8 Nexus 设备授权风控文档化（2026-03-16）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 正式实施文档 | `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` | 已入库 |
| 文档结构 | 目标 / 范围与非目标 / 分期 / 验收 / 回滚 / 风险与豁免边界 | 已对齐 |
| 六主文档口径 | 下一动作统一为 `Nexus 设备授权风控` | 已对齐 |
| CLI 兼容策略 | `2.4.x` 保留 shim，`2.5.0` 退场 | 已固化 |

**质量约束落地**
- 风控策略调整必须同时更新实施文档与 `CHANGES`，形成同日证据闭环。
- 豁免必须具备责任人、时间窗和原因，不允许全局无限期豁免。
- 文档门禁仍保持 `docs:guard` report-only，strict 升级需满足连续零告警前置条件。

### 6.9 Pilot 路由 V2（2026-03-17）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 执行入口 | `/api/chat/sessions/*`（`/api/aigc/executor` 与 `/api/v1/chat/sessions/:sessionId/{stream,turns}` 已 hard-cut 下线） | 已统一接入 |
| 路由策略 | `Quota Auto` 速度优先 + 探索流量 | 已落地 |
| 评比指标 | `queueWaitMs/ttftMs/totalDurationMs/success/errorCode/finishReason` | 已落库 |
| 熔断恢复 | 失败阈值 + 冷却 + 半开探测 | 已落地 |
| 运行时模型目录 | `/api/runtime/models` 驱动前端模型选择 | 已落地 |

**质量约束落地**
- 路由决策必须可解释：需输出 `selectionSource + selectionReason + routeComboId`。
- 模型开关必须可控：`internet`、`thinking` 均需透传至后端执行链路。
- 路由异常必须自动回退：LangGraph Local Server 不可用时回退 deepagent，不得阻断主对话链路。

### 6.10 Core Main 生命周期止血（2026-03-23）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 启动链路 | 必需模块失败即 fail-fast，`ALL_MODULES_LOADED` 仅在全链路成功后触发 | 已收口 |
| 退出链路 | 运行时 `process.exit(0)` 已从主退出路径移除（close/tray） | 已收口 |
| EventBus 契约 | `once` 消费生效，`emit/emitAsync` 支持 handler 级异常隔离，新增诊断 | 已收口 |
| IPC 稳定性 | `dialog:open-file` 重复注册收敛为单注册点 | 已收口 |
| 回归门禁 | 定向 vitest（19 tests）+ `typecheck:node` | 已通过 |

**质量约束落地**
- 任何主进程业务退出路径不得直接 `process.exit(0)`，必须统一通过 `app.quit()` 与模块卸载流程。
- 启动健康态必须以“模块加载 + TouchApp 初始化完成”为前置，不允许发送虚假 `ALL_MODULES_LOADED`。
- 事件总线必须保证“单 handler 失败不影响其他 handler”与 `once` 监听器一次性语义。
- 关停流程必须可等待（`emitAsync` + `unloadAll`），并可观测 `app-quit` 上下文下的资源清理。

### 6.11 Core Main 生命周期收口与去耦首轮（2026-03-23）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 关停超时保险 | `before-quit` 新增默认 `8s` timeout guard，超时/异常后继续退出 | 已收口 |
| 卸载观测 | `ModuleUnloadObservation` 记录 `reason/appClosing/duration/failedCount` | 已落地 |
| 运行时上下文 | 生命周期统一注入 `ctx.runtime`（`MainRuntimeContext`） | 已落地 |
| 全局耦合守卫 | 新增 `guard:global-app` + allowlist，阻止 `src/main/**` 新增 `$app` 直接读取 | 已落地 |
| 结构治理首轮 | plugin/file/update 完成首轮服务拆分，外部契约保持不变 | 已落地 |
| 回归子集 | `pnpm test:core-main` 聚合主进程关键测试 + `typecheck:node` + `guard:global-app` | 已通过 |

**质量约束落地**
- 主进程退出流程必须具备“可等待 + 可超时脱困”双保险，禁止因单个 `before-quit` handler 阻塞导致无法退出。
- 生命周期观测必须包含可回归字段（`reason/appClosing/duration/failedCount`），用于“启停循环”稳定性对比。
- 新模块默认通过 `ctx.runtime` 获取依赖，不得新增 `globalThis.$app` 读取点；存量兼容仅允许过渡期一次性告警。
- 结构拆分必须保持外部 event 名称与 payload 兼容，且每次拆分补齐 direct tests，不以集成测试单点兜底。

### 6.12 脚本治理去重首轮（2026-03-23）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| guard 公共库 | `scripts/lib/scan-config.mjs`、`file-scan.mjs`、`version-utils.mjs` | 已落地 |
| 网络门禁入口 | root `check-network-boundaries.mjs` 支持 `--scope` | 已落地 |
| CoreApp 网络门禁 | 改为复用 root 脚本，删除重复实现 | 已收口 |
| 构建脚本拆分 | `build-target/postprocess-mac.js` 从主脚本抽离 | 已落地 |

**质量约束落地**
- 门禁脚本必须共享同一套扫描与版本比较基础能力，避免“规则一致、实现漂移”。
- 同类质量门禁仅允许一个实现来源；workspace 侧脚本优先复用 root 实现（通过 `--scope` 等参数化）。
- 大体量编排脚本必须按“编排层 + 平台实现层”拆分，降低单文件风险与回归成本。
- 桌面打包链路必须校验关键运行时依赖真实进入产物可解析路径（`app.asar` 或 `resources/node_modules`）；至少覆盖显式直依赖与已知高风险传递依赖（当前基线含 `ms`、`@sentry/electron`、`require-in-the-middle`、`module-details-from-path`，以及 `@langchain/core` 当前已知高风险缺包 `p-retry`、`retry`、`langsmith`、`mustache`、`camelcase`、`decamelize`、`ansi-styles`、`@cfworker/json-schema`），禁止产出“可安装但主进程启动即崩”的坏包。
