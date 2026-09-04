# CoreBox 空态推荐理由分组

## 目标

CoreBox 空态（未输入任何字符时）现在是一个标题为 `Recommend` 的大网格，所有推荐项混在一起，每个项右上角挂一个几乎恒为「推荐」的徽章。用户看不出**为什么**这一项被推荐。

本任务把空态改成**按推荐来源分组的列表**：每组一个理由标题（常用 / 此刻常用 / 最近 / 新安装 …），组内 3 项，每项右侧给一句可解释的证据文本（`本周打开 23 次` / `每天 09-11 点常开` / `2 小时前刚安装`）。

视觉基线：`docs/design/corebox/v2.5.0.pen` 中的 `CoreBox 空态 · E 理由分组 + 预览` 帧（node `HUp92`）的**左栏**。右侧预览面板不在本任务范围内。

## 背景事实（已核对代码，非推测）

| 事实 | 位置 | 状态 |
|---|---|---|
| 推荐来源共 9 种，taxonomy 已完整 | `recommendation-engine.ts` `CandidateItem['source']` (~3251) | ✅ 已有 |
| `TuffContainerLayout.sections` 分组基建已存在 | `packages/utils/core-box/tuff/tuff-dsl.ts:1452-1489` | ✅ 已有 |
| `buildContainerLayout()` 只产出 `recommendations` + `pinned` 两组，`mode: 'grid'` | `recommendation-engine.ts:1448-1490` | ⚠️ 需改写 |
| `recommendation.source` 联合类型漏了 `'plugin'` | `tuff-dsl.ts:1166` | ⚠️ 缺陷 |
| `getReasonLabel` / `generateBadge` 两张映射表都漏了 `pinned` | `item-rebuilder.ts:637,651` | ⚠️ 缺陷，落到默认「推荐」 |
| `time-based` 与 `cold-start` 徽章文案都是「推荐」 | `item-rebuilder.ts:651` | ⚠️ 这是「全员推荐徽章」的直接成因 |
| 执行次数 `executeCount`（含索引） | `schema.ts` `itemUsageStats` (258-289) | ⚠️ 有数据，未进 item meta |
| 小时分布 `hourDistribution`（24 长数组） | `schema.ts` `itemTimeStats` (584-600) | ⚠️ 有数据，缺峰值提取函数 |
| 安装时间 `installedAt` | `ItemCandidate.installedAt`，已驱动 novelty boost | ⚠️ 有数据，未透出 |
| **应用共现**（"打开 Xcode 之后常用"） | 无任何信号；`usageLogs.context` 的 `prev_app` 注释无人写入也无人读取 | ❌ **不存在，已从设计中删除** |
| `BoxGrid.vue` 读 `section.title`，但从不读 `section.layout` | `components/render/BoxGrid.vue` | ⚠️ 需加 list 分支 |
| intelligence 分组被硬钳到 5 列 | `box-grid-layout.ts` `CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT` | 说明：这是原截图中「5+1 孤儿行」的确切成因 |

## 需求

- **R1 分组顺序**：空态按固定顺序渲染分组 —
  `pinned → frequent → time-based → recent → newly-installed → context → plugin → trending → cold-start`。
  顺序必须来自**单一常量**，主进程与渲染进程共用。
  ⚠️ 这是**行为反转**：现有实现把 pinned 放在**底部**（`recommendation-engine.ts:1448` 注释 "Pinned at bottom"）。
- **R2 空组省略**：没有条目的来源不产出 section，不留空标题。
- **R3 每组条数**：每组最多 3 项。
- **R4 理由文案**：9 种来源各有独立中英文案，不允许两种来源共用同一串。
  特别地：`time-based`「推荐」→「此刻常用」，`cold-start`「推荐」→「猜你要用」，`pinned` 补齐。
- **R5 证据字段**：`recommendation` meta 增加 `evidence` 子对象，承载 `executeCount` / `lastExecutedAt` / `installedAt` / `peakHourRange`。字段全部可选——**没有数据时留空，不允许编造**。
- **R6 列表渲染**：`BoxGrid.vue` 尊重 `section.layout === 'list'`，走行渲染分支；网格分支与 `CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT` 保持原样不动。

## 非目标

1. **不做右侧预览面板**（E 帧右栏）——独立任务。
2. **不做应用共现信号**——底层数据不存在，硬造需要新的采集链路。
3. **不改搜索态**（已输入字符后的结果列表）布局。

## 验收标准

1. 空态渲染出多个带理由标题的分组，顺序与 R1 常量一致。
2. Pinned 分组出现在**最上方**。
3. 无条目的来源不产出空分组。
4. 每组不超过 3 项。
5. 9 种来源的徽章/理由文案两两不同，中英文 key 集合一致（`translation-coverage.test.ts` 通过）。
6. 有 `executeCount` / `installedAt` / 峰值时段数据的项，行内显示对应证据文本；无数据的项不显示、不占位、不编造。
7. `resolvePeakHourRange` 在样本不足（< 10 次）或峰值窗口占比不足 40% 时返回 `null`。
8. `npm run typecheck`、`pnpm lint`、`pnpm utils:test` 全绿。
