# Nexus 后台补齐：积分控制台 `/admin/credits`

父任务：`10-02-nexus-admin-console-overhaul`（2026-10-02 起；原父任务 `09-23-nexus-docs-perf-cms-remediation`）。依赖：`10-02-nexus-admin-console-kit` 合入且组合件 API 已冻结。`design.md` / `implement.md` 为 09-23 旧版、已过期，开工前按冻结后的组合件 API 重写。

## 范围变更记录

2026-09-23 原 PRD 的六条需求在 2026-10-02 并入后台全面重构后分配如下（原文见 git 历史）：

| 原需求 | 去向 |
|---|---|
| R1 Credits 控制台页 | **本任务**（下文 R1–R4） |
| R2 插件审核页 | `10-02-nexus-admin-plugin-moderation`；原计划新建的版本级状态路由**不需要**——`PATCH /api/dashboard/plugins/:id/versions/:versionId` 自 2025-11 已存在（`server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts`） |
| R3 发布证据页 | `10-02-nexus-admin-release-evidence`（并按 D8 接 CI 写入） |
| R4 `governance.vue` 拆分 | `10-02-nexus-admin-migrate-governance` |
| R5 images 列表分页 | `10-02-nexus-admin-migrate-content` |
| R6 导航整洁 | 各子任务各自调整 `AdminNav`；`/admin/codes` 保持重定向且不进菜单 |

原验收依赖的 `AdminNav.test.ts`、`admin-page-layout-contracts.test.ts`、`doc-comments.vue` 已在 10-01（`5e6579e05`）删除，不再引用。

## Goal

把服务端已有、却没有界面的全局积分能力（流水、用量、计价）做成后台页面，替换 `credits.vue` 的重定向壳（`app/pages/admin/credits.vue:2-4`）。

## Requirements

- **R1 页面**：`/admin/credits`，「用户与订阅」组新增条目「积分」（`dashboard.sections.menu.credits`）；三个分区经 `?section=ledger|usage|pricing` 切换。删除 `AdminNav.vue:240-241` 把 `/admin/credits` 高亮为 `users` 的映射，同步 `AdminNav.routing.test.ts:162-165,204`。
- **R2 流水**（`GET /api/admin/credits/ledger`，`page/limit/q`）：
  - 后端补齐：当前只查 `scope='team'`（`server/utils/creditsStore.ts:1958`），管理员调额、验证加赠、每日签到（`scope='user'`，`:1071-1072,869-875,988-994`）看不到。新增 `scope` 参数（`all | team | user`，默认 `all`）与按原因、用户 id 过滤；修正组织团队行 `userId` 与 `userEmail` 不一致（`:1972-2001`）。
  - 表格：时间、用户（`AdminIdentity`）、范围、原因、变动额、关联能力；行点击看详情（metadata）。
- **R3 用量**（`GET /api/admin/credits/usage`）：后端把 `month` 参数透传给 store（store 已支持，`creditsStore.ts:1879,1884`，handler 未传，`usage.get.ts:15-19`）；页面提供月份选择，表格显示用户、额度、已用、占比，按已用降序。
- **R4 计价**（`GET / PATCH /api/admin/credits/pricing`）：
  - 规则表：能力、`creditsPerUnit`、`minCredits`、`reserveMultiplier`、`upstreamCostUsdPerUnit`、`active`、更新时间；编辑走抽屉表单，校验与 `pricing.patch.ts:13-68` 一致（不能改单位、不能新建能力）。
  - 保存前 `AdminConfirmDialog` 显示「旧值 → 新值」，并说明改价即时影响所有扣费；把 `active` 设为 false 时额外警告该能力会对所有人返回 503 `CAPABILITY_DISABLED`（`creditPricingStore.ts:464-478`）。
  - 后端：审计元数据补记旧值与 `upstreamCostUsdPerUnit`（当前只记新值，`pricing.patch.ts:74-85`）。
  - 已知副作用：`GET pricing` 会补种缺失能力行并重置未改过的旧种子行（`creditPricingStore.ts:355-396`），页面不额外触发重复 GET。
- **R5 联动**：计价分区提供「查看改价记录」，深链到 `/admin/audits?action=credits.pricing.update`。

## Acceptance Criteria

- [ ] 页面逐条满足父任务 design §4；ego 截图（三个分区 × 1280 / 1920 × 亮 / 暗 × 中 / 英）存 `research/`。
- [ ] 本地给某用户调额后，全局流水（`scope=all`）能看到这条 `scope='user'` 记录；按 `team` / `user` 过滤结果正确。
- [ ] 切换月份后用量数据随之变化（本地造两个月的数据验证）。
- [ ] 修改一条计价后 `GET pricing` 回读一致；管理操作审计里该记录的 metadata 含旧值与新值。
- [ ] 后端新参数有 API 测试；`ledger` / `usage` 当前全仓库无调用方（`research/orphan-api-contracts.md` §2.1，扫描带正控），`scope` 默认改为 `all` 不影响现有客户端。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`。

## Out of Scope

- 用户维度积分调整（已在 `/admin/users` 抽屉）；积分业务规则与价目调整本身。
- `research/orphan-api-contracts.md` §2.2 的「减少被抬回」可疑缺陷（由 `10-02-nexus-admin-migrate-accounts` 复现并报告）。
