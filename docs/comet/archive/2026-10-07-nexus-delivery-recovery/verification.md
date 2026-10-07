---
generated_from_state_version: 10
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 2
- 验证器尝试次数: 1
- 完成时间: 2026-10-07T03:37:47.077Z
- 摘要: Independent read-only acceptance of all current A1-A9: each passed exactly once after reviewing complete dispatch scope, brief/full Spec, patch/current producers and consumers, current Runtime seven check logs and matching real-browser/build evidence before using Builder handoff as corroboration. No implementation omission proven. Known failed whole-site budget/type gates and browser/online boundaries remain explicit risks. Startup receipt was submitted using the dispatch identity. Product and formal documents were not edited; no accept-result, archive, commit, merge or push performed.

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | 概览和设备页使用现有 TuffEx 地图展示有效坐标、标签和数值，无坐标时显示本地化空态。点选事件仍能返回对应记录，页面不再请求 Leaflet/unpkg 或 OpenStreetMap 瓦片。 | Passed by independent source/consumer review plus current Runtime maps and real Dashboard consumer tests (17+4), map-runtime.json, map-localized-empty.json and map-responsive-sizing.json: finite coordinate filtering, original record bubble-click to point-click forwarding, safe text labels/value/color, reactive positions, actual pan/zoom, localized empty states and no Leaflet/unpkg/OSM requests. Dashboard callers retain lazy mounting and expose coordinate-free empty state. Browser evidence is the actual GeoBubbleMap component at 8839, not an authenticated backend end-to-end claim; ResizeObserver cleanup verified in use-map-base.ts. |
| A2 | passed | brief.md | 中英文 Developer、Concepts 和组件目录页均可直接访问、站内导航及前进后退。有效目录及其 index 拼写具有对应静态 HTML、JSON 和 Markdown，不再误报 Document not found；不存在的文档仍返回真实未找到结果。 | Passed: canonicalDocsPageIdentity is consumed by route-record validation, request cache and full-body cache; existing prerender/index alias pipeline retained. static-http-delivery.json records both languages for docs root, Developer and Concepts/components directory: HTML/Markdown/body JSON 200, directory/index matching bodies, unknown HTML/JSON 404 and legacy /docs/dev 308. spa-navigation-and-cache.json demonstrates actual uncached directory navigation plus Back/Forward preserving corresponding readable content. |
| A3 | passed | brief.md | 文档 URL、正文、侧栏、目录、周边 UI 和 Demo 文案使用一致语言。中英往返、刷新及快速切换后以最后路由为准，链接保留语言，不展示未翻译键，不被浏览器或账户偏好切回另一种语言。 | Passed: LanguageToggle preserves query/hash while navigating localized document identity; the consuming locale queue checks explicit route language after message loading, and profile sync checks before and after its async fetch. Current 25 Runtime locale tests cover conflicting and late preferences; locale-roundtrip.json and rapid-locale-final-owner.json record Chinese selection/refresh and zh/en/zh/en ending with English URL, title, navigation, language button and real Toast Demo labels, without untranslated keys. Direct document navigation does not invoke manual account preference updates. |
| A4 | passed | brief.md | 仅包含动态组件导入的模块不会提前加载这些组件的 CSS。激活组件时加载其样式及完整依赖，静态导入仍有正确样式，既有显式 CSS 导入不重复下载。 | Passed: reviewed AST ImportDeclaration/ImportExpression routing and both generic and componentDistRoot execution paths; lazy styles are loaded within the dynamic boundary, with dependency-first full closure and module-level deduplication. Current Runtime 10 tests execute actual Vite output for both modes, checking cold registry, activated closure, shared dependencies, explicit CSS deduplication and type/string/comment exclusion. Current production resource sample retains only needed page dependencies; no full stylesheet fallback was added. |
| A5 | passed | brief.md | Nexus 同一运行模式下的 TuffEx 自动注册、显式组件和工具模块来自同一套实现。生产预览的 Toast Demo 能展示提示，Overlay 共用层级管理，不出现 source/dist 分裂导致的交互失效。 | Passed: Nuxt automatic registration and explicit component/utils aliases share the same source/dist mode; traced Toast host consumption to toastStore and Overlay consumers to the common z-index-manager module. production-toast.json records real Success -> Saved notification; clean-toast-observation.json records the clean rebuild interaction and completed visibility wait. Actual repeated language dropdown opening/selection/closing also works. No bridge or duplicate state queue introduced; final screenshot timeout is not counted as visual evidence. |
| A6 | passed | brief.md | 未缓存的站内文档切换通过一个完整正文响应取得元数据和正文，不先等待 meta 请求再等待 body。已缓存页面复用结果，快速导航或切语言时旧响应不会覆盖新页面，失败保留明确错误和现有重试入口。 | Passed: page SSR/hydration and SPA use body=1; sidebar/pager no longer issue metadata requests. Reviewed canonical locale-aware caches, pending request joining, route/generation stale guards around awaits/backoff, page-local state and bounded retry/error UI. spa-navigation-and-cache.json records one body JSON for uncached Developer/Concepts and zero requests on cached Back/Forward; checkbox-and-transport-error.json and transport-error-retry.json show explicit error (not false 404), settled bounded denials and one-response Retry recovery. late-navigation-response.json releases a real delayed 200 after returning to Toast without replacing the final page. Current Runtime cache tests also preserve production 404 versus transport error semantics. |
| A7 | passed | brief.md | 文档首屏只加载公共页面壳、本页组件和实际依赖，不加载其他文档的 Demo 或其重型依赖。滚动激活及重置本页 Demo 后交互、样式和语言仍正确，页面之间不会携带整份 Demo 注册表作为首屏依赖。 | Passed: traced registry build parsing -> emitted versioned loader -> runtime dynamic import -> renderer default component and instance-change -> wrapper reset handler. Manual chunk isolation and non-entry manifest flags keep Demo implementations out of shared startup. Current Runtime Vite integration test measures loaded implementation ownership including silent unrelated modules, and production-resource-graph.log inspects actual clean Button JS: only ButtonVariantsDemo and ButtonDisabledDemo implementations. Real Checkbox mouse, reset and keyboard Space evidence and retained Terminal Demo evidence confirm interactions are not mocked away; body/code remain static and the full registry is development-only. |
| A8 | passed | brief.md | 生产预渲染的中英文文档在禁用 JavaScript 时已有标题、正文和代码。恢复 JavaScript 后正文保留，首屏不重新请求正文；canonical、alternate、静态缓存规则和既有 URL 形态保持正确。 | Passed: complete body mode and fetch key are shared by SSR/hydration, and body seeding suppresses duplicate requests. ssg-no-javascript.json records six real script-disabled English/Chinese Button and directory pages with titles/body, Button code blocks, production canonical and en/zh-CN/x-default alternates. Clean before/after production browser samples keep readable Button content and zero initial body requests. static-http-delivery.json plus unchanged static delivery pipeline and current budget sub-check output confirm 300-second public cache, JSON MIME, real 404, 308 entry redirect and static route ownership; private engagement/account APIs are not added to public caching. Overall budget command is failed, not passed. |
| A9 | passed | brief.md | 在真实浏览器回归地图、目录、语言、普通组件页及 Toast Demo。用同一构建模式和缓存条件比较优化前后请求数、CSS/JS 资源和串行等待，分别报告本地与线上边界，不把开发模块数量或历史部署问题当成当前生产收益。 | Passed for the complete confirmed evidence/reporting criterion, not a claim that every metric improves: current unchanged candidate has real Pages browser directory/locale/ordinary component/Toast interactions plus actual map component browser operations. Same Node/build entry and clean production mode, viewport 1799x1209, disabled cache/service-worker bypass, and five seconds after first live Demo form one cold pair. Runtime graph output records 111 -> 121 requests, CSS 123447 -> 112532 encoded bytes and JS 487753 -> 459867 encoded bytes, zero initial body requests; SPA evidence separately records one complete response versus cached zero and no meta/body serial chain. Both clean original full-site budget commands fail (89.43 -> 91.18 MiB against unchanged 60 MiB) and full-site typechecks fail (candidate 6/baseline 12); these are explicitly retained constraints in brief line 76, not hidden passes or reduced acceptance scope. No deployment, edge-cache, Early Hints or online latency benefit is asserted. |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| Nexus locale cache real Dashboard and Demo contracts | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/vitest/vitest.mjs run app/composables/useLocaleOrchestrator.test.ts app/utils/docs-page-client-cache.test.ts build/nexus-demo-loaders.test.ts test/guards/component-auto-import.test.ts app/pages/dashboard/geo-map-visibility.test.ts app/components/admin/admin-kit-components.test.ts app/components/dashboard/intelligence/intelligence-overview-components.test.ts app/components/dashboard/provider-registry/provider-registry-components.test.ts | apps/nexus | passed | 0 | 1246 ms |
| Real map pointer and dynamic CSS closure contracts | npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false /Users/talexdreamsoul/.local/share/mise/installs/node/26.0.0/bin/node node_modules/vitest/vitest.mjs run --project components --project build packages/components/src/charts/__tests__/maps.test.ts packages/script/build/__tests__/on-demand-style-plugin.test.ts | packages/tuffex | passed | 0 | 1149 ms |
| check-doc-translation-parity | build/check-doc-translation-parity.mjs | apps/nexus | passed | 0 | 57 ms |
| check-demo-registry-orphans | build/check-demo-registry-orphans.mjs | apps/nexus | passed | 0 | 81 ms |
| check-mdc-fences | build/check-mdc-fences.mjs | apps/nexus | passed | 0 | 58 ms |
| Actual loaded Demo implementation ownership | -e const fs=require('node:fs'),path=require('node:path'); const [root,beforePath,afterPath]=process.argv.slice(1); const observations=[]; for(const [phase,samplePath] of [['before',beforePath],['after',afterPath]]){ const sample=JSON.parse(fs.readFileSync(samplePath,'utf8')); observations.push({phase,viewport:sample.viewport,requests:sample.resources.length,jsCount:sample.js.length,jsBytes:sample.js.reduce((n,x)=>n+x.bytes,0),cssCount:sample.css.length,cssBytes:sample.css.reduce((n,x)=>n+x.bytes,0),bodyRequests:sample.bodyRequests,loaders:sample.loaders}); if(phase==='after'){ const modules=sample.js.map(x=>{const code=fs.readFileSync(path.join(root,x.path),'utf8');return {path:x.path,names:[...code.matchAll(/(?:__name\|name):"([A-Za-z][A-Za-z0-9_-]*)"/g)].map(m=>m[1])};}); const demos=modules.flatMap(x=>x.names.filter(n=>n.endsWith('Demo')).map(name=>({path:x.path,name}))); console.log(JSON.stringify({modules,demos})); if(demos.some(x=>!x.name.startsWith('Button')))process.exitCode=1; } } console.log(JSON.stringify({observations})); /Users/talexdreamsoul/orca/workspaces/talex-touch/nexus-delivery-recovery/apps/nexus/dist /Users/talexdreamsoul/.local/share/tuff-recovery/nexus-delivery-20261006/before-clean-resources.json /Users/talexdreamsoul/.local/share/tuff-recovery/nexus-delivery-20261006/after-clean-resources.json | . | passed | 0 | 45 ms |
| Committed recovery source whitespace | diff --check HEAD^ HEAD | . | passed | 0 | 22 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- Nexus定向行为回归: passed — 8文件80项，bg_14；不继承历史结果。
- TuffEx地图与动态CSS回归: passed — 2文件27项，bg_5。
- 包级ESLint: passed — 实际Nexus配置bg_24、TuffEx配置bg_20；此前根配置/路径失败已明确修正，不记作产品失败。
- 干净生产构建与静态后处理: passed — /Users/talexdreamsoul/.local/share/tuff-recovery/nexus-delivery-20261006/before-clean-build-results.json；/Users/talexdreamsoul/.local/share/tuff-recovery/nexus-delivery-20261006/after-clean-build-results.json
- 完整全站资源门禁: failed — 原命令未修改，两套干净输出均exit1；详见before-clean-budget.log和after-clean-budget.log。
- 全站渲染层类型检查: failed — /Users/talexdreamsoul/.local/share/tuff-recovery/nexus-delivery-20261006/typecheck-known-limits.json
- 完整源码提交保全: passed — commit 3d8fe081c，37份文本与提交blob完全一致；Husky包级ESLint和commitlint运行，未关闭GPG签名，未推送。
- 标准Nuxt声明准备: passed — 实际nuxt prepare完成，修正component-auto-import既有检查的生成环境前提。
- 已知限制: 未部署、未修改Cloudflare线上规则，不能推断线上延迟、边缘缓存或Early Hints收益。
- 已知限制: 一次同条件本地冷采样的CSS/JS字节下降，但请求111→121，干净部署产物89.43→91.18MiB；不宣称整体变快。历史会话JS增长的事实不因新采样覆盖。
- 已知限制: check-worker-bundle原阈值未动：两组均超60MiB，另有HTML完整正文payload、初始大chunk和图标预算问题。此恢复不以删除SSG正文或放宽阈值清零全站预算。
- 已知限制: 全站vue-tsc未通过：候选6项配置/Cloudflare声明问题，基线12项；没有本轮业务Vue文件报错。完整结果见typecheck-known-limits.json，不宣称类型检查通过。
- 已知限制: Dashboard认证/后端不在本轮重新设计范围。完整真实页面消费者回归与真实GeoBubbleMap浏览器探针共同覆盖地图，不将探针冒充认证后台验收。
- 已知限制: 返回图片在当前宿主不可直接目视，本轮UI结论来自真实DOM、几何、网络和交互；已有截图保存。最后一次干净Toast截图超时，但之前可见性等待及先前真实Toast截图/DOM证据有效。

## 阻塞项

_无。_

## 风险与跳过的工作

- Original check-worker-bundle fails on BOTH clean outputs: total 89.43 -> 91.18 MiB exceeds the unchanged 60 MiB threshold; full HTML/body payload, icon selectors and heavy/initial chunks also violate existing budgets. This report accepts A1-A9 behavior/evidence under the explicitly preserved limitation, not the full-site release gate. Do not delete SSG body or raise thresholds to turn it green.
- Only one matched local cold pair: requests increase 111 -> 121 (+10), JS resources 68 -> 80 and CSS resources 36 -> 33; CSS encoded bytes 123447 -> 112532 and JS 487753 -> 459867 decrease. This is not proof of overall speed improvement, and does not replace or conceal historical measurements.
- Full-site vue-tsc remains FAILED: candidate 6 configuration/Cloudflare declaration errors, baseline 12. Current Runtime seven planned checks and 107 targeted tests passed, but neither the full-site budget gate nor full-site typecheck is included in that pass claim.
- Browser evidence is local Pages production preview (8837 candidate/8838 baseline); map browser evidence is actual component-level 8839 plus real Dashboard consumer Runtime tests, not authenticated Dashboard/backend end-to-end verification. No deployment or Cloudflare rule changes were made; online latency/edge caching/Early Hints effects remain unverified.
- Screenshots are not visually readable in this model. Findings rely on actual DOM, geometry, network and recorded interactions; the last clean Toast screenshot timed out after its visibility wait succeeded and is not presented as a successful screenshot.
- Reused only current candidate/source-matching Runtime and browser evidence, not lost-workspace pass state or the superseded first check failure. Source commit is 3d8fe081c; build/source binding and clean artifact roots are recorded in committed-source-proof.json and the clean build receipts. No build/test/lint/formatter rerun was performed by this Verifier.

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Builder handoff Runtime checks failed: nexus-contract-regressions | 2026-10-07T03:27:21.849Z |
| 1 | 2 | 1 | pass | — | Independent read-only acceptance of all current A1-A9: each passed exactly once after reviewing complete dispatch scope, brief/full Spec, patch/current producers and consumers, current Runtime seven check logs and matching real-browser/build evidence before using Builder handoff as corroboration. No implementation omission proven. Known failed whole-site budget/type gates and browser/online boundaries remain explicit risks. Startup receipt was submitted using the dispatch identity. Product and formal documents were not edited; no accept-result, archive, commit, merge or push performed. | 2026-10-07T03:37:47.077Z |



## 结论

Independent read-only acceptance of all current A1-A9: each passed exactly once after reviewing complete dispatch scope, brief/full Spec, patch/current producers and consumers, current Runtime seven check logs and matching real-browser/build evidence before using Builder handoff as corroboration. No implementation omission proven. Known failed whole-site budget/type gates and browser/online boundaries remain explicit risks. Startup receipt was submitted using the dispatch identity. Product and formal documents were not edited; no accept-result, archive, commit, merge or push performed.
