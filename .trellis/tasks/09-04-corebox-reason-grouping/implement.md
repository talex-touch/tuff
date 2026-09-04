# 执行计划 · CoreBox 空态推荐理由分组

顺序有依赖：S1 契约 → S2 纯函数 → S3/S4 主进程消费 → S5 文案 → S6 渲染 → S7 全量验证。

> 执行结论：S1–S7 已完成。下方每步的 ✅ 为实际落地情况，**偏差**段落记录与原计划不一致之处及原因。

---

## S1 · 契约层（`packages/utils`）

- [x] ~~新建~~ **改写** `packages/utils/core-box/recommendation.ts`，导出 `RECOMMENDATION_SECTION_ORDER` / `RecommendationSource` / `RECOMMENDATION_SECTION_ITEM_LIMIT` / `RecommendationEvidence`
- [x] 该模块此前已从包入口导出，无需新增导出
- [x] `tuff-dsl.ts` 的 `recommendation.source` 改为引用 `RecommendationSource`
- [x] 同处新增可选 `evidence` 子对象（见 design C1）

验证：`pnpm --filter @talex-touch/utils build` ✅

> **偏差 1（S1）**：计划写的是「新建 `recommendation.ts`」，但该文件**本就存在**且已导出。改为**统一**而非创建。
>
> 顺带修掉一个计划只猜中一半的既有缺陷：drift 的 `source` 联合类型有 **3 处**（非 2 处），且 `RecommendationBadge.variant` 缺 `'plugin'`——`generateBadge` 一直在发这个值，被宽松的 `{ variant: string }` 返回类型盖住了。已 grep 确认 utils 这几个类型无外部消费方，加宽安全。

> **补漏（Phase 3 发现）**：S1 当时只统一了 3 处中的 2 处，漏了 `transport/events/types/core-box.ts`——**恰恰是真正跨 IPC 的那一处**，且仍缺 `'plugin'`。是走 3.3 spec 更新时被 `recommendation-freshness-contracts.md` 里「union lives in THREE files」这条既有约定抓出来的。已改为引用 `RecommendationSource` 并补 `evidence`，三处至此收敛到单一真源。

> ⚠️ 已知陷阱：改完 `@talex-touch/utils` 的导出后，`apps/core-app/node_modules` 里可能残留物理副本遮蔽根 symlink（shamefully-hoist），表现为 `tsc` 过但运行时/vitest 找不到新子路径。解析失败就 `pnpm install` 重跑。（本次未触发）

## S2 · `resolvePeakHourRange` 纯函数

- [x] 实现 design C4 的 4 条规则，含**跨零点回绕**
- [x] 测试覆盖：畸形入参 / 总和 9 与 10 的边界 / 均匀分布 / 最忙窗口 / 跨零点 / 占比恰好 0.4 / 脏桶（负数、NaN）/ 并列取先

验证：`recommendation-utils.test.ts` ✅ 19 tests pass

> **偏差 2（S2）**：函数落在既有的 `recommendation-utils.ts`，**未**新建 `peak-hour-range.ts` / `peak-hour-range.test.ts`。理由：同文件已有同性质的 `calculateHourAffinity`，代码复用指南要求就近放置而非新开文件。

## S3 · `item-rebuilder.ts`（断点 A）

- [x] `getReasonLabel` 补 `pinned: 'Pinned'`
- [x] `generateBadge` 补 `pinned`；`time-based`「推荐」→「此刻常用」；`cold-start`「推荐」→「猜你要用」
- [x] `buildEvidence()` 填充 `meta.recommendation.evidence`
- [x] **拿不到的字段就不写**：逐字段 `Number.isFinite` + `> 0` 校验，全空则整个 `evidence` 返回 `undefined`

验证：`item-rebuilder.test.ts` ✅ 10 tests pass

> 既有测试 `'labels newly installed and cold-start items with their own badge'` 断言 cold-start 用**通用**徽章——与它自己的用例名矛盾。已按 PRD 决策改为 `'猜你要用'`，并补一条结构性测试：遍历 `RECOMMENDATION_SECTION_ORDER`，断言 9 个来源的徽章文案与 reason 两两不同。

## S4 · `recommendation-engine.ts`（断点 B）⚠️ 回滚点

- [x] 按 design C3 改写 `buildContainerLayout()`：分桶 → 按 `RECOMMENDATION_SECTION_ORDER` 输出 → 空组跳过 → 每组 `slice(0, 3)`
- [x] 更新「Pinned at bottom」注释

验证：`recommendation-engine.test.ts` ✅（整个 `recommendation/` 目录 125 tests / 7 files pass）

> **评审门 1 触发并自行判定**：`recommendation-engine.test.ts` 断言 pinned 在 `sections?.at(-1)`，与 PRD R1 冲突。判定为**纯期望值更新**（PRD 已明确记录该顺序反转属预期行为变更），故未阻塞提问，改为 `at(0)` 并加注释说明；`items` 数组自身的顺序是另一件事，未动。

## S5 · i18n

- [x] `zh-CN.json` + `en-US.json` 各加 `corebox.reason.*` 共 9 个 key
- [x] 另加 `corebox.evidence.*`（见偏差 3）
- [x] 两个文件 key 集合完全一致

验证：`translation-coverage.test.ts` ✅ 4 tests pass

> 未使用 vue-i18n 复数语法：全库现有文案把 `|` 当**字面分隔符**用，没有任何复数形式。改用复数无关的紧凑写法（`{count}h`、`Opened {count}×`）。

## S6 · `BoxGrid.vue`（断点 C）

- [x] 加 list 分支；title 含 `.` 走 `t()`，否则字面量回退（兼容缓存里的旧 `'Recommend'`）
- [x] **未动** grid 分支、`CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT`、全局 index 累加
- [x] list 分支复用 `BoxItem.vue` 渲染行

> **偏差 3（S6）**：计划只写了 `BoxGrid.vue`，实际还需要三样东西才能把证据落到行上：
>
> 1. 新建 `recommendation-evidence.ts` —— `formatRecommendationEvidence()`，按来源选最能解释它的那条事实，没有可说的就返回 `''`（+ `recommendation-evidence.test.ts` 10 tests ✅）
> 2. `BoxItem.vue` 新增 `evidence?: string` prop 与 `.RecommendationEvidence` 样式
> 3. i18n 增加 `corebox.evidence.*`
>
> 复用 `BoxItem` 而非新建行组件，顺带解决了原始诉求里「空态和搜索态像两个 App」的问题。
>
> 另确认：`resolveResultSignal` / `sourceMeta.ts` 是给错误/健康状态用的，不是推荐理由，因此证据走独立 prop 而非复用它。

## S7 · 全量验证

- [x] `npm run typecheck`（在 `apps/core-app/`）—— exit 0
- [x] `pnpm lint` —— 首次 exit 1（9 条 `prettier/prettier` warning，0 error），`pnpm lint:fix` 后 exit 0
- [x] `pnpm utils:test` —— 248 pass / 5 fail
- [x] `apps/core-app` 全量 vitest —— 6806 pass / 4 fail
- [ ] `pnpm core:dev` 人工确认：分组顺序、pinned 置顶、无空组、每组 ≤3、证据文案真实（**待用户执行**）

> **两处失败均为既有问题，与本任务无关**——已 `git stash` 到干净 HEAD 复跑，同样的文件、同样的用例数失败：
>
> | 失败用例 | 数量 | 归因 |
> |---|---|---|
> | `channel-api-doc.test.ts` | 1 | 渲染进程 `send()` 加了 `options?: { timeout?: number }`，CLAUDE.md 文档未同步 |
> | `ui-preference-storage.test.ts` | 2 | `window.localStorage` undefined（测试环境） |
> | `widget-registry.test.ts` | 1 | 插件沙箱隔离 |
> | `tuff-native-ocr.test.ts` | 2 | 原生模块 |
> | `translation.test.ts`（`packages/test`） | 3 | touch-translation Prelude |

---

## 评审门（遇到就停下来问，不要自行决定）

1. ~~现有测试断言与 PRD R1 分组顺序冲突~~ → 触发，判定为期望值更新，见 S4
2. ~~`@talex-touch/utils` 需要破坏性改动~~ → 未触发；改动为**加宽**（补齐联合类型成员、新增可选字段），且无外部消费方
3. ~~峰值时段阈值在真实数据上明显不合理~~ → 未触发（阈值保守，取不到就返回 `null`）
4. ~~分组数超过 5 个，空态变得过长~~ → 未触发；空组直接跳过，实际同时出现的分组远少于 9

---

## 附：顺带发现（未处理，超出本任务范围）

`TuffItem.meta.usageStats` 在 `tuff-dsl.ts` 有声明、`BoxItem.vue:104` 有读取（图标角标显示打开次数），但**全仓库没有任何写入方**——该角标是死 UI，从不渲染。因此它不会和本次的证据文案重复。
