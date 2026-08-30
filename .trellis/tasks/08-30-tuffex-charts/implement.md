# tuffex-charts 执行计划（父任务）

父任务不直接写实现代码；本文件是跨子任务的执行顺序、公共验证与集成审查清单。各子任务的细粒度 checklist 在各自任务目录。

## 分支策略

- 全部子任务基于 `master` 拉特性分支（base_branch 已设 master；当前会话所在 docs 分支含未推送提交，勿混入）。
- 建议单一特性分支 `feat/tuffex-charts` 串行推进子任务（同包内改动，拆分支徒增合并成本）；docs 子任务视情况同分支或独立分支。

## 执行顺序

1. **foundation**（脚手架 + Colors + Legend）→ 完成后包能 build、palette 单测绿。
2. **primitives**（TxChart + 轴/网格/系列 + tooltip stage）→ 完成后 Custom Chart 能力可用，line/bar/donut demo 可手搓。
3. **timeseries**（依赖 primitives）；**sankey**、**maps**（只依赖 foundation，可与 timeseries 并行，若并行注意 barrel/index.ts 是共享文件——各子任务只 append 自己的导出段，冲突时人工合并并跑语义 gate（仓库已知教训：自动合并的才危险））。
4. **docs**（依赖全部实现子任务）。
5. 父任务终审。

## 公共验证命令（每个子任务收尾必跑）

```bash
pnpm --filter @talex-touch/tuffex-charts typecheck
pnpm --filter @talex-touch/tuffex-charts test
pnpm --filter @talex-touch/tuffex-charts build
pnpm --filter @talex-touch/tuffex-charts exec eslint --cache .
```

docs 子任务另加：nexus typecheck（严格配置侧）+ mdc 围栏检查 + `pnpm nexus:dev` 渲染核验。

## 审查门

- 每个子任务 `task.py start` 前：其 prd 就绪、依赖子任务已归档（或明确说明可并行）。
- 每个子任务收尾：更新父 design.md §12 对照表对应行；trellis-check 过一遍。
- 父任务终审 checklist：
  - [ ] barrel 导出 = design §12 对照表的「同名/改名/改进」全集，无缺项
  - [ ] `pnpm why echarts` 确认 tuffex-charts 依赖树无 echarts
  - [ ] 六页文档与实现一致（禁幻影 API——文档不得描述未实现行为，仓库审计已知重灾区）
  - [ ] spec 更新（3.3）：新包写入 .trellis/spec/frontend 相关索引

## 回滚点

- foundation 之前零共享文件改动；整包回滚 = 删除 `packages/tuffex-charts` 目录（workspace 通配自动摘除）。
- docs 子任务前，nexus 侧零改动；docs 回滚 = 撤销 content/registry/sidebar 接线各文件。
