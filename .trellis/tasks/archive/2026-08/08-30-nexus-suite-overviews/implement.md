# 实现清单

## Phase A — 无争用（content + 画廊）

- [x] 定位 DocsComponentsGallery 实现，加套件过滤（`suite` prop，按 category→suite 映射过滤；映射需单一来源可复用）
- [x] 读 ai-suite 双语页，定型 overview 模板（frontmatter 字段照抄先例）
- [x] 写 concepts-suite.{zh,en}.mdc（三组别三节 + 链接 index/foundations/utils）
- [x] 写 base-suite.{zh,en}.mdc（套件定位 + 本套件画廊）
- [x] 写 pro-suite.{zh,en}.mdc（同上）
- [x] check:mdc-fences + doc-parity 本地过（新页此时尚未入侧栏，属预期）

## Phase B — 争用文件（等 avatar 任务提交或归属明确后）

- [x] DocsSidebar：`SuiteKey` + `'data'`；SUITES 增 data 项（categories=Visualization/Charts；overview 首项机制统一五套件）
- [x] CATEGORY_SUITE_MAP：Visualization/Charts → data
- [x] `/docs/dev/components` 路由列表加入三个新 overview 页（否则上下页导航/侧栏缺失）
- [x] recategorize-component-docs.py 套件映射同步
- [x] i18n locales：suites.data 及新增 label（只动本任务 region，hunk 级 stage）
- [x] misc canary 目检

## Phase C — 门禁与视觉

- [x] pnpm install（对齐 master lockfile，先通报共用 dev server 的会话）
- [x] 先 build tuffex，再 nexus typecheck
- [x] pnpm -C apps/nexus test（coverage / 性能边界）
- [x] check:mdc-fences / check:doc-parity / check:demo-registry
- [x] CDP 明暗截图五 tab + concepts 页
- [x] commit（只含本任务 hunks）→ push → PR（PR 流强制）

## 回滚点

- Phase A 纯新增文件 + gallery 一处 prop，revert 即回滚。
- Phase B 全部集中在 DocsSidebar/locales/python 三文件，单 commit 便于整体回退。
