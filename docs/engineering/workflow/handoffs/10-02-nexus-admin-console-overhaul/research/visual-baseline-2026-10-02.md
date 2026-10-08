# 后台视觉基线（2026-10-02，真实浏览器）

采集方式：ego TaskSpace 171，本机 dev server `http://localhost:3200`（他人/老板已在跑的实例，只读浏览，未点击任何写操作）。会话为本地开发密钥 `tuff-dev-secret` 签发的测试账号 `ui-audit-bot@local.test`，在根 `.wrangler` D1 中提为 admin（`apps/nexus/scripts/dashboard-visual-audit.mjs:99-106` 同款签发方式）。视口 1273×1038 CSS px，DPR 2，暗色主题，中文界面。每页导航后静置 6 s 再取数与截图。

截图在 `/tmp/nexus-admin-baseline/*.png`（临时目录，不入库）；原始数据 `/tmp/nexus-admin-baseline/sweep-*.json`；脚本 `/tmp/nexus-admin-baseline/sweep.mjs`。

## 逐页数据

| 路由 | 落点 | 页内标题（h1/h2） | `<main>` 高度 | 关键现象 |
|---|---|---|---|---|
| `/admin/analytics` | 同 | 数据概览 | 4,033 | 导航叫「数据分析」、页面叫「数据概览」；渐变 KPI 卡（`tx-stat-card__aura`）；面板条 7 段 |
| `/admin/updates` | 同 | 更新与要闻 | 994 | 筛选卡 + 表格卡；表格卡顶部空白带；时间「2026年3月3日」折两行；底部只有文字「共 1 条…每页 5 条」 |
| `/admin/images` | 同 | 资源库 | 994 | 空态；上传区说明文字与「选择文件」重复出现两遍 |
| `/admin/reviews?tab=plugins` | 同 | 评论管理 | 994 | 空态，「待审核 0 条」出现两次 |
| `/admin/reviews?tab=docs` | 同 | 评论管理 | 994 | 空态 |
| `/admin/users` | 同 | 用户管理 | 1,566 | 无外框筛选行；创建时间「2026年9月29日」折两行；头像首字母取到方括号（「[R」「[江」）；三按钮操作列 |
| `/admin/subscriptions` | 同 | 激活码 | 994 | 无外框筛选行 + 表格 + 右下分页；「操作」列整列为空；复制按钮套在异形胶囊里 |
| `/admin/intelligence-overview` | 同 | 概览 / 智能概览 | 994 | 双重标题（页面「概览」+ 卡内「智能概览」+ 副标题），与导航「AI 概览」三处不一致；纯色 KPI 卡（与渐变卡两套样式）；「刷新」「查询」按钮离各自对象很远；底部单独一张卡只写「当前环境未启用风险控制能力，IP 封禁面板已自动隐藏」；Nuxt 警告页面不是单根节点 |
| `/admin/provider-registry` | 同 | 服务渠道 / 已注册服务渠道 | 1,108 | 双重标题；「刷新」单独占一行；页内再套 4 个标签页；时间 `9/30/2026, 7:09:07 PM`；表格横向溢出，健康/配额/更新时间列在视口外 |
| `/admin/intelligence-audits` | 同 | 审计日志 | 2,166 | 与 `/admin/audits` 同名；卡片流而非表格；时间 `9/30/2026, 5:26:02 PM`；只有「按用户 ID 过滤」一个输入；Nuxt 单根节点警告 |
| `/admin/governance` | 同 | 数据治理 + 5 个英文小节标题 | **11,513**（≈11.6 屏） | 整页英文：Operations report snapshot / D1 migration readiness / Analytics cockpit / Analytics collection / Notification channel test；按钮 Export Markdown / Dry run / Send using config / Send；7 张 KPI 卡全为 0；可见原始事件名 `governance.operator_cockpit.viewed` |
| `/admin/audits` | 同 | 审计日志 | 3,319 | 见下节；20 条英文日期；`tx-data-table is-scroll-x` 横向溢出 |
| `/admin/risk` | → `/admin/updates` | — | — | 本地未开 `riskControl`，被 feature gate 重定向，未能看到页面 |
| `/admin/emergency` | → `/` | — | — | 同上，落到首页（首页另有 hydration mismatch，与后台无关） |
| `/admin/credits` | → `/admin/users` | — | — | 重定向壳页 |
| `/admin/codes` | → `/admin/subscriptions` | — | — | 重定向壳页 |

## `/admin/audits`（老板截图页）在 1273px 视口下

- 「动作」列被压成约 1 个汉字宽，「用户状态变更」竖排成 6 行；「时间」折成 5 行（Sep / 30, / 2026, / 8:46 / PM）。
- 「详情」列整列被挤出视口，只能横向滚动才看得到。
- 管理员列：无名字的账号把邮箱当名字再显示一次邮箱（同一字符串两行）。
- 表格卡顶部一条空白带只放「1 / 3」页码。
- 老板截图（更宽视口）同样可见：时间英文且折行、详情列被挤成窄条、邮箱重复。

## 跨页不一致（统一骨架要解决的）

1. 列表页三种拼法：筛选卡 + 带空白顶带的表格卡（audits、updates）／无外框筛选行 + 表格 + 分页器（users、subscriptions）／卡片流（intelligence-audits）。
2. 指标卡两套：渐变 `TxStatCard`（analytics、provider-registry）与纯色卡（intelligence-overview）；governance 又是第三套带 OK 徽标的卡。
3. 页面标题：AdminPageShell 标题之外又在正文里加标题/副标题（intelligence-overview、provider-registry、governance 小节），违反 `component-guidelines.md` 的单标题约定；两页同名「审计日志」；导航名与页面名不一致（数据分析/数据概览、AI 概览/概览）。
4. 刷新按钮位置四种：页头右侧、单独一行、卡片右上角文字按钮、卡片内。
5. 日期格式至少三种：`Sep 30, 2026, 8:46 PM`、`9/30/2026, 7:09:07 PM`、`2026年9月29日`、`2026/10/2 06:55:32`；后两种在窄列里折行。
6. 语言：governance 整页英文；其他页中文。
7. 分页：页码文字（audits「1 / 3」+ 上一页/下一页）、分页器（subscriptions）、只有统计文字（updates）、数字按钮（intelligence-audits）。
