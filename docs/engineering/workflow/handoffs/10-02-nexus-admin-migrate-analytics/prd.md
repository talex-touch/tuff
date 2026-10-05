# 数据分析页拆分迁移

父任务：`10-02-nexus-admin-console-overhaul`。依赖：`10-02-nexus-admin-retired-ai-cleanup`（AI 分析面板已删，剩六个面板）与 `10-02-nexus-admin-console-kit`（组合件 API 已冻结）。`design.md` / `implement.md` 在开工前补写。

## Goal

把 2,269 行的 `analytics.vue` 拆成按需加载的面板组件，修掉「独立面板被总请求绑架」「刷新整页换骨架」「手写抽屉」等问题，并迁到统一骨架。

## Requirements

- **R1 页面结构**：标题固定为「数据分析」（当前 H1 是当前面板名，与面板条重复，`analytics.vue:654,679-693`）；六个面板的分区条放 `AdminPageShell #nav`，`?section=` 由 `useAdminQueryState` 管理，遗留 section 回落 overview；天数选择留在 `#actions`。
- **R2 拆分**：每个面板一个异步组件（`components/admin/analytics/*`，命名遵守 `component-auto-import` 守卫），共享状态（天数、当前面板）留在页面或一个 composable；保持 spec `component-guidelines.md:73` 的约定——overview 独占使用量 / 版本 / 地理内容与四张 KPI 卡，其它面板既不显示也不请求 overview 专属资源；每个面板保留按查询懒加载的归属。
- **R3 加载与错误**：messages、exchange、docs 等独立数据的面板不再包在总请求的 `v-else-if="analytics"` 里（`:726-2266`），各自骨架、各自错误态 + 重试（当前子面板错误无重试，`:1251-1257,1479-1485,1660-1665,1772-1778`）；改天数或重试时保留现有内容，不整页换骨架（`:695`）。
- **R4 组件统一**：KPI 与各处手写指标卡用 `AdminStatGrid`；8 张分布小卡与抽屉内 14 段列表的重复模板（`:1113-1243,2104-2261`）收成一个组件；明细抽屉改为 `TxDrawer`（当前手写 `fixed inset-0` 遮罩、无 Esc、无 `role="dialog"`、暗色写死 `#1c1c1e`，`:2069-2264`）；卡片圆角与内边距统一到 `AdminSection`（当前 58 个 TxCard 混用 16 / 18 圆角与五种内边距）；数字与时间格式化改用 `useAdminFormat`（替换 `utils/admin-analytics.ts` 中与之重复的部分）。
- **R5 测试**：`analytics-page-performance.test.ts`（867 行，剥 import 现编整页）改为测试面板组件与 composable，逐条保留原断言守住的行为：7→6 个 section 顺序、`?section=` 用 `replace`、遗留 section 回落、各取数组 loading / error 隔离、请求路径白名单、地区名随 locale、docs 过滤防抖、旧响应后到不覆盖。

## Acceptance Criteria

- [ ] 页面逐条满足父任务 design §4；ego 截图（六个面板 × 1280 / 1920 × 亮 / 暗 × 中 / 英）存 `research/`。
- [ ] 让 `/api/admin/analytics` 失败（ego 拦截请求）时，messages / exchange / docs 面板仍能加载并显示数据。
- [ ] 打开 overview 以外的面板时，网络面板里没有 `/geo`、`/versions` 请求。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`；`check-worker-bundle.mjs` 不新增 findings。

## Out of Scope

- 分析接口与统计口径变更（基线里 KPI 24 小时为 0 而日趋势有数据的现象若确认为口径问题，单独报告）。
