# PRD 最终目标与质量约束基线

> 更新时间：2026-03-14  
> 适用范围：`docs/plan-prd/02-architecture`、`docs/plan-prd/03-features`、`docs/plan-prd/04-implementation`、`docs/plan-prd/06-ecosystem`

## 1. 目的

统一活跃 PRD 的编写与验收标准，避免“有方案无目标、有实现无质量门禁”。  
从本文件生效后，新增或继续推进的 PRD 均应满足下述最小结构。

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

### 3.2 可靠性约束
- 关键路径需有显式错误处理与用户可见反馈。
- 对异步流程必须定义超时与失败回退。

### 3.3 性能约束
- 为关键路径提供预算（如启动、搜索响应、任务执行耗时）。
- 避免在主线程引入长时间同步阻塞。

### 3.4 安全与数据约束
- 遵守 Storage/Sync 规则：SQLite 本地 SoT，JSON 仅同步载荷。
- 禁止敏感信息明文落地到 localStorage/JSON/日志。

### 3.5 文档约束
- PRD 状态变化（进行中/完成/归档）必须同步 `README.md` 与 `TODO.md`。
- 对外行为变化必须同步 Nexus 对应开发文档。

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

### 6.4 v2.4.7 发版门禁跟踪（2026-02-26）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 版本基线 | 历史 `v2.4.7` 发布窗口已满足；当前工作区为 `2.4.8-beta.3` | 作为历史 Gate 记录，不再阻塞当前主线 |
| 发布链路 | `build-and-release` + Nexus release + CLI npm 自动发布 | 已完成 |
| 质量门禁 | lint/typecheck 阻塞项已清零（C1~C4） | 已完成 |
| 发布资产结构 | notes/notesHtml `{ zh, en }` | Gate D 仅剩元数据回填：`sha256 + manifest`；写入统一由 GitHub CI `sync-nexus-release` 执行（已接入 backfill，且仅 `v2.4.7` 启用）；`signature` 对 `v2.4.7` 按历史豁免 |
| tag 发布动作 | `v2.4.7` | 历史已执行（tag 存在，release 已 published，latest 命中） |

**质量约束落地**
- 发布前必须完成 Gate C（阻塞级 lint/typecheck 清零或豁免清单显式备案）。
- 发布资产必须满足多语言结构约束（`notes`/`notesHtml` 仅 `zh|en`）。
- 发布执行以 `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` 作为单一追踪入口，避免口径分叉。
- Gate D/E 统一预检命令：`node scripts/check-release-gates.mjs --tag v2.4.7 --stage gate-d|gate-e --base-url https://tuff.tagzxia.com`。
- 历史豁免边界：`v2.4.7` 允许 `signature` 缺口豁免；`>=2.4.8` 必须恢复 `manifest + sha256 + signatureUrl` 严格门禁。

### 6.5 Pilot × Intelligence（2026-03-07）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 新应用 | `apps/pilot`（Nuxt Node Server + Postgres/Redis） | 已创建并作为主路径运行 |
| Runtime 收口 | `packages/tuff-intelligence`（protocol/runtime/registry/policy/store） | 已落地 |
| 流式 API | `POST /api/pilot/chat/sessions/:sessionId/stream` | 已上线 |
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
