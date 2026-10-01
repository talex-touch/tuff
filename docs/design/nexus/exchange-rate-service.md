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

- `GET /api/admin/exchange/history`
  - 查询参数与用户历史接口一致。
  - 仅限已登录、状态正常的管理员；未登录返回 401，非管理员返回 403。
  - 不检查套餐，不扣 credits 积分。支持目标币种历史、快照和原始 payload。

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
   - 用户历史接口要求非 FREE 套餐，每次查询扣 2 credits 积分。
   - 用户接口仍仅允许管理员使用 `includePayload=true`。
   - Admin Analytics 使用管理员专用只读接口，不受订阅套餐和用户积分限制。

## 关键文件

- `/apps/nexus/server/utils/exchangeRateService.ts`
- `/apps/nexus/server/utils/exchangeRateStore.ts`
- `/apps/nexus/server/api/exchange/convert.get.ts`
- `/apps/nexus/server/api/exchange/history.get.ts`
- `/apps/nexus/server/api/admin/exchange/history.get.ts`
