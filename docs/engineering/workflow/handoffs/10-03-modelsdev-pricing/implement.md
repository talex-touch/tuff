# Implement — models.dev 定价接入

## 清单

1. [ ] 生成夹具：用一次性脚本从 `https://models.dev/api.json` 截取 design 中列出的服务商与模型，写入 `pricing/__fixtures__/models-dev-subset.json`。脚本本身不入库，在测试文件头注释写明截取日期与来源。
2. [ ] `pricing-provider-map.ts`：类型表与模型族表（父 `design.md` §2.3 第 2、4 步）。
3. [ ] `models-dev-catalog.ts`：
   - `compactModelsDevCatalog`：只保留 `name / api` 与模型的 `input / output / cache_read / cache_write / limit.context / limit.output / name`，记 `priced`；
   - 稳定序列化 + `sha256`；
   - `loadPricingCatalog`：读 `system_config`、校验、内存缓存；
   - `refreshPricingCatalog`：ETag / 304 / 失败保留；
   - `getPricingCatalogStatus`、`requestPricingRefresh`。
4. [ ] `model-pricing.ts`：`resolveModelPricing`（类别 → 服务商 → 模型 → 族回退）与 `estimateCostUsd`，按 `(providerId, model, sha256)` 记忆化。
5. [ ] 接线：
   - `IntelligenceModule.onInit` 写 since 标记、登记延迟检查；
   - `IntelligenceAuditLogger.flushToDB` 在写事务前计算 `estimatedCost`；
   - 删除 `MODEL_COSTS` 一套。
6. [ ] 测试：
   - `model-pricing.test.ts`：AC-A1 全部样例 + 规范化各步 + 不跨转售商；
   - `models-dev-catalog.test.ts`：200 / 304 / 失败 / 篡改 / 离线；
   - 更新 `intelligence-audit-logger-caller-period.test.ts` 的费用锚点。

## 验证

```bash
pnpm -C "apps/core-app" run typecheck:node
pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/ai/pricing" \
  "src/main/modules/ai/intelligence-audit-logger-caller-period.test.ts" \
  "src/main/modules/ai/intelligence-stream-ledger.integration.test.ts" \
  "src/main/modules/ai/intelligence-typed-transport.integration.test.ts"
rg -n "MODEL_COSTS" apps packages   # 期望 0 行；同时 rg 一个已知存在的符号做阳性对照
git diff --check
```

- 真实网络冒烟（只读）：在 dev 实例里触发一次 `refreshPricingCatalog({ force: true })`，确认 `system_config` 出现目录行、大小约 0.5 MB、`sha256` 校验通过。

## 风险与回滚

- **风险**：调用方没传 `estimatedCost` 时，费用全部依赖目录。目录缺失期间（首次安装且离线）费用为 0，状态为 `unpriced`，页面会提示。这是有意的，不再编造默认价。
- **回滚**：revert 本子任务即可，`system_config` 的两行无害。
