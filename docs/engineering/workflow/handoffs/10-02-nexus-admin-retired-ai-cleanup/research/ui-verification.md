# UI 验收（主会话，ego，2026-10-02）

- 环境：worktree `~/Workspace/Worktrees/talex-touch-ai-cleanup`（`ca6577bbb` + 本任务未提交改动），dev server `127.0.0.1:3201`（`/tmp/aiclean/start-dev.sh`，`NUXT_TUFFEX_SOURCE=true`），本地 D1 测试管理员 `ui-audit-bot@local.test`；ego TaskSpace 178；视口 1273×1038、暗色。
- `/admin/analytics` 分区条：中文「数据概览 / 性能 / 搜索 / 文档分析 / 汇率 / 告警」，英文「Data Overview / Performance / Search / Docs Analytics / Exchange / Alerts」——六个面板，无「AI 分析 / AI Analytics」。
- 六个 `?section=` 逐个打开均渲染对应面板（标题与分区一致）；`?section=intelligence` 渲染数据概览（URL 保持原样，内容回落）。
- 请求（CDP `Network.requestWillBeSent`）：`?section=overview` 与 `?section=intelligence` 都只请求 `/api/admin/analytics?days=30`、`/versions?days=30`、`/geo?days=30&limit=240`，没有 `/api/admin/analytics/intelligence`。
- 说明：dev 模式下 Vite 模块数超过 `performance` 资源计时缓冲（250 条），用 `getEntriesByType('resource')` 统计请求会漏记，因此改用 CDP 网络事件。
- 截图：`ui-zh-legacy-intelligence-fallback.png`、`ui-zh-performance.png`、`ui-en-exchange.png`。
- 范围外观察（留给后续迁移子任务）：英文 rail「Comment Manage…」被截断；汇率面板筛选框无标签。
