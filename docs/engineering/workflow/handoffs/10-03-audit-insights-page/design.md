# Design — 审计洞察页

以父任务 `design.md` §5 为准，本文件补组件拆分与数据流细节。

## 组件

| 文件（`apps/core-app/src/renderer/src/`） | 职责 |
|---|---|
| `views/base/intelligence/IntelligenceAuditPage.vue` | 页面编排：范围状态、加载 / 刷新、提示条决策、抽屉开关 |
| `components/intelligence/audit/useAuditInsights.ts` | 调 `getUsageInsights`；`hasLoaded` / `refreshing` / `loadFailed`；`useDeferredLoading` 骨架开关；`onActivated` 刷新 |
| `components/intelligence/audit/audit-labels.ts` | 名称映射：渠道（providers + 图标 + 已删除）、调用方（静态表 + 插件构造匹配 + Home operation + 兜底）、能力（`capabilities` label） |
| `components/intelligence/audit/audit-format.ts` | Token / 请求 compact、延迟、USD（2 位有效小数、`< $0.01`）、本地日刻度（`timeZone:'UTC'`） |
| `components/intelligence/audit/AuditTrendCard.vue` | 趋势卡 |
| `components/intelligence/audit/AuditBreakdownCard.vue` | 去向卡 |
| `components/intelligence/audit/AuditLimitsCard.vue` + `AuditLimitsDrawer.vue` | 上限卡与编辑 |
| `components/intelligence/audit/AuditRecordsDrawer.vue` + `useAuditRecords.ts` | 记录抽屉：筛选、分页、详情、导出 |
| `components/intelligence/audit/AuditSettingsDrawer.vue` | 设置抽屉 |
| `components/intelligence/audit/AuditZeroCostNotice.vue` | 0 定价提示（三处复用） |
| `components/intelligence/audit/AuditPageSkeleton.vue` | 骨架：复用真实卡片容器 + `TxSkeleton` / `TxRowSkeleton` |

## 数据流

- 范围变化 → `useAuditInsights.load(range)`：保留旧数据直到新数据到达，避免回到骨架。
- 设置抽屉开关审计：
  - 走 `useIntelligenceManager().updateGlobalConfig`，与现有页面同一路径；
  - 成功后刷新 insights，提示条随 `audit.enabled` 变化。
- 上限抽屉保存：`setUsageLimits` 成功后刷新 insights；失败显示错误并保留输入。
- 记录抽屉：
  - 打开时用页面当前范围作为默认时间窗；
  - 筛选变化 → offset 归零；
  - 行点击 → 详情面板，并按需拉上下文包 / 检查点（迁移旧 `IntelligenceAuditLogs.vue:62-170` 的缓存与错误处理）。

## 交互细节

- 指标卡的估算费用：
  - 显示估算值与「估算」标签；
  - `note` 写价目来源（models.dev，目录更新时间）与「Nexus 托管按积分计费、未折算」；
  - `zeroCostModels` 非空时在卡下方挂 `AuditZeroCostNotice` 的紧凑形态。
- 去向卡：
  - 维度切换不重新请求（四维一次返回）；
  - 表格默认按 Token 降序；
  - 模型维度多出单价 / 上下文 / 输出上限列；
  - `pricing.status !== 'priced'` 的行显示状态徽标。
- 上限卡：只渲染已设项；全部未设时显示一行「未设置上限」+ 按钮。
- 导出：拉取过程中按钮显示进度（已拉 / 总数），可取消；完成后 toast。

## 测试

- 组件测试 mock `useIntelligenceSdk`（照 `views/base/VoiceInsights.test.ts` 的写法）。
- `audit-labels.ts` / `audit-format.ts` 纯函数单测。
- 页面测试覆盖父 AC-14 的状态切换，真机截图另存 `evidence/`。
