# 用户与订阅页迁移：用户管理、激活码

父任务：`10-02-nexus-admin-console-overhaul`。依赖：`10-02-nexus-admin-console-kit` 合入且组合件 API 已冻结。`design.md` / `implement.md` 在开工前按冻结后的 API 补写。

## Goal

把用户管理与激活码两页迁到统一骨架，修掉基线里看到的身份展示与折行问题。

## Requirements

- **R1 用户管理 `/admin/users`**（`users.vue` 926 行）：
  - 列表：`AdminFilterBar`（关键词、状态、角色）+ `AdminTable` + 分页（替换自写上一页 / 下一页，`:615-625`），筛选与页码进 URL；用户列用 `AdminIdentity`（修首字母取到方括号的问题，`:208-216,567-572`）；创建时间用 `tableDateTime`。
  - 抽屉五种模式（详情 / 编辑 / 订阅 / 积分 / 删除，`:628-924`）：详情与订阅信息用 `TxDescriptions`（替换手写 `<dl>`，`:645-702,750-779`）；删除走 `AdminConfirmDialog`（要求输入邮箱确认，沿用现有语义）。
  - 积分抽屉补请求代次防竞态（当前订阅抽屉有、积分抽屉没有，`:415-435`；spec `quality-guidelines.md:118` 要求后台抽屉响应只属于当前打开的身份与请求代次）。
  - 硬编码 `ID:`（`:640`）、`tokens`（`:870`）改为 i18n 键；`resolveErrorMessage`（`:82-86`）改用公共 `resolveAdminErrorMessage`。
- **R2 激活码 `/admin/subscriptions`**（`subscriptions.vue` 380 行）：
  - 列表迁到组合件；1440px 视口下不横向溢出（当前列宽合计 1180px，`:94-103`）；「操作」列在没有可执行操作时不再整列空白（基线截图）；复制改用 `TxCopyButton`。
  - 生成激活码的弹层表单使用带标签字段；吊销走 `AdminConfirmDialog`。
- **R3 管理员扣减积分不得越过下限（2026-10-03 复现成立，老板决定在本任务修）**：
  - 缺陷：对处于套餐基础额度的用户做「减少」，接口 200、流水与管理审计都记了扣减，余额却不变；跨过基础额度时只扣到基础额度为止。原因是每个读写入口的 `ensureBalance`（`creditsStore.ts:711-714`）都会把额度抬回套餐基础额度，同一请求返回摘要时就被抬回（复现见 `research/credits-subtract-repro.md`）。
  - 规则（老板决定）：套餐基础额度是每月下限，管理员不能扣破它。扣减后额度必须同时不低于套餐基础额度（含 FREE 加赠后的额度）和本月已用额度；超过可扣上限的扣减整笔拒绝（400），不写余额、流水与审计。增加积分不受影响。
  - 抽屉在「减少」时显示可扣上限并在提交前拦截；服务端拒绝时显示本地化提示与最新上限。
  - 不追溯线上已存在的对不上的流水。

## Acceptance Criteria

- [ ] 两页逐条满足父任务 design §4；ego 截图存 `research/`，与基线对照（「[R」「[江」首字母、日期折行、空操作列均消失）。
- [ ] 积分抽屉：快速切换两个用户，后到的旧响应不覆盖当前用户（测试覆盖）。
- [x] R3 复现结论（复现步骤、实际余额、流水与审计记录）写入 `research/` 并已报告。
- [ ] R3 修复：基础额度用户「减少」→ 400（`errorCode: CREDITS_DEDUCT_LIMIT`，带可扣上限），余额、流水、审计都不变；高于基础额度时在上限内扣减成功，随后读取的余额等于扣减后的值（不再被抬回）；跨过下限的扣减整笔拒绝。服务端测试用真实 SQL 语义覆盖这几条，并做负控（去掉下限检查后测试失败）；在本地 dev server 重跑复现脚本，结果补进 `research/credits-subtract-repro.md`。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`。

## Out of Scope

- 积分全局控制台（`09-23-nexus-admin-console-gaps`）。
- 订阅与积分的业务规则调整（R3 只让「基础额度是每月下限」这条既有规则在管理员扣减上也成立，不改规则本身）。
- 线上历史流水的对账与追溯。
