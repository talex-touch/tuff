# packages/test 质量分析

## 现状
- 测试覆盖较多（`core-box`、`common`、`aisdk`、`download` 等）。
- 测试代码中存在 `as any` 用法（如 `aisdk/provider-test.test.ts:7/14`），但属于测试上下文。

## 建议
- 保持测试现有覆盖强度，并在 CI 中启用该包测试执行。
