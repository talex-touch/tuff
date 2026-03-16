# 变更日志

> 更新时间: 2026-03-16
> 说明: 主文件仅保留近 30 天（2026-02-23 ~ 2026-03-16）详细记录；更早历史已按月归档。

## 阅读方式

- 当前主线：`2.4.9-beta.4` 基线下，下一动作统一为 `Nexus 设备授权风控`。
- 历史主线：`2.4.8 OmniPanel Gate`、`v2.4.7 Gate A/B/C/D/E` 均已收口（historical）。
- 旧记录入口：见文末“历史索引导航”。

---

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
