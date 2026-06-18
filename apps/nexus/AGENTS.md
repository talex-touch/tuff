# apps/nexus/AGENTS.md

适用于 `apps/nexus/**`。根规则仍然生效；本文只补 Nexus 专属约束。

## 范围

- Nexus 是文档、生态站点、Dashboard、Provider Registry、Data Governance、release metadata 与插件生态入口。
- 技术细节以 `apps/nexus/package.json`、Nuxt 配置和当前源码为准，不在 AGENTS 写死版本。

## Nuxt / SSR / UI

- 新增自定义组件在页面中显式 import；依赖浏览器态、用户态、时间、Teleport 的组件必须使用 `ClientOnly` 或等价 SSR guard。
- 避免 hydration mismatch：不要在 SSR 首屏直接读取 `window`、localStorage、随机数、当前时间或未 hydration 的用户态。
- Nexus UI 优先使用 TuffEx / 项目既有组件体系；避免引入新的视觉体系。
- 新文案必须同步 `apps/nexus/i18n/locales/zh.ts` 与 `apps/nexus/i18n/locales/en.ts`。

## SEO / Docs

- docs 页面 metadata、canonical、alternate、robots、OG/Twitter、JSON-LD 的变更需复用现有 helper，不要在页面散写重复逻辑。
- 当前 docs i18n 过渡口径：显式 `/en/docs/**`、`/zh/docs/**` route + 页内 locale 同步；不要擅自改全站 prefix 策略。
- 入口文档只放当前 SoT、P0/P1 和少量专题；连续审计报告放 archive/index，不逐条塞主入口。

## Provider Registry / Governance

- Provider 与 Scene 解耦：新增供应商进入 Provider Registry，新增使用场景进入 Scene，不新增孤立 provider model。
- provider secret、API key、credential ref 不得进入普通响应、日志、analytics payload 或 UI 明文。
- Governance evidence source 必须区分 `live | d1 | r2 | local-only | memory | open`；`memory/local-only` 不能计入生产完成证据。
- Nexus production governance 完成判断以 `docs/plan-prd/04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md` 为准。

## Pricing / Subscription

- 当前 pricing SoT 是 `docs/plan-prd/04-implementation/Pricing-SoT-2026-06-18.md`。
- 当前公开站只承诺 Pioneer `0 元 / $0`。
- `FREE / PRO / PLUS / TEAM / ENTERPRISE` 只能作为权限层级/套餐占位，不代表正式价格。
- 禁止 mock checkout、伪成功购买入口、固定假价格。

## Release / Assets

- Release metadata / assets 变更必须保持 GitHub Release ↔ Nexus matrix 可校验。
- `sha256`、`signatureUrl`、signature endpoint 属 R1 Release Integrity，不得用本地 preflight 替代真实链路证据。
- 生产/preview 发布、Cloudflare/D1/R2 操作属于高风险操作，必须单独确认。

## 推荐验证

- Nexus 类型：`pnpm -C "apps/nexus" run typecheck`
- Nexus 构建：`pnpm -C "apps/nexus" run build`
- API/routes：`pnpm -C "apps/nexus" run check:api-routes`
- 最近路径测试：`pnpm -C "apps/nexus" exec vitest run "<test files>"`
- 文档/空白：`git diff --check`
