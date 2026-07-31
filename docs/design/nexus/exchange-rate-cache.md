# Exchange Rate Cache 模块

## 目标

沉淀 Nexus 汇率缓存与历史快照的存储结构，确保 USD 基准汇率可追溯、可审计、可扩展。

## 存储结构（D1）

- 表名：`exchange_rate_snapshots`
- 字段：
  - `id` (TEXT, PK)
  - `base_currency` (TEXT)
  - `fetched_at` (INTEGER)
  - `provider_updated_at` (INTEGER)
  - `provider_next_update_at` (INTEGER)
  - `payload_json` (TEXT)
  - `rates_json` (TEXT)
- 索引：`idx_exchange_rate_base_fetched_at` (`base_currency`, `fetched_at`)

## 归一化历史表（曲线查询）

- 表名：`exchange_rate_rates`
- 字段：
  - `id` (TEXT, PK)
  - `base_currency` (TEXT)
  - `target_currency` (TEXT)
  - `rate` (REAL)
  - `fetched_at` (INTEGER)
  - `provider_updated_at` (INTEGER)
- 索引：`idx_exchange_rate_rates_target_fetched_at` (`target_currency`, `fetched_at`)

## 读写策略

1. **读取**：优先从 D1 读取最新快照（按 `fetched_at` 倒序）。
2. **写入**：成功回源后写入 D1 快照 + 归一化表，并回写 `useStorage` 作为 fallback。
3. **TTL**：由服务层判断是否过期（默认 8h）。
4. **保留策略**：`historyRetentionDays > 0` 时按 `fetched_at` 清理过期记录（默认不清理）。

## 关键文件

- `/apps/nexus/server/utils/exchangeRateStore.ts`
