# 变更日志归档（2026-03）

> 来源：`docs/plan-prd/01-project/CHANGES.md` 历史拆分归档
> 归档时间：2026-03-16

## 2026-03-16

### Pilot：恢复 GitHub -> 1Panel webhook 自动部署（含密钥校验）

**变更类型**: CI/CD 自动化 / 运维安全加固

**描述**:
- 恢复并标准化 Pilot 自动部署链路：`pilot-image.yml` 推送 GHCR 成功后，自动 `POST` 1Panel webhook 触发重建。
- 新增 webhook 安全约束：
  - 请求必须携带 `X-Pilot-Token`（或 `Authorization: Bearer`）；
  - 服务端使用 `PILOT_WEBHOOK_TOKEN` 严格匹配；
  - 可选仓库/分支白名单：`PILOT_WEBHOOK_ALLOWED_REPOSITORY`、`PILOT_WEBHOOK_ALLOWED_BRANCH`。
- 新增轻量 HTTP webhook 服务与状态页：
  - `GET /`：查看最近一次部署状态与输出；
  - `GET /health`：健康检查；
  - `POST /deploy`：接收 payload 并调用部署脚本。
- 兼容入口补齐：根目录 `scripts/` 新增 webhook 兼容脚本与 env 示例，继续转发到 `apps/pilot/deploy` 真正实现。

**验证结果**:
- `bash -n "apps/pilot/deploy/deploy-pilot-1panel-webhook.sh"` ✅
- `python3 -m py_compile "apps/pilot/deploy/pilot-deploy-webhook-server.py"` ✅
- `bash -n "scripts/deploy-pilot-1panel-webhook.sh"` ✅

**修改文件（关键）**:
- `.github/workflows/pilot-image.yml`
- `.github/workflows/README.md`
- `apps/pilot/deploy/deploy-pilot-1panel-webhook.sh`
- `apps/pilot/deploy/deploy-pilot-1panel-webhook.env.example`
- `apps/pilot/deploy/pilot-deploy-webhook-server.py`
- `apps/pilot/deploy/pilot-deploy-webhook.service.example`
- `apps/pilot/deploy/README.md`
- `apps/pilot/deploy/README.zh-CN.md`
- `scripts/deploy-pilot-1panel-webhook.sh`
- `scripts/deploy-pilot-1panel-webhook.env.example`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/CHANGES.md`

### 修复: CMS 应用菜单为空（tree 资源 children 兼容）

**变更类型**: Bug 修复

**描述**: 修复 `system.menus` / `system.depts` 在兼容 seed 为“嵌套 children 存储”时被树构建重置为 `children: []` 的问题，导致管理后台“我的应用”无可选项。

**主要变更**:
1. `pilot-system-resource` 的树构建新增兼容归一化：同时支持“嵌套 children”与“扁平行 parentId”两种存储形态。
2. 保持既有数据可读，不需要清库或重建 seed。
3. 新增回归测试覆盖：
   - 嵌套 children 结构恢复树
   - 混合数据（嵌套 + 扁平）归并恢复树

**影响**: `GET /api/account/menus` 与 `GET /api/system/depts` 能返回完整子节点，CMS “我的应用”恢复可配置与可展示。

### 修复: Pilot 多模态输入链路稳定性（单条 user 多内容块）

**变更类型**: Bug 修复

**描述**:
- 统一 `text + image` 请求语义为“同一条 user 消息中的多模态 content”，避免拆成两条 user turn 导致上下文丢失。
- stream 与 quota 路径统一 `dataUrl > previewUrl > ref` 选取优先级，并补齐对应回归断言。

**验证结果**:
- `pnpm -C "apps/pilot" run test -- --runInBand` ✅（包含新增多模态消息形态断言）

### Docs：文档治理门禁脚本（warn 模式）落地

**变更类型**: 文档治理 / CI 门禁

**描述**:
- 新增 `scripts/check-doc-governance.mjs`，统一检查六主文档日期、下一动作口径、TODO 统计、陈旧文案与关键运维文档字段一致性。
- 默认 `warn` 模式（报告不阻塞）；支持 `--strict true` 切换为阻塞。
- 根脚本入口补齐：`pnpm docs:guard` 与 `pnpm docs:guard:strict`。
- CI 先接入 `docs:guard` 报告步骤（不改发布触发逻辑，不阻塞流水线）。

### Docs：Nexus 风控主线文档收口（实施入口 + 契约回填 + 兼容策略固化）

**变更类型**: 文档治理 / 主线收口

**描述**:
- `Nexus 设备授权风控` 正式实施文档入库：`docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md`（目标/范围/分期/验收/回滚/豁免边界）。
- 六主文档与生态文档同步回填：
  - `TODO/README/INDEX/Roadmap/Release Checklist/Quality Baseline` 的“下一动作”统一指向 `Nexus 设备授权风控` 实施入口；
  - `PILOT-INTELLIGENCE-API-CONTRACT` 更新为当前主路径（Node Server + Postgres/Redis + JWT Cookie + MinIO），Cloudflare/D1/R2 切为历史语境；
  - `view-mode-prd` 新增“已落地能力（Phase2~4）/未闭环项/验收证据”；
  - `TUFFCLI-PRD` / `TUFFCLI-SPLIT-PLAN` 固化 shim 生命周期（`2.4.x` 兼容，`2.5.0` 退场）。
- `TODO` 同步补充 `docs:guard` 升级 strict 的前置条件（连续零告警 + 无口径回退）。

**基线推送证据（commit `c1542556`）**:
- commit: `c1542556b7d4782b34a7b51691689fc917eb5562`
- CI run：
  - Contributes: https://github.com/talex-touch/tuff/actions/runs/23125828534（completed/success）
  - CodeQL: https://github.com/talex-touch/tuff/actions/runs/23125828282（completed/success）
  - Pilot Image Publish: https://github.com/talex-touch/tuff/actions/runs/23125828532（completed/failure）
  - Pilot CI: https://github.com/talex-touch/tuff/actions/runs/23125828545（completed/success）

### Docs：文档清债第二轮（遗留文档收口）

**变更类型**: 文档治理 / 历史债务收口

**描述**:
- 完成证据层修正：补录提交 `223cb514` 的 CI 事实，并将 `c1542556` 条目中的运行态更新为最终态。
- 活跃文档对齐：
  - `OMNIPANEL-FEATURE-HUB-PRD` 改为 historical done（2.4.8 Gate），不再作为当前主线；
  - `PILOT-NEXUS-OAUTH-CLI-TEST-PLAN` 重写为“已落地 vs 未启动”快照，明确 `tuff-pilot-cli` 仍为 backlog；
  - `TUFFCLI-INVENTORY` 改为 `tuff-cli` 主入口口径，保留 `unplugin` shim 兼容窗口（2.4.x 保留 / 2.5.0 退场）。
- 历史文档降权：`NEXUS-SUBSCRIPTION-PRD` 与 `NEXUS-PLUGIN-COMMUNITY-PRD` 增加“历史/待重写”头部标记与替代入口（`CHANGES`/`TODO`）。
- `TODO` 增加“文档债务池（第二轮）”小节，记录本轮已处理与剩余文档清单。

**本次提交证据（commit `223cb514`）**:
- commit: `223cb5146de06644f7567bd0a5704f835696257a`
- CI run：
  - Contributes: https://github.com/talex-touch/tuff/actions/runs/23126138554（completed/success）
  - CodeQL: https://github.com/talex-touch/tuff/actions/runs/23126138304（completed/success）

---

## 2026-03-16

### feat(pilot): Chat/Turn 新协议与单 SSE 尾段 Title

- 新增 `v1/chat/sessions/:sessionId` 路由族：
  - `POST /turns`：按会话入队，返回 `request_id/turn_id/queue_pos`
  - `POST /stream`：按 turn 流式回传 `turn.accepted/queued/started/delta/completed`，并在同一 SSE 尾段返回 `title.generated/title.failed`，最后 `[DONE]`
  - `GET /messages`：返回 `messages` 同时附带 `run_state/active_turn_id/pending_count`
- 新增服务端 `chat-turn-queue`（会话级串行执行锁 + 队列状态持久化）。
- 旧 `aigc/history|conversations|conversation/:id` 回包增加 `run_state` 相关字段，支持刷新恢复时读取后端运行态。

### fix(chat-ui): 输入区 loading 与发送解耦

- 输入区新增 `send_state`（`idle | sending_until_accepted`），底部 loading 仅在等待受理时展示。
- 发送逻辑改为允许连续发送，不再在每次发送前强制 abort 上一个请求。
- 修复 `verbose` 状态映射错误与 `ChatItem` 结束态误判（避免无内容时显示“分析失败”）。

### refactor(prompt): 标题生成 prompt 收敛

- 抽取 `server/utils/pilot-title.ts`，统一 `executor` 与 `title` 接口的标题生成逻辑与短 prompt。
- `pilot-runtime` 默认系统提示压缩为短、稳、可执行导向文案。

## 2026-03-15

### Release：v2.4.9-beta.4 基线快照固化（工作区治理起点）

**变更类型**: 发布基线固化 / 工作区治理

**描述**:
- 固化当前工作区基线为 `2.4.9-beta.4`，作为后续“全仓历史债务清理”的统一起点。
- 已记录并核对发布事实：
  - commit: `d93e4bec599bed2c0793aa8602ba6462a39bfbbe`
  - tag: `v2.4.9-beta.4`
  - CI 结果：
    - Build and Release: https://github.com/talex-touch/tuff/actions/runs/23106614270
    - Contributes: https://github.com/talex-touch/tuff/actions/runs/23106610206
    - Pilot Image Publish: https://github.com/talex-touch/tuff/actions/runs/23106610203
    - CodeQL: https://github.com/talex-touch/tuff/actions/runs/23106609938
- 工作区卫生同步收口：将 `output/` 明确纳入 `.gitignore`，避免 Playwright 截图产物污染提交。

**验证结果**:
- `git ls-remote --tags origin v2.4.9-beta.4` ✅
- 上述 4 条 CI workflow 全部 `completed/success` ✅

### Docs：主文档压缩与债务分层（2.4.9 基线）

**变更类型**: 文档治理 / 状态口径压缩

**描述**:
- `TODO` 拆分为“当前执行清单（2周）+ 历史债务池（长期）+ Wave A/B/C”三层入口，减少短期主线与长期债务混杂。
- 任务统计改为 checkbox 实时计数口径（`184 done / 76 todo / 260 total`，71%）。
- 主文档中的“当前工作区版本”统一更新为 `2.4.9-beta.4`（历史语境保留，不改 historical 结论）。
- CLI 生态文档同步为“Phase1+2 已完成 + 兼容层保留期”，去除“纯规划态”误导描述。

**修改文件（关键）**:
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/06-ecosystem/{README.md,TUFFCLI-PRD.md,TUFFCLI-SPLIT-PLAN.md}`

### CLI：Phase1+2 完整迁移收口（`tuff-cli` + `tuff-cli-core` + shim）

**变更类型**: 包层迁移 / 兼容收口 / 工具链修复

**描述**:
- `@talex-touch/tuff-cli` 成为 `tuff` 命令主入口，运行时加载自身 `dist/bin/tuff.js`。
- `@talex-touch/tuff-cli-core` 承接核心编排与共享逻辑：`args/config/auth/publish/validate/runtime-config/device/repositories`。
- `@talex-touch/unplugin-export-plugin` 的 CLI 入口降级为兼容 shim：保留转发能力并输出 deprecation 提示，不再承载主命令逻辑。
- 补齐 `tuff-cli`、`tuff-cli-core`、`tuffcli` 的 `tsup` 构建入口，修复三包 `No input files` 构建失败。
- 迁移并补齐回归测试：CLI 参数、配置、publish smoke、validate 失败码，以及 shim 转发链路。

**验证结果**:
- `pnpm -C "packages/tuff-cli-core" run lint && pnpm -C "packages/tuff-cli-core" run build && pnpm -C "packages/tuff-cli-core" run test` ✅
- `pnpm -C "packages/tuff-cli" run lint && pnpm -C "packages/tuff-cli" run build` ✅
- `pnpm -C "packages/tuffcli" run lint && pnpm -C "packages/tuffcli" run build` ✅
- `pnpm -C "packages/unplugin-export-plugin" run lint && pnpm -C "packages/unplugin-export-plugin" run build && pnpm -C "packages/unplugin-export-plugin" run test` ✅
- `node packages/tuff-cli/bin/tuff.js --help` / `validate --help` ✅
- 无效 manifest 执行 `tuff validate --strict` 返回非 0（`exit code=1`）✅
- `node packages/unplugin-export-plugin/dist/bin/tuff.js --help` 输出 deprecation 并成功转发 ✅

### Pilot：M2/M3 接口迁移收口（含微信豁免 + 支付 3 秒自动结算）

**变更类型**: API 兼容迁移 / 豁免策略落地 / 运维脚本补齐

**描述**:
- 基于 `g-wggu...ends` 与 `g-wggu...view` 口径，Pilot 侧完成 M2/M3 迁移收口：
  - 运营后台常用域：`tools/storage/*`、`marketing/banner/*`、`feedback/*`、`subscribe/*`、`system/serve/stat`。
  - 重 CRUD 域：`doc/*`、`system/users|roles|menus|depts|dict|tasks|param-config/*`。
  - AIGC 管理域：`aigc/chat_log*`、`aigc/consumption_statistics`、`aigc/prompts*`（list/create/get/update/audit/status/tags/statistics）。
- 微信相关接口统一进入豁免模式（协议可消费，暂不接第三方）：
  - `livechat/*`、`platform/qrcode*`、`auth/sms_*`、`auth/platform_login*`。
- 支付相关接口保留协议并切换为本地 mock：
  - `order/*`、`coupon/*` 下单后固定 **3 秒自动结算成功**，`order/status/target` 可轮询拿到完成态。
- 渠道治理收口：
  - 新增 `ends -> pilot` 渠道合并能力，按 `id` 去重、Pilot 优先、Ends 仅补缺。
  - 新增管理端触发接口：`POST /api/pilot/admin/channels/merge-ends`。
  - 新增一次性脚本：`pnpm -C "apps/pilot" run channels:merge:ends`。
  - 渠道敏感字段继续通过 `PILOT_CONFIG_ENCRYPTION_KEY` 加密存储。
- 目录治理：
  - `.gitignore` 新增忽略：`apps/g-wggu5114-thisai-thisai-ends-/`、`apps/g-wggu5114-thisai-thisai-view-/`。

**验证结果**:
- 前端 endpoint 对照复核：从 `g-wggu...view` 抽取的 `endHttp` 调用（101 条）已全部在 `apps/pilot/server/api` 匹配到明确路由，未发现 501 落兜底路径。
- `pnpm -C "apps/pilot" run test` ✅
- `pnpm -C "apps/pilot" run typecheck` ⚠️（存在大量存量错误；本次新增 `merge-ends` 与 channel 类型约束相关错误已清理）

**修改文件（关键）**:
- `.gitignore`
- `apps/pilot/server/utils/pilot-compat-store.ts`
- `apps/pilot/server/utils/pilot-compat-payment.ts`
- `apps/pilot/server/utils/pilot-compat-seeds.ts`
- `apps/pilot/server/utils/pilot-system-resource.ts`
- `apps/pilot/server/utils/pilot-compat-aigc.ts`
- `apps/pilot/server/utils/pilot-local-auth.ts`
- `apps/pilot/server/utils/pilot-admin-channel-config.ts`
- `apps/pilot/server/utils/pilot-channel-merge-ends.ts`
- `apps/pilot/server/api/pilot/admin/channels/merge-ends.post.ts`
- `apps/pilot/scripts/merge-ends-channels.mjs`
- `apps/pilot/package.json`
- `apps/pilot/server/api/system/**`
- `apps/pilot/server/api/aigc/**`
- `apps/pilot/server/api/order/**`
- `apps/pilot/server/api/coupon/**`
- `apps/pilot/server/api/doc/**`
- `apps/pilot/server/api/feedback/**`
- `apps/pilot/server/api/marketing/banner/**`
- `apps/pilot/server/api/subscribe/**`
- `apps/pilot/server/api/livechat/**`
- `apps/pilot/server/api/platform/**`
- `apps/pilot/server/api/auth/**`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/INDEX.md`

### Core-app：2.4.9 插件主线收口（权限 Phase5 + View 安全 + CLI validate）

**变更类型**: 插件治理收口 / 安装链路增强 / CLI 兼容升级

**描述**:
- 权限中心 Phase 5 落地：
  - `PermissionStore` 切换为 SQLite 主存储（`permissions.db`）；
  - 启动时支持 `permissions.json -> SQLite` 一次性迁移，迁移后保留 JSON 备份；
  - SQLite 不可用时进入 JSON 只读回退并输出告警。
- 插件安装链路新增权限确认：
  - 安装队列在 finalize 前增加 `permissions` 确认阶段；
  - 渲染侧支持 `always/session/deny` 三选一；
  - 拒绝授权时安装失败可感知，不再 silent failure。
- View Mode 安全回归补齐：
  - 增加非法协议、双斜杠路径、显式 html 文件路径等边界测试；
  - 类型侧补齐 `IPluginWebview`，`IPluginDev.source` 与 `PluginIssue` 字段语义对齐。
- CLI 收口：
  - `tuff` 新增 `validate` 子命令（manifest/sdkapi/category/permissions 校验）；
  - `@talex-touch/tuff-cli` 入口标记为主入口；
  - `@talex-touch/unplugin-export-plugin` 保留兼容入口并输出迁移提示。
- 文档闭环：
  - 新增插件市场多源验收文档并同步 `TODO/README/INDEX` 状态口径；
  - 六份主文档（`TODO/README/INDEX/Roadmap/Release Checklist/Quality Baseline`）更新时间与 `2.4.9` 主线顺序已统一到 `2026-03-15`。

**验证结果**:
- `pnpm -C "apps/core-app" run typecheck:node` ✅
- `pnpm -C "apps/core-app" run typecheck:web` ✅
- `pnpm -C "apps/core-app" exec vitest run "src/main/modules/permission/permission-store.test.ts" "src/main/modules/permission/permission-guard.test.ts" "src/main/modules/plugin/install-queue.test.ts" "src/main/modules/plugin/view/plugin-view-loader.test.ts"` ✅（17 tests passed）
- `node packages/tuff-cli/bin/tuff.js --help|create --help|build --help|dev --help|publish --help|validate --help` ✅
- `node packages/tuff-cli/bin/tuff.js validate --manifest <invalid> --strict` 返回非交互失败码 `1` ✅
- `node packages/unplugin-export-plugin/dist/bin/tuff.js --help` 输出 deprecation 提示 ✅

**修改文件（关键）**:
- `apps/core-app/src/main/modules/permission/permission-store.ts`
- `apps/core-app/src/main/modules/permission/index.ts`
- `apps/core-app/src/main/modules/plugin/install-queue.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/renderer/src/modules/install/install-manager.ts`
- `apps/core-app/src/main/modules/plugin/view/plugin-view-loader.test.ts`
- `apps/core-app/src/main/modules/plugin/install-queue.test.ts`
- `apps/core-app/src/main/modules/permission/permission-store.test.ts`
- `packages/utils/plugin/install.ts`
- `packages/utils/plugin/index.ts`
- `packages/unplugin-export-plugin/src/bin/tuff.ts`
- `packages/tuff-cli/bin/tuff.js`
- `docs/plan-prd/docs/PLUGIN-STORE-MULTI-SOURCE-ACCEPTANCE-2026-03-15.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-14

### Pilot：附件空正文提示 + MinIO env 直连兜底

**变更类型**: 交互可读性修复 / 存储配置增强

**描述**:
- 聊天输入仅上传附件且未输入文本时，自动补充正文占位 `"(无正文内容)"`，避免消息气泡出现空正文。
- 新旧聊天入口统一该行为：`pilot` 新会话页与旧 QuotaGPTView 输入框在“仅附件发送”场景都会补齐占位文本。
- 附件存储增加 MinIO 环境变量直连兜底：当后台存储配置未设置时，可直接通过 env 启用 `s3/minio` 写入。
- 支持 env 键：`PILOT_ATTACHMENT_PROVIDER`、`PILOT_ATTACHMENT_PUBLIC_BASE_URL`、`PILOT_ATTACHMENT_SIGNING_SECRET`、`PILOT_MINIO_*`。
- 签名密钥优先读取 `PILOT_ATTACHMENT_SIGNING_SECRET`，为空时回退 `PILOT_COOKIE_SECRET`。
- 当 provider 设为 `s3/minio` 但配置缺失或上传失败时，服务端自动回退到 `memory` 并输出日志，优先保证附件功能可用。
- 上传大小限制统一为 **10MB**（旧 `tools/upload` 与新 `pilot` 会话附件上传接口都生效），前端同步拦截超限文件。
- 旧上传接口补充绝对 `url` 返回字段，前端优先使用该地址，减少自拼接 URL 导致的访问错误。

**修改文件**:
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `apps/pilot/app/components/input/ThInput.vue`
- `apps/pilot/server/utils/pilot-attachment-storage.ts`
- `apps/pilot/server/utils/__tests__/pilot-attachment-storage.test.ts`
- `apps/pilot/.env.example`
- `apps/pilot/deploy/deploy-pilot-1panel.env.example`
- `apps/pilot/deploy/README.md`
- `apps/pilot/deploy/README.zh-CN.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot：邮箱登录自动注册 + 仅附件消息可发送

**变更类型**: 登录流程简化 / 聊天交互可用性修复

**描述**:
- 邮箱登录改为“未注册自动创建账号并登录”，无需单独走邮箱注册入口；已存在账号仍按密码校验登录。
- 登录接口统一密码长度校验（`6-128` 位），并根据“登录/自动注册”区分访客数据合并来源。
- 新 Pilot 会话链路支持“仅附件发送”（空文本 + 附件），并同步修复流式接口校验与运行时 turn 判定，避免附件消息被拒绝。
- 旧 QuotaGPTView 输入框发送条件优化：仅在“文件仍在上传中”时禁发；已失败文件不再阻塞文本/已上传文件发送。
- 登录弹窗移除邮箱注册 tab，邮箱登录按钮改为“登录 / 自动注册”并补充提示文案，降低使用歧义。

**修改文件**:
- `apps/pilot/server/api/auth/email/login.post.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/stream.post.ts`
- `packages/tuff-intelligence/src/business/pilot/stream.ts`
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `packages/tuffex/packages/components/src/chat/src/types.ts`
- `packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue`
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `apps/pilot/app/components/input/ThInput.vue`
- `apps/pilot/app/components/chore/Login.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### CI：sync-nexus-release 接入 Gate D backfill（仅 v2.4.7）

**变更类型**: 发布流程补齐 / 风险收敛

**描述**:
- `build-and-release.yml` 的 `sync-nexus-release` job 已接入 `scripts/backfill-release-assets-from-github.mjs`。
- backfill 步骤增加 tag 守卫，**仅当 `TAG == v2.4.7` 执行**，避免影响 `>=2.4.8`（含 `v2.4.9`）严格发布资产流程。
- 本地 dry-run 命令校验通过：可稳定产出 `sha256 + manifest` 的差异计划。

**修改文件**:
- `.github/workflows/build-and-release.yml`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/01-project/CHANGES.md`

### CI：build-and-release 支持手动 `sync_tag` 触发 Nexus 同步

**变更类型**: 发布自动化增强 / 执行路径补齐

**描述**:
- `build-and-release.yml` 新增 `workflow_dispatch.inputs.sync_tag`，可手动指定已有 tag（如 `v2.4.7`）直接执行 `sync-nexus-release`。
- 当 `sync_tag` 存在时，`build-and-release` 与 `create-release` 路径会被跳过，改走“仅同步”流程，避免重复构建与额外 draft release。
- `sync-nexus-release` 新增 tag 格式校验，并继续保留 `v2.4.7` 专属 backfill 守卫。

**修改文件**:
- `.github/workflows/build-and-release.yml`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Release：v2.4.7 Gate D 收口完成（CI 手动同步）

**变更类型**: 发布门禁闭环 / 文档状态收口

**描述**:
- 通过 GitHub Actions `Build and Release`（run `23091014958`）执行 `workflow_dispatch + sync_tag=v2.4.7`，`Sync Nexus Release` 全流程成功。
- `v2.4.7` 远端资产从 3 项收口到 4 项，已包含 `tuff-release-manifest.json`，且资产 `sha256` 已补齐。
- 六份主文档口径统一更新为：`Gate A/B/C/D/E = Done`（其中 `Gate E` historical、`Gate D` historical backfill）。
- 主线顺序同步切换为：`View Mode 安全收口 -> Nexus 设备授权风控`。

**修改文件**:
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Docs：Release assets 核对清单切换到 v2.4.9 严格口径

**变更类型**: 文档口径切换 / 发布治理前移

**描述**:
- `NEXUS-RELEASE-ASSETS-CHECKLIST` 从 `v2.4.7` 语境切换为 `v2.4.9` Gate D 严格执行清单。
- 明确默认规则为 `manifest + sha256 + signatureUrl` 全量完整，且 `signature` 不允许豁免。
- 保留说明：`v2.4.7` 历史豁免不在该清单覆盖范围内，避免新旧版本口径混用。
- 同步更新 `README/INDEX/TODO` 中对此清单的入口描述，统一为 `v2.4.9` 严格核对入口。

**修改文件**:
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Docs：Gate D 执行方式统一为 GitHub CI 自动同步

**变更类型**: 发布流程口径修正 / 执行路径统一

**描述**:
- `v2.4.7 Gate D` 的写入动作统一改为 GitHub Actions 自动执行（`build-and-release.yml` / `sync-nexus-release`）。
- 本地脚本仅保留 dry-run 对账用途，不再要求手工 `--nexus-key` 回填。
- 同步更新 `TODO/README/INDEX/Release Checklist` 的“下一动作”描述，避免手工路径与 CI 主路径并存。

**修改文件**:
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Release：v2.4.7 Gate D 回填脚本落地 + Gate E 历史闭环

**变更类型**: 发布治理收口 / 历史版本豁免记录 / 文档一致性修复

**描述**:
- 新增 `scripts/backfill-release-assets-from-github.mjs`，用于 `v2.4.7` Gate D 数据补齐：
  - 从 GitHub `talex-touch/tuff` release 拉取资产与 `tuff-release-manifest.json`；
  - 按 `platform/arch/filename` 对齐 Nexus 资产，回填 `sha256` 与 manifest 资产记录；
  - 支持 `--dry-run` 输出“将更新/已更新”差异清单。
- `Gate E` 统一改为 `Done (historical)`，并固定证据链：
  - `v2.4.7` tag 存在（本地与远端）；
  - Nexus release 已 `published`；
  - `latest?channel=RELEASE` 命中 `v2.4.7`。
- `v2.4.7` 签名缺口登记为历史豁免（Accepted waiver）：
  - GitHub 原始 `v2.4.7` 无 `.sig` 资产；
  - manifest 无 signature 字段；
  - 豁免仅作用于 `v2.4.7`，不扩展到 `>=2.4.8`。
- 同步收口 `TODO/README/INDEX/Roadmap/Quality Baseline/Release Checklist` 六份主文档，主线顺序统一为 `Gate D -> View Mode`。

**修改文件**:
- `scripts/backfill-release-assets-from-github.mjs`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/01-project/RISK-REGISTER-2026-02.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot：管理员引导密码改为强制 env 注入（最小 6 位）

**变更类型**: 安全基线收敛 / 配置约束增强

**描述**:
- `pilot-bootstrap-admin` 不再使用默认管理员密码，`PILOT_BOOTSTRAP_ADMIN_PASSWORD` 必须显式提供。
- 启动时管理员密码最小长度约束从 3 位提升到 6 位；不满足时跳过 bootstrap 并输出提示日志。
- 部署与示例配置同步：移除 `admin` 默认回退，模板改为 `replace-with-admin-password-min-6` 占位值。

**修改文件**:
- `apps/pilot/server/plugins/pilot-bootstrap-admin.ts`
- `apps/pilot/.env.example`
- `apps/pilot/deploy/deploy-pilot-1panel.env.example`
- `apps/pilot/deploy/deploy-pilot-1panel.sh`
- `apps/pilot/deploy/README.md`
- `apps/pilot/deploy/README.zh-CN.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot：显式 env 加载优先级固化（`.env.local > .env.prod > .env.dev > .env`）

**变更类型**: 配置行为固化 / 本地开发一致性修复

**描述**:
- 在 `apps/pilot/nuxt.config.ts` 增加显式 env 文件加载逻辑，不再依赖 Nuxt 默认加载顺序。
- 按固定顺序覆盖：先加载 `.env`，再 `.env.dev`，再 `.env.prod`，最后 `.env.local`，确保最终优先级为 `.env.local > .env.prod > .env.dev > .env`。
- 新增共享加载器 `apps/pilot/shared/pilot-env-loader.ts`，并在 Postgres DSN 解析前强制一次性应用优先级，避免 Nitro 运行时与 Nuxt 配置阶段出现读取不一致。
- 修复“本地已在 `.env.local` 配置但默认 `pnpm run dev` 仍报 Postgres 密码错误”的不确定行为。

**修改文件**:
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/shared/pilot-env-loader.ts`
- `apps/pilot/server/utils/pilot-node-pg-d1.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot：渠道不可用诊断增强（503 可观测性修复）

**变更类型**: 运行时诊断增强 / 错误信息可观测性

**描述**:
- `resolvePilotChannelSelection` 在无可用渠道时输出结构化日志（包含 `db` 目标、配置渠道列表、启用渠道列表、默认渠道、请求渠道）。
- `/api/aigc/executor` 的 503 SSE 错误事件补充 `code/reason/message`，并将文案细化为可执行指引（例如 `no_channels_configured`）。
- 修复 h3 警告：避免使用长 `statusMessage`，改为短状态 + 详细 `message`。
- 启动期 bootstrap 检查日志增加数据库目标定位，便于快速判断“连到了空库”还是“渠道被禁用”。

**修改文件**:
- `apps/pilot/server/utils/pilot-channel.ts`
- `apps/pilot/server/api/aigc/executor.post.ts`
- `apps/pilot/server/plugins/pilot-channel-bootstrap-check.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot：Postgres 兼容性修复（登录合并链路）

**变更类型**: 运行时稳定性修复 / 跨数据库兼容

**描述**:
- 修复 `D1RuntimeStoreAdapter.ensureSchema` 在 Postgres 下对重复列异常识别不全的问题（`42701` / `column ... already exists`），避免登录后访客数据合并阶段异常中断。
- 修复访客合并 SQL 中 SQLite 专用函数 `randomblob()` 导致的 Postgres 500。
- 将 `INSERT OR IGNORE` 改为 `ON CONFLICT ... DO NOTHING`，统一兼容 SQLite + Postgres。

**修改文件**:
- `packages/tuff-intelligence/src/store/d1-runtime-store.ts`
- `apps/pilot/server/utils/pilot-guest-merge.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot：管理后台新增渠道设置页（复用存储页风格）

**变更类型**: 管理能力补齐 / 配置可视化

**描述**:
- 新增 ` /pilot/admin/channels ` 页面，支持增删渠道、默认渠道选择、超时与工具配置。
- 复用 `storage` 管理页的布局与视觉风格，并在侧边栏与存储页头部增加“渠道设置”入口。
- 渠道保存支持“留空 API Key 保持不变”，避免每次编辑都重复输入密钥。
- 修复加密配置解密前缀解析错误（`enc:v1`），解决渠道配置“保存成功但读取为空”的问题。

**修改文件**:
- `apps/pilot/app/pages/pilot/admin/channels.vue`
- `apps/pilot/app/pages/pilot/admin/storage.vue`
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `apps/pilot/server/utils/pilot-admin-channel-config.ts`
- `apps/pilot/server/utils/pilot-config-crypto.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot：旧 QuotaGPTView 流式 Markdown 实时性优化（executor 链路）

**变更类型**: 交互性能优化 / 流式体验修复

**描述**:
- 对旧 `executor` 聊天链路增加前端 80ms Markdown 合帧写入，避免逐 token 触发重渲染导致“看似缓冲”。
- `MilkContent` 增加 80ms 内容刷新调度与重复内容跳过，减少 `replaceAll` 频率并保留持续 Markdown 渲染。
- 生成期滚动改为节流触发 + `auto` 滚动，完成后再 `smooth` 校正一次，降低滚动动画抢占主线程问题。
- 生成光标定位改为低频更新（80ms），减少每次 chunk 的 Range 计算和布局抖动。

**修改文件**:
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
- `apps/pilot/app/components/article/MilkContent.vue`
- `apps/pilot/app/components/chat/ThChat.vue`
- `apps/pilot/app/components/render/RenderContent.vue`
- `apps/pilot/app/pages/index.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-App：OmniPanel 稳定版 MVP Gate（真实窗口 smoke + 失败路径回归）

**变更类型**: 发布门禁补强 / 回归覆盖扩展 / 稳定性收口

**描述**:
- 为 OmniPanel 增加发布级最小链路验证：`show -> execute builtin.corebox-search -> hide`（真实 Electron runtime）。
- 新增主进程 smoke probe（`TUFF_OMNIPANEL_SMOKE=1`），超时与异常返回非 0 退出码，避免 silent failure。
- 补齐 `main/modules/omni-panel` 失败路径与触发稳定性回归测试（plugin unavailable / plugin missing / no context / shortcut fallback / combo active / input-hook cleanup）。
- 新增独立 CI 工作流 `.github/workflows/omnipanel-gate.yml`，将 `typecheck + scoped lint + unit + build + smoke` 作为 2.4.8 Gate 主线。

**修改文件**:
- `apps/core-app/src/main/modules/omni-panel/index.test.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/package.json`
- `.github/workflows/omnipanel-gate.yml`
- `docs/plan-prd/01-project/CHANGES.md`

### Docs：主文档口径矩阵统一与压缩治理（2.4.8）

**变更类型**: 文档治理 / 口径修复 / 冗余压缩

**描述**:
- 建立并落地“单一口径矩阵”：统一 `TODO/README/Roadmap/Release 清单/Quality Baseline/INDEX` 六份主文档的状态、日期与下一动作。
- 修复关键冲突：
  - `v2.4.7 Gate C` 统一为 `Done`；
  - `Pilot Runtime` 统一为 `Node Server + Postgres/Redis` 主路径；
  - `TODO` 顶部与文末更新时间统一为 `2026-03-14`；
  - `INDEX` 改为“入口 + 高价值快照”并移除错误的“待完成/未发现”聚合条目。
- 生态文档修正：`06-ecosystem/README.md` 将过期 `tuffex-ui` 路径更新为 `packages/tuffex/`。
- 对 `next-edit` 给出降权规则：仅作为草稿池，不参与发布状态判定。

**修改文件**:
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/INDEX.md`
- `docs/plan-prd/06-ecosystem/README.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-App：SDK Hard-Cut E~F 持续迁移（Everything + Sync Storage + Plugin + Migration + Widget Registry）

**变更类型**: 架构收敛 / renderer 直连清理 / 事件契约统一

**描述**:
- `SettingEverything` 从 legacy channel 直调迁移到 typed transport 事件：
  - 移除 `tryUseChannel().send('everything:*')`；
  - 改为 `transport.send(everythingStatusEvent/everythingToggleEvent/everythingTestEvent)`。
- 新增共享事件契约 `src/shared/events/everything.ts`，主渲复用同一事件与类型，避免字符串事件散落。
- `everything-provider` 主进程注册逻辑切换为复用共享事件定义，保持行为不变（仅收敛调用方式）。
- `sync-item-mapper` 移除 `window.$channel.send('plugin:storage:*')` 直连，统一改为
  `PluginEvents.storage.listSyncItems/applySyncItem/deleteSyncItem` typed transport 调用。
- `PluginNew` 创建页移除 `tryUseChannel` 初始化路径，`EnvDetector` 改为直接复用 `useTuffTransport()`，减少 renderer 侧 legacy channel 入口扩散。
- `MigrationProgress` 下载迁移面板移除 `window.electron.ipcRenderer` 直连：
  - 请求链路改为 `transport.send(DownloadEvents.migration.checkNeeded/start/retry)`；
  - 进度/结果监听改为 transport listener（raw event），统一走 transport 协议入口。
- `ViewPlugin` 移除 `tryUseChannel().regChannel('plugin:message-transport')`：
  - 改为 `transport.on(raw event)` 监听插件消息；
  - 使用 Promise resolver 保留“webview 处理后再 reply”的异步回包语义，并补充 unmount cleanup。
- `plugin-sdk` 移除 `tryUseChannel` 前置判断：
  - 改为 transport listener 绑定失败即轮询重试；
  - 保留插件状态推送订阅语义与已有回调分发逻辑。
- `widget-registry` 移除 `tryUseChannel` 检查：
  - 改为 `bindTransportHandlers` 捕获失败并清理半注册状态；
  - 使用既有 polling 任务重试绑定，避免启动早期 transport 未就绪导致漏绑定。
- `useClipboard` 移除 `tryUseChannel + polling` 预检查：
  - 改为直接尝试 `useClipboardChannel` 初始化；
  - 初始化失败时回退为 reset `initAttempted` + 定时重试，保持启动期可恢复能力。
- 存储初始化链路（`main.ts` / `useAppLifecycle.ts` / `modules/channel/storage/base.ts`）移除 `tryUseChannel`：
  - 改为 `useChannel + safe resolve`，在 channel 未注入时保持无异常跳过；
  - 保留既有 `initStorageTransport + initStorageChannel + initStorageSubscription` 行为，不改变存储同步语义。
- `account-channel` 移除 legacy `touchChannel.regChannel('auth:get-fingerprint-hash')`：
  - 改为 `useTuffTransport().on(raw event)`；
  - 保持主进程 `requestRendererValue('auth:get-fingerprint-hash')` 事件名与返回语义不变。

**修改文件**:
- `apps/core-app/src/shared/events/everything.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingEverything.vue`
- `apps/core-app/src/renderer/src/modules/sync/sync-item-mapper.ts`
- `apps/core-app/src/renderer/src/views/base/plugin/PluginNew.vue`
- `apps/core-app/src/renderer/src/components/download/MigrationProgress.vue`
- `apps/core-app/src/renderer/src/views/base/plugin/ViewPlugin.vue`
- `apps/core-app/src/renderer/src/modules/sdk/plugin-sdk.ts`
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboard.ts`
- `apps/core-app/src/renderer/src/main.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useAppLifecycle.ts`
- `apps/core-app/src/renderer/src/modules/channel/storage/base.ts`
- `apps/core-app/src/renderer/src/modules/auth/account-channel.ts`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Release：v2.4.7 Gate D/E 预检自动化 + 口径收口（2026-03-14）

**变更类型**: 发布门禁治理 / 文档口径同步 / 可执行脚本新增

**描述**:
- 新增 `scripts/check-release-gates.mjs`，提供 Gate D/E 本地 + 远端只读预检能力（支持 `--base-url`）：
  - 校验 release notes `zh/en` 是否存在且非空；
  - 校验风险门禁（`P0` 不可为 `Open/In Progress`）；
  - 校验版本基线（`root/core-app` 与目标 tag 版本一致性）；
  - 校验本地 manifest（存在时调用 `update-validate-release-manifest.mjs`，缺失时给出 pending/fail）。
- 用预检脚本完成 `v2.4.7` Gate D 本地核对并回填文档：
  - `gate-d` 结果通过（notes + P0）；
  - `gate-e --strict` 演练失败（当前工作区 `2.4.8-beta.3` 与 `2.4.7` 基线不一致，且本地无 manifest 实体）。
- 完成 Nexus 公开接口远端只读核对（`/api/releases/v2.4.7*`）：
  - 已确认 `notes/notesHtml` 为 `{ zh, en }` 且 `latest?channel=RELEASE` 命中 `v2.4.7`；
  - 下载链路 `download/{platform}/{arch}` 返回 `302`；
  - 发现 Gate D 阻塞：`signature/{platform}/{arch}` 返回 `404`、assets `sha256/signatureUrl` 缺失、`tuff-release-manifest.json` 资产缺失。
- 同步 `TODO/README/INDEX/Roadmap/Quality Baseline/Release Checklist`，统一口径为：
  - `SDK Hard-Cut E~F` 已完成；
  - 主线顺序切换到 `Gate D -> Gate E`；
  - Gate E 前阻塞项（版本基线 + signature/sha256/manifest 实体）显式化。

**修改文件**:
- `scripts/check-release-gates.mjs`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-13

### CI：修复 Pilot PNPM 版本冲突 + core-app 构建对 deepagents 的错误引入

**变更类型**: CI 稳定性修复 / 构建边界收敛

**描述**:
- 修复 `Pilot CI` 在 `pnpm/action-setup@v4` 阶段失败的问题：
  - 根因：workflow 固定 `pnpm 10.30.3`，而仓库 `packageManager` 已升级为 `pnpm@10.32.1`，触发 `ERR_PNPM_BAD_PM_VERSION`。
  - 方案：移除 workflow 中的硬编码 `version`，统一跟随仓库 `packageManager`。
- 修复 `core-app` 渲染端构建因 `deepagents -> @langchain/langgraph@0.4.x` 引入 `node:async_hooks` 导致的 Rollup 失败：
  - 新增 `packages/tuff-intelligence/src/renderer.ts` 作为渲染端安全入口，仅导出 `client/types/sdk` 必需能力。
  - 在 `apps/core-app/electron.vite.config.ts` 的 renderer alias 中将 `@talex-touch/tuff-intelligence` 指向该入口，避免渲染 bundle 解析 server-only adapter 链路。

**验证**:
- `pnpm -C "apps/core-app" exec electron-vite build` ✅
- `gh run view 23049285164 --job 66946118791 --log`（确认历史失败根因）✅

**修改文件**:
- `.github/workflows/pilot-ci.yml`
- `apps/core-app/electron.vite.config.ts`
- `packages/tuff-intelligence/src/renderer.ts`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-12

### Pilot：环境变量收敛清单固化（Postgres + Redis + DB Config）

**变更类型**: 配置治理 / 部署简化 / 兼容收口

**描述**:
- 运行时环境变量进一步收敛到最小集合：
  - 必填：`PILOT_POSTGRES_URL`、`PILOT_REDIS_URL`、`PILOT_JWT_ACCESS_SECRET`、`PILOT_JWT_REFRESH_SECRET`、`PILOT_COOKIE_SECRET`、`PILOT_CONFIG_ENCRYPTION_KEY`、`PILOT_BOOTSTRAP_ADMIN_PASSWORD`。
  - 可选：`PILOT_BOOTSTRAP_ADMIN_EMAIL`、`PILOT_EXECUTOR_DEBUG`、`NUXT_PUBLIC_NEXUS_ORIGIN`、`PILOT_NEXUS_OAUTH_CLIENT_ID`、`PILOT_NEXUS_OAUTH_CLIENT_SECRET`。
- JWT TTL 固定为 Access 2h + Refresh 30d，不再从 env 读取过期时间，避免配置漂移。
- 前端 `endsBaseUrl` 固定本地同源（`/`），移除 `NUXT_PUBLIC_ENDS_URL` 入口，避免部署侧多余配置。
- 1Panel 部署脚本改为“自动探测优先”：
  - 不再依赖 `PILOT_PROJECT_DIR/PILOT_COMPOSE_FILE/PILOT_SERVICE_NAME` 等定位 env；
  - 部署侧仅保留 `PILOT_IMAGE_TAG` 与健康检查变量（`PILOT_HEALTHCHECK_*` + `PILOT_ROLLBACK_ON_FAILURE`）。
- 部署示例 env 同步精简；如需首次生成 compose，改为命令参数显式触发 `--bootstrap-compose`。

**修改文件（核心）**:
- `apps/pilot/.env.example`
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/server/utils/pilot-session.ts`
- `apps/pilot/deploy/deploy-pilot-1panel.sh`
- `apps/pilot/deploy/deploy-pilot-1panel.env.example`
- `apps/pilot/deploy/README.md`
- `apps/pilot/deploy/README.zh-CN.md`
- `scripts/deploy-pilot-1panel.env.example`

### Pilot：环境变量收敛 + Node Runtime 固化（Postgres/Redis + JWT 双 Token）

**变更类型**: 架构收敛 / 部署链路清理 / 认证升级

**描述**:
- `apps/pilot` 运行时收敛为 Node Server，移除 Cloudflare 运行分支与 wrangler 相关配置；Nuxt Nitro 固定 `node-server`。
- 数据与会话依赖收敛为强制 `Postgres + Redis`：
  - 移除 `sqlite/D1` 路径与旧别名变量（`PILOT_DB_DRIVER`、`PILOT_DB_FILE`、`PILOT_PG_DSN`、`DATABASE_URL`）。
  - 新增 Redis 会话存储工具，作为 refresh token 状态管理基础。
- 认证升级为 JWT Access/Refresh + HttpOnly Cookie：
  - access 默认 2h，refresh 默认 30d，`renew_token` 改为真实续签。
  - 登录/注册成功返回 token 结构并写 Cookie；登出执行 refresh 撤销与双 Cookie 清理。
- 管理员引导策略调整：
  - 默认账号 `admin@pilot.local / admin`（可由 env 覆盖）。
  - 启动日志不再输出管理员明文密码。
- 渠道与附件配置改为数据库真源：
  - `channels` 从 env 迁移到 admin DB 配置，并增加 `PILOT_CONFIG_ENCRYPTION_KEY` 对敏感字段加密。
  - 附件存储移除 R2/Cloudflare 分支，仅保留 `memory/s3(minio)`，并移除 `PILOT_S3_*` 别名。
- 部署资产收敛到 1Panel 脚本：
  - 删除 webhook 脚本与 GHCR 私有鉴权变量路径。
  - 部署 env 示例精简为镜像标签 + 健康检查 + 最小运行时变量。

**修改文件（核心）**:
- `apps/pilot/server/utils/pilot-session.ts`
- `apps/pilot/server/utils/pilot-channel.ts`
- `apps/pilot/server/utils/pilot-admin-channel-config.ts`
- `apps/pilot/server/utils/pilot-admin-storage-config.ts`
- `apps/pilot/server/utils/pilot-attachment-storage.ts`
- `apps/pilot/server/utils/pilot-store.ts`
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/package.json`
- `apps/pilot/deploy/*`
- `apps/pilot/.env.example`

### Pilot：legacy responses SSE 兼容修复（`Cannot use 'in' operator`）

**变更类型**: 稳定性修复 / 协议兼容增强

**描述**:
- 修复 Pilot 在 `adapter=legacy` + `transport=responses` 渠道下，偶发抛出
  `Cannot use 'in' operator to search for 'object' in event: response.created...` 导致流式会话失败的问题。
- `packages/tuff-intelligence` 中新增两层兜底：
  - 识别该异常签名后自动切换到 `responses.direct` 兼容路径（跳过不稳定的 SDK 解析分支）。
  - 当上游返回 `text/event-stream` 文本体时，支持解析 `response.output_text.delta/done/completed` 事件并提取最终文本。
- 保持现有对外接口不变，仅增强 legacy 网关兼容性与容错能力。

**验证**:
- `pnpm -C "packages/tuff-intelligence" exec eslint "src/adapters/deepagent-engine.ts"` ✅
- `pnpm -C "packages/tuff-intelligence" exec tsc --noEmit` ✅

**修改文件**:
- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### 全仓 Network 套件硬切（四阶段收口补齐）

**变更类型**: 架构收敛 / 质量门禁升级 / 跨工作区迁移

**描述**:
- 全仓 direct `fetch/axios` 清零（network 套件内部除外）：
  - 迁移 `apps/nexus`（Intelligence SSE 页面、Docs Assistant、`/api/docs/assistant` 服务端 provider 调用）。
  - 迁移 `apps/pilot`（`usePilotChatPage` JSON/SSE 请求统一改为 `networkClient`）。
  - 迁移 `packages/tuff-intelligence`（DeepAgent relay fallback 请求改为 `networkClient`，保留 timeout/retry/error 语义）。
  - 迁移 `packages/tuffex`（`TxIcon` 移除内部裸 `fetch`，统一依赖注入 `svgFetcher`；未注入时降级为 `<img>` 渲染）。
- root 级网络边界门禁收紧：
  - `scripts/check-network-boundaries.mjs` 移除临时 allowlist，仅保留 `packages/utils/network/request.ts`。
  - `pnpm run network:guard` 现覆盖 `apps/* + packages/* + plugins/*` 且 0 违规。
- ESLint 硬禁补齐（最小必要范围）：
  - `apps/nexus`、`apps/pilot`、`packages/tuff-intelligence`、`packages/tuffex`、`packages/unplugin-export-plugin`、`plugins/touch-{translation,image,music}` 新增 `no-restricted-imports(axios)` + `no-restricted-syntax(fetch)`。
- 修复迁移引入的类型回归：
  - `packages/utils/common/utils/time.ts` 的 retrier 返回值泛型推导修正（`withTimeout<T>`）。
  - `apps/pilot/app/composables/usePilotChatPage.ts` 与 `packages/tuff-intelligence/src/adapters/deepagent-engine.ts` 补齐 `NetworkMethod` 映射。

**验证**:
- `pnpm run network:guard` ✅
- `pnpm -C "apps/core-app" run typecheck:node` ✅
- `pnpm -C "apps/nexus" run typecheck` ✅
- `pnpm -C "apps/nexus" exec eslint app/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue app/components/docs/DocsAssistantDialog.vue app/pages/dashboard/admin/intelligence-chat.vue server/api/docs/assistant.post.ts` ✅
- `pnpm -C "apps/pilot" exec eslint app/composables/usePilotChatPage.ts` ✅
- `pnpm -C "packages/tuff-intelligence" exec eslint src/adapters/deepagent-engine.ts` ✅
- `pnpm -C "packages/tuff-intelligence" exec tsc --noEmit` ✅
- `pnpm -C "packages/tuffex" exec eslint packages/components/src/icon/src/TxIcon.vue` ✅
- `pnpm -C "apps/pilot" run typecheck` ⚠️（存在大量历史存量错误，当前改动相关错误已清理）

**修改文件（本批次）**:
- `apps/nexus/app/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue`
- `apps/nexus/app/components/docs/DocsAssistantDialog.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence-chat.vue`
- `apps/nexus/server/api/docs/assistant.post.ts`
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
- `packages/tuff-intelligence/src/types/path-browserify.d.ts`
- `packages/tuff-intelligence/package.json`
- `packages/tuffex/packages/components/src/icon/src/TxIcon.vue`
- `packages/utils/common/utils/time.ts`
- `scripts/check-network-boundaries.mjs`
- `apps/nexus/eslint.config.js`
- `apps/pilot/eslint.config.js`
- `packages/tuff-intelligence/eslint.config.js`
- `packages/tuffex/eslint.config.js`
- `packages/unplugin-export-plugin/eslint.config.js`
- `plugins/touch-translation/eslint.config.js`
- `plugins/touch-image/eslint.config.js`
- `plugins/touch-music/eslint.config.js`

### core-app：Network 套件统一改造（Main 网关 + Proxy + tfile + SDK）

**变更类型**: 架构收敛 / 稳定性修复 / 可扩展能力补齐

**描述**:
- 在 `packages/utils` 新增 `network` 套件（`request/file/guard`），统一抽象请求参数、代理配置、重试与冷却策略。
- 新增 Transport `NetworkEvents` + Domain `NetworkSDK` + renderer `useNetworkSdk`，Renderer 网络访问统一可经 Main 网关执行。
- Main 新增 `NetworkModule` 与 `NetworkService`：
  - 统一承接 HTTP 请求、文件读取（`file://` / `tfile://` / 绝对路径）与 `toTfileUrl` 转换。
  - 代理策略支持 `direct/system/custom`，首版覆盖 `HTTP/HTTPS + SOCKS + PAC + bypass`。
  - 配置接入 `app-setting.network`（`proxy/retry/cooldown/timeout`）。
- 首批迁移完成（移除分散 `proxy:false`）：
  - `plugin-loaders` / `plugin.ts`（dev prelude）
  - `dev-server-monitor`
  - `widget-loader`
  - `store-http.service`
  - `download-worker`
  - `plugin providers`（`npm-provider`、`providers/utils`）
  - `official-plugin.service`
- 渲染侧图标链路收口：
  - `useSvgContent` 统一接入 `NetworkSDK` 文件读取与本地 URL 冷却策略。
  - `TuffIcon.vue` 改为复用 network `toTfileUrl`。
- 修复你确认的 1/2：
  - `TuffIconImpl` 仅在 `dev.enable && dev.source && dev.address` 时才走 dev 远程 URL。
  - localhost SVG 失败冷却从局部实现抽离为 network policy 复用。
- 新增收口门禁：`apps/core-app/scripts/check-network-boundaries.js`（`pnpm -C \"apps/core-app\" run network:guard`）用于禁止新增散落 `fetch/axios` 入口。

**验证**:
- `pnpm -C "packages/utils" run lint` ✅
- `pnpm -C "packages/utils" exec vitest run "__tests__/network-guard.test.ts"` ✅
- `pnpm -C "apps/core-app" exec vitest run "src/main/core/tuff-icon.test.ts"` ✅
- `pnpm -C "apps/core-app" run network:guard` ✅
- `pnpm -C "apps/core-app" run typecheck:node` ⚠️（存在既有 Sentry 类型冲突，`src/main/modules/sentry/sentry-service.ts:574`，与本次改动无关）
- `pnpm -C "apps/core-app" run typecheck:web` ⚠️（存在既有 Milkdown 版本类型冲突，`src/renderer/src/components/base/input/FlatMarkdown.vue:68`，与本次改动无关）

**修改文件**:
- `packages/utils/network/*`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/events/types/{index.ts,network.ts}`
- `packages/utils/transport/sdk/domains/{index.ts,network.ts}`
- `packages/utils/renderer/hooks/{index.ts,use-network-sdk.ts}`
- `packages/utils/common/storage/entity/app-settings.ts`
- `packages/utils/index.ts`
- `apps/core-app/src/main/modules/network/*`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/core/tuff-icon.ts`
- `apps/core-app/src/main/modules/plugin/{plugin.ts,plugin-loaders.ts,dev-server-monitor.ts}`
- `apps/core-app/src/main/modules/plugin/widget/widget-loader.ts`
- `apps/core-app/src/main/modules/plugin/providers/{npm-provider.ts,utils.ts}`
- `apps/core-app/src/main/modules/download/download-worker.ts`
- `apps/core-app/src/main/service/{store-http.service.ts,official-plugin.service.ts}`
- `apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts`
- `apps/core-app/src/renderer/src/components/base/TuffIcon.vue`
- `apps/core-app/src/renderer/src/base/axios.ts`
- `apps/core-app/scripts/check-network-boundaries.js`
- `apps/core-app/package.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot 登录简化：本地邮箱优先 + Nexus 并存（M1.4）

**变更类型**: 认证链路收敛 / 体验修复 / 数据一致性增强

**描述**:
- 新增本地邮箱认证能力（`/api/auth/email/register`、`/api/auth/email/login`、`/api/auth/logout`），统一写入 `pilot_auth_session` Cookie，不引入邮箱验证码流程。
- `GET /api/auth/status` 升级为登录来源可识别（`guest/local/nexus`），并在本地账号场景返回基础 profile（`nickname/email`）。
- 前端登录弹窗重新挂载到全局根（`app.vue`），保留双入口：邮箱登录/注册为主链路，Nexus OAuth 入口继续可用。
- 原短信/微信二维码登录入口改为“即将上线（Nexus）”占位，避免调用当前未迁移接口导致误报。
- 新增访客数据并入：登录成功后基于 device guest id 自动迁移会话/历史/运行时记录到登录账号，并输出后端合并审计日志。

**验证**:
- `pnpm -C "apps/pilot" run test` ✅
- `pnpm -C "apps/pilot" run build` ✅
- `pnpm -C "apps/pilot" run typecheck` ⚠️（存在大量存量 TS 错误，集中在 Quota 旧页面与 CMS 模块，与本次登录改造无直接耦合）
- `pnpm -C "apps/pilot" run lint` ⚠️（存在存量 lint debt，已在 `TODO.md` 的 M0 收口条目持续跟踪）

**修改文件**:
- `apps/pilot/server/utils/pilot-local-auth.ts`
- `apps/pilot/server/utils/pilot-guest-merge.ts`
- `apps/pilot/server/api/auth/email/register.post.ts`
- `apps/pilot/server/api/auth/email/login.post.ts`
- `apps/pilot/server/api/auth/logout.post.ts`
- `apps/pilot/server/api/auth/status.get.ts`
- `apps/pilot/server/api/account/profile.get.ts`
- `apps/pilot/server/routes/auth/callback.get.ts`
- `apps/pilot/app/components/chore/Login.vue`
- `apps/pilot/app/app.vue`
- `apps/pilot/app/composables/user.ts`
- `apps/pilot/app/composables/api/base/v1/auth.ts`
- `apps/pilot/app/composables/api/auth.ts`
- `apps/pilot/server/utils/__tests__/pilot-local-auth.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot M1.3：渠道 Adapter 化（禁用自动协议降级，legacy 固定 responses）

**变更类型**: 架构收敛 / 兼容策略调整

**描述**:
- 根据渠道差异，后端从“自动降级”切换为“按渠道 Adapter 显式路由”：
  - 新增 `adapter` 语义（`legacy | openai`），在 `PILOT_CHANNELS_JSON` 可按渠道配置。
  - `legacy` 渠道强制走 `responses`，不会再尝试 `chat.completions`。
  - `openai` 渠道按 `transport` 显式选择（`responses | chat.completions`），不再隐式 fallback。
- 默认渠道策略可配置：
  - 新增 `PILOT_CHANNEL_DEFAULT_ADAPTER`（默认 `legacy`）。
  - 保留 `PILOT_CHANNEL_DEFAULT_TRANSPORT`，但在 `legacy` 下会被收敛为 `responses`。
- `POST /api/aigc/executor` 事件补充：
  - `session_bound` 新增 `adapter`，明确当前会话实际使用的渠道适配器。
- 诊断增强：
  - 当渠道报 `Unsupported legacy protocol: /v1/chat/completions is not supported` 时，返回可读提示，指导将该渠道改为 `responses`/`legacy` 配置。
  - `executor` 错误事件新增 `detail` 结构（`status_code/status_message/endpoint/model/phase/cause`），并在后端输出 `[pilot-executor-error]` 结构化日志，便于排查 `Connection error` 与网关链路问题。
- 管理接口增强：
  - `GET /api/pilot/admin/channels` 返回 `adapter` 字段，便于后台排查渠道配置。

**验证**:
- `pnpm -C "apps/pilot" run test` ✅
- `pnpm -C "apps/pilot" run build` ✅（本次改动文件通过构建）

**修改文件**:
- `apps/pilot/server/utils/pilot-channel.ts`
- `apps/pilot/server/utils/pilot-runtime.ts`
- `apps/pilot/server/api/aigc/executor.post.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/server/api/pilot/admin/channels.get.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot M1.2：Executor 超时治理（渠道超时配置化 + 自动降级 + 可诊断错误）

**变更类型**: 稳定性修复 / 兼容性增强

**描述**:
- 修复 `POST /api/aigc/executor` 在 `responses` 通道下频繁返回 `Request timed out.` 的问题根因：
  - 渠道超时阈值从固定 `25_000ms` 升级为可配置，并统一默认到 `90_000ms`（下限 `3000ms`，上限 `10min`）。
  - 支持全局变量 `PILOT_CHANNEL_TIMEOUT_MS`，并允许 `PILOT_CHANNELS_JSON` 渠道项单独指定 `timeoutMs`（未指定时继承全局默认）。
- 自动协议降级增强：
  - `transport=auto` 且 `responses` 超时时，允许自动降级到 `chat.completions`（原先仅覆盖 404/405/501）。
  - 新增对 `504/524` 与超时关键字（`timed out/timeout/AbortError`）的降级判定。
  - 注：该策略已在同日 `Pilot M1.3` 切换为 Adapter 显式路由（默认不再自动降级）。
- SSE 诊断信息增强：
  - `session_bound` 事件新增 `timeout_ms` 字段，便于定位当前渠道阈值。
  - 错误消息对超时场景改为可读提示：包含超时阈值与渠道信息，不再只有笼统 `Request timed out.`。
- 管理接口增强：
  - `GET /api/pilot/admin/channels` 增加 `timeoutMs` 脱敏可见字段。

**验证**:
- `pnpm -C "apps/pilot" run test` ✅
- `pnpm -C "apps/pilot" run build` ✅（本次改动文件通过类型与构建校验）

**修改文件**:
- `apps/pilot/server/utils/pilot-channel.ts`
- `apps/pilot/server/utils/pilot-runtime.ts`
- `apps/pilot/server/api/aigc/executor.post.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/server/api/pilot/admin/channels.get.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot M0：GHCR 镜像发布链路落地（master + packages 触发）

**变更类型**: 工程化增强 / 发布链路补齐

**描述**:
- 新增 `apps/pilot/Dockerfile`，将 Pilot 构建链路固定为 `NITRO_PRESET=node-server`，产出可直接运行的容器镜像。
- Docker 构建阶段使用 `pnpm deploy` 生成运行时依赖并拷贝 `.output`，同时清理 `.nuxt`/`dist`/源码目录，降低镜像冗余体积。
- 新增仓库级 `.dockerignore`，避免把 `node_modules`、`.git`、构建产物等无关内容打入构建上下文。
- 新增 `.github/workflows/pilot-image.yml`：
  - 触发条件：`master` push 且命中 `apps/pilot/**`、`packages/**`、锁文件或工作流自身改动。
  - 发布目标：`ghcr.io/<owner>/tuff-pilot`。
  - 标签策略：`pilot-<short_sha>`（不可变）+ `pilot-latest`（环境跟随）。
  - 输出镜像 digest，便于后续 1Panel 部署审计与回滚定位。
  - 若配置 `ONEPANEL_WEBHOOK_URL`，发布后自动触发 webhook，并发送 `repository/branch/sha/image/tag/image_ref/digest`。
- `pilot-ci.yml` 下线 `deploy-1panel` 任务，避免与镜像发布链路重复触发；1Panel 触发统一收口到 `pilot-image.yml`。
- 工作流文档同步更新 `.github/workflows/README.md`。

**验证**:
- `pnpm -C "apps/pilot" run build` ✅（在本地以 `NITRO_PRESET=node-server` 验证构建可通过）

**修改文件**:
- `.dockerignore`
- `apps/pilot/Dockerfile`
- `.github/workflows/pilot-image.yml`
- `.github/workflows/pilot-ci.yml`
- `.github/workflows/README.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot M0：1Panel 部署脚本（GHCR 拉取 + 健康检查回滚）

**变更类型**: 工程化增强 / 部署可靠性提升

**描述**:
- 新增 `apps/pilot/deploy/deploy-pilot-1panel.sh`，用于在 1Panel 服务器执行 Pilot 容器更新。
- 脚本支持从 GHCR 拉取指定镜像（`--image + --tag` 或 `--image-ref`），并通过 compose 仅更新指定服务。
- 增加可选健康检查（`--health-url`），失败时默认自动回滚到上一个运行镜像。
- 同时兼容 `docker compose` 与 `docker-compose`，并支持可选 GHCR 登录参数（私有镜像场景）。
- 新增 `apps/pilot/deploy/deploy-pilot-1panel-webhook.sh`，支持 webhook payload 解析（`image/tag/sha`）与 `sha -> pilot-<short_sha>` 自动映射，并转发到主部署脚本。
- 新增部署模板与双语教程：
  - `apps/pilot/deploy/deploy-pilot-1panel.env.example`
  - `apps/pilot/deploy/deploy-pilot-1panel-webhook.env.example`
  - `apps/pilot/deploy/README.zh-CN.md`
  - `apps/pilot/deploy/README.md`
- 根目录 `scripts/deploy-pilot-1panel.sh` 与 `scripts/deploy-pilot-1panel-webhook.sh` 保留为兼容入口，转发到 `apps/pilot/deploy/`。

**验证**:
- `bash -n "apps/pilot/deploy/deploy-pilot-1panel.sh"` ✅
- `apps/pilot/deploy/deploy-pilot-1panel.sh --help` ✅
- `bash -n "apps/pilot/deploy/deploy-pilot-1panel-webhook.sh"` ✅
- `apps/pilot/deploy/deploy-pilot-1panel-webhook.sh --dry-run --payload-json '{"repository":"talex-touch/tuff","sha":"abcdef123456","branch":"master"}'` ✅

**修改文件**:
- `apps/pilot/deploy/deploy-pilot-1panel.sh`
- `apps/pilot/deploy/deploy-pilot-1panel.env.example`
- `apps/pilot/deploy/deploy-pilot-1panel-webhook.sh`
- `apps/pilot/deploy/deploy-pilot-1panel-webhook.env.example`
- `apps/pilot/deploy/README.zh-CN.md`
- `apps/pilot/deploy/README.md`
- `scripts/deploy-pilot-1panel.sh`
- `scripts/deploy-pilot-1panel.env.example`
- `scripts/deploy-pilot-1panel-webhook.sh`
- `scripts/deploy-pilot-1panel-webhook.env.example`
- `docs/plan-prd/01-project/CHANGES.md`

### core-app：本地 SVG 源连接失败降噪（localhost 重试节流）

**变更类型**: 稳定性修复 / 开发体验优化

**描述**:
- 修复渲染层图标加载在 `localhost` SVG 资源不可达时的错误刷屏问题（典型报错：`ERR_CONNECTION_REFUSED`）。
- `useSvgContent` 对本地 HTTP 源（`localhost` / `127.0.0.1`）增加“失败后短暂冷却”策略（3s），避免同一地址在短时间内被高频重复请求。
- 调整重试策略：本地 HTTP 源失败后不再走 retrier 多次重试，减少无效网络请求与控制台噪音。
- 调整日志策略：对本地 HTTP 源失败不再输出 `fetchSvgContent failed after retries` 错误日志（仍保留组件错误态），远程源行为不变。

**验证**:
- `pnpm -C "apps/core-app" exec eslint "src/renderer/src/modules/hooks/useSvgContent.ts"` ✅
- `pnpm -C "apps/core-app" run typecheck:web` ⚠️（存在既有 `Milkdown` 版本类型冲突，报错位于 `src/renderer/src/components/base/input/FlatMarkdown.vue:68`，与本次改动无关）

**修改文件**:
- `apps/core-app/src/renderer/src/modules/hooks/useSvgContent.ts`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-11

### Pilot M1：多渠道 + Completions 兼容 + 后端会话主导（第一批 API 拆分）

**变更类型**: 融合增强 / 兼容迁移 / 稳定性修复

**描述**:
- 新增渠道解析与协议兼容层（`apps/pilot/server/utils/pilot-channel.ts`）：
  - 支持 `PILOT_CHANNELS_JSON` 与 `PILOT_DEFAULT_CHANNEL_ID`（含 runtime/env 回退）。
  - 选择优先级固定为：`request channel_id > 会话绑定 channel_id > default channel`。
  - `transport=auto` 下先走 `responses`，命中不支持特征后自动回退 `chat.completions`，并做短期能力缓存。
- 聊天执行器 `POST /api/aigc/executor` 完成 M1 升级（`apps/pilot/server/api/aigc/executor.post.ts`）：
  - `chat_id` 改为可选（后端可创建），新增可选 `channel_id`。
  - SSE 新增 `session_bound` 事件，返回最终 `chat_id/runtime_session_id/channel_id/transport`。
  - 兼容旧工具事件映射：`capability.call -> status_updated(calling)`、`capability.result -> status_updated(result)`；保留 `completion/error/[DONE]`。
  - 流式结束后由后端自动快照历史，不再依赖前端单独补写 `conversations`。
- 新增后端会话映射真源（`apps/pilot/server/utils/pilot-quota-session.ts`）：
  - 表 `pilot_quota_sessions(chat_id/user_id/runtime_session_id/channel_id/topic/created_at/updated_at)`。
  - 删除会话时统一清理：`quota history + session mapping + runtime session`，避免脏数据。
- 兼容接口语义收口：
  - `POST /api/aigc/conversations` 调整为“兼容补写/覆盖元数据”，不再作为主同步通道。
  - `GET /api/pilot/admin/channels` 新增 env 渠道脱敏查看；`POST /api/pilot/admin/channels` 在 M1 返回 501（保持 env 只读策略）。
- 完成 M1 第一批剩余 API 迁移（主链路/用户态）：
  - `aigc` 扩展：`prompts/detail`、`prompts/user`、`conversation/share*`。
  - `auth`：`renew_token`。
  - `user-config`、`dummy`、`invitation/records`、`order/*`、`tools/upload*`。
- 延续 M0 既定口径：
  - 路由继续保持 `/ -> Quota`、`/pilot/* -> 原 Pilot`。
  - 认证主链路继续使用 Pilot Cookie 会话/访客模式（Bearer Token 非主路径）。
  - 兼容 API 继续输出 `{ code, message, data }`。
- 前端错误态兼容增强（`apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts` + `ErrorCard.vue`）：
  - 支持同时解析 `event:error` 与 `data.event=error` 两类 SSE 错误帧，优先展示后端 `message`。
  - 传输层异常统一提取可读错误文本，避免退化为不可读对象。
  - 修复错误卡片 CTA 误判：未知错误/渠道熔断不再默认显示“立即升级”，`503 熔断/无可用渠道` 改为“稍后重试或切换渠道”提示。

**验证**:
- `pnpm -C "apps/pilot" run test` ✅
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm -C "apps/pilot" run build` ✅
- `pnpm -C "apps/pilot" run typecheck` ⚠️（Quota 迁移存量类型错误仍在，未新增阻塞）
- `pnpm -C "apps/pilot" run lint` ⚠️（Quota 迁移存量 lint 债务仍在，规则量级较大）

### Pilot M1.1：构建与部署瘦身（sourcemap 关闭 + 静态发布剔除 worker）

**变更类型**: 性能优化 / 部署可靠性增强

**描述**:
- `apps/pilot/nuxt.config.ts` 生产构建默认关闭 client/server sourcemap（避免发布产物被 `.map` 主导）。
- `apps/pilot/uno.config.ts` 调整 WebFonts 策略：仅当 `NUXT_WEB_FONTS=true` 时启用，默认不走远程字体抓取，降低构建网络依赖。
- `apps/pilot/package.json` 的 `prepare:cf-static` 新增 `rm -rf dist/_worker.js`，静态发布时显式剔除 worker 产物，规避 Cloudflare Worker 体积门槛影响。

**验证**:
- `pnpm -C "apps/pilot" run generate` ✅
- `pnpm -C "apps/pilot" run prepare:cf-static` ✅
- `node apps/pilot/scripts/report-dist-size.mjs` ✅（`dist/_nuxt` 从约 `51.36MB` 降至 `12.66MB`）

**修改文件**:
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/uno.config.ts`
- `apps/pilot/package.json`
- `docs/plan-prd/01-project/CHANGES.md`

**修改文件**:
- `apps/pilot/server/utils/pilot-channel.ts`
- `apps/pilot/server/utils/pilot-runtime.ts`
- `apps/pilot/server/utils/pilot-quota-session.ts`
- `apps/pilot/server/utils/quota-conversation-snapshot.ts`
- `apps/pilot/server/utils/quota-share-store.ts`
- `apps/pilot/server/utils/quota-user-store.ts`
- `apps/pilot/server/utils/quota-upload-store.ts`
- `apps/pilot/server/api/aigc/executor.post.ts`
- `apps/pilot/server/api/aigc/conversations.post.ts`
- `apps/pilot/server/api/aigc/conversations/[id].delete.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/server/api/pilot/admin/channels.get.ts`
- `apps/pilot/server/api/pilot/admin/channels.post.ts`
- `apps/pilot/server/api/aigc/prompts/user.get.ts`
- `apps/pilot/server/api/aigc/prompts/detail/[id]/index.get.ts`
- `apps/pilot/server/api/aigc/conversation/share/[id]/index.get.ts`
- `apps/pilot/server/api/aigc/conversation/share/[id]/index.post.ts`
- `apps/pilot/server/api/aigc/conversation/share_chat/[id]/index.get.ts`
- `apps/pilot/server/api/aigc/conversation/share_list.get.ts`
- `apps/pilot/server/api/auth/renew_token.get.ts`
- `apps/pilot/server/api/user-config.get.ts`
- `apps/pilot/server/api/user-config.post.ts`
- `apps/pilot/server/api/user-config/user/[uid]/index.get.ts`
- `apps/pilot/server/api/dummy/*`
- `apps/pilot/server/api/invitation/records.get.ts`
- `apps/pilot/server/api/order/*`
- `apps/pilot/server/api/tools/upload.post.ts`
- `apps/pilot/server/api/tools/upload/content/[id]/index.get.ts`
- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-10

### Pilot M0: 聊天未渲染修复（SSE 分片解析 + Milkdown 时序 + 运行时缺包）

**变更类型**: 稳定性修复 / 依赖治理

**描述**:
- 修复 Quota 聊天流式结果在前端解析时出现半包/残片导致不渲染的问题：
  - `app/composables/api/base/v1/aigc/completion/index.ts` 的 `handleExecutorResult` 改为标准 SSE 帧缓冲解析（按 `\n\n` 分帧，支持跨 chunk 聚合），不再按 `split('\n')` 粗暴处理。
  - 保留 `event:error` 处理并统一 data 聚合，兼容 `[DONE]` 结束帧。
- 修复 `MilkdownError: Timer "SchemaReady" not found`：
  - `MilkContent.vue` 增加 `SchemaReady` 等待与重试兜底，避免初始化时序下 `replaceAll` 触发 token 未就绪。
  - 增加组件卸载时 `editor.destroy()` 清理，避免重复挂载导致状态污染。
  - `MilkContent.vue` 的 `refractor` 语言导入路径从 `refractor/lang/*` 更正为 `refractor/*`，修复 `Expected function for syntax` 报错。
- 修复 dev 运行时缺包导致首页 500：
  - `apps/pilot/package.json` 显式补齐 `@langchain/core`、`@langchain/langgraph`、`@langchain/openai`、`deepagents`。
- 统一 `apps/pilot` 中 `@milkdown/*` 主干依赖版本并显式声明 `@milkdown/utils`，降低 token 版本漂移风险。
- `server/api/aigc/executor` 增加 final-only 流式兜底：当上游只返回 `assistant.final` 时，按字符块拆分成多条 `completion(completed:false)` 后再补 `completed:true`，保证前端可见流式输出。
- 修复 dev 环境 CSS 资源 404：
  - `nuxt.config.ts` 的全局 `css` 改为显式文件路径（`tuffex` 样式入口与 UnoCSS reset 实体文件），避免 `/_nuxt/@talex-touch/tuffex/style.css` 与 `/_nuxt/@unocss/reset/tailwind.css` 404。
- `executor` 对上游 `530 status code` 增加可读错误提示，明确指向 `NUXT_PILOT_BASE_URL` / `NUXT_PILOT_API_KEY` 配置排查。

**验证**:
- `pnpm -C "apps/pilot" exec eslint app/components/article/MilkContent.vue app/composables/api/base/v1/aigc/completion/index.ts` ✅
- `curl http://127.0.0.1:<dev-port>/api/auth/status` ✅
- `curl -N POST /api/aigc/executor` SSE 实测输出 `status_updated -> completion -> [DONE]` ✅
- `pnpm -C "apps/pilot" run typecheck` ⚠️（仍有 Quota 迁移存量类型错误，与本次修复无关）

**修改文件**:
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
- `apps/pilot/app/components/article/MilkContent.vue`
- `apps/pilot/package.json`
- `pnpm-lock.yaml`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot M0: 前端冷启动加速 + CI/1Panel 部署链路补齐

**变更类型**: 性能优化 / 工程化增强

**描述**:
- 启动链路优化（`apps/pilot`）：
  - `dev` 默认切换为 Cloudflare runtime 绑定模式（`NUXT_USE_CLOUDFLARE_DEV=true` + `preview` 环境），本地可直接联调 D1/R2。
  - 增加 `dev:local` 作为无 runtime 绑定的纯本地模式。
  - `build` 固化 `NODE_OPTIONS=--max-old-space-size=8192`，避免构建阶段 OOM。
  - `nuxt.config.ts` 中 `buildTime` 在 dev 固定为常量，避免每次启动触发 Vite 配置漂移。
  - `@talex-touch/tuffex` 源码 alias 改为开关模式（默认关闭，必要时通过 `NUXT_USE_WORKSPACE_SOURCE=true` 启用）。
  - 代码块渲染器改为异步组件加载（`EditorCodeBlock` 下 `mindmap/echarts/mermaid/abc/code` 全部按需 `import()`）。
- UnoCSS 编译负担优化（根因修复）：
  - `uno.config.ts` 将全量 icon safelist 改为“默认关闭，按需开启”（`NUXT_FULL_ICON_SAFELIST=true` 时启用）。
  - dev 环境不再启用 `presetWebFonts` 远程字体抓取，减少首轮编译阻塞。
- 体积分析能力补齐：
  - 新增 `pnpm -C "apps/pilot" run analyze:size` 与 `scripts/report-dist-size.mjs`，输出 `dist/_nuxt` 总体积、扩展名占比、Top 20 大文件。
  - 实测重块集中在 `@antv/x6`、`abcjs`、`echarts`、`element-plus`、`Milkdown` 相关 chunk。
- CI/部署链路补齐：
  - 新增 `.github/workflows/pilot-ci.yml`：
    - `quality`: `lint/typecheck/test/build`
    - `static-dist`: `generate + prepare:cf-static + artifact`
    - `deploy-1panel`: `master` push 成功后触发 `ONEPANEL_WEBHOOK_URL`
  - 结合 M0 存量类型债，`quality` 中 `lint/typecheck` 先按“非阻塞告警”执行，`test/build` 仍作为部署阻塞门禁。
  - 工作流文档同步更新 `.github/workflows/README.md`。

**验证**:
- `pnpm -C "apps/pilot" run test` ✅
- `pnpm -C "apps/pilot" run build` ✅（8GB 堆内存下通过）
- 本地冷启动基线对比（`/` 首次可访问）：
  - 优化前约 `132s ~ 218s`
  - 优化后约 `9s ~ 10s`

**修改文件**:
- `apps/pilot/package.json`
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/uno.config.ts`
- `apps/pilot/app/components/article/components/EditorCodeBlock.vue`
- `apps/pilot/scripts/report-dist-size.mjs`
- `.github/workflows/pilot-ci.yml`
- `.github/workflows/README.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`

### Pilot M0: Cloudflare 部署改为静态发布（规避 Worker 3MiB 限制）

**变更类型**: 部署策略调整 / 线上可用性修复

**描述**:
- Cloudflare Pages 免费额度下，`nuxt build` 产物中的 `_worker.js` 模块体积约 `13MB`，发布时报错 `Worker exceeded 3 MiB`。
- 为保证 M0 可上线，`apps/pilot` 的 Cloudflare 脚本切换为静态发布链路：
  - `preview:cf` 改为 `nuxt generate + prepare:cf-static + wrangler pages dev dist`
  - `deploy:cf` 改为 `nuxt generate + prepare:cf-static + wrangler pages deploy dist`
- 静态发布补齐路由兜底：
  - 发布前移除 `dist/_routes.json`（避免 Pages 把全路由误导向不存在的 Functions）。
  - 自动生成 `dist/index.html`、`dist/pilot/index.html`、`dist/pilot/admin/storage/index.html`（由 `200.html` 复制），并写入 `/* /index.html 200` 到 `_redirects`，避免 ` /`、`/pilot`、`/pilot/admin/storage` 线上白屏/404。
- 新增运行时 API 基地址注入：
  - `runtimeConfig.public.endsBaseUrl`（优先 `NUXT_PUBLIC_ENDS_URL`，回退 `NUXT_PILOT_BASE_URL`）
  - `app.vue` 启动时优先把 `endsBaseUrl` 写入 `globalOptions`，确保前端 API 请求可按环境变量指向当前 AIAPI。
- `wrangler.toml` 增补 `NUXT_PUBLIC_ENDS_URL`（preview/production 同步），与现有 env 保持一致。

**测试**:
- `pnpm -C "apps/pilot" run generate` ✅
- `npx wrangler pages deploy .output/public --project-name tuff-pilot --branch main` ✅

**修改文件**:
- `apps/pilot/package.json`
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/app/app.vue`
- `apps/pilot/wrangler.toml`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-09

### Pilot M0: 聊天渲染链路修复（Milkdown `SchemaReady` 冲突）

**变更类型**: 稳定性修复 / 运行时兼容

**描述**:
- 修复 Quota 聊天页面在流式回复场景下出现的 `MilkdownError: Timer "SchemaReady" not found` 报错与消息未渲染问题。
- `ThContent.vue` 的渲染实现切换为 `MilkContent.vue`（只读渲染），规避 `@milkdown/vue + useEditor` 在当前依赖组合下的上下文注入时序问题。
- 保留 `disableRich=true`，避免渲染期附加增强逻辑影响聊天主链路稳定性。
- 顺带修复聊天页告警：`ChatLinkShare.vue` 将误写标签 `<di>` 更正为 `<div>`，消除 `Failed to resolve component: di`。

**测试**:
- `pnpm -C "apps/pilot" exec nuxi prepare` ✅
- `pnpm -C "apps/pilot" run dev` ✅（本地构建通过，可进入聊天页面）

**修改文件**:
- `apps/pilot/app/components/article/MilkdownRender.vue`
- `apps/pilot/app/components/article/ThContent.vue`
- `apps/pilot/app/components/chat/head/ChatLinkShare.vue`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/TODO.md`
- `docs/INDEX.md`

### Pilot: Cloudflare Dashboard Secrets 基线配置落地

**变更类型**: 运维配置 / 文档同步

**描述**:
- 已在 Cloudflare Pages 项目 `tuff-pilot` 的 `preview` 与 `production` 环境完成首批 secrets 写入，确保附件链路具备统一默认基线：
  - `PILOT_ATTACHMENT_PROVIDER=auto`
  - `PILOT_ATTACHMENT_PUBLIC_BASE_URL`
  - `PILOT_ATTACHMENT_SIGNING_SECRET`
  - `PILOT_MINIO_REGION=us-east-1`
  - `PILOT_MINIO_FORCE_PATH_STYLE=true`
- 待人工补齐环境相关敏感项（按环境值）：
  - OAuth：`PILOT_NEXUS_OAUTH_CLIENT_ID`、`PILOT_NEXUS_OAUTH_CLIENT_SECRET`、`PILOT_NEXUS_INTERNAL_ORIGIN`（按需）
  - MinIO（启用时）：`PILOT_MINIO_ENDPOINT`、`PILOT_MINIO_BUCKET`、`PILOT_MINIO_ACCESS_KEY`、`PILOT_MINIO_SECRET_KEY`、`PILOT_MINIO_PUBLIC_BASE_URL`（可选）
- 本次仅完成 Dashboard 配置，不含部署动作。

**测试**:
- `npx wrangler pages secret list --project-name tuff-pilot --env preview` ✅
- `npx wrangler pages secret list --project-name tuff-pilot --env production` ✅

**修改文件**:
- `docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/INDEX.md`

### Pilot: 开发端口固定 3300 并移除 dev.mjs 启动入口

**变更类型**: 开发体验清理 / 启动链路收敛

**描述**:
- `apps/pilot` 的 `dev` 脚本改为直接执行 `nuxt dev`，不再通过 `scripts/dev.mjs` 包装启动。
- 开发端口固定从 `3300` 启动（`--port 3300`），并显式绑定 `127.0.0.1`。
- 保持 Cloudflare dev 默认开启（`NUXT_USE_CLOUDFLARE_DEV=true`，`CLOUDFLARE_DEV_ENVIRONMENT=preview`），减少本地联调入口分叉。

**测试**:
- `pnpm pilot:dev` ✅（本地启动成功：`http://127.0.0.1:3300/`）
- `pnpm -C "apps/pilot" run test` ✅（`3` files, `14` tests passed）

**修改文件**:
- `apps/pilot/package.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus: UnoCSS WebFonts 子路径兼容修复

**变更类型**: 稳定性修复 / 开发环境兼容

**描述**:
- 修复 Nexus 在 Nuxt 开发期可能出现的 UnoCSS 配置加载失败（`Package subpath './local' is not defined by "exports"`）问题。
- `apps/nexus/uno.config.ts` 中将 `presetWebFonts` 从 `unocss` 聚合导入改为直接导入 `@unocss/preset-web-fonts`，规避混合版本依赖树下的子路径解析冲突。
- 保持现有 WebFonts 配置与功能行为不变（`google/none` provider 逻辑不变）。

**测试**:
- `pnpm -C "apps/nexus" run typecheck` ✅
- `pnpm -C "apps/nexus" run dev:pure` ✅（Nuxt 启动通过）

**修改文件**:
- `apps/nexus/uno.config.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot M0: Quota 前端并入 + Nuxt 兼容 API 落地

**变更类型**: 融合交付 / 兼容迁移

**描述**:
- `apps/pilot` 完成 Quota 前端体系并入（`pages/layouts/components/composables/plugins/constants`），并切换路由语义：
  - `/` 使用 Quota 页面体系
  - `/pilot` 使用原 Pilot 聊天页
  - `/pilot/admin/storage` 使用原 Pilot 管理页
- 根壳保留 Pilot `app.vue`，新增 Quota 运行时桥接（`appOptions/globalOptions`、指令/插件注册），并移除 Quota 强制登录门禁，改为 Pilot 会话/访客态可用。
- Nuxt `server/api` 新增 M0 兼容层并统一返回 `{ code, message, data }`，覆盖：
  - `POST /api/aigc/executor`（SSE 映射为 `status_updated/completion/error/[DONE]`）
  - `POST /api/aigc/conversations`
  - `GET /api/aigc/history`
  - `GET /api/aigc/conversation/:id`
  - `DELETE /api/aigc/conversations/:id`
  - `GET /api/auth/status`
  - `GET /api/account/profile`
  - `GET /api/account/permissions`
  - `GET /api/aigc/prompts/hot|search|tags/recommend`（M0 返回空列表）
- 非 M0 接口统一由 `server/api/[...path].ts` 返回 501 包装，避免页面白屏或 404 误判。
- 聊天链路复用 Pilot Runtime，兼容历史存储保留 `chat_id/topic/value/meta` 结构；删除会话时同步清理兼容记录与 Pilot 会话。
- 根 `.gitignore` 新增 `apps/quota-gpt-view/` 与 `apps/quota-gpt-ends/`，迁移参考目录不纳入提交。

**测试**:
- `pnpm -C "apps/pilot" run test` ✅
- `pnpm -C "apps/pilot" run typecheck` ⚠️（Quota 迁移存量类型问题，集中在 article/cms 等模块）
- `pnpm -C "apps/pilot" run lint` ⚠️（Quota 迁移存量 lint 问题）
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm -C "apps/pilot" run build` ✅

**修改文件**:
- `apps/pilot/app/app.vue`
- `apps/pilot/app/pages/index.vue`
- `apps/pilot/app/pages/pilot/index.vue`
- `apps/pilot/app/pages/pilot/admin/storage.vue`
- `apps/pilot/app/layouts/pilot.vue`
- `apps/pilot/server/api/aigc/*`
- `apps/pilot/server/api/auth/status.get.ts`
- `apps/pilot/server/api/account/*`
- `apps/pilot/server/api/[...path].ts`
- `apps/pilot/server/utils/quota-api.ts`
- `apps/pilot/server/utils/quota-history-store.ts`
- `apps/pilot/server/utils/quota-history-codec.ts`
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/package.json`
- `apps/pilot/uno.config.ts`
- `.gitignore`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 多会话并行与流式超时兜底

**变更类型**: 稳定性修复 / 体验优化

**描述**:
- 前端会话运行态从全局 `running` 收敛为“按 session 追踪”，允许一个会话生成时切换并继续操作其他会话。
- 同 session 重试时仅中断该 session 的旧流，不再全局中断其它会话流。
- SSE 消费新增双超时兜底：
  - 空闲超时：`45s` 无事件自动中断并提示。
  - 总时长超时：`8min` 自动中断并提示。
- 超时参数改为可配置：支持通过 `NUXT_PUBLIC_PILOT_STREAM_IDLE_TIMEOUT_MS` 与 `NUXT_PUBLIC_PILOT_STREAM_MAX_DURATION_MS` 调整（含前端边界夹取）。
- 当用户进入会话触发 `fromSeq/follow` 且超时后，前端会自动调用 `POST /api/pilot/chat/sessions/:sessionId/pause`（`reason=heartbeat_timeout`）终止会话，避免长期 loading 卡住。
- 会话列表删除按钮改为按行禁用（仅禁用正在运行中的会话），新建会话按钮不再因其它会话运行而锁死。

**测试**:
- `pnpm -C "apps/pilot" run test`
- `pnpm -C "apps/pilot" run typecheck`

**修改文件**:
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `apps/pilot/app/composables/pilot-chat.types.ts`
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `apps/pilot/app/components/pilot/PilotSidebarHeader.vue`
- `apps/pilot/app/pages/index.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core-App: Channel 销毁态广播兜底 + Invoke Handler 常驻注册

**变更类型**: 稳定性修复 / 关停阶段容错

**描述**:
- 修复 `Object has been destroyed`：`channel-core` 的 `getWebContents` 新增销毁态与异常兜底，避免在插件 `disable` 状态广播时读取已销毁窗口对象导致未处理 Promise 拒绝。
- 修复 `No handler registered for "storage:app:save"` 噪声：`main-transport` 的 `ipcMain.handle` 改为“首次注册后常驻”，当事件暂无订阅处理器时返回 `undefined`，不再移除 handler，避免窗口/模块 teardown 窗口期触发 Electron 级 no-handler 报错。

**测试**:
- `pnpm -C "apps/core-app" run typecheck:node`

**修改文件**:
- `apps/core-app/src/main/core/channel-core.ts`
- `packages/utils/transport/sdk/main-transport.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: Cloudflare 流式响应延迟优化（SSE / D1 热路径）

**变更类型**: 性能优化 / 体验优化

**描述**:
- 降低流式阶段的高频持久化压力：`run.metrics` 保留实时事件发送，不再逐条写入 trace 存储。
- 优化 stream emitter 的序号分配：不再每次落库前都读取 `lastSeq`，改为本地游标递增，遇到 `seq` 冲突时再回退同步。
- 优化 runtime 事件持久化：`persistEvent` 移除每事件 `getSession` 读取，改为本地序号优先 + 冲突重试，减少 D1 往返。
- 优化 D1 trace 写入链路：`appendTrace` 由两次独立 `run()` 改为 `batch()` 合并提交（`INSERT trace + UPDATE session`）。
- 新增 `assistant.delta` 服务端批量持久化：默认按 `160ms` 时间窗或 `320` 字符阈值聚合后写入，SSE 仍保持逐增量实时输出。
- 新增每轮流式请求持久化汇总指标（`run.metrics` + Cloudflare 日志）：`delta 批次数 / 平均批字符数 / runtime trace 写入数 / store appendTrace 总数`。
- 移除流接口热路径中的重复 `ensureSchema` 调用，保持由 store adapter 统一懒初始化。
- 下调前端助手文本 flush 窗口（`120ms -> 48ms`），改善“吐字”实时观感。

**测试**:
- `pnpm -C "apps/pilot" run typecheck`

**修改文件**:
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `packages/tuff-intelligence/src/business/pilot/stream.ts`
- `packages/tuff-intelligence/src/business/pilot/emitter.ts`
- `packages/tuff-intelligence/src/runtime/agent-runtime.ts`
- `packages/tuff-intelligence/src/store/d1-runtime-store.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus OAuth Apps: 支持编辑与密钥轮换

**变更类型**: 能力补齐 / 管理体验增强

**描述**:
- OAuth 应用管理新增“编辑应用”能力：支持修改 `name`、`description`、`redirectUris`。
- OAuth 应用管理新增“重新生成 Secret”能力：服务端轮换 `client_secret_hash` 与 `client_secret_hint`，新 `client_secret` 仅返回一次。
- Dashboard OAuth 页面新增动作按钮：
  - `Edit`：应用级内联编辑表单并保存。
  - `Regenerate Secret`：即时轮换并展示新 secret（可复制）。
- 新增管理 API：
  - `PATCH /api/dashboard/oauth/clients/:id`
  - `POST /api/dashboard/oauth/clients/:id/rotate-secret`

**测试**:
- `pnpm -C "apps/nexus" exec vitest run server/api/dashboard/oauth/__tests__/clients.post.test.ts server/api/dashboard/oauth/__tests__/clients.[id].patch.test.ts server/api/dashboard/oauth/__tests__/clients.[id].rotate-secret.post.test.ts`

**修改文件**:
- `apps/nexus/server/utils/oauthClientStore.ts`
- `apps/nexus/server/api/dashboard/oauth/clients/[id].patch.ts`
- `apps/nexus/server/api/dashboard/oauth/clients/[id]/rotate-secret.post.ts`
- `apps/nexus/server/api/dashboard/oauth/__tests__/clients.[id].patch.test.ts`
- `apps/nexus/server/api/dashboard/oauth/__tests__/clients.[id].rotate-secret.post.test.ts`
- `apps/nexus/app/pages/dashboard/oauth.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot OAuth: 清理 bridge legacy + API/CLI 调用收口

**变更类型**: 认证链路收敛 / 兼容清理

**描述**:
- Pilot 回调链路改为严格 OAuth：`GET /auth/callback` 仅接受 `code + state`，移除 `ticket` 回退消费逻辑。
- Nexus 侧下线全部 bridge 接口与实现：`/api/pilot/auth/bridge-ticket`、`/api/pilot/auth/bridge-consume`、`/api/pilot/auth/bridge-start`。
- `authStore` 移除 `auth_pilot_bridge_tickets` 相关表初始化、类型与读写函数，避免后续误接入 legacy。
- OAuth token 交换路径收敛为标准授权码模式：统一要求 `client_id + client_secret`，不再接受 `x-pilot-oauth-secret`。
- Nexus OAuth 授权端点移除 `pilot_web + redirect allowlist` 分支，统一按 OAuth 应用注册的 `redirectUris` 校验。
- Pilot 配置与类型同步收口：
  - `runtimeConfig.pilot` 改为 `nexusOauthClientId` + `nexusOauthClientSecret`。
  - `.env.example` / Cloudflare env 类型改为 `PILOT_NEXUS_OAUTH_CLIENT_ID` / `PILOT_NEXUS_OAUTH_CLIENT_SECRET`。
- 文档补齐 API/CLI 调用与本地回调配置口径，统一“dev 本地 / prod 线上”的回跳策略说明。

**测试**:
- `pnpm -C "apps/nexus" exec vitest run server/api/pilot/oauth/__tests__/authorize.get.test.ts server/api/pilot/oauth/__tests__/token.post.test.ts server/api/dashboard/oauth/__tests__/clients.post.test.ts server/utils/__tests__/oauth-access.test.ts`
- `pnpm -C "apps/nexus" run typecheck`
- `pnpm -C "apps/pilot" run test`
- `pnpm -C "apps/pilot" run typecheck`

**修改文件**:
- `apps/pilot/server/routes/auth/authorize.get.ts`
- `apps/pilot/server/routes/auth/callback.get.ts`
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/.env.example`
- `apps/pilot/types/cloudflare-env.d.ts`
- `apps/nexus/server/api/pilot/oauth/authorize.get.ts`
- `apps/nexus/server/api/pilot/oauth/token.post.ts`
- `apps/nexus/server/api/pilot/oauth/__tests__/authorize.get.test.ts`
- `apps/nexus/server/api/pilot/oauth/__tests__/token.post.test.ts`
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/nuxt.config.ts`
- `apps/nexus/server/api/pilot/auth/bridge-ticket.post.ts`
- `apps/nexus/server/api/pilot/auth/bridge-consume.post.ts`
- `apps/nexus/server/api/pilot/auth/bridge-start.get.ts`
- `apps/nexus/server/api/pilot/auth/__tests__/bridge-ticket.post.test.ts`
- `apps/nexus/server/api/pilot/auth/__tests__/bridge-consume.post.test.ts`
- `docs/plan-prd/docs/PILOT-NEXUS-OAUTH-CLI-TEST-PLAN.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/INDEX.md`

### CoreBox: Search Core SRP + Perf 第1阶段（query/providers/merge-rank）

**变更类型**: 架构解耦 / 可观测性增强

**描述**:
- 在 `search-core` 内将搜索主链路按职责拆分为三段私有编排方法，保持现有结果协议与交互行为不变：
  - 查询编排：`orchestrateSearchQuery`（trim、`@provider` 解析、clipboard inputs 解析、cache key 统一生成）。
  - Provider 聚合：`aggregateProvidersForQuery`（输入类型过滤、`@provider` 过滤、refractory 跳过策略）。
  - 结果合并排序：`mergeAndRankItems`（usage/pinned/completion 注入 + sort）。
- 新增分段耗时埋点，覆盖 `parse -> providers -> merge/rank` 三段：
  - `Search.pipeline.parse`
  - `Search.pipeline.providers`
  - `Search.pipeline.merge-rank`
- 搜索指标上报补充分段耗时字段（`parseDuration`、`providerAggregationDuration`、`mergeRankDuration`），便于后续性能回归对比。

**测试**:
- `pnpm -C "apps/core-app" run typecheck:node`

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox: Roadmap 06-C 回归矩阵与性能基线最小集

**变更类型**: 测试基线 / 回归可复测性增强

**描述**:
- 为 roadmap 06-C 建立最小回归矩阵，覆盖：
  - CoreBox Search：纯文本、`@provider`、clipboard 输入三类路径。
  - Plugin Loader：packaged `dev.source` 回退、本地 dev 远程加载两类关键路径。
- 新增 `search-core` 基线采样测试辅助文件，采集 `parse/providers/merge-rank` 三段耗时样例，并输出 `ROADMAP_06C_BASELINE` 结构化日志。
- 输出三组基线数据样例，作为后续 06-A/06-B 重构后回归对照（不作为绝对 SLA）。
- 新增 06-C 专项文档，记录回归矩阵、基线数据与复测命令。

**测试**:
- `npm exec --yes pnpm -- -C "apps/core-app" run typecheck:node`
- `npm exec --yes pnpm -- -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts" "src/main/modules/plugin/plugin-loaders.test.ts" "src/main/modules/plugin/view/plugin-view-loader.test.ts"`

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts`
- `docs/plan-prd/docs/COREBOX-ROADMAP-06C-REGRESSION-BASELINE.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Docs: Roadmap 任务01（TODO 现状校准）收口（CoreBox/Nexus）

**变更类型**: 文档口径校准 / 优先级重排

**描述**:
- 清理 `TODO.md` 中“已落地但仍处于待实现语义”的混合标记，拆分为“已完成能力”与“真实剩余项”。
- 新增 CoreBox/Nexus 优先级“变更前/后”对照，并将剩余执行顺序重排为：
  - `SDK Hard-Cut E~F` → `v2.4.7 Gate D` → `v2.4.7 Gate E` → `View Mode 安全收口` → `Nexus 设备授权风控`。
- 同步 `README.md` 与 `docs/INDEX.md` 导航入口，确保三处入口对齐同一状态口径。

**修改文件**:
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 高标准交付（附件识别发送 / 可插拔存储 / 刷新续接 / Markdown 分块渲染）

**变更类型**: 会话可靠性增强 / 多模态能力补齐 / 体验优化

**描述**:
- 附件上传链路升级为可插拔存储：
  - 新增 `PilotAttachmentStorage` 抽象实现（`memory` + `R2`），`POST /uploads` 统一写入对象存储，不再只保留元数据。
  - 新增本地 MinIO（S3 兼容）provider，支持 `s3://` ref 与签名/公网 URL 输出，解决本地联调模型无法访问内网附件 URL 的问题。
  - 新增无 MinIO 回退：可配置 `attachmentPublicBaseUrl` 输出签名附件 URL（`/attachments/:id/content?exp&sig`），模型无需登录态即可回源读取。
  - 新增本地私网上传门禁：若未配置 MinIO 且无可用公网 Base URL，`POST /uploads` 拒绝附件上传（避免模型侧无法读取附件）。
  - 新增 Admin 存储配置后台：`/admin/storage` + `/api/pilot/admin/storage-config`（D1 持久化），支持运行时动态改 MinIO 与 Base URL 配置。
  - 附件记录补齐 `previewUrl`，新增 `GET /attachments/:attachmentId/content` 二进制读取接口（鉴权 + 会话归属）。
- 附件“识别发送”能力补齐：
  - `stream` 会解析当前轮附件上下文并注入 runtime `TurnState.attachments`。
  - 图片附件优先转为 `data URL` 并映射到多模态输入（`image_url` / `input_image`）。
  - 非图片文件先按能力边界注入结构化元数据（name/mime/size/ref），暂不做通用文档 OCR 解析。
- 刷新自动续接主路径落地：
  - `POST /stream` 支持 `fromSeq + follow`，可先 replay 再 tail 新 trace 直到会话退出 `executing/planning`。
  - 客户端断开默认不再立即 `pause`，服务端通过 `waitUntil` 保持后台推理继续执行。
  - 前端会话切换/页面刷新时，若会话仍在执行中会自动发起追尾续接。
- Markdown 流式观感优化：
  - `assistant.delta` 改为分块刷新（120ms flush，遇换行/句末标点提前 flush）。
  - `assistant.final` 到达时强制 flush 并做最终对齐。
  - 最新 assistant 气泡增加轻量淡入，并对 `prefers-reduced-motion` 自动降级。

**测试**:
- `pnpm -C "apps/pilot" run test`
- `pnpm -C "apps/pilot" run typecheck`
- `pnpm -C "apps/pilot" run lint`
- `pnpm -C "packages/tuff-intelligence" run lint`
- `pnpm -C "packages/tuff-intelligence" exec tsc --noEmit`

**修改文件**:
- `apps/pilot/server/utils/pilot-attachment-storage.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/uploads.post.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/attachments/[attachmentId]/content.get.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/messages.get.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/index.delete.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/server/utils/__tests__/pilot-attachment-storage.test.ts`
- `apps/pilot/app/composables/pilot-chat.types.ts`
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `packages/tuff-intelligence/src/protocol/session.ts`
- `packages/tuff-intelligence/src/runtime/agent-runtime.ts`
- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
- `docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/INDEX.md`

### CoreBox: touch-translation 链路收口与 View Mode 安全回归

**变更类型**: 插件链路修复 / 安全回归

**描述**:
- 收口翻译插件三条入口链路：
  - `fy`（`touch-translate`）保持 widget 翻译流程；
  - `fy-multi`（`multi-source-translate`）回归到稳定 webcontent 路由加载；
  - `s-fy`（`screenshot-translate`）补齐缺失 widget 文件并接入图片 OCR 文本解析流程。
- 三条链路统一错误提示语义：权限拒绝、无输入、调用失败均使用统一前缀文案，避免各入口提示分裂。
- 截图翻译新增明确失败提示：无图片输入、AI 权限拒绝、OCR 失败/无文本场景均返回可读错误信息，避免静默失败。
- View Mode 安全回归：
  - `plugin-view-loader` 增加本地路径越界拦截与路由规范化（兼容 `/path` 与 `#/path`）；
  - 生产环境继续阻断远程 `http/https` 协议；
  - 本地文件路径改为安全解析，禁止绝对路径逃逸插件目录。
- `plugin-loaders` 增加生产环境 `dev.source` 降级：打包态强制回退本地资源，开发态保持 `dev.source` 远程流程不变。
- 新增回归测试覆盖 `plugin-view-loader` 与 `plugin-loaders` 关键分支，防止协议阻断与 hash 路由逻辑再次回归。

**修改文件**:
- `plugins/touch-translation/index.js`
- `plugins/touch-translation/index/main.ts`
- `plugins/touch-translation/widgets/screenshot-translate.vue`
- `apps/core-app/src/main/modules/plugin/view/plugin-view-loader.ts`
- `apps/core-app/src/main/modules/plugin/view/plugin-view-loader.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.ts`
- `apps/core-app/src/main/modules/plugin/plugin-loaders.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox: Workflow Editor MVP（workflow.execute + workflow-agent 闭环）

**变更类型**: Intelligence 能力补全 / 可视化执行闭环

**描述**:
- 新增 Intelligence 工作流编辑页（`/intelligence/workflows`），提供最小可用 Workflow Editor：
  - 默认 3 步草稿，支持步骤新增/删除、`stepId/agentId/type/input(JSON)` 编辑。
  - 支持 `continueOnError` 开关并直连 `workflow.execute`。
- 基于现有 `workflow.execute + builtin.workflow-agent`，打通执行闭环：
  - 页面通过 `useIntelligenceSdk().invoke('workflow.execute')` 统一调用层触发执行（无 legacy channel 直连）。
  - 页面可触发执行并展示运行摘要（状态、success/failed/not-run 计数、traceId、latency、provider/model、tokens）。
  - 支持每个 step 的成功/失败状态、错误信息与输出回显（含未执行步骤标识）。
- JSON 输入校验升级为字段级可见错误（步骤索引 + 字段 + 失败原因），同时提供 inline 提示与 toast 提示，避免静默失败。
- Step 输出回显增加安全序列化兜底（循环引用等异常场景不会中断页面渲染）。
- Intelligence 首页入口补齐：在 `Cloud & Sharing` 区块新增 Workflow 入口。
- 新增 `useWorkflowEditor` hook，统一承载步骤校验、JSON 解析、执行调用与结果状态管理。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceWorkflowPage.vue`
- `apps/core-app/src/renderer/src/modules/hooks/useWorkflowEditor.ts`
- `apps/core-app/src/renderer/src/base/router.ts`
- `apps/core-app/src/renderer/src/components/intelligence/IntelligenceFuture.vue`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox: touch-intelligence 升级为多轮上下文对话（兼容 ai/@ai/智能 指令）

**变更类型**: 插件能力增强 / 交互可靠性修复

**描述**:
- `plugins/touch-intelligence` 新增按 `featureId` 的内存会话状态，自动携带最近对话上下文参与下一轮提问，支持连续追问。
- 历史窗口固定上限 10 条，仅保留 `user/assistant` 业务消息并按“最旧优先淘汰”收敛；`system prompt` 不入历史，只在请求时注入一次。
- AI 请求增加双重并发隔离（`requestId` + UI request guard）：仅当前活跃请求可落盘 UI 与历史，避免 stale response 覆盖最新 pending/ready。
- `retry` 动作改为复用失败前最后一次成功上下文快照重放，失败轮次与 error item 均不会写入会话历史。
- 保留 `copy-answer` 与 `retry` 动作行为，触发词与指令兼容性保持不变（`ai`/`@ai`/`/ai`/`智能`/`问答`）。

**修改文件**:
- `plugins/touch-intelligence/index.js`
- `docs/plan-prd/01-project/CHANGES.md`

### CoreBox: 自定义壁纸链路收口（模式切换/入库同步/异常可见性）

**变更类型**: 稳定性修复 / 回归可测性增强

**描述**:
- 收敛 `custom/folder/desktop` 模式切换链路：切换到 `custom/folder` 且未配置路径时，自动触发选择流程；用户取消选择时自动回退到上一模式，避免进入无效态。
- 优化壁纸库 copy/sync 行为：开启 `sync` 时主动触发一次入库；`folder` 入库改为逐文件容错，跳过损坏或不可读文件并持续处理。
- 主进程壁纸通道增加参数校验与错误返回（`wallpaper:get-desktop`、`wallpaper:copy-to-library`），并补充结构化日志，便于定位异常路径。
- 渲染侧补充用户可见反馈：选择失败、桌面壁纸不可用、入库失败场景统一给出 toast 提示。
- 修复文件夹轮播首帧索引问题（顺序模式首张不再被跳过），并补充空目录/加载失败日志。

**修改文件**:
- `apps/core-app/src/renderer/src/views/base/styles/ThemeStyle.vue`
- `apps/core-app/src/renderer/src/modules/layout/useWallpaper.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus: 通用 OAuth Client 申请（team admin / nexus admin）+ Pilot OAuth 多客户端兼容

**变更类型**: 认证能力扩展 / 权限治理

**描述**:
- 新增通用 OAuth Client 申请与管理接口（Nexus Dashboard API）：
  - `GET /api/dashboard/oauth/clients`
  - `POST /api/dashboard/oauth/clients`
  - `DELETE /api/dashboard/oauth/clients/:id`
- Nexus Dashboard 左侧导航新增 `OAuth 应用` 入口，并落地页面 `GET /dashboard/oauth`（支持 scope 切换、创建、列表与吊销）。
- 权限收敛：仅允许 `team admin`（组织团队 owner/admin）或 `nexus admin` 使用申请能力；普通用户与个人团队 owner 不可用。
- 新增 OAuth Client 存储 `oauth_clients`（D1 自动建表）：
  - 持久化 `client_id`、`client_secret_hash`、`redirect_uris`、owner scope（`team|nexus`）与状态字段。
  - `client_secret` 仅在创建时返回一次，后续仅暴露 hint。
- Pilot OAuth 端点升级为多客户端兼容：
  - `GET /api/pilot/oauth/authorize` 保留 `pilot_web` 旧行为，同时支持已注册 `client_id`（按注册 `redirect_uris` 校验）。
  - `POST /api/pilot/oauth/token` 保留 legacy header secret 路径，同时支持非 `pilot_web` 客户端通过 `client_secret` 换码。
- 本地联调变量补齐：
  - Pilot `.env.example` 增加 `PILOT_NEXUS_INTERNAL_ORIGIN` 与 `PILOT_NEXUS_OAUTH_SECRET`。

**测试**:
- 新增/更新测试：
  - `apps/nexus/server/api/dashboard/oauth/__tests__/clients.post.test.ts`
  - `apps/nexus/server/utils/__tests__/oauth-access.test.ts`
  - `apps/nexus/server/api/pilot/oauth/__tests__/authorize.get.test.ts`
  - `apps/nexus/server/api/pilot/oauth/__tests__/token.post.test.ts`

**修改文件**:
- `apps/nexus/server/utils/oauthClientStore.ts`
- `apps/nexus/server/utils/oauthAccess.ts`
- `apps/nexus/server/api/dashboard/oauth/clients.get.ts`
- `apps/nexus/server/api/dashboard/oauth/clients.post.ts`
- `apps/nexus/server/api/dashboard/oauth/clients/[id].delete.ts`
- `apps/nexus/server/api/pilot/oauth/authorize.get.ts`
- `apps/nexus/server/api/pilot/oauth/token.post.ts`
- `apps/nexus/server/api/dashboard/oauth/__tests__/clients.post.test.ts`
- `apps/nexus/server/utils/__tests__/oauth-access.test.ts`
- `apps/nexus/server/api/pilot/oauth/__tests__/authorize.get.test.ts`
- `apps/nexus/server/api/pilot/oauth/__tests__/token.post.test.ts`
- `apps/pilot/.env.example`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-08

### Pilot: Dev 环境 Nexus 回跳默认改为本地（避免本地误跳线上）

**变更类型**: 认证链路修复 / 环境解析收敛

**描述**:
- 新增 `resolvePilotNexusOrigin` 专用解析逻辑，仅用于 Pilot -> Nexus 的授权与回调链路。
- 开发环境（`NODE_ENV !== production`）默认使用 `http://127.0.0.1:3200`，并忽略 Cloudflare dev 注入的 `NUXT_PUBLIC_NEXUS_ORIGIN`，避免本地调试被 `wrangler.toml` 线上值覆盖。
- 非开发环境保持线上默认 `https://tuff.tagzxia.com`，继续支持 `PILOT_NEXUS_INTERNAL_ORIGIN` 覆盖内部回调地址。
- `apps/pilot/nuxt.config.ts` 的 `nexusOrigin` 默认值同步为“dev 本地 / prod 线上”。
- 新增配置单测覆盖 dev/prod 优先级与 internal 回退顺序。

**修改文件**:
- `apps/pilot/server/utils/pilot-config.ts`
- `apps/pilot/server/routes/auth/authorize.get.ts`
- `apps/pilot/server/routes/auth/callback.get.ts`
- `apps/pilot/server/utils/__tests__/pilot-config.test.ts`
- `apps/pilot/nuxt.config.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 修复流式消息空格丢失与 final 重复拼接

**变更类型**: 流式渲染缺陷修复

**描述**:
- 修复 `assistant.delta` 文本映射时错误 `trim()` 导致的 token 前导空格丢失（英文句子出现 `WhatcanIhelpyouwith` 这类连写）。
- 修复 `assistant.final` 到达时与当前增量内容不一致的处理逻辑：由“追加”改为“覆盖”，避免出现“无空格版本 + 正常版本”重复展示。

**修改文件**:
- `packages/tuff-intelligence/src/business/pilot/types.ts`
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 登录页授权 + 访客可用 + 历史 3 天有效期

**变更类型**: 登录体验调整 / 存储策略收敛

**描述**:
- Pilot 新增“先展示再授权”的登录页：`GET /auth/login` 不再自动跳转 Nexus，而是显示授权说明页，用户点击后走 `GET /auth/authorize` 发起授权。
- OAuth 授权链路：`/auth/authorize -> Nexus /api/pilot/oauth/authorize -> /auth/callback`。
- 页面不再强制登录拦截：未登录也可直接使用聊天能力。
- 未登录用户历史改为绑定本地设备 ID（`pilot_device_id` cookie），ID 丢失则访客历史不可恢复。
- 会话历史增加统一过期策略：按 `updated_at` 保留最近 3 天，超期会话及其消息/trace/checkpoint/附件自动清理。
- 侧边栏新增“授权登录 Nexus”入口，用户可在访客模式下按需升级登录。

**修改文件**:
- `apps/pilot/server/routes/auth/login.get.ts`
- `apps/pilot/server/routes/auth/authorize.get.ts`
- `apps/pilot/server/middleware/require-pilot-page-auth.ts`
- `apps/pilot/server/utils/pilot-device.ts`
- `apps/pilot/server/utils/auth.ts`
- `apps/pilot/server/utils/pilot-history.ts`
- `apps/pilot/server/utils/pilot-store.ts`
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `apps/pilot/server/utils/__tests__/auth.test.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot × Nexus: OAuth 授权码兑换（兼容 bridge secret）

**变更类型**: 认证协议升级 / API 增强

**描述**:
- Nexus 新增 Pilot OAuth 端点：
  - `GET /api/pilot/oauth/authorize`：校验 `client_id=pilot_web`、`redirect_uri` allowlist，登录后签发一次性 `code` 回跳。
  - `POST /api/pilot/oauth/token`：Pilot 服务端带 shared secret 兑换 `code`，返回 `userId`。
- Pilot 回调逻辑升级：
  - `/auth/callback` 优先处理 OAuth `code + state`，服务端换取用户身份后写入 `pilot_auth_session`。
  - `state` 使用 `pilot_oauth_state` cookie 校验，防止回调伪造。
- 兼容策略：
  - `/auth/callback` 保留 legacy `ticket` 回调兜底（迁移窗口兼容）。
  - token 端点 secret 默认兼容 `PILOT_NEXUS_BRIDGE_SECRET`，可选独立 `PILOT_NEXUS_OAUTH_SECRET`。
  - redirect allowlist 可通过 `PILOT_OAUTH_REDIRECT_ALLOWLIST` 覆盖，未配置使用内置安全默认值。

**测试**:
- 新增 Nexus OAuth API 单测：
  - `apps/nexus/server/api/pilot/oauth/__tests__/authorize.get.test.ts`
  - `apps/nexus/server/api/pilot/oauth/__tests__/token.post.test.ts`

**修改文件**:
- `apps/nexus/server/api/pilot/oauth/authorize.get.ts`
- `apps/nexus/server/api/pilot/oauth/token.post.ts`
- `apps/nexus/server/api/pilot/oauth/__tests__/authorize.get.test.ts`
- `apps/nexus/server/api/pilot/oauth/__tests__/token.post.test.ts`
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/nuxt.config.ts`
- `apps/pilot/server/routes/auth/authorize.get.ts`
- `apps/pilot/server/routes/auth/callback.get.ts`
- `apps/pilot/server/utils/pilot-oauth.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: Legacy Auth 全量移除 + Cloudflare 变量最小化

**变更类型**: 认证收敛 / 部署配置治理

**描述**:
- Pilot 鉴权收敛为单路径：`requirePilotAuth` 仅接受签名会话 cookie `pilot_auth_session`。
- 移除所有 legacy 兼容入口：`x-pilot-user-id`、`x-user-id`、`pilot_user_id`、`Bearer`、localhost dev bypass。
- `GET /auth/callback` 停止写入 legacy `pilot_user_id` cookie，仅写新会话 cookie。
- `apps/pilot/wrangler.toml` 改为最小变量集合：
  - 固定 `NUXT_PUBLIC_NEXUS_ORIGIN=https://tuff.tagzxia.com`
  - 保留 `NUXT_PILOT_BASE_URL`（其余走默认值）
  - `PILOT_NEXUS_BRIDGE_SECRET` / `PILOT_COOKIE_SECRET` / `NUXT_PILOT_API_KEY` 统一走 Cloudflare secrets
- 明确保留并绑定 Pilot 独立存储：
  - D1：`tuff-pilot-preview` / `tuff-pilot-production`
  - R2：`tuff-pilot-preview-attachments` / `tuff-pilot-production-attachments`

**测试**:
- 更新 `apps/pilot/server/utils/__tests__/auth.test.ts`：
  - `session-cookie` 成功路径；
  - 未登录 401；
  - legacy header/cookie/bearer 输入不再放行。

**修改文件**:
- `apps/pilot/server/utils/auth.ts`
- `apps/pilot/server/routes/auth/callback.get.ts`
- `apps/pilot/server/utils/__tests__/auth.test.ts`
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/.env.example`
- `apps/pilot/wrangler.toml`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: Main 区域头部精简与 Trace 入口收敛

**变更类型**: UI 体验优化

**描述**:
- 移除 `PilotChatWorkspace` 头部的会话标题与 session id 展示，主区聚焦消息与输入。
- Trace 入口从文字按钮调整为右上角单图标按钮（仅保留一个入口控件）。
- 收紧主区外层冗余边距：去除主容器额外 margin/宽度限制，减少无效 padding。

**修改文件**:
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `apps/pilot/app/pages/index.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: Nexus 登录桥接 + 用户历史隔离保持 + Markdown 渲染 + 独立 Cloudflare 配置

**变更类型**: 认证集成 / 体验改进 / 部署治理

**描述**:
- Nexus 新增 Pilot 登录桥接票据能力：
  - `POST /api/pilot/auth/bridge-ticket`（需 Nexus 登录态）签发 60s 一次性票据。
  - `POST /api/pilot/auth/bridge-consume`（共享密钥校验）消费票据并返回用户身份。
  - `GET /api/pilot/auth/bridge-start` 作为浏览器登录入口：未登录时跳转 `sign-in`，登录后签发票据并重定向回 Pilot 回调地址。
- Pilot 新增登录桥接流程：
  - `GET /auth/login` 首版阶段为直接跳转 Nexus 登录桥接入口（后续改为“授权说明页 + 手动点击”）。
  - `GET /auth/callback` 消费票据并写入新会话 cookie 后回跳目标页面（legacy 写入策略已在同日后续迭代移除，见上方“Legacy Auth 全量移除”）。
  - 页面级 server middleware 首版为未认证自动重定向（后续已改为“访客可用 + 手动授权”，见上方“登录页授权 + 访客可用”）。
- `requirePilotAuth` 在首版桥接阶段采用“新优先、旧兼容”；该兼容路径已在同日后续迭代移除，当前仅保留 `pilot_auth_session`。
- 聊天渲染改为 Markdown：`PilotChatWorkspace` 的 `TxChatList` 开启 `:markdown=\"true\"`，沿用 tuffex sanitize 默认策略。
- Cloudflare 独立部署能力：
  - 新增 `apps/pilot/wrangler.toml`，与根 wrangler 配置解耦。
  - `apps/pilot/package.json` 的 `preview:cf/deploy:cf` 强制使用 Pilot 专属 config 与 project-name（`tuff-pilot`）。
  - Nuxt Cloudflare Dev 配置改为读取 `apps/pilot/wrangler.toml`。

**测试**:
- 新增 Nexus API 单测：
  - `bridge-ticket.post.test.ts`（签发/TTL/禁用用户）
  - `bridge-consume.post.test.ts`（密钥校验/过期票据/禁用用户）
- 新增 Pilot 鉴权单测：
  - `auth.test.ts`（session-cookie 路径与未登录拒绝）

**修改文件**:
- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/api/pilot/auth/bridge-ticket.post.ts`
- `apps/nexus/server/api/pilot/auth/bridge-consume.post.ts`
- `apps/nexus/server/api/pilot/auth/bridge-start.get.ts`
- `apps/nexus/server/api/pilot/auth/__tests__/bridge-ticket.post.test.ts`
- `apps/nexus/server/api/pilot/auth/__tests__/bridge-consume.post.test.ts`
- `apps/nexus/nuxt.config.ts`
- `apps/pilot/server/utils/pilot-session.ts`
- `apps/pilot/server/utils/auth.ts`
- `apps/pilot/server/middleware/require-pilot-page-auth.ts`
- `apps/pilot/server/routes/auth/login.get.ts`
- `apps/pilot/server/routes/auth/callback.get.ts`
- `apps/pilot/server/utils/__tests__/auth.test.ts`
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `apps/pilot/package.json`
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/wrangler.toml`
- `apps/pilot/.env.example`
- `apps/pilot/vitest.config.ts`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/INDEX.md`

### Pilot: DeepAgent 真增量流式渲染修复 + Legacy 兼容梳理

**变更类型**: 流式体验修复 / 兼容治理

**描述**:
- 修复 Pilot “回答需等待全部生成后才一次性渲染”的问题：
  - `DeepAgentLangChainEngineAdapter` 新增 `runStream()`，通过 `deepagents` 的 LangGraph `streamMode: 'messages'` 持续产出 assistant 增量片段。
  - `AbstractAgentRuntime` 支持优先消费 `engine.runStream()`，保持老 `run()` 路径兼容回退。
  - 当上游流式不可用时自动回退到原 `run()` 单次输出，避免破坏既有运行链路。
- 前端补齐 `assistant.final` 去重拼接策略，避免“增量 + final”双写造成内容重复。
- 形成本轮 Legacy 兼容面清单（旧接口保留 + 新接口补齐）：
  - 旧 `intelligence:agent:session:stream` 继续保留查询语义。
  - 新 `intelligence:agent:session:subscribe` 承担实时推流。
  - trace `seq` 与 `fromSeq` 续播保持向后兼容（老 trace 无 `seq` 自动补齐）。

**修改文件**:
- `packages/tuff-intelligence/src/adapters/engine.ts`
- `packages/tuff-intelligence/src/runtime/agent-runtime.ts`
- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Intelligence × Pilot: 会话流式推送统一（兼容版）

**变更类型**: 架构收敛 / 流式能力增强

**描述**:
- 保持 `intelligence:agent:session:stream` 兼容语义（一次性 trace 查询）不变。
- 新增 `intelligence:agent:session:subscribe`，基于 Transport `stream/onStream` 提供 Core-App 侧真推流能力。
- Core Runtime trace 增补单调 `seq`，`queryTrace(fromSeq)` 从“数组下标切片”收敛为“按 `seq` 过滤”，并兼容老会话（无 `seq` 自动补齐）。
- 新增会话级 trace 订阅器（subscribe/unsubscribe），实时推送 trace 事件并支持断开资源释放。
- Core stream 链路补齐生命周期事件：`stream.started`、`replay.started/finished`、`stream.heartbeat`、`done`。
- 客户端断开时，若会话仍在运行态，自动写入 `paused_disconnect`。
- Nexus `intelligence-agent/session/stream` keepalive 补齐 `stream.heartbeat` 事件语义（保留原有注释 heartbeat 兼容）。

**修改文件**:
- `apps/core-app/src/main/modules/ai/tuff-intelligence-runtime.ts`
- `apps/core-app/src/main/modules/ai/intelligence-module.ts`
- `apps/nexus/server/api/admin/intelligence-agent/session/stream.post.ts`
- `packages/utils/transport/sdk/domains/intelligence.ts`
- `packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts`
- `packages/utils/types/intelligence.ts`
- `packages/tuff-intelligence/src/types/intelligence.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
- `apps/core-app/src/main/modules/ai/tuff-intelligence-runtime.test.ts`
- `docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Nexus: 组件文档页性能修复与无效导入清理

**变更类型**: 性能优化 / 稳定性修复

**描述**:
- 清理 `apps/nexus/content/docs/dev/components/*.mdc` 中无效导入，移除仅包含 import 的 `<script setup>`（共 58 个组件文档文件），降低组件文档解析与首屏执行负担。
- `DocsSidebar` 组件页元数据查询改为最小字段读取（`path/title/category/meta/syncStatus/verified`），并在 `useAsyncData.transform` 预处理 `_normalizedPath/_meta/_syncStatus`，将后续计算收敛为轻量分组与排序。
- `docs/[...slug].vue` 代码块增强链路增加 `data-code-enhanced` 幂等标记，并收敛为单次调度（timer/raf 去重 + 卸载清理），减少切页重复扫描。
- `highlight.client.ts` 跳过 `.tuff-code-block__code` 节点并增加同帧调度去重，避免与页面内代码块高亮重复重扫。
- `docs` 布局抽屉内容改为按需挂载（仅可见时挂载 `DocsSidebar/DocsOutline`），降低隐藏态实例开销。
- 修复 `GradualBlurAnimatedDemo` 的 `wheel` 监听与 timeout 清理，避免 demo 组件反复挂载造成监听泄漏。

**修改文件**:
- `apps/nexus/content/docs/dev/components/*.mdc`
- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/app/plugins/highlight.client.ts`
- `apps/nexus/app/layouts/docs.vue`
- `apps/nexus/app/components/content/demos/GradualBlurAnimatedDemo.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 会话切换路由参数同步 + 标题溢出 Tooltip

**变更类型**: 体验优化 / 导航可恢复性增强

**描述**:
- 会话切换时将当前 `sessionId` 同步到页面路径参数（query），支持刷新或分享链接后恢复到目标会话。
- 页面初始化时优先读取路径参数中的 `sessionId`，若存在且有效则直接定位该会话。
- 会话列表标题改为 `TxTooltip` 悬浮提示，保留单行省略（ellipsis）样式，hover 显示完整标题。

**修改文件**:
- `apps/pilot/app/pages/index.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Core App: 修复 tuff-intelligence 在主进程运行时的 ESM 导入失败

**变更类型**: 缺陷修复 / 构建配置收敛

**描述**:
- 修复 Core App 启动时 `ERR_MODULE_NOT_FOUND`（`@talex-touch/tuff-intelligence` -> `src/adapters/index`）问题。
- 根因是主进程将 `@talex-touch/tuff-intelligence` externalize 后，Node 运行时直接加载 TS ESM 源码并触发无扩展名相对导入解析失败。
- 在 `electron-vite` 的 `main/preload` 配置中将该 workspace 包加入 `exclude`，确保由构建器打包处理，避免运行时 ESM 解析差异。

**修改文件**:
- `apps/core-app/electron.vite.config.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: SSE 可观测性增强 + DeepAgent 风格阶段事件 + 默认模型升级

**变更类型**: 功能增强 / 可靠性修复

**描述**:
- 修复 Pilot 多轮对话 trace `seq` 冲突问题（按会话 `lastSeq` 续号），避免第二轮写入唯一索引冲突。
- `POST /api/pilot/chat/sessions/:sessionId/stream` 增强：
  - 首帧 `stream.started`，避免“长时间无事件返回”。
  - 新增阶段事件：`planning.started` / `planning.updated` / `planning.finished`、`turn.started` / `turn.finished`、`replay.started` / `replay.finished`。
  - 新增 `run.audit`，透传上游调用审计（request / response / network_error / response_error）。
  - `error` 事件补充结构化 `detail`（phase、endpoint、status、stack/cause）。
- DeepAgent 最小封装迁入 `@talex-touch/tuff-intelligence`：
  - 新增 `DeepAgentLangChainEngineAdapter`，Pilot 不再内联拼装 `/v1/responses` 请求。
  - `DeepAgentAuditRecord` / `DeepAgentErrorDetail` / `toDeepAgentErrorDetail` 由 intelligence 包统一输出。
  - `DeepAgentLangChainEngineAdapter` 改为通过 `deepagents.createDeepAgent` 运行（非手写 fetch loop），并按 `claude-relay-service` 约定归一化上游地址：
    - 配置 `base_url=http://localhost:3000/openai` 时，运行时自动转换为 LangChain 所需的 `http://localhost:3000/openai/v1`。
    - 仍兼容完整 `responses` 地址（如 `.../openai/v1/responses`）输入，统一收敛到 DeepAgent + ChatCompletions 通道。
  - 针对上游 `socket hang up / 长时间无响应` 增加请求级超时保护（默认 25s/次），两次重试后返回结构化 `504 Gateway Timeout`，避免 SSE 长时间仅 keepalive 无结果。
  - 新增 `proxy: false` 网络执行策略：在 Pilot runtime 调用链中禁用 `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY`，并强制注入 `NO_PROXY=localhost,127.0.0.1,::1`，用于排除本机 upstream 误走系统代理。
  - Pilot 上游配置改为本地 `.env` 驱动：
    - 移除 `nuxt.config.ts` 与 `pilot-runtime.ts` 内置 API Key / endpoint 硬编码。
    - 新增 `apps/pilot/.env.example`（`NUXT_PILOT_*`）用于本地配置渠道、预算、重试与 proxy 策略。
  - 进一步精简环境变量：Pilot AI 渠道仅保留 `NUXT_PILOT_BASE_URL` / `NUXT_PILOT_API_KEY` / `NUXT_PILOT_MODEL`（默认 baseUrl 为 `http://localhost:3000/openai`），删除 `endpoint/upstreamChat` 入口，减少配置歧义。
- Pilot 前端 Trace 抽屉增强：展示 `run.audit` 和结构化错误详情；流结束后按增量 trace 合并，避免覆盖流内审计事件。
- 默认模型升级为 `gpt-5.4`（Nuxt runtimeConfig + runtime fallback）。

**修改文件**:
- `packages/tuff-intelligence/src/runtime/agent-runtime.ts`
- `apps/pilot/server/utils/pilot-runtime.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/app/pages/index.vue`
- `apps/pilot/nuxt.config.ts`
- `docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md`

### Pilot: 页面层优先复用 tuffex 组件

**变更类型**: UI 架构收敛 / 组件复用

**描述**:
- Pilot 聊天页从自定义原生控件切换为优先使用 `@talex-touch/tuffex` 组件，统一视觉与交互语义。
- 保持现有行为约束不变：
  - 页面整体不滚动；
  - 中间聊天区全高撑开；
  - 输入区固定底部；
  - Trace 通过按钮打开右侧抽屉并在抽屉内滚动。

**主要变更**:
1. 引入并接入 `TxButton`、`TxChatList`、`TxChatComposer`、`TxDrawer`、`TxEmptyState`、`TxStatusBadge`、`TxTag`、`TxTypingIndicator`。
2. `apps/pilot` 引入 `@talex-touch/tuffex` 依赖，并在 Nuxt 配置中补齐样式、transpile 与 workspace source alias。
3. 会话列表状态徽标、消息列表、输入区、Trace 抽屉与空状态全部切换到 tuffex 组件实现。
4. 扩展 `TxChatComposer`，新增“附件+输入一体化”能力（附件列表、附件按钮、左侧工具栏插槽），Pilot 底部输入区改为统一 Composer，不再分离独立附件区。
5. `TxChatComposer` 新增 `toolbar` 具名插槽，Pilot 通过插槽实现类似 Web 搜索模式的底部操作条（附件入口 + 模式/搜索项 + 右侧语音圆按钮）。

**修改文件**:
- `apps/pilot/package.json`
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/app/pages/index.vue`
- `packages/tuffex/packages/components/src/chat/src/types.ts`
- `packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue`
- `packages/tuffex/packages/components/src/chat/index.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 聊天页空态与底部输入区视觉修正

**变更类型**: UI 缺陷修复 / 体验一致性优化

**描述**:
- 修复 Pilot 聊天页“视觉怪异”问题：消息空态由 `blank-slate` 插画改为 `custom + card` 轻量空态，避免大插画在主聊天区造成视觉突兀。
- 收敛底部输入区层次：降低透明叠层感，增强 Composer 与工具按钮对比度，保留“附件 + 输入一体化”结构。
- Trace 抽屉内部滚动行为补齐：右侧 Trace 内容区改为独立滚动，避免内容增长时影响整体布局观感。

**主要变更**:
1. 消息区空态替换为 `TxEmptyState(variant=custom, surface=card)`，并限制空态区域宽度与居中布局。
2. 聊天区消息容器增加 `overflow: hidden`，继续保证“整页不滚动、仅局部滚动”。
3. 底部 Dock 与 `TxChatComposer` 背景/边框/阴影调优，工具栏与按钮增加 hover/对比度优化。
4. Trace 内容区增加 `flex: 1 + overflow: auto`，确保抽屉内滚动稳定。

**修改文件**:
- `apps/pilot/app/pages/index.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 首页结构拆分（左侧/中间组件 + 页面 composable）

**变更类型**: 架构整理 / 可维护性提升

**描述**:
- 将 Pilot 首页从单文件大组件拆分为“页面组装层 + 左侧会话组件 + 中间聊天组件 + 逻辑 composable”，降低页面耦合并便于后续迭代。
- 保持现有行为与交互不变：双栏布局、整页不滚动、消息区独立滚动、底部输入固定、Trace 右侧抽屉。

**主要变更**:
1. 抽离左侧会话区组件 `PilotSessionsPanel`，承载会话列表渲染与交互事件。
2. 抽离中间聊天区组件 `PilotChatWorkspace`，承载消息区、底部一体化输入、Trace 抽屉与附件选择器。
3. 新增 `usePilotChatPage` composable，统一收敛会话状态、SSE 流处理、消息发送、附件上传、标题总结与回放逻辑。
4. 新增 `pilot-chat.types.ts` 统一页面与组件共享类型，减少页面内联类型噪音。
5. `index.vue` 收敛为布局组装层，仅负责连接 props / emits / v-model。

**修改文件**:
- `apps/pilot/app/pages/index.vue`
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `apps/pilot/app/composables/pilot-chat.types.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 移除聊天头部冗余控制按钮

**变更类型**: 交互收敛 / 界面简化

**描述**:
- 移除右上角“补播恢复”“停止”按钮，头部仅保留 `Trace` 入口，避免与底部恢复入口重复。
- 清理对应页面事件与 composable 中不再使用的 `stop` 流程，减少无效代码路径。

**修改文件**:
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `apps/pilot/app/pages/index.vue`
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 页面版式收敛（间距清理 + 响应式比例 + 内容居中）

**变更类型**: UI 布局优化 / 响应式适配

**描述**:
- 清理 Pilot 页面多余 `margin/padding`，统一左右栏与聊天区间距节奏，降低视觉拥挤与空洞并存问题。
- 左右栏比例调整为更接近 ChatGPT 的宽度关系：左侧固定范围收敛，右侧主区域获得更稳定的阅读空间。
- 右侧聊天区新增居中壳层并限制最大宽度，兼容大屏与中屏，避免内容“贴边拉长”。

**主要变更**:
1. `pilot-page` 网格列调整为 `clamp(248px, 19vw, 292px) + 1fr`。
2. `PilotChatWorkspace` 新增 `pilot-chat__shell`，右侧内容采用 `margin-inline: auto` 居中并设置最大宽度限制。
3. 聊天区与会话区统一收敛内边距、间距和卡片密度，减少多余空白。
4. 补充 `1200px / 960px` 响应式细化，确保不同屏幕下布局稳定。

**修改文件**:
- `apps/pilot/app/pages/index.vue`
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 输入区收敛（底部锚定 + 隐藏预留功能按钮）

**变更类型**: 交互优化 / 功能收敛

**描述**:
- 修复输入区视觉与布局问题：输入框高度收敛、底部区域稳定锚定，避免输入区显得“过高/漂浮”。
- 底部预留能力按钮暂时隐藏：移除 `Pro/Search/Mic/语音` 相关展示，仅保留“附件 + 发送”的核心输入能力。
- 恢复按钮仅在 paused 状态展示，常态下不再占位，保证输入区贴底观感。

**修改文件**:
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: Composer 紧凑化修正（高度与底部贴合）

**变更类型**: UI 缺陷修复 / 版式修正

**描述**:
- 针对输入区仍显过高的问题，进一步收敛 `TxChatComposer` 的内边距、间距与 textarea 初始高度。
- 聊天壳层补充 `height: 100%`，确保输入区在不同屏幕下稳定贴底。

**修改文件**:
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 左侧会话区文本化展示

**变更类型**: UI 收敛 / 信息层级简化

**描述**:
- 按需求将左侧会话区调整为纯文本表达，移除状态徽章组件展示。
- 会话列表由卡片样式收敛为文本行样式，仅保留标题、状态文本、更新时间与会话元信息。

**修改文件**:
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 左侧列表状态文案精简与边框语义

**变更类型**: UI 规则收敛

**描述**:
- 左侧会话列表不再显示 `id` 和状态文案（如 `completed`），保持纯文本列表简洁性。
- 状态反馈改为边框语义：
  - `failed` 使用红色边框；
  - `completed` 使用蓝色边框。

**修改文件**:
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 左侧列表极简化（隐藏时间 + 尾部状态点 + Hover 删除）

**变更类型**: UI 细节优化

**描述**:
- 左侧会话列表进一步简化，不再展示时间信息。
- 默认无边框；状态反馈由边框改为尾部指示点（该阶段语义，后续已统一为“通知蓝点”语义）。
- 删除按钮改为仅在列表项 hover/focus 时显示，常态下不干扰文本阅读。

**修改文件**:
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 会话完成通知蓝点（独立通知接口）

**变更类型**: 功能增强 / 交互语义修正

**描述**:
- 蓝点语义调整为“通知”而非状态：仅在“用户发起新消息并完成后”置位。
- 新增独立通知接口用于读取/清除会话通知状态，前端不再依赖会话状态文案推断蓝点。
- 左侧列表蓝点改为读取通知字段；点击进入会话后调用通知接口清除蓝点。
- 当前正在查看的会话会自动清除 `unread`，不展示蓝点；仅离开当前会话后再收到完成通知时显示蓝点。

**新增接口**:
- `GET /api/pilot/chat/sessions/notifications`
- `POST /api/pilot/chat/sessions/:sessionId/notification`

**修改文件**:
- `packages/tuff-intelligence/src/store/store-adapter.ts`
- `packages/tuff-intelligence/src/store/d1-runtime-store.ts`
- `apps/pilot/server/api/pilot/chat/sessions/notifications.get.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/notification.post.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/stream.post.ts`
- `apps/pilot/app/composables/pilot-chat.types.ts`
- `apps/pilot/app/composables/usePilotChatPage.ts`
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 右侧主区内部滚动收敛

**变更类型**: 交互一致性优化

**描述**:
- 右侧聊天主区改为容器内部纵向滚动，避免页面级滚动。
- 保持主布局 100vh 锁定，滚动行为限定在右侧内容区域。

**修改文件**:
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 主题变量收敛（tuffex token）+ 系统亮暗自动切换

**变更类型**: 视觉一致性优化 / 主题适配增强

**描述**:
- Pilot 首页与左右栏样式中硬编码颜色收敛为 `tuffex` CSS 变量（`--tx-*`），减少页面私有色值分叉。
- 页面背景、边框、文本、消息气泡、输入区与 Trace 面板统一改为 token 驱动。
- 新增系统亮暗模式自动跟随：基于 `prefers-color-scheme` 自动设置 `html[data-theme]`，并在系统主题变化时实时切换。

**修改文件**:
- `apps/pilot/app/app.vue`
- `apps/pilot/app/pages/index.vue`
- `apps/pilot/app/components/pilot/PilotSessionsPanel.vue`
- `apps/pilot/app/components/pilot/PilotChatWorkspace.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot: 渠道配置极简化（仅 BASE_URL + API_KEY）与读取修复

**变更类型**: 配置收敛 / 缺陷修复

**描述**:
- 修复 `api key is not configured` 误报：`pilot-runtime` 改为多层读取顺序（`runtimeConfig -> Cloudflare env -> process.env`），避免本地 `.env` 或 worker env 已配置但运行时读空。
- Pilot 配置入口收敛为仅两项：
  - `NUXT_PILOT_BASE_URL`
  - `NUXT_PILOT_API_KEY`
- 移除 proxy/no-proxy/model 等 env 入口，默认模型固定 `gpt-5.4`（代码常量）。
- 移除历史兼容键名与回退：`PILOT_*`、`NUXT_PILOT_UPSTREAM_RESPONSES_*` 不再生效。
- 移除 `Authorization` 头作为 API Key 的回退来源，统一只使用配置项 `NUXT_PILOT_API_KEY`。
- `@langchain/openai` 升级至支持 Responses API 的版本，并在 DeepAgent `ChatOpenAI` 中启用 `useResponsesApi`，默认直接走 `/v1/responses`。
- 新增 `packages/tuff-intelligence/src/business/pilot/*`，将 `planning / run.metrics / replay` 流式编排逻辑从 `apps/pilot` 下沉到 intelligence 包。
- Pilot 心跳改为 SSE 内部事件（`stream.heartbeat`），前端移除额外 `/heartbeat` 请求链路。
- `appendTrace + seq 冲突重试 + emit` 下沉到 `business/pilot/emitter.ts`，`stream.post.ts` 收敛为传输层编排。
- `toJsonSafe/toSafeRecord/stream error detail` 统一下沉到 `packages/tuff-intelligence/src/business/pilot/utils.ts`，`stream.post.ts` 不再内联同类实现。
- 彻底清理前端历史 heartbeat 残留（`postHeartbeat/startHeartbeat/stopHeartbeat` 与计时器状态），仅保留 SSE 内置 `stream.heartbeat`。
- 修复流式文本拼接失真：assistant delta 不再按片段 `trim`，保留空格与换行。
- 修复 replay-only 写入副作用：`fromSeq` 只读补播场景不再新增 `stream.started/replay.* /done/error` trace 记录。
- 删除 `POST /api/pilot/chat/sessions/:sessionId/heartbeat` 路由入口。
- `DeepAgent` 适配层移除 proxy 注入链路与 upstream chat fallback 分支，仅保留 relay baseUrl 路径，减少配置歧义。
- 新增根忽略规则：`apps/pilot/.env`，避免本地密钥误提交。

**修改文件**:
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/server/utils/pilot-runtime.ts`
- `apps/pilot/.env.example`
- `packages/tuff-intelligence/src/adapters/deepagent-engine.ts`
- `packages/tuff-intelligence/src/business/pilot/{stream.ts,types.ts,emitter.ts,utils.ts}`
- `apps/pilot/app/pages/index.vue`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/stream.post.ts`
- `.gitignore`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot 下一阶段执行文档落地（测试优先 + OAuth + CLI + channel routing）

**变更类型**: 文档规划 / 执行顺序收敛

**描述**: 基于 Pilot 首版上线状态，新增下一阶段执行文档，明确后续按“测试优先”推进，并串联 Nexus OAuth 登录、`tuff-pilot-cli` 与后端渠道可配置能力，作为后续实现统一入口。

**主要变更**:
1. 新增文档 `docs/plan-prd/docs/PILOT-NEXUS-OAUTH-CLI-TEST-PLAN.md`。
2. 固化硬顺序：`T0 测试 -> T1 OAuth -> T2 CLI -> T3 channel routing`。
3. 补充阶段门禁（Gate A-D）与非目标边界，避免本轮任务扩散。

**修改文件**:
- `docs/plan-prd/docs/PILOT-NEXUS-OAUTH-CLI-TEST-PLAN.md`
- `docs/INDEX.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot dev 启动稳定性修复（Nuxt Cloudflare + checker）

**变更类型**: 开发体验修复 / 配置收敛

**描述**: 修复 `apps/pilot` 在 `nuxt dev` 下因 `vite-plugin-checker` 触发 `typescript/lib/typesMap.json` 拷贝失败导致的启动异常；同时修正 Cloudflare dev 的兼容日期配置入口。

**主要变更**:
1. `apps/pilot/nuxt.config.ts` 将 `compatibilityDate` 提升到 Nuxt 顶层并更新到 `2026-03-08`。
2. `apps/pilot/nuxt.config.ts` 关闭 dev 内置 `typescript.typeCheck`，改为通过 `pnpm pilot:typecheck` 独立执行类型检查。

**修改文件**:
- `apps/pilot/nuxt.config.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Pilot 本地联调通路补齐（Cloudflare 绑定 + 内置 Responses mock upstream）

**变更类型**: 本地联调能力增强 / 测试配置落地

**描述**: 为 Pilot 测试阶段补齐本地可用链路。`nuxt dev` 在 cloudflare-dev 模式下显式复用根 `wrangler.toml`（含 D1/R2 绑定与持久化目录）；同时内置固定 Responses upstream（用户提供的 mock 地址与 token），让 Chat 流程可直接联调。

**主要变更**:
1. `apps/pilot/nuxt.config.ts` 新增 `nitro.cloudflareDev`（`configPath` + `persistDir` + `environment`），本地调试可读取 `DB` 绑定并持久化到 `.wrangler/state/v3`。
2. `apps/pilot/server/utils/pilot-runtime.ts` 增加 OpenAI Responses 请求路径（`/v1/responses`）与多格式响应文本提取逻辑。
3. Pilot runtime config 增加内置 `upstreamResponsesBaseUrl` / `upstreamResponsesApiKey` / `upstreamResponsesModel` 默认值，用于本地 mock 联调。
4. `apps/pilot/server/utils/pilot-store.ts` 附件桶读取增加 `R2` fallback（兼容根 wrangler 绑定名）。
5. `apps/pilot/types/cloudflare-env.d.ts` 增加 `R2` 绑定类型声明。

**修改文件**:
- `apps/pilot/nuxt.config.ts`
- `apps/pilot/server/utils/pilot-runtime.ts`
- `apps/pilot/server/utils/pilot-store.ts`
- `apps/pilot/types/cloudflare-env.d.ts`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-07

### Pilot（Nuxt Edge）上线首版 + Intelligence Hard-Cut 收口

**变更类型**: 新增应用 / 架构收口 / 协议落地

**描述**: 新增 `apps/pilot` 作为独立部署的 AI Chat-first 应用，并将 Agent Runtime/Protocol 核心统一收口到 `packages/tuff-intelligence`。Pilot 服务端采用 SSE + checkpoint/replay 模式，具备长会话断线恢复的基础能力。

**主要变更**:
1. 新建 `apps/pilot`（Nuxt + `cloudflare-pages` preset），实现会话、消息、trace、heartbeat、pause、upload、stream API。
2. 新增 `POST /api/pilot/chat/sessions/:sessionId/stream`，支持 `assistant.delta/final`、`run.metrics`、`session.paused`、`error`、`done` 与 `fromSeq` 补播。
3. 新增 Pilot 前端 V1 聊天页：会话列表、消息流、附件上传、停止、补播恢复、Trace 抽屉。
4. `tuff-intelligence` Runtime 增强：会话历史注入、trace `seq` 写回 envelope `meta`、周期 checkpoint。
5. 全仓清理旧 Intelligence 直连：移除 `@talex-touch/utils/intelligence*` 外部依赖，核心改用 `@talex-touch/tuff-intelligence`。
6. `packages/utils` 切断 Intelligence 聚合导出（root/types/renderer/hooks/plugin-sdk/transport-domain）。
7. 根脚本补齐 `pilot:dev`、`pilot:build`、`pilot:typecheck`、`pilot:lint`。

**修改文件（核心）**:
- `apps/pilot/**`
- `packages/tuff-intelligence/src/runtime/agent-runtime.ts`
- `packages/tuff-intelligence/src/{client.ts,index.ts,transport/**,store/**,protocol/**}`
- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- `apps/core-app/src/renderer/src/components/intelligence/**`
- `apps/core-app/tuff/modules/plugins/touch-translation/shared/tuffintelligence.ts`
- `packages/utils/index.ts`
- `packages/utils/types/index.ts`
- `packages/utils/renderer/index.ts`
- `packages/utils/renderer/hooks/index.ts`
- `packages/utils/plugin/sdk/index.ts`
- `packages/utils/transport/sdk/domains/index.ts`
- `package.json`
- `scripts/check-intelligence-no-todo.mjs`

### 主进程退出链路 + Tray/设置事件重构

**变更类型**: 架构重构 / 稳定性修复 / 公共事件收敛

**描述**: 针对开发环境高频崩溃链路（`Object has been destroyed` + 异常退出 + native hook fatal）进行一次性收敛。退出流程改为“标准 quit 优先、超时兜底强退”，并将 Tray 相关设置通道从旧 `TrayEvents` 迁移到 `AppEvents.system.*`，同时收敛模块监听生命周期。

**主要变更**:
1. `DevProcessManager` 改为两阶段退出：先 `app.quit()` 走标准卸载链路，5 秒超时后再执行强制清理并 `process.exit(1)`；正常路径不再主动 `process.exit(0)`。
2. `ModuleManager` 新增幂等 `unloadAll(reason)`，`BEFORE_APP_QUIT` 统一走该入口，避免重复 unload 与竞态。
3. Tray 模块改为启动时按 `appSetting.setup.experimentalTray` 动态加载；关闭实验开关时 Tray 模块完全不进入运行态。
4. `TrayManager` 增加统一 listener disposer 管理（`app/window/eventbus`），并在窗口激活/显示链路补齐 destroyed guard。
5. `AddonOpenerModule` 补齐 `app.on` 与 transport handler 的集中释放机制，减少退出期回调悬挂风险。
6. 移除旧 `TrayEvents` 通道，新增 `AppEvents.system.autoStartGet/autoStartUpdate/traySettingsGet/traySettingsUpdate`，并在 `CommonChannel` 常驻注册处理。
7. 渲染端设置页与引导页全部迁移到新 system 事件；`experimentalTray=false` 时隐藏 `showTray/hideDock` UI 开关，`autoStart` 保持可用。
8. OmniPanel 在 `BEFORE_APP_QUIT` 提前执行 `cleanupInputHook`，降低 `uiohook-napi` 退出竞态。

**修改文件（核心）**:
- `apps/core-app/src/main/utils/dev-process-manager.ts`
- `apps/core-app/src/main/core/module-manager.ts`
- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.ts`
- `apps/core-app/src/main/modules/addon-opener.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/channel/common.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/events/types/app.ts`
- `packages/utils/transport/events/types/index.ts`
- `packages/utils/transport/sdk/domains/settings.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingWindow.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`
- `apps/core-app/src/main/core/module-manager.test.ts`
- `apps/core-app/src/main/utils/dev-process-manager.test.ts`
- `apps/core-app/src/main/modules/tray/tray-manager.test.ts`

## 2026-03-05

### Nexus Auth 路由在 Cloudflare 环境 500 修复

**变更类型**: 缺陷修复 / 线上可用性恢复

**描述**: 修复 Nexus 在 Cloudflare Pages/Worker 环境下，`/api/auth/*` 全部返回 500 的问题。根因是 auth 路由静态引入 `next-auth/providers/email`，会连带 `nodemailer` 进入 Worker 运行时并导致初始化失败。

**主要变更**:
1. 移除 `server/api/auth/[...].ts` 对 `next-auth/providers/email` 的静态导入，避免 Worker 侧加载 Node 邮件依赖。
2. 在 auth 路由内使用轻量 email provider（仅声明 `email` 类型和 `sendVerificationRequest`），保持现有邮件登录流程与 `sendEmail` 能力不变。
3. 仅在 `AUTH_EMAIL_SERVER` 与 `AUTH_EMAIL_FROM` 同时存在时注册 email provider，行为与原有门控保持一致。

**修改文件**:
- `apps/nexus/server/api/auth/[...].ts`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-04

### Nexus 官网同步：性能落地公告与文档入口

**变更类型**: 官网内容同步 / 发布可见性增强

**描述**: 将本轮 Core App 的数据库写压治理与统计降频优化同步到 Nexus 官网。新增中英文性能落地文档，并在公开更新流注入一条官方公告，确保用户可在 `/updates` 第一时间看到性能升级说明并跳转详情。

**主要变更**:
1. `/api/updates` 数据源新增官方公告注入（中英文标题与摘要），并按 `id` 去重，避免与后台写入数据冲突。
2. 公告类型设为 `announcement`，覆盖 `RELEASE/BETA/SNAPSHOT`，默认对 web/system 双端可见。
3. 新增 release 文档页 `performance-persistence`（zh/en），完整说明 stats/analytics 降频、OCR 写压治理、调度器观测等策略。
4. `release` 文档索引与 Docs 侧边栏新增“性能落地（2026-03）”入口，保证站内可检索与可导航。
5. 新增幂等同步接口 `POST /api/dashboard/updates/sync-official`，可将官方公告 upsert 到 D1（或内存存储），返回 inserted/updated 计数用于运维确认。

**修改文件**:
- `apps/nexus/server/utils/dashboardStore.ts`
- `apps/nexus/content/docs/dev/release/performance-persistence.zh.md`
- `apps/nexus/content/docs/dev/release/performance-persistence.en.md`
- `apps/nexus/content/docs/dev/release/index.zh.md`
- `apps/nexus/content/docs/dev/release/index.en.md`
- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/server/api/dashboard/updates/sync-official.post.ts`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-02

### MetaOverlay（MetaK）动作执行链路修复

**变更类型**: 缺陷修复 / 交互可用性恢复

**描述**: 修复 MetaOverlay（MetaK）中点击动作“无响应”的回归问题。内建动作恢复为主进程直接执行，避免依赖 renderer 转发链路造成执行失败；同时增强 item 上下文兜底，减少请求载荷不完整导致的全链路中断。

**主要变更**:
1. 内建动作（固定/复制/定位/流转）恢复由主进程直接分发执行。
2. MetaOverlay 执行动作时支持使用当前面板缓存的 item 上下文兜底。
3. `meta-overlay:action.execute` IPC 不再因 `item` 缺失立即抛错，交由 manager 统一处理。
4. MetaOverlay renderer 发送执行请求时不再因本地 `item` 为空直接短路。
5. MetaOverlay 未匹配到内建动作时，renderer 侧回退到 `CoreBoxEvents.item.execute`，避免 `system-action-*` 等 item action 被吞掉。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `apps/core-app/src/renderer/src/views/meta/MetaOverlay.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### 文件系统动作“加入文件索引”补索引修复（复制文件场景）

**变更类型**: 缺陷修复 / 索引链路补偿

**描述**: 修复“复制文件后触发加入文件索引但搜索仍不可见”的场景。当目标文件所在目录已在 watch roots 内时，原逻辑会直接返回 `exists`，未触发该文件的补索引。现已在 `exists` 分支补充增量索引入队。

**主要变更**:
1. `addWatchPath` 在 `exists` 返回前，对“文件目标”执行 `enqueueIncrementalUpdate(path, 'add')`。
2. 新增关键日志，标记“命中已监听路径但已触发增量补索引”。
3. 新增“新增 watchPath 后的文件目标”补索引入队，降低首次可搜索延迟。
4. `SystemActionsProvider` 的 `file-index` 动作改为传递原始候选路径（文件保持文件路径），避免被提前降级成目录路径导致单文件补索引分支失效。
5. `file-index` 动作增加 start/result 日志，便于排查是否命中 `added/exists/invalid` 分支。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### Search Stats/Analytics 落盘节流与队列分层

**变更类型**: 性能优化 / 数据落盘策略收敛 / SQLite 竞争缓解

**描述**: 针对启动与高频检索阶段的 SQLite 写竞争，收敛 `usage-stats` 与 `analytics` 的持久化频率：低价值高频 `search` 统计转为内存聚合+低频批量落盘，执行类行为单独队列保障可靠性，同时提升 analytics 快照最小落盘间隔，降低写放大与锁竞争。

**主要变更**:
1. `UsageStatsQueue` 升级为分层内存聚合：`search` 与 `action(execute/cancel)` 分离计时与阈值触发。
2. `search` 队列默认 30 分钟批量落盘，`action` 队列默认 10 分钟批量落盘，并支持事件阈值提前触发。
3. 引入基于 `dbWriteScheduler` 队列深度的 `search` 采样背压，写压高时自动降采样。
4. `usage-stats.search.flush` 采用可丢弃策略；`usage-stats.action.flush` 保持不可丢弃并在失败时回灌内存队列。
5. `analytics` 快照最小落盘间隔调整为：`15m=10分钟`、`1h=20分钟`、`24h=60分钟`。
6. `query-completions.record` 接入 `dbWriteScheduler + withSqliteRetry`，执行路径统一串行写队列，减少 direct write 抢锁。
7. `analytics report queue` 的插入/重试标记/删除/清理统一走写调度器，保持数据库写入策略一致。
8. OCR 队列在写压高时跳过 `ocr.jobs.start` 中间态落库，仅保留成功/失败/重试等最终状态写入，并在终态写入时补齐 attempts。
9. `ocr:last-dispatch` 配置写入新增队列深度门控与 30 秒最小落盘间隔，高压下自动跳过非关键状态写入。
10. `ocr:last-queued` 配置写入同样启用队列深度门控与 30 秒最小落盘间隔，进一步减少入队阶段的非关键写入。
11. `ocr:last-success` 配置写入启用同级门控（队列深度 + 30 秒最小间隔 + droppable），降低高频成功场景下的附加写压力。
12. `ocr:last-failure` 仅在任务状态首次转为 `failed` 时落盘，避免失败风暴下重复覆盖写入。
13. `ocr:queue-disabled` 配置增加“语义签名”去重，重复状态（仅时间戳变化）不再重复落库。
14. `ocr.config` 的 `last-*` 与 `queue-disabled` 落盘策略收敛为统一策略表，减少分散硬编码与后续维护成本。
15. OCR 配置策略抽取为 `ocr-config-policy` 独立模块，`ocr-service` 仅消费策略解析结果，进一步降低服务文件复杂度。
16. `ocr.config` 的语义签名计算逻辑下沉到 `ocr-config-policy`，`ocr-service` 仅保留写入编排职责。
17. `ocr.config` 的“是否跳过落盘”判定也下沉到 `ocr-config-policy`，服务层仅传入运行态上下文（队列深度/上次落盘时间）。
18. `ocr.config` 写入 label 按 key 细分（如 `ocr.config.last-dispatch`），提升队列/日志观测粒度。
19. `dbWriteScheduler` 新增按 label 的轻量聚合监控，并按分钟输出 TopN（含 enqueued/executed/failed/dropped/avgWait/maxWait），便于压测期定位写压热点。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/search-engine/usage-stats-queue.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/analytics/storage/db-store.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/query-completion-service.ts`
- `apps/core-app/src/main/modules/analytics/report-queue-store.ts`
- `apps/core-app/src/main/db/db-write-scheduler.ts`
- `apps/core-app/src/main/modules/ocr/ocr-config-policy.ts`
- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### OmniPanel 搜索增强（Fuse + 拼音）与底部选中文本提示收敛

**变更类型**: 功能增强 / 交互收敛

**描述**: OmniPanel 搜索切换为 `Fuse.js` 模糊检索并补齐拼音能力（全拼/首字母）；同时移除“复制内容大卡片”的主展示路径，改为底部统一提示“已选中 xxx”。

**主要变更**:
1. `filterOmniPanelFeatures` 接入 `Fuse.js`，支持英文模糊匹配（如 `serch` -> `search`）。
2. 标题、副标题、插件名补齐拼音 token（全拼 + 首字母），支持拼音检索。
3. 面板底部固定提示选中文本摘要，未选中时显示 `已选中 0 字符`。
4. 补充 OmniPanel 过滤单测，覆盖拼音与英文模糊检索场景。

**修改文件**:
- `apps/core-app/package.json`
- `apps/core-app/src/renderer/src/views/omni-panel/filter-features.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/filter-features.test.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### OmniPanel 窗口宽度继续收窄（保持三列网格）

**变更类型**: 交互优化 / 视觉密度调整

**描述**: 进一步收窄 OmniPanel 浮层宽度，减少遮挡；保持“一排最多三个”网格展示与键盘导航列数不变。

**主要变更**:
1. `OmniPanelWindowOption.width` 从 `460` 调整为 `400`。
2. `OmniPanelWindowOption.minWidth` 从 `380` 调整为 `340`。
3. Grid 列数仍保持 3 列，不改变 Feature 排布与交互路径。

**修改文件**:
- `apps/core-app/src/main/config/default.ts`
- `docs/plan-prd/01-project/CHANGES.md`

## 2026-03-01

### OmniPanel 浮层化与方形 Grid 卡片

**变更类型**: 交互优化 / 窗口行为调整 / UI 收敛

**描述**: OmniPanel 对齐 CoreBox 的浮层窗口语义，展示时不再抢焦点；同时移除头部关闭按钮，Feature 卡片改为方形 Grid 形态。

**主要变更**:
1. OmniPanel 窗口切换为 `panel` 类型，并设置 `alwaysOnTop(floating)` 与 `visibleOnAllWorkspaces`。
2. 唤起时改用 `showInactive()`，避免干扰当前活跃窗口；保持失焦自动隐藏。
3. Header 移除关闭按钮，仅保留标题信息。
4. Action 区升级为三列 Grid，卡片统一 `1:1` 方形样式并改为“图标居中 + 底部标题”。
5. 移除面板顶部标题块，区块间补充分割线（divider）提高视觉层次。

**修改文件**:
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelHeader.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelActionItem.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelActionList.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelContextCard.vue`
- `docs/plan-prd/01-project/CHANGES.md`

### OmniPanel 窗口进一步收敛（更小体积 + 失焦自动隐藏）

**变更类型**: 交互优化 / 窗口行为调整

**描述**: OmniPanel 再次收敛为更小窗口体积，并移除对 macOS 红绿灯样式/位置的控制；同时新增失焦自动隐藏，强化临时面板的使用预期。

**主要变更**:
1. `OmniPanelWindowOption` 尺寸下调为 `460x320`，最小尺寸调整为 `380x260`。
2. 移除 OmniPanel 的 `titleBarStyle/trafficLightPosition/titleBarOverlay` 配置，不再主动控制红绿灯。
3. OmniPanel 窗口新增 `blur` 事件处理，失去焦点后自动隐藏。

**修改文件**:
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### OmniPanel Grid 展示与快捷键按住触发收敛

**变更类型**: 交互优化 / 触发行为修正

**描述**: OmniPanel 的 Feature 区域从 list 改为双列 grid 展示；同时快捷键触发改为“按住达到阈值再触发”，避免短按或松手瞬间误触。

**主要变更**:
1. Feature 列表改为 grid 布局，并补齐 `←/→` 导航，`↑/↓` 按列跳行。
2. 主进程新增快捷键按住阈值判定（500ms），支持按住触发与松手回调兼容窗口。
3. 短按未达到阈值不触发 OmniPanel，保持鼠标右键长按路径不变。

**修改文件**:
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/interaction.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/interaction.test.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelActionList.vue`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### OmniPanel 紧凑化样式与窗口策略收敛

**变更类型**: 交互优化 / 视觉一致性 / 窗口行为调整

**描述**: OmniPanel 调整为更紧凑的窗口与布局密度，统一改用主题变量渲染，减少硬编码深色样式；同时收敛窗口行为为固定尺寸+隐藏任务栏，强化“临时面板”使用语义。

**主要变更**:
1. `OmniPanelWindowOption` 调整为更小尺寸、不可缩放、`skipTaskbar=true`，匹配快速调用场景。
2. 渲染层主容器与子组件（Header/Context/Search/Action）统一采用 `tx` 主题变量，降低主题割裂。
3. Action 列表增加最大高度与滚动，避免大量 Feature 撑高窗口。

**修改文件**:
- `apps/core-app/src/main/config/default.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelActionItem.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelActionList.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelContextCard.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelHeader.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/OmniPanelSearchBar.vue`

### macOS App 名称扫描补强（首扫与本地化 plist 解析）

**变更类型**: 稳定性优化 / 本地化体验修复

**描述**: AppProvider 在 macOS 场景新增“首次 mdls 扫描全量触发”策略，并将本地化 `InfoPlist.strings` 读取切换为 `simple-plist` 解析，提升首轮应用名称本地化命中率并降低格式兼容问题。

**主要变更**:
1. 启动阶段当 `lastLocale` 为空时视为首次 mdls 扫描，强制全量扫描，避免首轮英文回退名称长期残留。
2. `darwin` 扫描器读取 `InfoPlist.strings` 改用 `simple-plist`，兼容二进制/文本 plist。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/darwin.ts`

### OmniPanel 去除 Feature 显式启停展示（默认可执行）

**变更类型**: 交互收敛 / 执行策略调整

**描述**: OmniPanel 面板内移除 Feature 的“启用/停用”显式展示与切换入口；执行链路不再受 `enabled` 状态阻断，避免历史配置中停用项导致可见但不可执行。

**主要变更**:
1. 渲染层移除 Feature 启停按钮与状态文案，只保留执行与排序操作。
2. 主进程执行分发移除 `FEATURE_DISABLED` 门控，统一按可用性（插件存在、feature 可执行）判定。

**修改文件**:
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `docs/plan-prd/01-project/CHANGES.md`

### OmniPanel 40 点推进（Wave-1~Wave-4 首批落地）

**变更类型**: 功能完善 / 可测试性提升 / 协议收敛

**描述**: 面向 OmniPanel 40 点推进计划，完成首批核心能力收敛：渲染层组件拆分、键盘交互、过滤纯函数、主进程调度与自动装载稳定性测试，并建立后续台账与汇总文档基础。

**主要变更**:
1. 渲染层拆分为 `OmniPanelHeader/ContextCard/SearchBar/ActionItem/ActionList`，主容器聚焦流程编排。
2. 新增交互能力：`↑/↓` 聚焦、`Enter` 执行、`Cmd/Ctrl+F` 聚焦搜索、`Esc` 关闭并恢复焦点。
3. 过滤逻辑抽为 `filterOmniPanelFeatures` 纯函数；焦点/导航抽为 `interaction` 工具并补单测。
4. 主进程导出 `OmniPanelModule` 以便单测覆盖：registry 初始化、执行分发、自动装载优先级与去重、最小 smoke。

**修改文件**:
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
- `apps/core-app/src/renderer/src/views/omni-panel/components/*`
- `apps/core-app/src/renderer/src/views/omni-panel/filter-features.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/interaction.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/modules/omni-panel/index.test.ts`

## 2026-03-15

### 修复: Pilot 图片发送语义统一为单条 user 多模态 content

**变更类型**: Bug 修复

**描述**: 明确并固化 `text + image` 发送语义为“同一条 user 消息内多内容块”，避免拆分为两条 user turn 导致上下文丢失。

**主要变更**:
1. `ThInput` 保持单 turn 发送，图片上传保留 `dataUrl` 到 `inputMeta.data`，供后端优先内联。
2. Quota 与 Pilot Stream 两条后端链路统一内联阈值（单图 5MB / 总量 12MB），并优先使用 `dataUrl`。
3. 补充回归测试，覆盖：
   - 同 turn 的 `input_text + input_image` 组包断言
   - 仅图片场景可消费文本块断言
   - `dataUrl > previewUrl > ref` 优先级断言
   - “拆两条 user turn 会丢文本”风险断言

**影响**: 多模态识别链路更稳定，减少“模型只看到 URL 文本”导致的识别失败。

---

## 2026-03-15

### 修复: Pilot 旧 QuotaGPTView 对话链路消息完整性与图片输入兼容

**变更类型**: 对话链路修复 / 兼容性增强

**描述**:
- 修复旧 `aigc/executor` 链路中消息重组导致的上下文丢失风险，改为按原顺序无损序列化发送。
- 服务端由“仅提取最后一条用户文本”升级为“提取最后用户轮次（文本 + 附件）”。
- 新增图片分级策略：小图（<=256KB）内联 `dataUrl`，并增加单次内联总量上限（1MB）。
- 补齐旧链路 `this-title` 适配：显式支持 `generateTitle`，标题模型跟随当前渠道模型并提供回退标题。

**修改文件**:
- `apps/pilot/app/composables/api/base/v1/aigc/completion/index.ts`
- `apps/pilot/server/utils/quota-history-codec.ts`
- `apps/pilot/server/api/aigc/executor.post.ts`
- `apps/pilot/server/utils/__tests__/quota-history-codec.test.ts`

**影响**:
- 旧 QuotaGPTView 连续对话稳定性提升，减少“历史看起来被合并/覆盖”现象。
- 图片上传后在渠道无法直接拉取 URL 的场景下可优先通过内联小图提升可读性。

---

## 2026-03-08

### 新增: Pilot 双栏会话体验与 AI 标题总结

**变更类型**: 功能增强

**描述**: Pilot 聊天页升级为 ChatGPT 风格双栏交互，支持会话删除与 AI 自动命名标题。

**主要变更**:
1. **会话侧栏体验升级**:
   - 左侧会话列表支持直接删除会话（含消息/附件/trace 全量清理）
   - 会话卡片展示 AI 总结标题、状态、更新时间与 seq 信息
   - 新建会话后自动进入当前会话上下文

2. **聊天区布局重构**:
   - 页面改为固定高度双栏布局，整体页面不滚动
   - 中间聊天区撑满可视高度，输入区固定底部
   - 消息区与 Trace 区域改为内部独立滚动

3. **Trace 抽屉行为调整**:
   - Trace 改为按钮触发的右侧抽屉展开/收起
   - 桌面端右侧并排展开，移动端改为覆盖抽屉

4. **会话标题 AI 总结能力**:
   - 新增 `POST /api/pilot/chat/sessions/:sessionId/title` 接口
   - 基于会话消息调用模型总结短标题并持久化到会话表
   - 无模型可用时回退为首条用户消息摘要

5. **存储能力扩展**:
   - `pilot_chat_sessions` 新增 `title` 字段并兼容老表结构
   - Runtime Store 新增 `setSessionTitle` / `deleteSession` 方法

**修改文件**:
- `apps/pilot/app/pages/index.vue`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/index.delete.ts`
- `apps/pilot/server/api/pilot/chat/sessions/[sessionId]/title.post.ts`
- `packages/tuff-intelligence/src/store/store-adapter.ts`
- `packages/tuff-intelligence/src/store/d1-runtime-store.ts`

**影响**:
- Pilot 对话管理更接近主流 AI 聊天产品交互
- 会话可读性与检索效率提升（标题化）
- 会话清理与 trace 查看路径更清晰

---

### 修复: CoreBox 手动文件索引入库与附件执行后自动清空

**变更类型**: Bug 修复

**描述**: 修复 `file-index` 对非白名单扩展名（如 `.jar`）触发后不入库的问题，并在 CoreBox 执行携带附件的动作后自动清空附件状态，减少重复手动清理。

**主要修复**:
1. **手动文件索引补偿**:
   - `addWatchPath` 对文件目标入队时标记 `manual`。
   - 增量入库 `buildFileRecord` 新增 `manualForce` 分支：绕过扩展名白名单与系统路径过滤，仅保留最小黑名单扩展过滤。
   - 对手动补偿路径新增 console/log 输出，明确 `accepted(manual-force)` 与 `filtered(manual-blacklist)` 结果。

2. **系统动作日志语义修正**:
   - `file-index result` 日志改为 `{ requestPath, result }`，避免 `path` 字段被合并覆盖导致误判。

3. **附件执行后自动清空**:
   - `useSearch.handleExecute` 在执行携带 `files/image/html` 输入后自动清空附件状态。
   - 文件模式附件执行后重置 `boxOptions.mode/file`。
   - 剪贴板附件执行后写入 `lastClearedTimestamp` 并清空 `last/detectedAt`，避免同一条目被立即回填。

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`

**影响**:
- 复制/拖拽后触发“加入文件索引”可覆盖更多扩展名场景（至少保证路径级可搜索）
- CoreBox 附件执行链路体验更符合“执行即消费”预期
- `file-index` 调试日志更容易定位请求路径与结果路径

---

## 2026-03-01

### 修复: CoreBox Action 链路与插件 DevTools 事件断链

**变更类型**: Bug 修复

**描述**: 修复了 CoreBox MetaOverlay 内置动作在主渲染链路上的事件断链问题，并补齐插件 DevTools 的 legacy 事件处理器。

**主要修复**:
1. **MetaOverlay 内置动作统一下发**:
   - 将 `toggle-pin / copy-title / reveal-in-finder / flow-transfer` 统一改为 `meta-overlay:item-action` 下发到 renderer 执行
   - 修复 `core-box:toggle-pin` 等仅发送无消费导致的动作失效

2. **Renderer Action 执行通道补齐**:
   - `useActionPanel` 新增对 `meta-overlay:item-action` 的监听
   - 复用现有 action 执行逻辑，确保 pin/copy/reveal/flow 与 ActionPanel 行为一致

3. **插件 DevTools legacy 事件补齐**:
   - 在 `CommonChannel` 新增 `plugin:open-devtools` 处理器并返回打开结果
   - 同步补齐 `plugin:explorer` 与 `reload-plugin` legacy 处理器
   - 前端打开 DevTools 时改为校验返回值，失败时明确提示

4. **Clipboard 清空语义与 SDK 反馈一致性修复**:
   - 修复 `ClipboardEvents.clearHistory` 仅清理最近 1 小时记录的问题，改为复用 `cleanupHistory({ type: 'all' })` 全量清理
   - `TouchSDK.openPluginDevTools` 改为校验 `plugin:open-devtools` 返回值，失败时抛出明确错误，避免 SDK 调用侧静默失败

**修改文件**:
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`
- `apps/core-app/src/main/modules/clipboard.ts`
- `packages/utils/renderer/touch-sdk/index.ts`

**影响**:
- CoreBox 快捷动作执行链路恢复可用
- 插件 DevTools 打开失败从“静默失败”改为“可感知失败”
- 插件侧“清空历史”语义与文案、SDK 注释保持一致（真正全量清空）

---
