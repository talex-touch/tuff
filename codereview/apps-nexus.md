# apps/nexus 质量分析

## 关键问题

### 1) 类型安全缺口（`as any`）
在 server 端工具与 API 中多处使用 `as any` 进行数据兜底：
- `server/utils/releasesStore.ts:318-319/376-377`
- `server/utils/creditsStore.ts:123-168`
- `server/utils/ipSecurityStore.ts:50-62`
- `server/api/auth/[...].ts:91/130/149`
**风险**：运行时数据结构变化时难以及时发现，可能引发隐性 bug。  
**建议**：为 API 输入/外部服务返回增加 schema 校验（zod/valibot），减少 `as any`。

### 2) `@ts-expect-error` 使用
- `app/components/Search.vue:16`  
  **建议**：为 auto-import 或 composable 补 `d.ts` 声明，避免长期忽略类型错误。

### 3) 测试覆盖不足
未发现 `apps/nexus` 下的 `*.test.*`/`__tests__`（`latest.get.ts` 为 false positive）。  
**建议**：至少补 server utils / API 路由的基础测试。

## 可优化建议
- **配置一致性**：存在 `.env`/`.env.local`，建议统一校验脚本避免配置漂移（不涉及敏感值）。
- **类型治理**：聚焦 `releasesStore` 与 `creditsStore`，建立输入/输出类型边界。
