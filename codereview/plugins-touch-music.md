# plugins/touch-music 质量分析

## 关键问题
- 多处 `console.log` 仍存在于业务组件与模块中：  
  `layout/Header.vue:26`、`particle/bg/WavingParticle.vue:75`、`modules/api/index.ts:1`、`modules/entity/song-manager.ts:101` 等  
  **风险**：生产日志噪声与潜在隐私暴露。  
  **建议**：统一改为可控 logger 或仅保留在 dev 环境。

## 测试现状
未发现测试文件。  
**建议**：为核心播放/解析流程补最小单测。
