# packages/tuffex 质量分析

## 关键问题

### 1) 类型安全缺口（`as any` 高密度）
组件中存在大量 `as any`：
- `components/src/transition/src/TxTransition.vue:47/51`
- `components/src/scroll/src/TxScroll.vue:143/144/312/313`
- `components/src/tabs/src/TxTabs.vue:391/592`
- `components/src/tooltip/src/TxTooltip.vue:102/231/306`
**风险**：组件 API 演进时难以保证类型正确性。  
**建议**：优先为高使用频率组件补强泛型与类型声明。

### 2) `@ts-ignore` 出现在测试
- `packages/utils/__tests__/vibrate.test.ts:85/119/125`  
  **建议**：若为 DOM Mock，改为显式类型声明或 helper。

## 测试现状
组件测试覆盖较多（`tree`/`cascader`/`command-palette`/`data-table` 等）。  
**建议**：基于“高风险组件 + 高频 `as any`”优先补类型与测试。
