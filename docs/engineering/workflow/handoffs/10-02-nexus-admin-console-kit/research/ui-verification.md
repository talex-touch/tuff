# UI 验收（主会话，ego，2026-10-03）

- 环境：worktree `~/Workspace/Worktrees/talex-touch-admin-kit`（分支 `task/feat/nexus-admin-console-kit`，基于 `origin/stage` `573b18338` + 未提交改动），dev server `127.0.0.1:3203`；本地 D1 为主检出开发库的一致快照（14 个用户 / 45 条审计，含长邮箱管理员与演示数据），管理员 `ui-audit-bot@local.test`、普通用户 `ui-audit-user@local.test`（均用 `tuff-dev-secret` 签发）；TaskSpace 187。
- `/admin/audits` 5 种组合（zh 暗 / zh 亮 / en 暗 @1273；zh 暗 / en 亮 @1920）：标题「管理操作审计」/「Admin Action Audits」；20 行；表格横向溢出 0；多行单元格 0；挤压列 0；重复邮箱 0；摘要 JSON 0；时间全部 `YYYY-MM-DD HH:mm`；列宽 148 / 220 / 150 / 220 / 自适应（1273 下摘要 245px，1920 下 876px）；底部「共 45 条」/「45 in total」+ 分页 + 每页条数。
- URL `?action=activation_code.generate&limit=50` 刷新后状态恢复（6 行，动作筛选回显）。
- 行点击打开「Audit record」抽屉：TxDescriptions（完整本地化时间、管理员身份、管理员 ID、动作标签 + id、目标类型 / id / 名称、IP、UA）+ 格式化 metadata 与复制按钮（`ui-audits-drawer.png`）。
- `/admin` → `/admin/updates`。
- 切页骨架（Network 限速 400ms，users → governance）：240ms 出骨架（`aria-busy=true`）→ 3.6s 路由切换仍在骨架 → 7.9s 页面渲染、骨架收起；限速 1500ms 时骨架覆盖整个加载期，解除限速后正常落到目标页。
- 闸门错误态：拦截 `/api/user/me` 失败 →「Could not load your account … Retry」（`ui-gate-error.png`）；恢复网络点 Retry → 正常进入审计页。
- 公开页（`/`）经客户端路由进入 `/admin/audits`：204ms 骨架 → 407ms 渲染，无死锁（复核 agent 修的 `_route.sync` 路径）。
- 未登录经客户端路由进入 `/admin/audits`：824ms 跳到 `/sign-in?redirect_url=/admin/audits`。
- 普通用户：217ms 判定中 → 844ms 无权限态 → 1251ms 跳 `/dashboard/overview`；全程 0 个 `/api/admin/*` 请求（会话顺序切换，未并发，避免共享 cookie 罐干扰）。
- 验收中修正：摘要专门格式化在缺值时显示「– · –」「– → –」→ 一侧缺用「—」补位、两侧都缺回退到通用字段摘要（`app/utils/admin-audits.ts`，测试补 1 条）。修正后 14 行抽样中纯横杠摘要为 0。
- 未改动的已知观感：英文动作标签在 150px 列会省略（悬停可见全文）；中文基本放得下。
