# 技术设计：文档内容端点的缓存与降级策略

## 边界

改动范围限定在 `apps/nexus/server/`：

- 新增 `server/utils/docsContentCache.ts`（策略唯一声明处）
- 新增 `server/plugins/docs-content-health.ts`（启动期探针）
- 改造 `server/api/docs/{navigation,page,search,sidebar-components}.get.ts`
- 同步 `test/api/docs/*.get.test.ts` 四个测试文件 + 新增工具单测

不动前端、不动 Nuxt Content 配置、不动内容文件。

## 核心决策

### 决策 1：缓存包在成功路径内侧，而不是整个 handler 外侧

`defineCachedEventHandler` 包住整个 handler，意味着降级响应（空数组、null、本地 Markdown 回退）与正常响应一样被写入缓存。改用 `defineCachedFunction`：**函数抛错 = nitro 不写缓存**，这是既有语义，不需要自造失效机制。

外层 `defineEventHandler` 负责把内层抛出的哨兵错误翻译成对外响应。

代价：失去 `defineCachedEventHandler` 自带的 ETag / 304 协商。这四个端点都是 JSON 且已显式设置 `cache-control`，判定为可接受损失（navigation 本轮已按此实现并验证）。

### 决策 2：「空」分两级，用共享降级标记消歧

`[]` / `null` 有两种成因，且**查询本身不抛错时无法从结果区分**：

1. 内容库正在导入 / 不可用 → 空是假象，绝不能缓存
2. 集合里确实没有这条数据 → 空是事实，可以缓存（page 的 404）

消歧手段是把 `page.get.ts:139` 现有的私有熔断窗口提升为共享状态：任一端点捕获到内容库错误就 `markUnavailable()`，窗口内所有端点都不信任空结果。

于是每个端点只需声明一个语义位：

| 端点 | `treatEmptyAsUnavailable` | 理由 |
|---|---|---|
| navigation / search / sidebar-components | `true` | 整站文档为空永远是 bug |
| page | `false` | 单页 `null` 是合法 404，正常缓存 |

### 决策 3：拒绝「短 TTL 负缓存」方案

曾考虑给空结果单独一个 15~30s 的短 TTL（避免不存在的路径每次直穿数据库）。放弃，原因：

- `defineCachedFunction` 单实例只有一个 TTL，实现双 TTL 要么两次缓存查找，要么自造 envelope + 手工失效，复杂度远超收益。
- 决策 2 的共享降级标记已经解决了「故障被钉死一小时」这个真实问题；而"不存在的路径直穿数据库"在 page 端点上并不成立——非降级期它照常缓存 404。

### 决策 4：健康探针挂在首个请求，而不是进程启动

nitro plugin 内没有 `H3Event`，而 `queryCollection` 需要 event。因此挂 `nitroApp.hooks.hook('request')`，首个请求时探测一次并立即反注册（`hooks.hook()` 返回 unsubscribe），正常路径零常驻开销。

探针只在 dev 生效：它针对的是「本地开发静默几小时」这一失败模式；生产的每请求日志已由决策 1 的错误路径覆盖。探针失败只记日志，不阻断启动、不改变响应。

## 契约

```ts
// server/utils/docsContentCache.ts

export const DOCS_CONTENT_CACHE_CONTROL: string          // 'public, max-age=300, stale-while-revalidate=3600'
export const DOCS_CONTENT_CACHE_MAX_AGE_SECONDS: number  // 300
export const DOCS_CONTENT_CACHE_STALE_MAX_AGE_SECONDS: number // 3600

/** 任一端点探测到内容库不可用后，窗口内所有端点共享该判断 */
export const docsContentAvailability: {
  markUnavailable(): void
  isDegraded(): boolean
  reset(): void        // 仅测试使用
}

/** resolver 内部调用：返回这个值，但不要缓存它（用于 dev 下的本地 Markdown 回退） */
export function uncacheableDocsContent<T>(value: T): never

export interface DocsContentCacheOptions<A extends unknown[], R> {
  name: string
  getKey: (...args: A) => string
  /** 默认：null / undefined / 空数组 */
  isEmpty?: (result: R) => boolean
  /** 集合级读取：空载荷永远不合法 */
  treatEmptyAsUnavailable?: boolean
  maxAge?: number
  staleMaxAge?: number
}

export function cacheDocsContent<A extends unknown[], R>(
  resolve: (event: H3Event, ...args: A) => Promise<R>,
  options: DocsContentCacheOptions<A, R>,
): (event: H3Event, ...args: A) => Promise<R>
```

`cacheDocsContent` 返回函数的行为：

1. 命中缓存 → 设 `cache-control` → 返回
2. 未命中 → 跑 resolver
   - `isEmpty(result)` 且（`treatEmptyAsUnavailable` 或 `isDegraded()`）→ 抛哨兵 → 外层原样返回该空值，**不设 `cache-control`、不写缓存**
   - resolver 显式 `uncacheableDocsContent(v)` → 外层返回 `v`，不写缓存
   - 正常 → 写缓存 → 设 `cache-control` → 返回
3. resolver 抛错
   - `isMissingDocsContentTableError` → `markUnavailable()` → dev 打日志 → 抛 503（dev 的 message 含 `pnpm rebuild -r better-sqlite3`）
   - 其他错误 → 原样抛出

## 数据流

```
request
  └─ defineEventHandler            解析 locale/scope 等入参
      └─ cacheDocsContent          ← 策略唯一实现处
          ├─ defineCachedFunction  抛错即不写缓存
          │   └─ resolve(event)    端点各自的查询 + 序列化
          └─ catch → 503 / 空值直返
```

四个端点各自只保留：入参解析 + `resolve` 实现 + 一次 `cacheDocsContent` 声明。

## 兼容性

- **对外契约不变**：`cache-control` 头、缓存键格式（`locale:zh:scope:all`、`/docs/x:en:body`）、成功响应体结构均不变。
- **状态码变化**：`sidebar-components` / `search` 在内容库不可用时由 500 变 503。`DocsSidebar.vue` 只判断 `error` 真值，无影响。
- **磁盘缓存位置变化**：`.nuxt/cache/nitro/handlers/<name>/` → `functions/<name>/`。旧目录成为孤儿，无害，不做迁移。
- **page 的 dev 回退保留**：本地 Markdown 回退行为不变，只是改为不入缓存。
- **测试驱动方式变化**：四个测试文件需从 stub `defineCachedEventHandler` 改为 stub `defineCachedFunction` + `createError`，缓存键断言从 `getKey(event)` 改为 `getKey(...args)`。

## 风险与回滚

| 风险 | 处理 |
|---|---|
| `page.get.ts` 逻辑最重（本地回退 + 熔断窗口），改造易出错 | 放在最后一步单独做，前面四步已可独立验证 |
| 共享降级窗口是模块级可变状态，测试间会串 | 导出 `reset()`，各测试 `beforeEach` 调用 |
| 端点行为回归 | 每步跟着改对应测试，`vitest run test/api/docs` 必须全绿后才进入下一步 |

回滚点：每个实施步骤都是独立可回退单元；`docsContentCache.ts` 是纯新增，先落地不影响任何现有行为。
