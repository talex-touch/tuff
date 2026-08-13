# 其他异步页面接入骨架加载态

> 父任务：`08-05-skeleton-loading-default`（子任务 D）。需 `implement.md`；分诊结论落在 `design.md` 或 `implement.md` 均可。

## Goal

把设置页之外、版式已知且有首次加载等待的页面，同样改为骨架屏呈现，并把已有的手搓骨架统一到共享原语。

## 现状

`views/` 下（不含 `views/base/settings`）有 loading / pending 状态的页面 **24 个**，其中仅 5 处出现过 skeleton 字样，且实现均为手搓：

| 已有骨架（手搓） | 位置 |
|---|---|
| `StoreDetailSkeleton` | `components/store/StoreDetailSkeleton.vue`，被 `views/base/store/StoreDetailOverlay.vue` 使用 |
| `CapabilitySkeleton` / `ProviderSkeleton` | `components/intelligence/skeleton/`，被 `IntelligenceCapabilitiesPage.vue` 使用 |
| 其他 | `components/intelligence/agents/AgentsList.vue`、`components/download/DownloadHistoryView.vue` |

> 这三个手搓骨架的**收敛**归子任务 B（B-R6）；本子任务负责的是**接入面**——让消费它们的页面以及尚无骨架的页面都用上统一原语。两者边界须在实施时对齐，避免重复改同一文件。

## 依赖与顺序

**依赖子任务 B 完成**（消费其原语与防闪烁能力）。与子任务 C 无依赖关系，可在 B 完成后与 C 并行。

## Requirements

- **R1 先分诊，再改造**：24 个候选页面**不得照单全收**。实施首步须逐页判定并记录结论，分为三类：
  - **适用**：版式已知稳定、存在可感知的首次加载等待 → 接入骨架。
  - **不适用**：版式随数据变化、加载不可见或极短、非常规页面形态 → 记录理由后排除。
  - **另有归属**：如 `views/test/*` 测试页、`views/box/CoreBox.vue` 启动器等交互形态与常规页面不同的，明确排除并说明。
  分诊结论须逐页可查，不能只给一个总数。
- **R2 复用 B 的原语**：接入一律走共享原语，不得新增手搓骨架 div 或 `@keyframes`。
- **R3 已有骨架统一**：消费 `StoreDetailSkeleton` / `CapabilitySkeleton` / `ProviderSkeleton` 的页面，在 B 完成收敛后须验证观感与行为无回归。
- **R4 只改呈现**：不动数据加载逻辑与状态管理。
- **R5 不破坏刷新语义**：已有内容的后台刷新不得替换为骨架。
- **R6 防闪烁**：统一使用 B 提供的延迟出现 / 最短展示时长能力。

## Non-goals

- 不处理 `apps/nexus` 与插件 surface（父任务 Non-goal）。
- 不重构页面版式或数据层。
- 不改 `TxLayoutSkeleton` 的 app-shell 用途。

## Acceptance Criteria

- [x] **AC1**：24 页逐页分诊完成，见 `implement.md`：适用已做 1 / 已有骨架待复核 2 / 适用未做 7 / 不适用 11 / 另有归属 3，合计 24 无遗漏。
- [~] **AC2 部分**：`AgentsList` 已接入并贴合 `AgentItem` 真实形状；C 组 7 页未做。
- [x] **AC3**：`AgentsList` 改动未引入手搓骨架 div 或 `@keyframes`，改为复用 `TxRowSkeleton` + 令牌覆盖。
- [ ] **AC4**：`StoreDetailOverlay` / `IntelligenceCapabilitiesPage` 的骨架**尚未**逐项复核版式贴合度（B 的收敛不产生 TS/测试回归已验证，但「收敛无回归 ≠ 版式达标」）。
- [x] **AC5**（本轮范围）：`IntelligenceAgentsPage` 已加 `hasLoaded` 哨兵并改为 `:loading="showSkeleton"`。审查时发现它原本直接传 `loading`，每次 `loadAgents()` 都会把已渲染列表换回骨架，违反 R5；同时接入 `useDeferredLoading` 补上 R6 防闪烁。C 组 7 页未做。
- [x] **AC6**（本轮范围）：CoreApp `npm run typecheck` exit 0；渲染层测试 49 文件 / 260 用例全过；`AgentsList` lint 与 HEAD 同为 2（均属既存 `arrow-parens`）。

## Notes

- 本子任务优先级低于 C（设置页是用户原话直接点名的范围），排期上可后置。
- 分诊阶段若发现某页面「该有加载态却没有」（数据在加载但 UI 无任何反馈），属于既有缺陷：记录并上报，不在本子任务内顺手扩大修复范围。
