# 风控控制面迁移：IP 封禁列表与解封、手动封禁迁入

父任务：`10-02-nexus-admin-console-overhaul`（D7）。依赖：`10-02-nexus-admin-console-kit`（组合件 API 已冻结）与 `10-02-nexus-admin-migrate-ai-services`（AI 概览已迁移；本任务把其中的手动封禁区块迁走）。`design.md` / `implement.md` 在开工前补写。

## Goal

`/admin/risk` 现在「只写不读」且几乎全英文：能按 IP 解封却看不到哪些 IP 被封，自动封禁没有任何列表界面，手动封禁又放在 AI 概览里。把风控相关能力集中到 `/admin/risk`，迁到统一骨架并汉化，用浏览器内 passkey 二次验证替换手动粘贴明文 token。

## Background

- 风控开关：`server/middleware/feature-gates.ts:4-10` 把 `/api/admin/{emergency,risk,oob/risk,telemetry/ip-blocks}` 与 `/api/dashboard/intelligence/ip-bans` 归为风控路径，开关关闭时 404；页面侧 `middleware/feature-gates.global.ts:13-22` 把 `/admin/risk*` 重定向到 `/admin/updates`。**生产当前关闭**（父任务 D7）。
- 控制面守卫 `requireAdminControlPlaneAuth`（`server/utils/adminControlPlaneGuard.ts:298-335`）：会话通道默认需一次性 passkey step-up（`X-Login-Token`）；写操作限流；双人复核（`server/utils/adminRiskActions.ts:67-86`）会返回 202 + 待确认操作 id。
- 现有 `risk.vue`（591 行）四张卡：模式切换、按 actor 解封、永久封禁、双人复核确认（`:393-519`），step-up token 明文 `type="text"` 手填（`:376-382`），文案硬编码英文（`:76-108,238-299,370-588`）。
- 自动封禁：`GET /api/admin/telemetry/ip-blocks`（只返回仍在封禁期内的条目，`limit` 1–200，无分页 / 搜索）；兼容解封路由 `POST …/ip-blocks/unblock`。`risk/actor.unblock` 支持多个 actor、填写原因、逐个返回结果、支持双人复核。解封不清违规计数（下次封禁时长仍按次数指数增长，`ipSecurityStore.ts:285-288`）。
- 手动封禁（`intelligence_ip_bans`，目前只对文档助手生效）在 `IntelligenceOverviewPanel.vue` 中可增删启停（`:145,171,203,230`），step-up 输入在 `:84-92`。

## Requirements

- **R1 `useAdminStepUp()`**：复用 `pages/team/join.vue:125-157` 的流程（`/api/passkeys/options` → `navigator.credentials.get` → `/api/passkeys/verify`，10 分钟有效，仅 UV 通过才算 step-up），缓存未过期的 token，在控制面请求上自动带 `X-Login-Token`；token 过期或 403 时重新发起。替换风控页与手动封禁的明文 token 输入（`#12` 复用）。
- **R2 页面结构**：`/admin/risk` 分区（`?section=`）：
  - 自动封禁：列表（IP、封禁至、原因、违规次数、更新时间），多选解封（走 `risk/actor.unblock`，必填原因，逐条显示结果；返回 202 时显示待确认操作 id 并引导另一位管理员确认）；说明解封不清违规计数；
  - 手动封禁：从 AI 概览整体迁入（增、删、启停），并从 `IntelligenceOverviewPanel.vue` 删除该区块与「风险控制未启用」提示；
  - 防御模式：模式切换（沿用现有接口；切到 NORMAL 需要双人复核时给出提示）；
  - 永久封禁与双人复核确认：沿用现有接口，迁到组合件。
  所有破坏性 / 不可逆操作走 `AdminConfirmDialog`。
- **R3 汉化**：页面全部文案进 `dashboard.sections.risk.*`（中英），`risk.vue` 必须继续满足 `i18n-key-existence.test.ts:515-520` 的零违规。
- **R4 视觉统一**：去掉另起的卡片底色族（`rounded-xl border … dark:bg-black/10`，`:374,393,423,455,486`），用 `AdminSection`。
- **R5 本地验证环境**：需要 `NUXT_PUBLIC_RISK_CONTROL_ENABLED=true` 的本地实例；passkey 环节用 CDP 虚拟认证器或请老板手动完成一次。开工前与老板确认用哪个 dev server 实例。

## Acceptance Criteria

- [ ] 开关开启的本地实例上：自动封禁列表显示本地造的封禁 IP；多选解封后列表更新，审计（breakglass 表）有记录；手动封禁在风控页可增删启停，AI 概览不再出现该区块；step-up 通过浏览器 passkey 完成，页面上不再有明文 token 输入框。
- [ ] 开关关闭时：`/admin/risk` 重定向、rail 不显示风控入口、AI 概览没有残留提示。
- [ ] 页面逐条满足父任务 design §4；ego 截图存 `research/`。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`；`test/middleware/feature-gates-route.test.ts` 通过。

## Out of Scope

- 应急链路（`10-02-nexus-admin-emergency-chain`）；在生产开启风控开关。
- 新增「读取当前防御模式」「列出待确认双人复核操作」「breakglass 审计读取」接口（`research/orphan-api-contracts.md` §7-4 列出的后端缺口）：design 阶段评估是否为完成 R2 所必需，必需则向老板确认后纳入。
