# 审计洞察页重做

父任务：`../10-03-intelligence-audit-rebuild/`（需求 R-D1–R-D10、R-E3、R-B5 的界面侧；决定 D3 / D7 / D11 / D13）。设计以父任务 `design.md` §5 为准。

## Goal

把「设置 › 智能 › 审计」重做成洞察页：
- 一眼看到这段时间用了多少 Token、请求成败、花了多少（估算）、钱花在哪、离上限还有多远；
- 调用记录、上限编辑、设置都在抽屉里；
- 定价为 0 的模型被明确点名。

## Requirements

- **P1（R-D1）骨架**：
  - `SettingsPage` column + 返回「智能」；
  - `InsightsHeader`「审计」，操作为「调用记录」+ `InsightsMenu`（设置、导出 CSV、导出 JSON）；
  - 范围 `TxFilterChips`（tablist）：今天 / 近 7 天 / 近 30 天，默认近 30 天。
- **P2（R-D2）指标**：
  - `InsightsHeroMetric`：Token，含输入 / 输出拆分；
  - `InsightsMetricCard` × 4：请求（成功 / 失败）、成功率、平均延迟、估算费用（标「估算」，悬停说明价目来源、Nexus 积分不折算，并挂 0 定价提示）。
- **P3（R-D3）趋势**：
  - `TxTimeseriesChart` bar；
  - `TxFilterChips` 切换 Token（输入 / 输出堆叠）/ 请求（成功 / 失败堆叠）/ 估算费用；
  - X 轴本地日（由 `days[].day` 生成，`timeZone:'UTC'` 格式化），补零天，零值不画柱。
- **P4（R-D4）去向**：
  - 维度切换：渠道 / 模型 / 能力 / 调用方；
  - 展示：`TxAllocationBar`（按 Token，前 5 + 其他）+ 可排序 `TxDataTable`（请求、Token、估算费用、失败数）；
  - 模型行展示单价（输入 / 输出，USD / 1M）、上下文长度、输出上限、定价状态；
  - 名称映射按父 `design.md` §5.2；
  - 覆盖率低于 100% 时脚注说明原因（审计曾关闭 / 保留期 / 隐私删除）。
- **P5（R-D5）上限**：
  - `AuditLimitsCard`：已设项用 `TxProgressBar` 显示日 / 月用量，到 80% 标警示、到顶标已暂停与本地重置时间；
  - 未设时显示「设置上限」；
  - `AuditLimitsDrawer`：6 个 `TxNumberInput`（`null` = 不限），费用项注明估算并挂 0 定价提示，保存调用 `setUsageLimits`。
- **P6（R-D6）调用记录**：
  - `AuditRecordsDrawer`：筛选（状态、渠道、调用方、能力），`queryAuditLogs` 服务端分页 + 总数（`TxPagination`）；
  - 行详情：trace、用量、估算费用与定价状态、错误码、metadata、上下文包 / 检查点（复用 `context-package-log-summary.ts` 与旧组件的加载逻辑）；
  - 导出：按当前筛选导出全部结果（每页 200 拉到 `total`），CSV / JSON 用 Blob + `<a download>`，文件名带本地日期与范围。
- **P7（R-D7）设置**：
  - `AuditSettingsDrawer`：启用审计（说明只存元数据、不含内容、保留 N 天、关闭后仍计数）、响应缓存 + 过期时间（单一下拉）、「管理保留期与删除」跳隐私设置；
  - 页面上不再有任何重复开关。
- **P8（R-D8）状态**：
  - 首次加载：骨架与真实版式同容器同行数，用 `useDeferredLoading`；
  - 刷新：保留内容；
  - 审计未开启：`InsightsNotice` + 一键开启（总量 / 趋势 / 上限照常）；
  - 区间无调用：空态；
  - 读取失败：错误提示条 + 重试；
  - 上限 ≥ 80% 或已到顶：提示条；
  - 定价目录不可用：提示条；
  - 页脚说明「最近约 30 秒的调用稍后出现在记录里」。
- **P9（R-B5）0 定价提示**：`AuditZeroCostNotice` 在费用指标、模型维度去向、上限抽屉费用项三处复用，列出 `zeroCostModels`（模型、原因：免费 / 本地 / Nexus 积分 / 未找到定价、调用次数）。
- **P10（R-D9 / R-D10）清理与文案**：
  - 删除 `IntelligenceUsageStats.vue`、`IntelligenceUsageChart.vue`、`IntelligenceAuditLogs.vue`、`IntelligenceAuditOverlay.vue`、`components/intelligence/config/IntelligenceGlobalSettings.vue`；
  - 页面不再挂记忆复核；
  - 新文案在 `intelligenceAudit.*`，中英同步；
  - `settingsIntelligenceHub.auditDesc` 去掉「记忆复核」。

## Acceptance Criteria

- [ ] AC-P1（父 AC-14）：真机 dev 实例逐一截图：
  - 有数据全页；
  - 审计未开启；
  - 区间无调用；
  - 读取失败（模拟 handler 抛错）；
  - 首次加载骨架（`getBoundingClientRect` 对比加载前后各区块高度无跳动）；
  - 记录抽屉：筛选后分页、行详情、导出 CSV（打开文件核对行数 = 总数、字段与筛选一致）；
  - 设置抽屉开关审计后页面状态随之变化。
- [ ] AC-P2（父 AC-15）：趋势 X 轴为本地日期，无逐字星期；零值日无柱（截图放大核对）。
- [ ] AC-P3（父 AC-16）：区间含一个 Ollama 模型与一个未收录模型时，三处 0 定价提示都列出二者及原因。
- [ ] AC-P4：上限卡在 79% / 80% / 100% 三种夹具下分别为正常 / 警示 / 已暂停，并显示重置时间。
- [ ] AC-P5（父 AC-17）：五个旧组件删除且全仓无引用（含 `components.d.ts` 重新生成）；审计页无记忆复核；`translation-coverage.test.ts` 绿。
- [ ] AC-P6（父 AC-18 的审计侧）：标题行、指标卡、菜单使用共享组件（代码检查）。
- [ ] AC-P7：组件测试覆盖：
  - 范围切换只重拉不清空；
  - 名称映射（插件按 `plugin:${name}` 精确匹配、`system` → 能力测试、NULL + operation → Home 各项、已删除渠道）；
  - 导出分页拉全；
  - 设置抽屉单一缓存控件。
- [ ] AC-P8：
  - `pnpm -C apps/core-app run typecheck:web` 本子任务范围 0 新错误；
  - `pnpm check coreapp-ui-contract` 通过；
  - lint delta 为 0；
  - `git diff --check` 干净。

## Out of Scope

- 主进程数据与执行逻辑（账本、定价、上限子任务）。
- 记忆页（记忆子页任务）。
- 清空日志按钮：统一在隐私设置，设置抽屉只给跳转。

## Dependencies

前置：`10-03-audit-usage-ledger`、`10-03-intelligence-usage-limits`、`10-03-insights-shell-kit` 已合入（`10-03-modelsdev-pricing` 在第 1 波已合入）。
