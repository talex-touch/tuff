# Design — tuffex 组件文档与源码一致性审计

## 1. 总体形态

三阶段流水线，全程并行，只读不写源码：

```
Phase A  分片审计     114 组件 → 29 个 shard（每片 4 组件）→ 并行 agent，每片输出结构化 findings
Phase B  对抗验证     每条 finding → 独立 verifier，默认判 REFUTED，证据不足即淘汰
Phase C  汇总建档     报告落盘 → 用户确认 → 批量建 issue
```

Phase A → B 用 `pipeline()` 而非 `parallel()`：某个 shard 审完就立刻进入验证，不等其他 shard，避免屏障浪费。

## 2. 审计契约（所有 agent 共享的判据）

### 2.1 每个组件的输入集合

```
文档：  apps/nexus/content/docs/dev/components/<name>.zh.mdc
        apps/nexus/content/docs/dev/components/<name>.en.mdc
源码：  packages/tuffex/packages/components/src/<name>/index.ts
        packages/tuffex/packages/components/src/<name>/src/*.vue
        packages/tuffex/packages/components/src/<name>/src/types.ts
        packages/tuffex/packages/components/src/<name>/__tests__/*     （若有）
Demo：  文档中 demo="X" 引用的 apps/nexus/app/components/content/demos/X.vue
```

### 2.2 统一文档范式（D5 的判据基线）

> **⚠️ 修正记录（审计执行中发现）**
> 初版标尺假定应为 `## Usage / ## Examples / ## API / ## Source`（英文段名）。
> 实测发现文档**已有事实标准**，且是中文段名，覆盖率如下 —— 初版标尺会把 118 个文档全部误判。
> 已启动的 workflow 使用的是初版标尺，因此其 `d5-missing-section` / `d5-nonstandard-section`
> 两类 finding **一律作废**，改用本节修正后的机械核对结果（`baseline-sections.md`）。
> D1–D4 与其余 D5 子类（`d5-no-purpose` / `d5-bloat` / `d5-shallow-api`）不受影响。

**事实标准段**（按 118 个 zh 文档的实际覆盖率倒推）：

| 段名 | 覆盖 / 118 |
|---|---|
| `## 审阅说明` | 117 |
| `## Source` | 116 |
| `## 最佳实践` | 115 |
| `## API` | 115 |
| `## 交互契约` | 101 |
| `## 基础用法` | 97 |

规范目标结构：

```markdown
---
title, description, category, status, since, tags, syncStatus, verified   # 8 个字段必填
---

# <Component> <中文名>

<1–3 句。讲清「为什么存在」和「什么时候该用 / 不该用」，不罗列特性。>

## 基础用法      最小可用示例；子场景一律用 ### 三级标题，不新开二级段
## 交互契约      状态机 / 事件时序 / 边界行为
## API           ### Props / ### Events / ### Slots / ### Expose
                 description 必须写「何时设 / 怎么用」，不是重复 type
## 最佳实践      选型建议（如 TxCard vs TxBaseSurface）、反模式
## Source        源码路径、导出别名、测试覆盖
## 审阅说明      同步状态与审阅记录
```

判定规则：
- 开头无设计目的陈述，或只罗列特性 → `d5-no-purpose`（agent 判定）
- zh 文档 > 400 行，或同一 API 被 3 个以上 demo 重复演示 → `d5-bloat`（agent 判定）
- Props 表 description 仅复述类型、未说明使用场景 → `d5-shallow-api`（agent 判定）
- 缺事实标准段 → 机械核对，见 `baseline-sections.md` §A
- 自定义二级标题应降级为 `###` → 机械核对，见 `baseline-sections.md` §B
  （实测 205 个自定义二级标题，其中 186 个只出现一次）

### 2.3 Finding 结构

```json
{
  "component": "button",
  "dimension": "D1|D2|D3|D4|D5",
  "category": "hallucinated-api | undocumented-api | type-mismatch | stale-demo-code |
               lang-parity | a11y | ssr-unsafe | missing-export | d5-bloat | ...",
  "severity": "high | medium | low",
  "summary": "一句话说清缺陷",
  "evidence": [{"file": "相对路径", "line": 123, "quote": "原文片段"}],
  "suggestion": "建议怎么改",
  "confidence": "high | medium | low"
}
```

`evidence` 至少 1 条且必须含真实 `file` + `line`。无证据的 finding 在 Phase B 直接淘汰。

### 2.4 严重度定义

| severity | 含义 |
|---|---|
| high | 会误导使用者写出跑不通的代码：幻觉 API、示例代码用了不存在的 prop、组件真实 bug |
| medium | 信息缺失但不致错：漏文档 API、单语缺章、a11y 缺失、frontmatter 缺字段 |
| low | 体验/规范问题：范式不统一、冗长、description 太浅 |

## 3. 分片策略

114 个组件按**目录体积降序**做蛇形分配（snake draft），使每片工作量均衡——`card`、`fusion`、`slider` 这类大组件不会挤在同一片。

- 分片数：29（每片 3–4 个组件）
- 并发上限由 runtime 控制（min(16, cores-2)），29 片会自动排队
- 每个 shard agent 的 prompt 内联完整审计契约，不依赖外部文件读取

## 4. 对抗验证协议

每条 `severity ∈ {high, medium}` 的 finding 派 1 个 verifier；`high` 派 2 个（不同视角：一个查证据真伪，一个查是否为误读语义）。

verifier 的指令是**证伪**而非确认：

> 默认这条 finding 是错的。打开 evidence 指向的文件与行号，确认引用是否真实存在、结论是否成立。
> 只要证据行号对不上、引用内容与原文不符、或结论依赖未验证的假设 —— 判 REFUTED。
> 只有当你亲自读到原文并确认缺陷成立时，才判 CONFIRMED。

`low` severity（D5 范式类）不做对抗验证，走 PLAUSIBLE 通道直接入报告——因为它是风格判断，不存在"证伪"。

存活规则：
- high：2 个 verifier 至少 1 个 CONFIRMED，且无 verifier 指出证据造假
- medium：1 个 verifier CONFIRMED
- low：直接标 PLAUSIBLE

## 5. 报告结构

落盘至 `.trellis/tasks/07-28-tuffex-docs-audit/report.md`：

```
1. 执行摘要        覆盖率、findings 总数、按维度/严重度分布
2. 跨组件共性问题   137 孤儿 demo、frontmatter 缺字段、范式不统一（对应汇总 issue）
3. 按组件索引      114 个组件逐个列出 findings（无问题的也列出，标「通过」）
4. 按问题类型索引   同类问题横向聚合，便于批量整改
5. 建议整改顺序     按 severity × 影响面排序
```

## 6. Issue 契约

### 标题
`[tuffex] <component>: <一句话摘要>`

### Label
新建两个：
- `tuffex` — 颜色 `#5B4FE9`，描述 `TuffEx component library`
- `docs-audit` — 颜色 `#0E8A16`，描述 `Findings from component docs/source audit`

每个 issue 同时打 `tuffex` + `docs-audit`，再按主要维度补打现有 label：D1/D2/D3/D5 → `documentation`，D4 → `bug` 或 `enhancement`。

### 正文模板

```markdown
> 来源：tuffex 组件全量审计（2026-07-28）· 组件 `<name>`

## 问题清单

### [high] <summary>
- 维度：D1 文档 vs 源码 API 一致性
- 证据：`path/to/file.ts:123`
  > 原文引用
- 建议：<怎么改>

（按 severity 降序列出全部 findings）

## 验收标准
- [ ] <可核查的完成条件>

## 相关文件
- 文档：`apps/nexus/content/docs/dev/components/<name>.{zh,en}.mdc`
- 源码：`packages/tuffex/packages/components/src/<name>/`
```

### 去重
建 issue 前拉取现有 56 个 open issue 的标题，对组件名做匹配；命中则跳过并在报告中标注，不自动追加评论。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| Agent 幻觉出不存在的 API 差异 | Phase B 对抗验证，默认证伪；证据必须带行号 |
| 114 个组件 × 5 维度 → findings 爆炸，issue 淹没仓库 | severity=low 的范式问题不单独开 issue，收进汇总 issue；单组件 issue 只收 high/medium |
| 批量建 issue 不可逆 | 报告产出后暂停，用户确认后才执行创建；先建 label 再建 issue |
| shard 之间判据不一致 | 审计契约完整内联进每个 agent 的 prompt，不靠外部文件 |
| 长文档（1802 行）超出 agent 有效阅读 | 大组件单独成片，且允许 agent 分段读取 |

## 8. 显式不做

- 不修改任何组件源码、文档、demo。
- 不删除 137 个孤儿 demo 文件（只在汇总 issue 中列出清单）。
- 不改写文档结构（范式统一是后续任务）。
- 不跑 `pnpm build` / `typecheck`（本任务是静态审计，不验证构建）。
