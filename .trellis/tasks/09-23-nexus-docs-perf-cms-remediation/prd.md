# Nexus docs 静态交付收尾、画廊瘦身与后台补齐（父任务）

## Goal

把 2026-09-23 的审计结论变成三个可独立验证的交付：让已经 SSG 的 docs 真正吃到静态与边缘缓存的红利并修掉软 404；把 suite 画廊页的首屏模块图从整个组件库缩回普通文档页水平；按"git 即 CMS"的路线补齐后台缺页并拆掉巨型页面。本任务只做规划、任务映射、跨子任务验收与最终集成复核，不承载实现。

## Background

审计证据全文在 `research/audit-2026-09-23.md`，要点：

- docs 已由 `build/docs-prerender-routes.ts` 全量预渲染并被 `_routes.json` 排除在 Worker 之外；线上 `button` 页 HTML 自带正文，hydration 零正文请求。老板感知的"不能 SSG"实际是"SSG 了但没生效"。
- 边缘不缓存：docs HTML / JSON / `.md` / `_i18n` 全部 `cf-cache-status: DYNAMIC`，`_headers` 的 `s-maxage` 在边缘无效；`/en/docs/<不存在>` 返回首页 HTML 且 200；`/docs/**` 的 308 仍由 Worker 处理。
- suite 画廊页 head 里 154 个样式表 + 225 个 modulepreload（普通页 28 + 53），根因是 `DocsComponentsGallery.vue` 静态 import 162 个 Tx 组件。
- 后台无文档内容管理；"内容"组仅 4 页；38 个 `/api/admin/*` 接口无 UI；`governance.vue` 4,056 行。

## Decisions

- D1（2026-09-23，老板）：建父任务 + 三个子任务，按优先级逐个推进。
- D2（2026-09-23，老板）：CMS 走路线 A "git 即 CMS"：文档继续 markdown + 构建发布，只补后台缺页并拆巨型页；不做正文入 D1 的在线编辑器（路线 B）。

## Task Map

| 子任务 | 交付物 | 优先级 | 顺序约束 |
|---|---|---|---|
| `09-23-nexus-docs-static-delivery-closeout` | 边缘缓存 runbook + 线上证据探针；`404.html` 真 404；`/docs/**` 静态 308；docs 根路径缓存头；归档 `08-27-nexus-docs-body-ssg` | P1 | 无前置；Cache Rule 需老板在 Cloudflare dashboard 操作 |
| `09-23-nexus-gallery-css-graph-slimming` | 画廊按 suite 拆成异步模块，suite 页 head 回到普通页水平；docs 页样式表数量实验 | P1 | 必须等 `09-23-nexus-pro-gallery-polish` 与 `09-23-nexus-base-gallery-sidebar` 落库后再开始（同一文件） |
| `09-23-nexus-admin-console-gaps` | credits 控制台页、插件审核页、发布证据页；`governance.vue` 拆分；images 列表分页 | P2 | 无前置 |

## Cross-child Acceptance Criteria

- [ ] 三个子任务各自归档后，`pnpm -C apps/nexus run build` 通过，`node apps/nexus/build/check-worker-bundle.mjs` 不新增 findings（基线见 research §6）。
- [ ] 线上探针：docs HTML / docs JSON 第二次请求 `cf-cache-status` 为 HIT 或 STALE；`/en/docs/<不存在>` 为 404；`/docs/dev` 的 308 不再带 Worker 特征（TTFB 与静态文件同量级）。
- [ ] `pro-suite` 预渲染 HTML 的 stylesheet ≤ 35、modulepreload ≤ 60，且画廊 27 个格子在 hydration 后仍全部渲染、重播按钮可用。
- [ ] 后台导航里不再有指向重定向壳页的条目；新增页面通过 `AdminNav.routing.test.ts` 与 `admin-page-layout-contracts.test.ts`。
- [ ] `.trellis/spec/frontend/nexus-docs-static-delivery.md` 更新为与线上一致的边缘缓存口径。

## Out of Scope

- 路线 B 的文档 CMS（正文入 D1、在线编辑器、ISR）。
- tuffex 组件本身的缺陷（走各画廊整改任务与 `tuffex-docs-sync`）。
- dev HMR 缺口与 `__uno.css` 体积（另有 `09-11-nexus-perf` 的 dev 子任务）。
- 本机网络路径与 Cloudflare 节点选择。
- `check-worker-bundle.mjs` 基线中已存在的 findings。

## Notes

- 共享工作树里有其他会话的未提交改动（`DocsComponentsGallery.vue/.css`、`DocsGallerySpecimen.vue`、tuffex 两个组件）；子任务只动自己范围内的文件，不 commit，除非老板要求。
- 父任务不 `task.py start`；先启动 `09-23-nexus-docs-static-delivery-closeout`。
