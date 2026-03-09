# CoreBox Roadmap 06-C：回归矩阵与性能基线（最小集）

## 1. 目标与范围

- 任务来源：roadmap 06-C（工程债收口回归基线）。
- 对象：
  - 已落地 `06-A`：`search-core` SRP（query/providers/merge-rank 三段拆分）。
  - 待提审 `06-B`：`plugin-module` SRP（loader/view loader 路径收口）。
- 约束：不改业务代码，仅补充测试辅助与文档记录。

## 2. 最小回归矩阵

| 链路 | 场景 | 覆盖点 | 断言 |
| --- | --- | --- | --- |
| CoreBox Search | 纯文本查询 | `search-core.regression-baseline.test.ts` / `plain-text` | parse/providers/merge-rank 三段耗时均可采样；provider 匹配数稳定（4） |
| CoreBox Search | `@provider` 查询 | `search-core.regression-baseline.test.ts` / `provider-filter` | provider 过滤生效（匹配数 `>0` 且 `< 全量`） |
| CoreBox Search | clipboard 输入（image + files） | `search-core.regression-baseline.test.ts` / `clipboard-input` | 输入类型过滤稳定，provider 匹配数为 3 |
| Plugin Loader | packaged + `dev.source=true` | `plugin-loaders.test.ts` | 打包态强制回退 `LocalPluginLoader` |
| Plugin Loader | dev 模式远程加载 | `plugin-loaders.test.ts` + `plugin-view-loader.test.ts` | 未打包态允许 `DevPluginLoader` 且远程路由可用 |

## 3. 性能基线样例（3 组）

数据来源：执行回归命令后，测试日志输出 `ROADMAP_06C_BASELINE=<json>`。

| Scenario | parse (ms) | providers (ms) | merge-rank (ms) | providersMatched |
| --- | ---: | ---: | ---: | ---: |
| plain-text | 0.563 | 0.022 | 0.247 | 4 |
| provider-filter | 0.547 | 0.084 | 0.107 | 2 |
| clipboard-input | 0.096 | 0.028 | 0.071 | 3 |

> 说明：该基线用于“重构后对比”，不作为绝对性能 SLA。

## 4. 复测命令与结果

1. Node 主进程类型检查（验收必需）：

```bash
npm exec --yes pnpm -- -C "apps/core-app" run typecheck:node
```

结果：通过。

2. 06-C 回归验证命令（新增）：

```bash
npm exec --yes pnpm -- -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts" "src/main/modules/plugin/plugin-loaders.test.ts" "src/main/modules/plugin/view/plugin-view-loader.test.ts"
```

结果：`3 files passed, 10 tests passed`。

## 5. 变更清单

- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts`
- `docs/plan-prd/docs/COREBOX-ROADMAP-06C-REGRESSION-BASELINE.md`
