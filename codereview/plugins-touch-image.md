# plugins/touch-image 质量分析

## 关键问题
- `@ts-expect-error`：`src/App.vue:35`（Electron 提供 `File.path`）  
  **建议**：补充全局类型声明（`File.path?: string`）或封装读取逻辑，避免长期开洞。

## 测试现状
未发现测试文件。  
**建议**：补最小行为测试或 snapshot。
