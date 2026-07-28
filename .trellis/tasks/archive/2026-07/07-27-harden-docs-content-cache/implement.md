# 执行计划

工作目录：`apps/nexus`。每步结束都要跑该步的验证命令，绿了才进下一步。

## 步骤

### 1. 新增共享策略模块（纯新增，零行为影响）✅

- [x] 写 `server/utils/docsContentCache.ts`，按 design.md 的契约实现：常量、`docsContentAvailability`、`uncacheableDocsContent`、`cacheDocsContent`
- [x] 写 `server/utils/docsContentCache.test.ts`（server utils 测试在本仓库是同目录放置，不是 `test/utils/`），覆盖：
  - 非空结果写缓存，二次调用不再触发 resolver，且设置了 `cache-control`
  - `treatEmptyAsUnavailable` 下空结果不写缓存（二次调用仍触发 resolver）、不设 `cache-control`
  - 默认模式下空结果**正常缓存**；但 `isDegraded()` 为真时不缓存
  - `uncacheableDocsContent(v)` 返回 `v` 且不写缓存
  - 内容库错误 → 503 + `markUnavailable()` 生效；dev 下 message 含 `pnpm rebuild -r better-sqlite3`
  - 无关错误（`database is locked`）原样抛出

验证：`npx vitest run test/utils/docsContentCache.test.ts`

### 2. navigation.get.ts 迁移到共享模块

本轮已就地实现过同等逻辑，这步是把它换成共享实现，行为不变。

- [x] 删除文件内的 `EmptyDocsNavigationError` / 内联 `defineCachedFunction` / 503 构造，改为 `cacheDocsContent(..., { name: 'docs-navigation', treatEmptyAsUnavailable: true })`
- [x] 删除本文件内重复的缓存常量，改用共享常量
- [x] 现有 10 项测试应基本不变；仅在断言依赖内部实现处做最小调整

验证：`npx vitest run test/api/docs/navigation.get.test.ts`

### 3. sidebar-components.get.ts

- [x] 抽出 `resolve`（现有查询 + 映射 + 排序），外层换成 `cacheDocsContent`，`treatEmptyAsUnavailable: true`
- [x] 删除本文件的三个重复常量
- [x] 测试从 stub `defineCachedEventHandler` 改为 `defineCachedFunction` + `createError`；`getKey` 断言改为按参数调用；新增「空结果不入缓存」「内容库不可用报 503」两条

验证：`npx vitest run test/api/docs/sidebar-components.get.test.ts`

### 4. search.get.ts

- [x] 同步骤 3；注意 `isEmpty` 需自定义为 `result => result.items.length === 0`
- [x] 测试同步

验证：`npx vitest run test/api/docs/search.get.test.ts`

### 5. page.get.ts（最重的一步，单独做）

- [x] 把私有的 `devDocsContentFallbackUntil` / `markDevDocsContentUnavailable` / `shouldPreferDevDocsFallback` 迁移到共享 `docsContentAvailability`，删除本地副本
- [x] `resolve` 内保留 dev 下读取本地 Markdown 的回退；命中回退时改为 `uncacheableDocsContent(doc)` 返回（降级响应不入缓存）
- [x] 外层 `cacheDocsContent`，`treatEmptyAsUnavailable: false`、`isEmpty: doc => doc === null`——真实 404 仍然缓存
- [x] 删除重复常量；测试同步（含「回退响应不入缓存」「降级窗口内 null 不入缓存」）

验证：`npx vitest run test/api/docs/page.get.test.ts`

### 6. 启动期健康探针

- [x] 写 `server/plugins/docs-content-health.ts`：dev only，`nitroApp.hooks.hook('request')` 首个请求探测一次 `queryCollection(event, 'docs').first()`，随即反注册
- [x] 失败时打一条醒目、可执行的日志（含 `pnpm rebuild -r better-sqlite3`）；成功时不打日志
- [x] 探针内部所有异常必须自吞，不得影响请求或启动

验证：`curl -s localhost:3200/api/docs/navigation/zh/all | head -c 80` 正常返回；dev server 日志无噪音

## 全量验证（最后一次迭代）

- [x] `npx vitest run test/api/docs test/utils/docsContentCache.test.ts` 全绿
- [x] `npx eslint` 对全部改动文件干净
- [x] 活体验证：`/api/docs/{navigation/zh/all,navigation/zh/components,sidebar-components/zh,search?locale=zh,page?path=/docs/dev}` 均 200 且有数据
- [x] 缓存行为验证：清掉 `.nuxt/cache/nitro/functions/docs-*`，请求两次，确认第二次命中缓存；确认缓存文件里没有空载荷

## 复审关口

- 步骤 1 完成后：共享模块的契约是否真的覆盖了四个端点的差异，还是需要端点再加特例？如果需要特例，先回来改设计而不是在端点里打补丁。
  - **已通过（2026-07-27）**：拿最难的 `page.get.ts` 逐条比对，共享模块无需任何特例。三点结论：① 两处 dev 本地 Markdown 回退用 `uncacheableDocsContent` 表达，降级响应不入缓存；② `shouldPreferDevDocsMetadataFileLookup` 那条是 dev 性能优化而非降级路径，照常缓存；③ 缓存键改由参数派生，顺带消除 `resolveDocsPageCacheKey` 重复解析 query 的问题。唯一行为变化：共享降级窗口 30s，比 page 原来的 10s 长，属可接受收敛。
- 步骤 5 完成后：page 的 dev 回退与降级窗口是否仍按预期工作（这是唯一有状态耦合的端点）。

## 回滚点

- 步骤 1 是纯新增：出问题直接删文件。
- 步骤 2~5 每步只动一个端点 + 其测试：出问题单独 revert 该步，其余步骤不受影响。
- 步骤 6 是纯新增插件：出问题直接删文件。
