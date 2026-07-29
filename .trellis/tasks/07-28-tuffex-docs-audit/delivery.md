# tuffex 组件文档审计 —— 交付说明

> 供决策用。四件待定事项在文末。

## 1. 改了什么

487 个**已跟踪**文件，+8760 / −11249。

> **⚠️ 这个数漏计了未跟踪的新文件。** `git diff` 只看已跟踪文件，而本任务新建了 **15 个文件 / 821 行**
> （`check-mdc-fences.mjs` 124、两个 `.contract.ts` 291、`utils.{zh,en}.mdc` 180、3 个测试 152、7 个 `types.ts` 74）。
> **真实足迹 ≈ 502 文件 / ≈ +9581 行。提交时必须 `git add` 这些，否则守卫和契约文件不会进版本库。**
>
> 另：全仓 `git diff` 是 526 文件 / +18088 / −20618，差额是另一个 Claude 会话的 core-app 插件隔离工作，**不属于本任务**。

| 区域 | 文件 | 增 | 删 | 性质 |
|---|--:|--:|--:|---|
| 组件文档 `.mdc` | 177 | +1791 | −10113 | 精简：删的是重复内联代码块 |
| 测试 | 90 | +3553 | −63 | **几乎只增不删**，全是新回归测试 |
| 组件源码 `.vue` | 118 | +1983 | −542 | a11y、逻辑修复、类型收紧 |
| 类型 / 入口 `.ts` | 74 | +381 | −143 | 补导出、消除类型泄漏 |
| demo `.vue` | 26 | +449 | −175 | 同步陈旧 demo |

新增文件：`check-mdc-fences.mjs`（守卫）、`missing-export.contract.ts` + `instance-drift.contract.ts`（编译期契约）、`utils.{zh,en}.mdc`（补文档）、7 个 `types.ts`（内联 props 外提）。

## 2. 用户原始诉求的量化

原话：**「文档不要又长又臭，要用精炼的语言表达出每一个组件的设计目的，统一目录结构内容设计范式，简洁讲出每个 API 怎么用」**

| 指标 | HEAD | 现在 |
|---|--:|--:|
| frontmatter 8 字段齐备 | 95/119 (79%) | **119/119 (100%)** |
| 开头讲设计目的（zh） | 100/119 | **113/119** |
| 开头讲设计目的（en） | — | **114/119** |
| 6 个事实标准段 ≥5 个 | — | 113/119 (94%) |
| zh/en 对等（字段集 / 段数 / demo 引用） | — | **三项 0 差异** |

体积典型降幅：`fusion` 1513→181、`avatar-variants` 1014→70、`slider` 817→216、`card` 1800→1066、`glass-surface` 499→207。

> 「讲设计目的」用「首段 vs frontmatter description 相似度 ≥0.85 判为照抄」度量。
> 独立复算确认 zh 113/119 精确复现，en 114/119——**en 侧确实更高**，`spinner` 的 en 开头本就合格、未被误判。

## 3. 审计本身漏掉的东西（本任务的额外产出）

**MDC 围栏深度不匹配** —— `::Foo` 开、`:::` 闭会让容器永不闭合、把文件剩余内容全部吞成子节点，整页文档半页从渲染结果消失。eslint / typecheck / vitest 三道闸全绿也看不见。

全库 23 处。审计撞见 3 次，但记在**三个各自只出现一次的类别名**下（`broken-mdc-block` / `broken-mdc-fence` / `d5-fence-mismatch`），永远聚不成批次，其中一条还被判 low 沉底。

已全部清零 + 加常驻守卫 `pnpm -C apps/nexus check:mdc-fences`（对抗性验证四项全过：干净树 exit 0、三种失效模式各被抓、还原后逐字节一致）。

**派生教训**：审计的**类别体系**本身要被审计。本次 34 个 category 里有 16 个只出现一次。

## 4. 建议的提交拆分

按可独立回滚的边界切，**每个都能单独通过全部闸门**：

1. `fix(tuffex): 组件源码修复` —— 118 个 `.vue` + 74 个 `.ts` + 90 个测试。逻辑 bug、a11y、类型泄漏、缺失导出。测试与修复同 commit，可对抗验证。
2. `docs(nexus): 精简组件文档并统一范式` —— 177 个 `.mdc`。净减 8322 行。
3. `fix(nexus): 修复 MDC 围栏深度不匹配` —— 20 处 1 字符改动 + `api/clipboard` 的 VitePress 语法残留。**单独拆开**，因为它修的是渲染 bug 不是内容。
4. `build(nexus): 新增 MDC 围栏守卫` —— `check-mdc-fences.mjs` + npm script。
5. `test(tuffex): 新增编译期契约守卫` —— 两个 `.contract.ts`。
6. `docs(tuffex): 同步陈旧 demo` —— 26 个 demo `.vue`。

## 5. 待决四件

### ① 提交
487 文件全部未提交。全程无任何 agent 执行过 `git commit`。

### ② 112 个 GitHub issue
（`created-issues.tsv` 实录 112，编号 #363–#474。此前口径「113」是约数。）

详见 `issue-reconciliation.md`：

- **45 个可直接关** —— 主诉落在已完成批次，有文件改动佐证
- **5 个从一开始就不成立** —— #394 / #414 / #431 / #435 / #438，各仅 1 条 finding 且全被驳回，零代码改动
- **62 个需改写后保留** —— 正确动作不是原样关也不是原样留，而是把已修 + 已判不成立的条目从描述里划掉

> 有一处冲突未替你拍板：`sortable-list` #450 既有 `refutedReason`（认为竞态不可达）又有台账记录的防御性修复，两说都真。

### ③ 144 个死重 demo 文件
- **137 个从未注册** —— 历史遗留，本任务之前就在
- **7 个本轮产生** —— `auto-sizer` ×2、`fusion` ×5，文档精简时移除了引用，但 `.vue` 文件和 registry 条目仍在

> **口径陷阱**：判孤儿必须用**全 `content/` 范围**。只扫 `components/` 会把
> `ComponentsDashboardSparklineDemo` 误判成孤儿——它掉了 `index.mdc` 的引用，
> 但仍被 `getting-started` / `tuffex-composition` 引用。demo registry 服务全站。

三方链零悬空（不是断链）。删文件不可逆，全程未让任何 agent 动。

### ④ `audit:size` 既存债（与本任务无关）
```
Base CSS   28.4 / 16.0 KiB   超 77%
Full CSS  382.7 / 330.0 KiB  超 16%
Core App renderer 根导入 2 / 0
```
**至少从 2026-06 起就红，从没人跑过**。归因已独立核实：两处根导入所在文件工作树零改动且在 `apps/core-app/`（另一会话地盘）；base.css 三个样式源冻结于 2026-06-21；预算块最后改动 2026-06-05。本轮对组件样式净增经逐文件 `<style>` diff 量化为 **+4,842 B**，仅占 54,009 B 超额的 <9%。

正面结论：CHANGELOG 里那些「防回涨」守卫**全绿**——gsap / v-wave / @codemirror 动态加载、scroll pull 插件、empty-state 轻量别名全部通过，empty-state 与 HEAD 逐字节相同。**本轮没有让任何按需入口回涨。**

## 6. 闸门状态

```
vitest                    907 passed (123 files)   exit 0
tuffex vue-tsc --noEmit   0 errors                 exit 0
declaration emission      0 errors                 exit 0
audit:exports                                      exit 0
audit:types                                        exit 0
check:mdc-fences          448 个 .mdc 全平衡        exit 0
demo 三方链               零断链、零悬空
zh/en 对等                字段集/段数/demo 三项 0 差异
```

> 全量 vitest 在 agent 写文件期间会产生**假失败**（本任务出现 4 次，每次隔离复跑均 3/3 通过）。判定失败必须隔离复跑。


---

## 7. 本文件已被对抗性核验

`delivery-verification.md` —— 由未参与撰写的 agent 独立复算，取样于三路 agent 仍在改文档时。

**结论：可作决策依据。** 已按其发现修正 4 处（规模漏计未跟踪文件、frontmatter 分母、死重 145→144、`.mdc` 总数）。

**它标为「不可独立验证」的两项**（诚实标注而非照抄）：
- `vitest 907` —— 并发改文件期间全量跑会假失败（本任务发生 4 次），需静默工作树复验
- issue 三分类 —— 依赖 `issue-reconciliation.md` 的批次级推导，非逐条复跑
