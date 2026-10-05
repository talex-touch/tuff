# 应急链路端到端：恢复码、会话列表与吊销

父任务：`10-02-nexus-admin-console-overhaul`（D7：应急链路补到端到端可用）。依赖：`10-02-nexus-admin-risk-console`（风控页结构与 `useAdminStepUp`）。`design.md` / `implement.md` 在开工前补写；本任务涉及安全敏感的凭据发放，合入前跑一次安全评审。

## Goal

应急（break-glass）链路的存储层齐全，但链路走不通：没有接口能生成恢复码，所以验证一步永远失败；没有会话列表，吊销只能手填会话 id；吊销后已签发的 token 仍可用到过期。补齐这三处，让「发起 → passkey + 恢复码验证 → 签发 10 分钟 token → 用 token 解封 → 必要时吊销」完整可用。

## Background

- 流程：`POST /api/admin/emergency/init`（受 `adminControl.breakglassEnabled` 控制，关闭时 403，`init.post.ts`）→ `verify`（管理员 passkey 断言 + 一次性恢复码，`verify.post.ts:120-175`）→ `issue`（break-glass JWT，有效期 10 分钟，`issue.post.ts:15`）→ 以 Bearer 调用 `risk/actor.unblock`。`/admin/emergency`（`layout: false`、不要求登录）是发起端页面。
- 存储（`server/utils/adminEmergencyStore.ts`）：`createAdminRecoveryCode`（加盐哈希存储，`:523`，**全仓无调用方**）、`verifyAndConsumeAdminRecoveryCode`（`:548`，校验后作废）、`revokeAdminEmergencySession`（只改会话状态，`:431-446`）、`createEmergencyJti` / `consumeEmergencyJti`（一次性 JTI，`:448-484`）。`consumeEmergencyJti` 与 JWT 校验都不看会话状态，所以吊销不影响已签发 token。
- 现有 `POST /api/admin/emergency/revoke`：风控开关 + 控制面 A 通道 + step-up；会话不存在也返回 success。
- 应急页（611 行）全英文、原生 `<input>` / `<button>` / `<textarea>`、写死暗色（`emergency.vue:440-592`）。
- 生产：`riskControl` 关闭；`wrangler.toml:28-31` 把 break-glass 等控制面开关设为 `"false"`，但这些值在构建时读取（`nuxt.config.ts:360-364`），线上实际值以构建环境为准。

## Requirements

- **R1 恢复码**：
  - `POST /api/admin/emergency/recovery-codes`：仅本人（已登录管理员，控制面 A 通道 + passkey step-up）；一次生成一批（数量在 design 阶段定，建议 10）高熵一次性码，**只在本次响应中返回明文**，同时作废该管理员所有未使用的旧码；写 breakglass 审计（不含明文）；限流。
  - `GET /api/admin/emergency/recovery-codes/status`：返回剩余未用数量、生成时间，不返回任何码或哈希。
  - 页面：在 `/admin/risk` 的「应急」分区显示状态，「生成 / 轮换」需二次确认；生成后一次性展示（可复制、可下载为文本），关闭前要求勾选「已妥善保存」。
- **R2 会话列表与吊销**：
  - `GET /api/admin/emergency/sessions`：最近的应急会话（id、状态、创建 / 验证 / 吊销时间、失败次数、关联管理员〔验证后〕；IP 与设备只显示哈希前缀），控制面鉴权，分页。
  - 吊销：沿用 `POST /api/admin/emergency/revoke`，语义收紧为「同时作废该会话所有未使用的 JTI」（store 新增按会话作废 JTI），使已签发、未使用的 token 立即失效；会话不存在时返回 404 而非 success（若影响现有调用方，design 阶段评估）。
  - 页面：会话列表 + 吊销（`AdminConfirmDialog`，要求输入确认文本）。
- **R3 应急页迁移**：`/admin/emergency` 保持 `layout: false`、无需登录；汉化（新键进 route chunk，`defineI18nRoute(false)` 现缺失需补）；原生控件换 TuffEx 组件；保留固定暗色的视觉意图但改用 `--tx-*` token。
- **R4 测试与评审**：恢复码生成 / 作废、会话列表、吊销后 JTI 失效的 API 测试；完整链路的集成测试（init → verify → issue → 解封 → 吊销后 token 被拒）；合入前跑一次安全评审（凭据只出现一次、日志与审计不含明文、限流、鉴权通道正确）。

## Acceptance Criteria

- [ ] 开启 `riskControl` + break-glass、配置非占位 `ADMIN_CONTROL_PLANE_PEPPER` 的本地实例上，用 CDP 虚拟认证器完整走通：生成恢复码 → 应急页发起 → passkey + 恢复码验证 → 签发 token → 解封一个 IP → 吊销会话后同一 token 被拒（401 / 403）。
- [ ] 恢复码明文只出现在生成响应里：数据库、日志、审计中都查不到明文（附检查方法）。
- [ ] 轮换后旧码验证失败；用过的码再次使用失败。
- [ ] 开关关闭时，相关接口 404、页面隐藏。
- [ ] 安全评审结论记录在 `research/`，问题已处理。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`。

## Out of Scope

- 在生产开启开关与配置 pepper（老板操作）；break-glass B 通道与 OOB C 通道的改动。
