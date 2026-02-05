# plugins/touch-translation 质量分析

## 关键问题
- `globalThis as any` 大量出现（`index/main.ts:5`、`index/item-builder.ts:4`、`shared/tuffintelligence.ts:13/21/22` 等）  
  **风险**：插件 SDK 形态变化时难以及时发现问题。  
  **建议**：抽 typed adapter，集中做运行时保护与错误提示。

- `@ts-expect-error` / `@ts-ignore` 出现在构建与 d.ts  
  - `vite.config.ts:66`  
  - `auto-imports.d.ts:315-339`  
  **建议**：若为自动生成可忽略，但需明确生成来源与是否需要纳入 lint 规则。

## 测试现状
未发现测试文件。  
**建议**：补最小 smoke test 或运行时 sanity check。
