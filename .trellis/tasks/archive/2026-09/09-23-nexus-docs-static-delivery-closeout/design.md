# Design — docs 静态交付收尾

## 1. 404.html

- 预渲染列表：`build/nexus-static-routes.mjs` 新增 `staticFallbackPrerenderRoutes = [NOT_FOUND_PRERENDER_ROUTE]`，`NOT_FOUND_PRERENDER_ROUTE = '/__not-found'`，由 `createNexusPrerenderRoutes` 合并进 Nitro 列表；不进 `publicPrerenderRoutes`（那张表还喂早期提示与 `_routes.json` 期望）。
- 为什么不是 `/404.html`：2026-09-24 实测，Nitro 确实把 `/404.html` 落盘了，但 Nuxt 对这个文件名走单页回退渲染，`#__nuxt` 为空、无标题无正文（3.6 KB）。用普通名字的私有路由则正常 SSR，构建后由 `build/materialize-not-found.mjs` 复制为 `dist/404.html` 并删除源文件；复制前断言不是空壳且含 `aria-label="404"`。
- 状态码：Nitro 只为 200/3xx 落盘，所以 `app/pages/[...all].vue` 在预渲染且路径恰为 `/__not-found` 时不调用 `setResponseStatus(404)`：

```ts
if (import.meta.server) {
  const event = useRequestEvent()
  const isStaticFallbackArtifact = import.meta.prerender && event?.path === '/__not-found'
  if (event && !isStaticFallbackArtifact)
    setResponseStatus(event, 404)
}
```

  运行时（Worker / dev）行为不变；只有构建期的那一次请求拿 200。
- `_redirects` 不写回退行：`/* /404.html 404` 的状态码 404 不在 Pages 允许的集合（200/301/302/303/307/308）里，wrangler 4.107 会打印 `invalid redirect rule … Got 404` 并丢弃；Pages 对顶层 `404.html` 的原生处理已经答复所有未命中路径（去掉该行前后行为完全一致，复核员用 fixture 验证）。`write-static-redirects.mjs` 会剔除任何非法状态码行，门禁 `checkStaticRedirects()` 对这类行报错。
- `_routes.json`：`/__not-found` 会被 Nitro 列入 exclude；源文件删除后访问该路径落到 404.html，不会出现一个 200 的"未找到"页。
- 门禁：`checkStaticFallback()` 断言 `404.html` 存在、`#__nuxt` 非空、含 `aria-label="404"`（三条真属性，不再断言任何 `_redirects` 行）。

## 2. `/docs/**` 静态 308

- 不能靠 routeRules：Nitro 写 `_redirects` 时不转换 `:splat`，而运行时 routeRules 的 `/**` 语义又与 Pages 不同，两边写法无法共用。
- 新增 `build/write-static-redirects.mjs`，在 build 脚本里紧接 `write-early-hints.mjs` 之后运行：读取 `dist/_redirects`，去掉旧的 docs 行（幂等），把
  ```
  /docs /en/docs 308
  /docs/* /en/docs/:splat 308
  ```
  插到文件最前（静态规则在前、动态在后、任何 `/*` catch-all 之后不得再有 docs 规则），保留 Nitro 的合法行（如 `/terms`）。规则表 `docsStaticRedirects` 放在 `build/nexus-static-routes.mjs`（plain-node 可读，门禁与写入脚本共用）；中间件 `docs-legacy-redirect.ts` 不改，由 `test/middleware/docs-legacy-redirect.test.ts` 用同一张表做对照，防止两处漂移；中间件保留，作为 dev 与 Worker 兜底。
- **`/docs` 与 `/docs/*` 必须同时进 `cloudflare.pages.routes.exclude`**：Pages 只对自己服务的请求应用 `_redirects`；wrangler 实测未排除时 `/docs/dev/api/box.en.md` 仍由 Worker 中间件归一化答复，说明静态规则根本没跑。排除后四条探测全部由静态层答复（`size=0` 的 308）。门禁 `checkRoutes()` 增加对两条 redirect 源的排除断言。
- 不做归一化：`/docs/foo.en.mdc` 这类旧式路径经 splat 变成 `/en/docs/foo.en.mdc`，落在 Worker 排除区后成为真 404（有了 R1 才是真 404）。今天直接访问 `/en/docs/foo.en.mdc` 也是未命中，行为一致，记录在 spec 与中间件对照测试。
- 验证：`wrangler pages dev dist` 会执行 `_redirects`，作为本地验收。

## 3. docs 根路径缓存头

- `build/nexus-static-routes.mjs`：`docsStaticHtmlHeaderRoutes` 增加 `'/en/docs'`、`'/zh/docs'`。Nitro 把它们写成两个独立块；`checkStaticCacheHeaders` 的期望块数 8 → 10；`static-cache-headers.test.ts` 同步。

## 4. 边缘缓存：两层与实验设计

- 层 1：Pages 资产缓存。官方文档：资产按数据中心插入、TTL 一周、部署即替换；`cf-cache-status` 不体现。实测同一 HTML 的服务端等待 0.26～3.2 s，说明这层命中率/延迟并不稳定。
- 层 2：zone CDN 缓存。默认只按扩展名缓存；需要 Cache Rule 才对 HTML/JSON 生效。风险：zone 缓存不随 Pages 部署清除，旧 HTML 引用的已变更 chunk 会 404，`emitRouteChunkError: 'automatic-immediate'` 会触发整页重载并再次拿到同一份旧 HTML，直到 TTL 到期。
- 因此规则采用固定短 TTL（5 分钟，与浏览器 `max-age=300` 对齐）且不设 SWR；`_i18n/*` 因路径带哈希可用长 TTL；JSON 孪生不引用哈希资源，可与 HTML 同 TTL。
- 路径范围只覆盖静态孪生与预渲染 API，明确排除 `/api/docs/view|comments|feedback|engagement|assistant` 与 `/api/docs/page?`（query 版走 Worker，本身有 `max-age=300` 但按需保留 DYNAMIC）。
- 探针 `scripts/probe-docs-edge-cache.mjs`：Node 原生 `fetch`，URL 列表来自 `docsPrerenderEvidenceRoutes` 的本地化路径 + JSON 孪生 + `_i18n`；每个 URL 两次，记录 `cf-cache-status`、`cf-ray` 节点、ttfb；输出 JSON + 一行 markdown 摘要。判据写在 PRD R4。
- `_headers` 中的 `s-maxage=3600, stale-while-revalidate=86400` 在规则采用固定 TTL 时被忽略；若实验保留规则，则把 `DOCS_STATIC_CACHE_CONTROL` 的 `s-maxage` 改为 300 并删去 SWR，让 `_headers` 与规则一致（`static-cache-headers.test.ts` 同步）。

## 5. spec 与任务归档

- `nexus-docs-static-delivery.md`：改写"Static docs responses carry an edge cache window"一节（两层、部署失效、Cache Rule 前提、TTL 选择），新增"404.html and _redirects"一节（为什么不能靠 routeRules、写入顺序、验收命令）。
- `08-27-nexus-docs-body-ssg`：在 `verify/RESULTS.md` 追加"2026-09-23 production probe"段落（命令、头部、`<h2>` 计数、hydration 零请求），`task.json.meta` 清空 blocker，执行归档命令。

## 6. 兼容与回滚

- 全部是构建产物层面的改动，无 API / 数据变化；Worker 行为不变。
- 回滚：撤销提交即恢复 SPA 回退与 Worker 重定向；Cache Rule 在 dashboard 删除即回退。
