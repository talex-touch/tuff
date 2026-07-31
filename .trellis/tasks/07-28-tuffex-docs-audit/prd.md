# tuffex 组件文档与源码一致性审计

## Goal

对 `packages/tuffex/packages/components/src` 下全部组件与 `apps/nexus/content/docs/dev/components` 下全部组件文档做一次全量交叉审计，产出可执行的整改清单，并为每个存在问题的组件在 `talex-touch/tuff` 建立一个 GitHub issue。

本任务**只产出审计结论与 issue，不修改组件或文档源码**。整改由后续任务按 issue 逐个认领。

## Scope

| 项 | 数量 | 路径 |
|---|---|---|
| 组件源码目录 | 114 | `packages/tuffex/packages/components/src/<name>/` |
| 组件文档（zh） | 118 | `apps/nexus/content/docs/dev/components/<name>.zh.mdc` |
| 组件文档（en） | 118 | `apps/nexus/content/docs/dev/components/<name>.en.mdc` |
| Demo 组件 | 443 文件 / 306 已注册 | `apps/nexus/app/components/content/demos/` |

不在范围内：`plugins/` 下的插件包、`apps/core-app` 渲染层组件、非组件类文档（guide / api / architecture）。

## 审计维度

审计每个组件时必须覆盖以下 5 个维度，缺一不可。

### D1 — 文档 vs 源码 API 一致性
- 文档 `## API` 段（`TuffPropsTable` / `DocApiTable`）声明的 props、events、slots、expose，与 `src/*.vue` + `src/types.ts` 实际实现逐项比对。
- 判定：**幻觉 API**（文档有、代码无）、**漏文档 API**（代码有、文档无）、**类型/默认值不符**、**已废弃仍在文档中**。
- `## Source` 段落中引用的文件路径、导出别名、测试覆盖描述必须真实存在。

### D2 — Demo 有效性
- 文档中 `::TuffDemoWrapper{demo="X"}` 引用的 `X` 必须在 `demo-registry.ts` 注册且 `demos/X.vue` 存在。
- 文档内联 `code:` 代码块必须与真实 demo 文件的实现语义一致（不得是过期或杜撰的示例）。
- 内联示例中使用的 props / 组件名必须是组件真实支持的。

### D3 — 中英文档对等
- zh / en 两份的二级章节结构、demo 数量、frontmatter 字段必须一致。
- 判定单语缺章、单语缺示例、译文与原文描述语义漂移。

### D4 — 组件代码质量
- 源码本身的缺陷：逻辑 bug、可访问性缺失（aria / 键盘可达 / 焦点管理）、类型缺陷（`any` 泄漏、类型与运行时不符）、`index.ts` 导出遗漏、SSR 不安全（直接访问 `window` / `document`）。

### D5 — 文档范式统一与精炼
用户明确诉求：**文档不要又长又臭，要用精炼语言表达每个组件的设计目的，统一目录结构与设计范式，简洁讲清每个 API 怎么用。**
- 是否在开头用 1–3 句讲清**该组件的设计目的与适用场景**（而非罗列特性）。
- 章节结构是否符合统一范式。
- 是否存在冗余堆砌：重复示例、与设计目的无关的长篇铺陈、同一 API 反复演示。
- 每个 API 是否给出了"怎么用"的判断依据（而非仅有类型签名）。

## 已确认的基线问题（机械核对结果，无需再验证）

1. **137 个孤儿 demo 文件** — `demos/` 下 443 个 `.vue`，仅 306 个在 `demo-registry.ts` 注册，137 个（31%）从未被任何文档引用。
2. **文档长度失控** — zh 文档从 71 行（`os-icon`）到 1802 行（`card`），相差 26 倍；总计 26990 行。超过 400 行的有 12 个。
3. **frontmatter 字段不统一** — 118 个 zh 文档中：`status` 缺 23、`since` 缺 23、`tags` 缺 13、`category` 缺 1。
4. **章节范式混乱** — 仅 1 个文档有 `## Usage`，22 个有 `## Slots`，4 个有 `## Events`；其余为各写各的自定义标题。
5. **5 个文档无对应组件目录** — `avatar-variants`、`chat-composer`、`foundations`、`index`、`typing-indicator`（需区分「元文档」与「子组件文档」还是「孤儿文档」）。
6. **3 个文档无任何 API 表** — `avatar-variants`、`foundations`、`index`。
7. **Demo 引用链路本身是干净的** — 文档引用 ↔ registry 注册 ↔ demos 文件三者对齐，0 断链。D2 审计应聚焦「内联 code 与真实 demo 的语义一致性」而非断链。

## Requirements

- R1：114 个组件目录 + 118 组文档全部被覆盖审计，不得抽样。
- R2：每条 findings 必须带 `file:line` 级证据，不接受"看起来像"的结论。
- R3：findings 必须经过独立的对抗式验证，未通过验证的不进入报告与 issue。
- R4：产出一份完整审计报告 Markdown，落到任务目录。
- R5：每个存在问题的组件在 `talex-touch/tuff` 建 1 个 GitHub issue。
- R6：issue 标题统一为 `[tuffex] <component>: <一句话摘要>`；新建 `tuffex`、`docs-audit` 两个 label 并打上。
- R7：跨组件的共性问题（如 137 孤儿 demo、frontmatter 缺字段）另开 1 个汇总 issue，不重复塞进每个组件 issue。
- R8：建 issue 前必须先检查现有 56 个 open issue，避免重复。

## Constraints

- 本任务不修改任何组件源码、文档源码、demo 文件。
- 建 issue 是外部可见的不可逆操作：报告产出后需用户确认，方可批量创建。
- 审计采用并行 workflow（用户已授权），token 预算按需分配。

## Acceptance Criteria

- [ ] 114 个组件全部完成 5 维度审计，覆盖率可核查
- [ ] 所有 findings 经对抗式验证，报告中标注 CONFIRMED / PLAUSIBLE
- [ ] 审计报告落到 `.trellis/tasks/07-28-tuffex-docs-audit/report.md`，含按组件与按问题类型两个索引
- [ ] `tuffex`、`docs-audit` label 已在仓库创建
- [ ] 每个问题组件对应 1 个 issue，标题前缀与 label 正确
- [ ] 1 个跨组件共性问题汇总 issue
- [ ] 无重复 issue（与现有 open issue 比对过）
- [ ] issue 正文含：问题清单、证据路径、建议改法、验收标准
