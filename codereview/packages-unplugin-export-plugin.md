# packages/unplugin-export-plugin 质量分析

## 现状
- 未发现显式 TODO/ts-ignore/明显未实现标记（按全仓扫描结果）。
- 存在测试用例：`__tests__/index-bundling.test.ts`、`cli-args.test.ts`、`config.test.ts`、`publish-smoke.test.ts`。

## 建议
- 保持当前测试覆盖，并在 CI 中确保该包 `run-test` 被启用。
