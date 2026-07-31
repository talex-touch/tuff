# Nexus 汇率服务（ExchangeRate-API）

## 用户故事

作为 Nexus 的服务调用方，我希望可以通过统一 API 获取 USD 基准的汇率换算结果，并且具备稳定缓存与历史可追溯能力；非免费用户可查询历史曲线。

## 入口

### API

- `GET /api/exchange/convert`
  - `target`: 目标货币（3 位代码）
  - `amount`: 数值
  - `base`（可选）：仅允许 `USD`，否则 400

- `GET /api/exchange/history`
  - `target`（可选）：查询目标币种历史曲线
  - `since` / `until`（可选时间戳）
  - `limit` / `offset`
  - `includePayload`（可选，仅管理员允许）

### 配置

- `runtimeConfig.exchangeRate`
  - `apiKey`
  - `baseUrl`
  - `ttlMs`
  - `timeoutMs`
  - `historyRetentionDays`
  - `storeRateRows`

## 关键实现

1. **USD 基准回源**
   - 服务端固定请求 `latest/USD`，客户端若需非 USD 换算需自行做交叉计算。

2. **8h TTL 懒刷新缓存**
   - 请求时优先读缓存，超过 TTL 才回源。

3. **历史快照与错误归档**
   - 成功响应完整写入 D1 历史表，并写入归一化历史表用于曲线查询。
  - 上游失败写入 `telemetry_messages`（`source=exchange-rate`）。

4. **高级访问控制**
   - 非 FREE 用户可访问历史接口。
   - 管理员才允许 `includePayload=true`。
   - Admin Analytics 提供 Exchange 区块用于查看历史数据。

## 关键文件

- `/apps/nexus/server/utils/exchangeRateService.ts`
- `/apps/nexus/server/utils/exchangeRateStore.ts`
- `/apps/nexus/server/api/exchange/convert.get.ts`
- `/apps/nexus/server/api/exchange/history.get.ts`
