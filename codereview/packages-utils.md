# packages/utils 质量分析

## 关键问题

### 1) `globalThis`/`window` 类型逃逸
多个模块使用 `globalThis as any` 或 `window as any` 来获取 channel/SDK：
- `renderer/hooks/use-channel.ts:61-66/74`
- `intelligence/client.ts:18-22`
- `transport/sdk/plugin-transport.ts:37/62/131`
- `transport/sdk/renderer-transport.ts:88/114`
- `env/index.ts:8/12/43`
**风险**：运行时环境差异（SSR/worker）或 SDK 形态变化会导致静默失败。  
**建议**：抽统一的 typed runtime accessor（带环境探测与错误提示）。

## 测试现状
存在多个测试：`__tests__/transport/port-policy.test.ts`、`__tests__/search/fuzzy-match.test.ts`、`__tests__/icons/icons.test.ts` 等。  
**建议**：为 transport/channel 访问层补充运行时断言测试。
