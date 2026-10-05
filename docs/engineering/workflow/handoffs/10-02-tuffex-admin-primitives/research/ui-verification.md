# UI 验收（主会话，ego，2026-10-02）

- 环境：worktree `~/Workspace/Worktrees/talex-touch-tuffex-primitives`（`ca6577bbb` + 本任务未提交改动），dev server `127.0.0.1:3202`（`NUXT_TUFFEX_SOURCE=true`，Node 26），ego TaskSpace 179，视口 1273×1038；主题按 `scripts/tuffex-visual-smoke.mjs` 的方式切换（emulated media + `html.dark` + `localStorage.color-mode`）。
- `/zh/docs/dev/components/descriptions`：三个 demo（Descriptions / 布局与尺寸 / 列数与跨列）亮、暗主题都正常；空值显示 `—`，`0` 照常显示；水平布局同列标签对齐；`span` 跨列正常。
- `/zh/docs/dev/components/data-table`「骨架加载」demo 三种状态：首屏加载 = 4 行贴合列宽的骨架（含复选框占位）；刷新 = 原有行不动、表头下方细进度条；已加载 = 正常行。亮 / 暗主题都已截图。
- `/zh/docs/dev/components/pagination`「每页条数」demo：页码、「每页条数 20」选择框与「共 230 条 · 第 3 / 12 页」同一行。
- 复现（改动前已存在、不是本任务引入）：「分页导航」demo 的 `TxSelect` 被 `<label>` 包住，精确点击箭头图标（`span.tuff-select__arrow` 内的 svg）时同一次点击产生两个 click 事件（`svg(trusted)` → `INPUT(trusted)`，后者由 label 转发），最终 `aria-expanded=false`——面板开了又关。点击文字区正常打开；「每页条数」demo（未包 label）点箭头正常打开。
- 截图：`ui-light-descriptions-basic.png`、`ui-dark-descriptions-layout.png`、`ui-dark-table-skeleton-first-load.png`、`ui-dark-table-refresh.png`、`ui-light-pagination-page-size.png`。
- 待补：组件画廊中 `descriptions` 的格子（`tuffex-design-rules.md:322` 注册链第 8 条），补完后在套件总览页验证。

## 补充项验收（老板决定后的三项改动，2026-10-02）

- 画廊：`/zh/docs/dev/components/base-suite` 中「Descriptions 描述列表」格子位于 DataTable 与 DotIndicator 之间，渲染 `插件=剪贴板历史 / 版本=2.4.1 / 通道=稳定版 / 主页=—`（截图 `ui-gallery-descriptions-cell.png`）。dev 模式首次打开套件页需等水合（约 2.4 s）且格子按可见性挂载，查找时要限定在 `.docs-gallery` 内——左侧导航里有同名链接。
- 「分页导航」demo：不再包 `<label>`；选择框可访问名称经 `aria-labelledby` 解析为「每页条数」；精确点击箭头只产生一个 click（`svg`），`aria-expanded=true`，选项 10 / 20 / 50 可见（截图 `ui-pagination-demo-fixed-open.png`）。
- 该 demo 的 `show-info` 默认文案「Page 1 of 12 (120 items)」与首末页按钮读屏标签在中文页仍是英文默认值：改动前即如此，未在本任务处理。
- worktree dev server 的内容缓存会产生假象：服务端渲染出旧文案（hydration 文本不一致告警），套件页提示语显示为中英混杂；源文件与线上（`https://tuff.tagzxia.com/zh/docs/dev/components/base-suite`）均为正确中文，不是本任务问题。
