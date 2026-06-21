# Nexus Performance TODO

> 更新时间：2026-06-21
> 范围：`apps/nexus` 文档站、生态站、Dashboard、Provider Registry、Data Governance 与公开控制台性能收口。

## Goal

```text
1. 扫描整个 nexus 优化性能，自行测试各种报告。目前加载超级缓慢，希望每个页面切换都很快，而且固定各种模板，拆分，该静态的静态。
2. 各种文档加载也特别慢，对应目前 aireview 组件还没有审批完的全部都要好好优化一下，依次修复，分批做提交，做截图+性能加载 playwright 分析报告等。
```

## 当前口径

- Nexus 性能线与 CoreApp / AI / R3 分开推进，不混入其它 dirty files。
- `output/playwright/` 只作为 ignored evidence 目录，不纳入提交。
- 每批保持小切片：Playwright screenshot/HAR/Markdown/JSON、focused 验证或等价静态检查、`git diff --check`。
- production 结论必须用 production build / preview HAR，不用 dev-only HAR 替代。
- 当前整体 goal 约 `96.5%`，剩余是系统性收尾，不再从聊天上下文恢复范围。

## 已完成摘要

- docs route 首屏重型链路已完成主要止血：
  - sidebar metadata 延迟加载
  - docs metadata 避免全量 MDC parse
  - i18n locale messages 懒加载
  - route-local locale messages 拆分
  - dev route-local CSS 污染过滤
  - component docs dev metadata fast path
  - sidebar / pager full-body prefetch 可取消化
  - docs Assistant context 按用户意图构建
  - pending 长文档后半段 deferred render
  - code copy header 原生 DOM 增强
  - toast feedback 动态加载
  - public docs auth/profile graph 移出首访
  - legacy sonner CSS 移出首访
- `/en/docs/dev/components/tabs` 当前关键状态：
  - 页面 200
  - 3.5s HAR 中 Assistant / dompurify / sonner / current-user profile graph 为 0
  - `typedPages=false` A/B 已证明不是 Nuxt dev macro 请求根因
  - 剩余共同慢点是 Nuxt dev macro scan、admin macro、auth page macro 与 `@sidebase/nuxt-auth` module-level client runtime
- pending / aireview 工作表：`../engineering/reports/nexus-performance-2026-06-21/pending-components-worktable.md`

## 未完成

| 主题 | 状态 | 下一步 |
| --- | --- | --- |
| docs 文档内容加载 | partial | 固定 docs template 静态壳；审计 `body=0` payload；继续拆可见区 demo / API table lazy boundary。 |
| AI review / aireview 未审批组件 | partial | 基于 pending 组件工作表，对组件按静态化、懒加载、首屏移出、模板合并、删除/后置分组处理。 |
| dev SSR TTFB / Nuxt macro | partial | 区分 Nuxt transform/cache、Content query/frontmatter fast path、i18n init、store memory init、auth/middleware 与 route payload。 |
| sidebase auth runtime | open | 处理前必须同时验证 public docs、`/sign-in`、OAuth callback、`/dashboard`、`/team/join`、`/auth/admin-bootstrap` 与 header user menu。 |
| route matrix 二轮 | partial | 补 authenticated dashboard、Provider Registry、Data Governance、移动端 viewport、production preview、back/forward cache、`/new`。 |
| production chunk / payload / CSS | open | 检查 docs/store/dashboard/landing 是否互相污染；优先修 import boundary、layout boundary 或 component registration。 |
| 首页 warnings | open | 单独定位 WebGL ReadPixels、async lifecycle `onBeforeUnmount`、`Invalid scope`，不混入 docs 文档批次。 |

## 下批建议顺序

1. `@sidebase/nuxt-auth` client plugin 拆分/门控。
2. pending / aireview 页面继续按组件工作表分批拆 demo/report/preview lazy boundary。
3. dev SSR TTFB / Nuxt macro 深化。
4. production chunk / payload / CSS 复核。
5. 全站 route matrix 二轮。
6. 首页 warnings 单独收口。

## 验证要求

- 每批至少保留一份 Playwright/HAR 或等价静态证据。
- 文档内容加载优化必须对比 before / after 请求数、failed count、关键 runtime chunk、visible shell。
- production chunk/CSS 结论必须跑 production preview。
- `git diff --check` 必须通过。
