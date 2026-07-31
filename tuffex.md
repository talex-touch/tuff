# tuffex 组件文档审计 —— 交接文档

> 2026-07-28 起的一轮全量审计与修复。详细产物在 `.trellis/tasks/07-28-tuffex-docs-audit/`。

## ⚠️ 提交状态：部分已提交，有一个关键缺口

```
b73d540f8  fix(tuffex): remediate component audit findings      292 文件 +6143 −748
2a586c405  test(tuffex): guard component export and instance contracts   2 文件 +291
```

**但 MDC 围栏守卫没进库**，这是最要紧的缺口：

```
未跟踪:  apps/nexus/build/check-mdc-fences.mjs
未提交:  apps/nexus/package.json 里的 check:mdc-fences script
```

**后果**：`pnpm -C apps/nexus check:mdc-fences` 对任何 clone 仓库的人都不存在。
本轮清零的 23 处围栏 bug 没有任何东西防止它复发——而这类 bug 三道闸全绿也看不见。

**下次第一件事**：
```bash
git add apps/nexus/build/check-mdc-fences.mjs apps/nexus/package.json
git commit -m "build(nexus): add MDC fence guard"
```

另外仍未提交：27 个 `.vue`（demo 同步）+ `package.json`。

## 待办 0：7 个文档的 `verified: true` 已成假断言（**已进库**）

`verified: true` 断言「本文档已对照源码验证过」。以下 7 个正文被大改，但那一行**逐字节没动**，且已随 `b73d540f8` 提交：

| 文档 | 正文删除 |
|---|--:|
| `card` | −1493 |
| `fusion` | −1363 |
| `avatar-variants` | −977 |
| `slider` | −621 |
| `glass-surface` | −307 |
| `container` | −151 |
| `context-menu` | −118 |

断言是对**重写前**的内容做的。前 4 个删了半页以上。

**建议**：这 7 个 `verified: false` / `syncStatus: needs-review`，或提交前真人重审。
对照：`flat-dropdown` / `utils` 已诚实标 `verified: false`。

`verified` 在 nexus 代码里无消费方（纯元数据），改它不影响渲染。

## 待办 0b：11 个 `since` 不准确

源码 2026-02-16 之后才首次出现、却标 `since: 1.0.0`：

```
2026-05-21  copy-button  divider  kbd  number-input  textarea
2026-06     markdown-editor  ai-elements  icon-button  os-icon
边界         edge-fade-mask(02-18)  transfer(02-22)
```

最硬的是 2026-05 后那 9 个（差 5–6 个月）。严格说是**漏标 / 默认值滥用**，不是凭空编造——`1.0.0` 同时是「未版本化默认值」。

**⚠️ 一个待裁定的连锁问题**：`base-anchor` / `base-surface` 标 `since: 2.5.0`，但源码首次出现是 **2026-02-16**——和同一天出现、标 `2.4.7` 的 `error-state`/`flat-radio`/`flat-select`/`guide-state` 矛盾。

**这污染了一条先例**：本轮定 `version-capsule` 的 `since` 时，我用「`flat-dropdown`(07-24) 标 2.5.0，最近邻居胜出」推出 `version-capsule`(07-25) = 2.5.0。`flat-dropdown` 那条是对的（真·全新），但 `base-anchor` 的 2.5.0 若是误标，则「2.5.0 是下一未发布版」这个推理基础需要重验。

## 快速恢复

```bash
# 四道闸门（全部应 exit 0）
cd packages/tuffex && npx vitest run                       # 907 passed
cd packages/tuffex && npx vue-tsc --noEmit -p tsconfig.json # 0 errors
cd packages/tuffex && npm run audit:exports && npm run audit:types
pnpm -C apps/nexus check:mdc-fences                          # 448 个 .mdc
```

**⚠️ 并发期全量 vitest 会假失败**（本轮发生 5 次，每次隔离复跑均 3/3 通过）。判定失败**必须**隔离复跑单组件。

## 已完成

421 条 finding 分 14 批处理完。**502 文件 / ≈+9581 行**（其中 15 个新文件 / 821 行未跟踪，**提交时必须 `git add`**）。

| 区域 | 文件 | 增 | 删 |
|---|--:|--:|--:|
| 组件文档 `.mdc` | 177 | +1791 | −10113 |
| 测试 | 90 | +3553 | −63 |
| 组件源码 `.vue` | 118 | +1983 | −542 |
| 类型 / 入口 `.ts` | 74 | +381 | −143 |
| demo `.vue` | 26 | +449 | −175 |

**新增文件**（不在 `git diff` 里）：`apps/nexus/build/check-mdc-fences.mjs`、`packages/tuffex/packages/components/{missing-export,instance-drift}.contract.ts`、`apps/nexus/content/docs/dev/components/utils.{zh,en}.mdc`、3 个测试、7 个 `types.ts`。

### D5 指标（用户原始诉求）

| 指标 | HEAD | 现在 |
|---|--:|--:|
| frontmatter 8 字段齐备 | 95/117 (81.2%) | **118/118 (100%)** |
| 开头讲设计目的（zh） | 99/117 | **112/118** |
| 二级段数中位数 | 7 | 7（>12 的文档从 8 个降到 1 个） |
| zh/en 对等（字段集/段数/demo） | — | **三项 0 差异** |

分母是 118 = 组件文档，**排除 `index`（landing page，无版本无成熟度，不该有 `since`/`status`）**。

体积典型降幅：`fusion` 1513→181、`avatar-variants` 1014→70、`card` 1800→465、`slider` 817→216、`glass-surface` 499→207。

## 待办

### A. 9 条幻影 API（已定位，未修）

见 `phantom-api-scan.md`。文档说了假话，读者照做会失败：

**凭空描述不存在的实现**
- `popover` zh `description:3`「基于 Tooltip 与 Anchor 链路」→ 源码只有 `TxBaseAnchor`
- `breadcrumb` 默认 `separatorIcon` 写 `'chevron-right'` → 源码是 `'i-carbon-chevron-right'`，无 `i-` 前缀在 TxIcon 里解析成 `null`
- `flat-input` CapsLock「基于 key code + shiftKey」→ 源码用 `getModifierState`，注释明说 keyCode 方案 was wrong
- `stagger` 「mount 后才应用 name/appear」→ 源码首帧就传
- `switch` 「根节点渲染 tabindex」→ 原生 `<button>` 无 tabindex 绑定
- `container` demo 用 `var(--tx-color-surface)` → 该变量全仓零定义

**反向幻影（否认真实行为）**
- ~~`loading-overlay`~~ **已修** —— 原文否认 `role=status`/`aria-live`/焦点陷阱，源码 `:73-74,:94-95,:52-54` 三样全有，只缺模态语义。已改成准确描述并指明「不需要另行补播报」
- `toast` 「复用 id 不取消旧定时器」→ 源码 `:51` 明确 clear 后重置
- `dialog` 把 `TxBlowDialog` 归进「稳定内部 id」→ 它用 `useId()`

### B. 4 件决策（见 `delivery.md`）

1. **提交** —— 502 文件全部未提交，全程无 `git commit`。建议拆分见 `delivery.md` §4
2. **112 个 GitHub issue** —— 45 可关 / 5 从一开始就不成立 / 62 需改写。见 `issue-reconciliation.md`
3. **144 个死重 demo** —— 137 历史遗留 + 7 本轮产生（`auto-sizer`×2、`fusion`×5，每个有报备理由）。三方链零悬空
4. **`audit:size` 既存债** —— 至少从 2026-06 起红、从没人跑过。本轮净增仅 +4,842 B（占超额 <9%），与本任务无关

### C. 收尾时中断的

- `frontmatter-truth-scan.md` —— 全库 frontmatter 伪造值排查未扫完（其余全部收尾）

层级归一 7/7 已完成：`tabs` 13→7、`gradual-blur` 14→6、`select` 13→6、`base-anchor` 13→6、`icon` 15→9、`group-block` 20→11（6 个 H1，按子组件保留）、`card` 18→6。
**全库二级段数中位数 7，>12 的文档从 8 个降到 1 个（仅 `index` 15，landing page 不适用组件范式）。**

## 本轮发现的、审计四维度覆盖不到的缺陷类

### 1. MDC 围栏深度不匹配（已清零 + 已加守卫）

`::Foo` 开、`:::` 闭 → 容器永不闭合，**把文件剩余内容全部吞成子节点**，整页文档半页从渲染结果消失。eslint / typecheck / vitest 三道闸全绿也看不见。

全库 23 处。审计撞见 3 次却记在**三个各自只出现一次的类别名**下，永远聚不成批次。

守卫：`pnpm -C apps/nexus check:mdc-fences`。**规则是开闭冒号数相等，不是「必须三个」**——全库 130 个 depth-2 块是刻意约定（22 个组件，19%），写成「统一三冒号」会误改一堆正确的块。

### 2. 腐坏的否定断言（8 处，5 已修 3 未修）

文档写「本组件**不**做 X」，源码后来做了 X。**比遗漏更糟**——它通常附带「所以你要自己做 X」的建议，腐坏时会主动误导读者做无用功。

典型：`splitter` 原文「没有暴露 aria-valuenow/min/max，建议在外部补充可见反馈」→ m4c 加上了这三个属性，读者照做会白写一套。

**四个维度全都抓不到**：D1 比对的是 Props/Events/Slots **条目**，否定性散文不是条目；D3 两份译文可以**同样地假**；D4 只看源码不回看文档。

检查方法：搜 `不支持`/`不会`/`没有暴露`/`不自动`/`does not`/`should ... yourself`，逐条回源码核实。

## 陷阱清单（重蹈会浪费大量时间）

**扫描 `.mdc` 必须排除代码块** —— `` ``` `` 围栏 **和** MDC 组件的 `code: |` YAML 字面量块（里面有 markdown 示例）。本轮因此误判三次：`## 方向` 报 615 实际 2、重复 H2 报 114/119 实际 1。`check-mdc-fences.mjs` 里的实现是对的，照抄。

**查「组件用没用某 lib」必须静态 + 动态双查** —— `scroll` 经 `await import('@better-scroll/core')` 加载，静态 `from '...'` grep 看不见。

**权威符号集必须跨全部子包** —— `TxToast*` 类型在 `packages/tuffex/packages/utils/`，不在 `components/`。只扫 components 会报出一堆假幻影。

**提取导出名要含 `export type X = ...`** —— 只抓 `export { }` 块会把所有 `*Instance` 类型误报成幻影（本轮一度报出 53 个，实际 0）。

**判 demo 孤儿必须用全 `content/` 范围** —— registry 服务全站。只扫 `components/` 会把 `ComponentsDashboardSparklineDemo` 误判成孤儿（它仍被 `getting-started`/`tuffex-composition` 引用）。

**判结构膨胀，分母是 H1 数不是文档数** —— `group-block` 有 20 个 H2 但 6 个 H1（多组件文档），平均 3.3 个／组件，正常。按单组件范式压平会把 `BlockSwitch` 的段塞进 `GroupBlock` 底下。

**`vue-tsc --noEmit` 不检查声明可发射性** —— 要单独跑 `--declaration --emitDeclarationOnly` 才能抓 TS4023（会导致 `.d.ts` 静默缺失）。

**`__tests__/` 被 vue-tsc 排除** —— 类型断言放测试里等于没有。编译期守卫要放 `packages/components/*.contract.ts`（该位置实测被覆盖，且 `files: ['dist']` 不发布）。

**泛型 SFC 破坏 `InstanceType`** —— `<script setup generic="T">` 编译成函数不是构造签名，`InstanceType<typeof X>` 报 TS2344，加 `<any>` 实例化也不行。解法见 `instance-drift.contract.ts`（零依赖的 `ExposedOf<T>`；`vue-component-type-helpers` 是 phantom dep，全仓无人声明）。

**多 agent 环境里别做瞬时 RED 注入验证守卫** —— 会污染所有并发 vue-tsc 读数。用永久 `@ts-expect-error` 反向控制，同样的对抗性证明、无副作用。

## 协作纪律（多 agent 并行时）

- **归属按文件类型划，不按组件名** —— a11y 批占 `.vue`+`__tests__`，文档批占 `.mdc`，同组件可安全并行
- **多方认领的 `.mdc` 只能外科式 Edit，绝不整文件 Write**，且每次编辑前紧邻重读
- **指令会过期，现场才是事实** —— 派活方可能自己干完却忘了撤回；收到指令先核实现场，矛盾就停手上报
- **cold 文件 ≠ 可做** —— cold 也可能是「已做完」。热度只判「动手安不安全」，判「还该不该做」得先读文件看缺陷是否还在
- **`evidence.quote` 和行号大面积过期** —— 审计快照与现场早已不符，一律以现场为准

## 审计本身的可靠性

`findings.json` 的 `suggestion` 字段**多次被证明不可靠**（`badge`/`base-surface`/`toast`/`loading-overlay` 的建议都是错的）。**它定位问题准，开药方不一定准**——每条都要回源码核实。

`category` 体系也需要审计：本轮 34 个 category 里 **16 个只出现一次**，正是这种碎片化藏住了 MDC 围栏那一整类 bug。
