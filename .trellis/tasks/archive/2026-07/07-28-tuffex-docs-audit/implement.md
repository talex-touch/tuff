# Implement — tuffex 组件文档与源码一致性审计

## 执行清单

### Step 0 — 基线固化 ✅ 已完成
- [x] 提取 114 组件目录清单 → `/tmp/comps.txt`
- [x] 提取 118 zh / 118 en 文档清单
- [x] 交叉核对 demo 引用 ↔ registry ↔ 文件：0 断链、137 孤儿文件
- [x] frontmatter 字段覆盖统计：status 缺 23、since 缺 23、tags 缺 13、category 缺 1
- [x] 文档长度分布：71 ~ 1802 行
- [x] 章节标题频次统计

产物：已写入 `prd.md` 的「已确认的基线问题」一节。

### Step 1 — 生成分片清单
- [ ] 按组件目录体积（文件数 × 总行数）降序排序 114 个组件
- [ ] 蛇形分配到 29 个 shard，写入 `shards.json`
- [ ] 校验：29 片组件数之和 == 114，无重复、无遗漏

验证：`jq '[.[].components[]] | length' shards.json` → 114；`jq -r '.[].components[]' shards.json | sort -u | wc -l` → 114

### Step 2 — Phase A 并行审计
- [ ] 每个 shard 派 1 个 agent，prompt 内联完整审计契约（design.md §2）
- [ ] 每个 agent 用 `schema` 强制返回结构化 findings
- [ ] agent 必须实际读取文档 + 源码 + demo 三方文件，禁止凭组件名推测

Gate：任一 shard 返回 `null` 或 findings 全为空且未说明理由 → 重跑该 shard。

### Step 3 — Phase B 对抗验证
- [ ] high severity findings → 2 个 verifier（证据真伪 + 语义误读）
- [ ] medium severity findings → 1 个 verifier
- [ ] low severity（D5 范式类）→ 跳过验证，标 PLAUSIBLE
- [ ] 淘汰所有 REFUTED 与证据行号对不上的 finding

Gate：验证淘汰率若 > 60%，说明 Phase A prompt 有问题，回到 Step 2 收紧判据重跑。

### Step 4 — 汇总报告
- [ ] 生成 `report.md`（design.md §5 结构）
- [ ] 覆盖率自检：114 个组件都在「按组件索引」中出现
- [ ] 统计表：findings 按维度 × 严重度交叉分布

Gate：**暂停，交用户过目**。用户确认后才进入 Step 5。

### Step 5 — 建 label
- [ ] `gh label create tuffex --color 5B4FE9 --description "TuffEx component library"`
- [ ] `gh label create docs-audit --color 0E8A16 --description "Findings from component docs/source audit"`

验证：`gh label list | grep -E 'tuffex|docs-audit'`

### Step 6 — 去重检查
- [ ] `gh issue list --state open --limit 200 --json number,title` 拉全量
- [ ] 与待建 issue 的组件名比对，命中的标记为 skip 并记录在报告中

### Step 7 — 批量建 issue
- [ ] 每个有 high/medium findings 的组件建 1 个 issue
- [ ] 1 个跨组件共性问题汇总 issue（137 孤儿 demo + frontmatter + 范式统一）
- [ ] 标题 `[tuffex] <component>: <摘要>`，label `tuffex` + `docs-audit` + 维度 label
- [ ] 建完回写 issue 号到 `report.md`

验证：`gh issue list --label docs-audit --limit 200 --json number,title --jq 'length'` 与预期数量一致

### Step 8 — 收尾
- [ ] `report.md` 补全 issue 编号索引
- [ ] 更新 spec（若审计暴露出需要沉淀的文档规范，写入 `.trellis/spec/frontend/`）
- [ ] commit（仅任务产物，不含源码改动）

## 回滚点

| 阶段 | 回滚方式 |
|---|---|
| Step 2–4 | 无副作用，直接重跑 |
| Step 5 | `gh label delete tuffex --yes` / `gh label delete docs-audit --yes` |
| Step 7 | `gh issue list --label docs-audit --json number --jq '.[].number' \| xargs -n1 gh issue close`；必要时 `gh issue delete <n>` |

Step 7 是唯一不可轻易回滚的步骤，因此 Step 4 后必须有人工 gate。

## 验证命令

```bash
# 分片完整性
jq -r '.[].components[]' .trellis/tasks/07-28-tuffex-docs-audit/shards.json | sort -u | wc -l   # 期望 114

# 报告覆盖率
grep -c '^### ' .trellis/tasks/07-28-tuffex-docs-audit/report.md

# issue 数量
gh issue list --label docs-audit --state open --limit 300 --json number --jq 'length'
```

## 不做

- 不改组件源码 / 文档 / demo
- 不删孤儿 demo 文件
- 不跑 build / typecheck
