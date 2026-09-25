# Implementation Plan — docs 静态交付收尾

工作集：`apps/nexus/build/nexus-static-routes.mjs`、`apps/nexus/build/write-static-redirects.mjs`（新）、`apps/nexus/shared/utils/docs-static-redirects.ts`（新）、`apps/nexus/server/middleware/docs-legacy-redirect.ts`、`apps/nexus/app/pages/[...all].vue`、`apps/nexus/build/check-worker-bundle.mjs`、`apps/nexus/build/static-cache-headers.test.ts`、`apps/nexus/build/check-worker-bundle.test.ts`、`apps/nexus/package.json`（build 脚本链）、`apps/nexus/scripts/probe-docs-edge-cache.mjs`（新）、`.trellis/spec/frontend/nexus-docs-static-delivery.md`、`.trellis/tasks/08-27-nexus-docs-body-ssg/{verify/RESULTS.md,task.json}`。

共享工作树：其他会话有未提交改动；逐文件 `git show HEAD:path` 核对，不 stash / checkout；只暂存本任务文件。

## Step 0 — 基线 `[gate]`

- [x] 基线改用 2026-09-21 的现成 `dist`（与本任务相关的产物 `_redirects` / `_routes.json` / `_headers` / 404.html 状态无歧义），门禁输出在 `/tmp/nexus-gate.log`；记录在 `research/baseline.md`。
- [x] 线上探针基线：`output/evidence/docs-edge-cache-2026-09-24-before.json`（0/28 命中边缘缓存，对照资产 MISS→HIT）。

## Step 1 — 404.html

- [x] `nexus-static-routes.mjs`：新增 `staticFallbackPrerenderRoutes = ['/404.html']`（不进 `publicPrerenderRoutes`，避免早期提示与 `_routes.json` 期望被带偏）；`[...all].vue` 加预渲染例外（design §1）。
- [x] ~~`routeToDistPath` 支持 `.html` 路由~~ 改为 `/__not-found` 后该分支成为死代码，已删除；`checkStaticFallback` / `checkStaticRedirects` 的用例在 `build/static-redirects.test.ts`。
- [x] build 后确认 `dist/404.html` 为完整 SSR 页（9 KB，标题/noindex/`aria-label="404"`），`_routes.json` 含 `/__not-found`；复核后 `_redirects` 不再含 `/* /404.html 404`（Pages 非法状态码，见 `research/verification-2026-09-24.md` 的更正）。

## Step 2 — `/docs/**` 静态 308

- [x] 规则表放在 `build/nexus-static-routes.mjs`（`docsStaticRedirects`，plain-node 可读）；`docs-legacy-redirect.ts` 未改，改为在 `test/middleware/docs-legacy-redirect.test.ts` 用同一张表做对照测试（含 `.md` 保留与唯一分歧点）。
- [x] 新建 `build/write-static-redirects.mjs`（幂等、插到最前、保留既有行）+ 测试；`package.json` build 链在 `write-early-hints.mjs` 之后加入。
- [x] `check-worker-bundle.mjs` 新增 `checkStaticRedirects()`：两条 docs 规则存在、目标正确、位于任何 `/*` catch-all 之前、静态在动态之前、无非法状态码行；`checkRoutes()` 增加 redirect 源的 `_routes.json` 排除断言并改为模式感知。

## Step 3 — 根路径缓存头

- [x] `docsStaticHtmlHeaderRoutes` 加 `/en/docs`、`/zh/docs`；`checkStaticCacheHeaders` 期望 10 块；`static-cache-headers.test.ts` 同步。

## Step 4 — 本地验收 `[gate]`

- [x] 隔离 worktree 构建 + `node build/check-worker-bundle.mjs`：新增断言全部通过，基线的"Missing static route exclusions"消失，其余家族的 finding 数只随 +10 篇文档增长（逐页对比一致）。
- [x] `wrangler pages dev dist --port 8788`（私有 persist 目录，`/tmp/nexus-verify.sh`）四条探测全部符合预期，另加 `/docs`、`.en.md` 分歧点、docs 根路径缓存头：
  ```bash
  curl -sI http://127.0.0.1:8788/docs/dev | grep -iE '^(HTTP|location)'
  curl -sI http://127.0.0.1:8788/docs/dev/components/button.md | grep -iE '^(HTTP|location)'
  curl -s -o /tmp/nope.html -w '%{http_code}\n' http://127.0.0.1:8788/en/docs/nope && grep -c 'notFound\|404' /tmp/nope.html
  curl -s http://127.0.0.1:8788/en/docs/dev/components/button | grep -c '<h2'
  ```
- [x] vitest 7 个相关文件 74 通过（全量 259 文件 1922 通过）；typecheck exit 0；改动文件 eslint 0 错；`git diff --check` 干净。

## Step 5 — 边缘缓存 runbook 与探针

- [x] spec 新增 runbook（表达式、TTL、排除路径、回退判据）；探针脚本 `scripts/probe-docs-edge-cache.mjs` + `package.json` 脚本 `probe:docs-edge-cache`。
- [x] Cache Rule 已在 dashboard 建好（老板登录后由 ego 操作）；`probe:docs-edge-cache -- --label after` 28/28 HIT（before 0/28），决定保留；`DOCS_STATIC_CACHE_CONTROL` 改为 `public, max-age=300, s-maxage=300` 并同步测试与 spec（随后续 PR 上线）。

## Step 6 — spec 与归档

- [x] `nexus-docs-static-delivery.md` 两节改写/新增（design §5）。
- [x] `08-27-nexus-docs-body-ssg`：追加线上证据、清 blocker、`task.py archive`。
- [x] 提交前 `git grep MUTATION HEAD` 无结果；只暂存本任务文件。老板指示部署后：cherry-pick 到 `nexus/static-delivery-closeout`，PR #1957 七项必需检查通过后 merge commit 合入（`eeff74b4d`），Pages 生产部署 80b95775 于 09:32 上线，线上四条探测通过（见 research）。

## 回滚点

- Step 1、2、3 各自独立成提交，任一步出问题单独撤销；Cache Rule 属 dashboard 配置，删除即回退。
