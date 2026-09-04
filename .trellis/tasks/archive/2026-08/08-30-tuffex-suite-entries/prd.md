# tuffex base/pro/ai 三入口

父任务：`.trellis/tasks/08-30-docs-suite-split`（设计见父 design.md §3；步骤见父 implement.md 阶段 C）。归属以父 prd 总表为准，成员 = 总表 ∩ components.ts 实际导出。

## Goal

`@talex-touch/tuffex` 新增 `./base` `./pro` `./ai` 三个分类 barrel 入口（`packages/components/src/{base,pro,ai}/index.ts` 纯 re-export），构建后被现有 `./*` 通配符 exports 覆盖，package.json 不动。安装/引入文档双语更新。

## Acceptance Criteria

- [ ] 三 barrel 成员并集 == components.ts 导出集，两两不相交（一致性脚本断言）。
- [ ] `pnpm -C packages/tuffex run build` 后 `dist/{es,lib}/{base,pro,ai}/index.js` 与 `.d.ts` 存在且可 resolve。
- [ ] `audit:exports`、`audit:types`、`audit:readme`、`typecheck`、`vitest run` 全绿。
- [ ] barrel 不引入新的星号导出名冲突（沿用 components.ts 的别名处理；构建产物 named exports 数量与主入口对齐）。
- [ ] nexus 文档（getting-started/tuffex-composition 或组件 hub）双语补三入口 import 说明。

## Out of Scope

不拆 npm 包、不动 gulp 流程、不动 components.ts、不为未导出组件建文档。
