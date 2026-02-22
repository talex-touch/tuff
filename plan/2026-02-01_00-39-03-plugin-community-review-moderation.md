---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: Nexus 插件社区审核与评论前端入口规划
complexity: medium
planning_method: builtin
created_at: 2026-02-01T00:39:16+0800
---

# Plan: Nexus 插件社区审核与评论前端入口

🎯 任务概述
在 Nexus 插件市场中补齐评论审核与管理入口，并完善用户端评论入口与展示，形成可用的社区闭环。目标是让管理员能在 Dashboard 中审核评论，用户端可提交评论并在审核后展示。

📋 执行计划
1. 现状核对与对齐：确认评论/评分相关 API、store 与类型已经存在并可用；若字段返回需要脱敏或缺少分页信息，则在接口层补齐。
2. 管理端入口落地：在 Dashboard Admin 导航中新增“评论审核”入口，创建 `apps/nexus/app/pages/dashboard/admin/reviews.vue` 页面骨架与基础权限校验。
3. 审核列表实现：调用 `/api/admin/market/reviews/pending` 拉取待审评论列表，展示插件信息、评分、内容、作者与时间，提供 approve/reject 操作并联动刷新。
4. 用户端入口完善：在市场详情页保留“写评论”入口与提交表单，展示评论状态（pending/rejected），确保作者能看见自己待审内容。
5. 体验与状态处理：补齐空态、加载态、错误提示与 toast 文案；必要时加入分页或“加载更多”。
6. 验证与回归：手动流程验证“提交评论 → 待审 → 管理员通过/拒绝 → 市场展示”；校验权限与匿名访问行为。

⚠️ 风险与注意事项
- 管理端权限校验依赖账号系统与 admin 角色元数据，需保证环境一致。
- D1 未绑定时会降级到 `useStorage()`，审核与分页表现可能与线上略有差异。
- 评论内容为用户生成内容，需要注意 XSS 防护与展示时的转义策略。

📎 参考
- `apps/nexus/server/utils/pluginReviewStore.ts`
- `apps/nexus/server/api/market/plugins/[slug]/reviews.get.ts`
- `apps/nexus/server/api/market/plugins/[slug]/reviews.post.ts`
- `apps/nexus/server/api/admin/market/reviews/pending.get.ts`
- `apps/nexus/server/api/admin/market/reviews/[id]/status.patch.ts`
- `apps/nexus/app/pages/market.vue`
