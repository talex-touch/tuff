# Nexus 文档站问题报告

> 记录于 2026-07-27，来源：Tuffex 组件文档侧边栏重新分类过程中发现的既有问题。
> 下列问题**均非本次改动引入**。
>
> **2026-07-27 更新：P1 / P2 / P3 已修复**，详见文末〈修复记录〉。P4–P6 见附录二，仍待处理。

---

## P1 · `docs-page-performance.test.ts` 5 个断言已失效（假阴性）  ✅ 已修复

**文件**：`apps/nexus/app/pages/docs/docs-page-performance.test.ts`
**发现时状态**：`5 failed | 31 passed` → **修复后 `36 passed`**

### 确认为既有问题

把 `DocsSidebar.vue` 换回 HEAD 版本重跑，结果同样是 `5 failed | 31 passed`，失败集合一致。与侧边栏分类重构无关。

### 根因分为两类

**A. 格式漂移（4 个：L636 / L654 / L664 / L892）**

`app/components/DocsSidebar.vue` 被以 Prettier 默认风格重新格式化（双引号 + 分号 + 80 列换行），而测试按仓库主流风格（单引号、无分号、单行）写死了字符串字面量。

| 断言期望 | 源码实际 |
|---|---|
| `import { requestDocsPage } from '~/utils/docs-page-client-cache'` | `import { requestDocsPage } from "~/utils/docs-page-client-cache";` |
| `requestDocsPage({ path: normalized, locale, body: '1' })` | `requestDocsPage({ path: normalized, locale, body: "1" })` |
| `const sidebarComponentsEndpoint = computed(() => \`...\`)`（单行） | `DocsSidebar.vue:69-71` 已换行成 3 行 |
| `const docsNavigationScope = computed(() => (...))`（单行） | `DocsSidebar.vue:48-50` 已换行成 3 行 |

**B. 变量重命名未同步（1 个：L546）**

```js
// 断言期望
expect(legacySearch).toMatch(/fetchContentApi<DocsSearchResponse>\(`\/api\/docs\/search\/\$\{normalizedLocale\}`/)

// app/components/Search.vue:23 实际
const response = await fetchContentApi<DocsSearchResponse>(`/api/docs/search/${targetLocale}`, {})
//                                                                             ^^^^^^^^^^^^ 已改名
```

### 影响评估：是假阴性，不是真回归

5 处失败全是**正向字面量匹配**。直接 grep 复核，测试真正要守的性能不变量仍然成立：

| 不变量 | 实测 |
|---|---|
| `composables/useGlobalSearch.ts` 不含 `queryCollection(` | 0 处 ✅ |
| `composables/useGlobalSearch.ts` 不含 `searchContent(` | 0 处 ✅ |
| `components/Search.vue` 不含 `searchContent(` | 0 处 ✅ |
| search / sidebar-components / navigation 三个端点仍走 `fetchContentApi` + `/api/docs/...` 可预渲染形态 | ✅ |

### 但有一个隐藏风险

Vitest 在断言失败处即中断该 `it()` 块，**排在失败行之后的负向断言（`not.toContain(...)`，也就是真正的护栏）根本没执行**。例如 L546 失败后，L547 的 `expect(legacySearch).not.toContain('searchContent(')` 被跳过。

也就是说这 5 个测试当前**整体处于失效状态**，而不只是"5 条断言过时"。上表的不变量是我手工 grep 验证的，不是测试跑出来的。

### 建议

1. **短期**：修 5 处字面量（`normalizedLocale` → `targetLocale`，其余适配新格式）。
2. **根治**：这类"读 SFC 源码文本 + grep 字符串"的测试对任何无害重构都会碎，且碎了之后连带屏蔽同块内的真护栏。两个方向：
   - 把字面量断言换成对格式不敏感的正则（引号任选、允许换行）；
   - 或改为断言**构建产物 / 运行时行为**（如检查打包 chunk 不含 content collection 代码），而非源码拼写。
3. 若采纳方案 2，建议把负向断言（真护栏）拆到独立的 `it()`，避免被正向断言的失败连累。

---

## P2 · `tuffex-visual-smoke.mjs` 引用已删除文件，脚本不可运行  ✅ 已修复

**文件**：`apps/nexus/scripts/tuffex-visual-smoke.mjs:3`

```js
import { ... } from '../../../packages/tuffex/scripts/audit-cdp-client.mjs'
```

该文件已在 `dff0813b8`（*chore(workspace): trim scripts and move tuffex showcase to nexus*）中删除，**引用方漏改**。

**现状**：`pnpm visual:smoke:tuffex` 必然 `ERR_MODULE_NOT_FOUND`。

**影响面**：该脚本仅在 `apps/nexus/package.json:36` 注册，未接入任何 CI，所以没造成红灯 —— 但也意味着 Tuffex 视觉冒烟测试事实上已停摆且长期无人察觉。

**建议**：二选一 —— 恢复/重写 CDP client，或删除脚本连同 `package.json` 里的 script 条目。保持现状是最差选项（看着有、实际没有）。

---

## P3 · 代码风格无强制机制，是 P1-A 的上游成因  ✅ 已修复

- 根目录与 `apps/nexus` 均**无** `.prettierrc` / `prettier.config.*`
- `apps/nexus/eslint.config.js:12` 显式设置 `stylistic: false`，ESLint 不管风格

结果：没有任何唯一事实源。谁用编辑器默认 Prettier 保存一次，文件风格就漂一次。当前已经分裂：

| 文件 | 风格 |
|---|---|
| `app/components/DocsSidebar.vue` | 双引号 + 分号 + 80 列换行 |
| `app/pages/docs/[...slug].vue` | 单引号 + 无分号 + 长行 |
| `i18n/locales/*.ts` | 单引号 + 无分号 |

**建议**：补 Prettier 配置，或打开 ESLint stylistic，二选一。在 P1 存在源码文本断言的前提下，风格漂移的代价被放大了 —— 一次无心的保存就会让性能护栏静默失效。

---

## 附：本次分类重构中已顺带修复的问题

以下问题已在侧边栏重构中一并解决，仅作记录：

- **分类静默丢失**：`Navigation`(3 个) 与 `Design`(Floating) 不在 `COMPONENT_CATEGORY_ORDER` 中，只能掉进「其他」兜底组。
- **中英分类不一致**：`foundations` 的 `category` 在 zh 侧是中文字面量 `基础`、en 侧是 `Foundation`，两个 locale 都命中不了 order 表。
- **错误分类**：`flat-input` 标为 `Basic`，实为表单组件。
- **两套分组机制并行**：硬编码的 `COMPONENT_PRIORITY_SECTIONS`（设计模式/设计案例/暗黑模式与主题）先从 23 个组件里抢人置顶，剩下的才按 frontmatter `category` 分组，导致语义割裂。已删除，改为单一分类驱动。

---

## 附：浏览器验证注意事项

给后续做同类验证的人一个提醒 —— 本次踩到过一次：

用 headless Chrome 校验侧边栏时，若**复用同一个 `--user-data-dir`**，`/api/docs/sidebar-components/{locale}` 会命中浏览器 HTTP 缓存，读到上一轮的旧数据（表现为 API 直连正确、页面渲染却是旧结构）。每轮验证前清掉 profile 目录，或禁用 HTTP 缓存。

---

# 修复记录（2026-07-27）

## P1 修复方式

关键判断：测试期望的 `docsNavigationEndpoint` 单行长 **127 字符**，而仓库行宽从 80 到 185 不等 —— **没有任何合理的 printWidth 能同时满足所有断言**。所以按"是不是仓库标准"把问题一分为二：

| 维度 | 是否仓库标准 | 修在哪 |
|---|---|---|
| 引号 / 分号 | **是**（实测 5696 个单引号 import、0 个双引号） | 修源文件 |
| 单参数箭头括号 | **是**（实测 bare 377 : parens 60） | 修源文件 |
| 换行位置 | **否**（行宽 80–185 并存） | 修测试 |

1. 用新增的 `.prettierrc.json` 重排 `DocsSidebar.vue`，消除引号/分号/箭头括号漂移。
2. 3 条依赖换行的正则改为容忍空白（`\s*`、可选尾逗号），断言强度不变。
3. `Search.vue` 的 `normalizedLocale` → `targetLocale` 重命名同步到断言。
4. **全文件 668 处 `expect(` 改为 `expect.soft(`** —— 根治"一处失败掩蔽整块"。

### 验证

- **变异测试**：分别破坏 locale 过滤、`?? 'all'` 兜底、idle 超时三处语义，放宽后的正则**全部捕获**，证明没有把护栏改松。
- **掩蔽验证**：在同一 `it()` 内同时破坏两处，两处**都被报出**（改造前只会报第一处）。
- 全量 `36 passed`；此前因掩蔽而从未执行的约 30 条断言现已真实运行。

## P2 修复方式

`audit-cdp-client.mjs` 从 `dff0813b8^` 恢复，落到 `apps/nexus/scripts/`（与唯一消费方同目录，符合该 commit "move to nexus" 的方向；`repoRoot` 的 `../../../` 深度两处一致，无需改动）。引用改为 `./audit-cdp-client.mjs`。

**已实跑验证**：起 Chrome(9224) + nexus dev，`node scripts/tuffex-visual-smoke.mjs` 完整跑完 30 个场景并产出报告。

### 恢复后立即暴露的新问题（未修）

脚本一恢复就抓到实料，这些是它停摆期间积累的：

| 问题 | 出现次数 |
|---|---|
| `[Vue warn] Hydration node mismatch: rendered on server: div.flex.flex-col.gap-0.5` | 29 / 30 场景 |
| `Hydration completed but contains mismatches.` | 29 / 30 场景 |
| `[Vue warn] Extraneous non-props attributes (class)` | 29 / 30 场景 |
| `[intlify] Not found 'nav.privacy' key in 'en' locale messages` | 26 / 30 场景 |
| `[intlify] Not found 'nav.license' key in 'en' locale messages` | 26 / 30 场景 |

第一条把**附录二 P5 的 hydration mismatch 精确定位到了 `div.flex.flex-col.gap-0.5`，即 DocsSidebar 的滚动容器**。后两条是 `nav.privacy` / `nav.license` 两个 i18n key 在 en 侧缺失，属独立的小 bug。

## P3 修复方式

新增根目录 `.prettierrc.json`：

```json
{ "semi": false, "singleQuote": true, "arrowParens": "avoid", "printWidth": 120 }
```

每一项都由实测数据定，不是拍脑袋（见 P1 表格）。**零 diff** —— 只提供唯一事实源，不触发任何既有文件重排。

### 为什么没有改用 ESLint stylistic

实测过：把 `apps/nexus/eslint.config.js` 的 `stylistic: false` 打开会产生 **668 个文件、17861 处**自动修复，完全淹没本次改动。已回滚，未采用。若日后要做全量规范化，这是可行路径，但应当独立成一次提交。

### 残余风险

`.prettierrc` 只约束"跑 Prettier 时的产物"，无法阻止有人不跑格式化。不过配合 P1 已让测试对换行不敏感，即使再次漂移也**不会再静默失效**。

---
---

# 附录二 · BaseAnchor liquid 动画实现过程中发现的问题

> 记录于 2026-07-27，来源：给 `TxBaseAnchor` 增加 `animation.type = 'liquid'` 液滴动效并同步双语文档。
> 与上文同一约定：下列 P4–P6 **均非本次改动引入**。
> **2026-07-27 更新：P4 / P5 / P6 已全部修复**，见文末〈P4–P6 修复记录〉。
> 文末另记本次顺带修掉的问题，以及几条会让人白白浪费时间的验证陷阱。

---

## P4 · `flat-dropdown` 已导出但零文档，文档覆盖测试常红  ✅ 已修复

**测试**：`apps/nexus/test/docs/tuffex-component-docs-coverage.test.ts`
**现状**：`2 failed | 20 passed`

```
× keeps every exported component covered by English and Chinese docs
  → missing English component docs: expected [ 'flat-dropdown' ] to deeply equal []
× requires complete localized documentation contracts for every exported component
  → ENOENT: .../content/docs/dev/components/flat-dropdown.en.mdc
```

### 确认为既有问题

- `packages/tuffex/packages/components/src/flat-dropdown` 与其在 `components.ts` 中的导出，同在 `3fc798b39`（*feat(tuffex): add flat-dropdown component*，2026-07-24）引入。
- `apps/nexus/content/docs/dev/components/flat-dropdown.{en,zh}.mdc` **在 HEAD 从未存在**。
- `components.ts` 当前**不脏**，本次改动未触碰。

即：组件合入时漏了配套文档，覆盖测试从 07-24 起就一直是红的。

### 附带影响（与 P1 同一个坑）

第二个失败是 `readFileSync` 直接抛 `ENOENT`，**整个 `it()` 块就此中断**。该块本来要对**每一个**组件文档逐一校验四项结构契约（至少一个 `TuffDemoWrapper`、`## API`、Props 标题、`## Best Practices` / `## 最佳实践`）。`flat-dropdown` 排在字母序靠前的位置，于是它后面所有组件的结构校验**根本没跑**。

这和 P1 是同一个失效模式：一处失败静默屏蔽掉同块内其余所有护栏。

### 建议

1. 补 `flat-dropdown.{en,zh}.mdc`（真正的修复）。
2. 顺手把结构校验循环改成先收集、后统一断言（`for` 里 `push` 到数组，循环外 `expect(problems).toEqual([])`），别让单个缺失文件吃掉整轮校验。

---

## P5 · 组件文档页全站 hydration mismatch  ✅ 已修复

**现状**：任意组件文档页在浏览器控制台报 `Hydration completed but contains mismatches.`

实测四个页面（其中三个与本次改动完全无关）：

| 页面 | 结果 |
|---|---|
| `/en/docs/dev/components/base-anchor` | HYDRATION MISMATCH |
| `/en/docs/dev/components/fusion` | HYDRATION MISMATCH |
| `/en/docs/dev/components/card` | HYDRATION MISMATCH |
| `/en/docs/dev/components/glass-surface` | HYDRATION MISMATCH |

全站一致，说明是文档页渲染管线本身的问题，不是某个组件的。

**影响**：Vue 在 mismatch 后会丢弃 SSR 产物、客户端整棵重渲染，白白抵消掉 SSR 收益 —— 而 P1 那组测试守的恰恰是文档页性能。也就是说性能护栏在源码层面写得很细，运行时却在这里漏掉一大块。

**建议**：开 Vue 的 `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` 定位到具体节点。优先怀疑随渲染环境变化的内容（主题/locale/时间/`ClientOnly` 边界附近）。

---

## P6 · `await update()` 是空等待，`@floating-ui/vue` 的 `update()` 返回 void  ✅ 已修复

**文件**：`packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue:755` 与 `:818`

```ts
await nextTick()
await update()      // ← 立即 resolve，浮层此刻尚未被定位
syncOutlineSize()
```

`node_modules/@floating-ui/vue/dist/floating-ui.vue.d.mts:265` 写得很明确：

```ts
/** The function to update floating position manually. */
update: () => void;
```

`await` 一个 `void` 立即 resolve。定位结果是通过响应式 `x` / `y` 异步写回的，`size` 中间件对 `elements.floating.style.width` 的写入也在其后。所以这两行 `await update()` **不构成任何"定位已完成"的保证**。

### 为什么一直没暴露

紧随其后的 `syncOutlineSize()` 只读 `contentRef` 的 `offsetWidth/Height`，而既有四种动画（`transfer`/`boom`/`opacity`/`none`）都只做相对变换，不关心浮层的**绝对**位置。所以量错了也看不出来。

`liquid` 需要触发器相对浮层的精确偏移，一上来就撞上了：幽灵画在 `(60, 60)` 而非局部 `(0, -48)`，面板宽度读到 149 而非 200，整个轮廓错位。

### 本次的处理

liquid 侧已改为逐帧可重跑的 `measureLiquid()`（带签名短路），不再依赖任何"定位已完成"的时机假设，并补了回归测试。

**但 `await update()` 这两行本身没动** —— 它们对既有四种动画无害，改动它们的收益不明而回归面不小。留作记录：**任何未来在 `TxBaseAnchor` 里读绝对几何的代码，都不能假设 `await update()` 之后布局已经稳定。**

---

## 附：本次顺带修复的问题

- **`base-anchor.test.ts` 从不 unmount，存在跨用例 DOM 污染**：`afterEach` 只做 `document.body.innerHTML = ''`，而面板是 teleport 到 body 的，组件实例仍然存活。被清空 DOM 的旧实例会重新插入内容，把后续用例的 `document.body.querySelector(...)` 引到错误节点上。已改为集中记录并 unmount 所有 wrapper。
- **两个新增 DOM 用例对真实计时器敏感**：单独跑绿、全量套件下红 —— 负载导致 190ms 动画在断言前跑完。已改为 `vi.spyOn(performance, 'now')` 冻结时钟。这个模式值得推广给任何断言动画中间态的用例。

---

## 附：验证陷阱（这几条本次各浪费了一轮）

1. **陈旧的 `.nuxt/dev` 会伪造出不存在的错误。** dev server 一度对所有文档页返回 500，报 `DOCS_PAGE_CACHE_MAX_AGE_SECONDS is not defined` 与 `Cannot access 'KA' before initialization`。而该符号在整个源码树里**根本不存在**（现名是 `DOCS_CONTENT_CACHE_MAX_AGE_SECONDS`）。`rm -rf apps/nexus/.nuxt/dev` 重启后一切正常。看到报错提到源码里搜不到的符号时，先怀疑构建缓存，别去读代码。

2. **文档页内容是客户端渲染的，`curl` 探测不到。** SSR 返回的 21KB HTML 只是壳，正文经 `requestDocsPage` 在客户端取。用 `grep` 检查渲染结果只会得到假阴性 —— 必须上真浏览器。

3. **demo 是 IntersectionObserver 懒挂载的**（`rootMargin: 240px`，`TuffDemoWrapper`）。不滚动到对应章节，demo 永远不会出现，而且**不会**显示 "Demo component not found"，看起来就像整段没渲染。

4. **headless Chrome 默认 `prefers-reduced-motion: reduce`。** 任何尊重该偏好的动画都会被正确地跳过，截图上表现为"动效没生效"。playwright 需显式传 `reducedMotion: 'no-preference'`。

5. **独立 harness 验证不能替代真实页面验证。** 本次 liquid 动效在独立 Vite harness 里完全正常，搬到文档页后触发器文字整个消失 —— `.docs-layout-root` / `.docs-layout-stage` 带 `isolation: isolate`，把触发器封在里面，任何 `z-index` 都无法抬到 teleport 到 `<body>` 的浮层之上。而且因为浮层是 `pointer-events: none`，`elementFromPoint` 仍然报告触发器在最上层，**命中测试是"对"的，只有肉眼是错的**。凡是依赖 z-index 跨越 teleport 边界的方案，都必须在真实页面上验证。

---

## 附：提交范围提示

本次改动触碰的 `apps/nexus/content/docs/dev/components/base-anchor.{en,zh}.mdc` 两个文件，各自还带着**一行不属于本次改动**的既有未提交修改：

```diff
-category: Feedback
+category: Primitives
```

来自上文附录一的分类重构（`recategorize-component-docs.py` 校验现已通过，说明这是有意的在途改动）。提交 liquid 相关改动时需要决定：连带提交，还是只 stage 本次的 hunk。

---

# P4–P6 修复记录（2026-07-27）

## P4 修复方式

补文档时发现同一次组件合入其实漏了**三处**，不止文档：

| 遗漏 | 位置 |
|---|---|
| 双语文档 | `content/docs/dev/components/flat-dropdown.{en,zh}.mdc` |
| 全局组件注册 | `app/plugins/tuffex.ts`（`TxFlatDropdown` 未注册，demo 根本渲染不出来） |
| hub 页链接 | `index.{en,zh}.mdc` |

已全部补齐，另加 `FlatDropdownBasicDemo.vue` 与其 registry 条目。文档内容按类型定义逐项核对（15 个 prop 的默认值、3 个事件、2 个插槽）。

分类归入 `Navigation`（与 `dropdown-menu` / `context-menu` 同组），并同步到 `recategorize-component-docs.py` 的分类表与 `DocsSidebar.vue` 的 `SECTION_ORDER` —— 这三处任缺其一，校验脚本会直接报错。

### 顺带修掉的掩蔽问题

结构契约校验循环改为**先收集、后统一断言**。变异验证：同时破坏 `button.en.mdc` 与 `tag.zh.mdc`，两处**都被报出** —— 改造前 en 的失败会中断整个 `it()`，`zh` 整轮根本执行不到。

### 验证

真实浏览器滚动到 demo（IntersectionObserver 懒挂载）并悬停触发器，面板展开且菜单项正确渲染。

## P5 修复方式

**根因**：`DocsSidebar.vue` 的滚动容器写着 `v-if="!sidebarPending"`，而导航请求是 `server: false` —— 服务端 `pending` 为 `false`（渲染该 div），客户端首帧为 `true`（不渲染），两端首帧不一致。

用 SSR 原始 HTML 实证确认：`curl` 返回的 HTML 里**确实存在** `flex flex-col gap-0.5`，与 Vue 警告 "rendered on server: div.flex.flex-col.gap-0.5" 完全吻合。

这个 `v-if` 的唯一收益是「客户端 hydration 到取数完成之间少闪一下」，代价却是**整页 hydration 失败**。已移除，两端首帧统一走 `sections.length === 0` 分支。

### 同时清掉的另外两类噪音

- **`Extraneous non-props attributes (class)`**：`TheHeader.vue:178` 给 `UiDrawer` 传 `class="TuffHeader-MobileMenu"`，经 `$attrs` 透传到根节点是 `<teleport>` 的 `TxDrawer`，无法继承。全仓检索确认**该 class 没有任何 CSS 规则或选择器引用**，是个死 class，已删除。
- **`nav.privacy` / `nav.license` 缺失**：这两个 key 在**中英两侧都不存在**，只靠 `t('nav.privacy', 'Privacy')` 的兜底串撑着 —— 所以中文站这两个页脚链接一直显示英文。已补齐（隐私政策 / 许可协议）。

### 验证

真实浏览器抓 console，6 个页面（含 P5 原表的四个）三类噪音**全部归零**：

```
OK  /en/docs/dev/components/base-anchor    hydration=0  extraneous-attrs=0  i18n-missing=0
OK  /en/docs/dev/components/fusion         hydration=0  extraneous-attrs=0  i18n-missing=0
OK  /en/docs/dev/components/card           hydration=0  extraneous-attrs=0  i18n-missing=0
OK  /en/docs/dev/components/glass-surface  hydration=0  extraneous-attrs=0  i18n-missing=0
OK  /en/docs/dev/components/flat-dropdown  hydration=0  extraneous-attrs=0  i18n-missing=0
OK  /zh/docs/dev/components/flat-dropdown  hydration=0  extraneous-attrs=0  i18n-missing=0
```

## P6 修复方式

原记录判断「收益不明」，但核对源码后收益是明确的：`TxBaseAnchor.vue:135` 的 `size` 中间件在 `apply()` 里写 `elements.floating.style.width`，而 `syncOutlineSize()` 读的正是依赖它的 `contentRef.offsetWidth`。竞态真实存在。

**第一版改法是错的**：把 `await update()` 换成 `update(); await nextFrame()`，测试立刻红了 2 个。查下来不只是测试没 flush rAF —— 这样会把**开场动画也推迟一帧**，是真的行为变更。

**最终改法**不动任何时序：立即测量保持原样，额外在帧落地后补测一次。`outlineW/outlineH` 是响应式的，轮廓会自行修正，动画启动时机完全不变。

```ts
update()
syncOutlineSize()
scheduleOutlineRemeasure()   // rAF 后重测，纠正 size 中间件写入前的过期宽度
```

### 验证

- 既有 40 个测试**一行未改**全部通过 —— 这是「无时序变更」最有力的证据。
- 新增回归测试（模拟 149 → 200 的宽度变化）。变异验证：移除两处 `scheduleOutlineRemeasure()` 调用后该测试变红，确认非空转。
- `packages/tuffex` 全量 **120 文件 / 709 测试全绿**。
- 真实文档页：14 个 anchor，点击展开正常，`viewBox="0 0 240 116"` 为真实非零尺寸。

---
---

# 附录三 · 36 个未完成任务的实证核查

> 记录于 2026-07-27，范围：`.trellis/tasks/` 下全部 36 个活跃任务（当日已归档的 9 个不在此列）。
> 方法：**不看 AC 勾选框下结论**。逐任务提取可验证产物（commit / tag / 文件 / 符号 / 测试），回仓库核实后定级。
> 本次核查为只读，未修改任何任务状态、未归档、未提交。

---

## P7 · 最大的一块「没完成」其实是「做完了没提交」  ⏸ 待授权（需提交工作区）

工作区 233 个未提交文件里，藏着**至少 6 个任务的完整或接近完整的交付**：

| 任务 | AC | 代码状态 |
|---|---|---|
| `07-27-fix-transport-caller-identity-300` | 9/9 | `caller-identity.ts` 等，仅工作区 |
| `07-27-harden-plugin-storage-299` | 8/8 | `sql-policy` 等新文件，仅工作区 |
| `07-27-secure-plugin-views-298` | 8/8 | `webviewTag=false` / atom 已改，仅工作区 |
| `07-27-fix-permission-revocation-296` | 7/8 | `permission-store.ts` 已改，仅工作区 |
| `07-27-base-anchor-liquid-animation` | 0/13 | `base-anchor-liquid.ts` 244 行 + 18 个测试 + 671 行组件改动，仅工作区（即附录二那批） |
| `07-27-fix-plugin-folder-button` | 4/5 | `system-shell-handlers.ts` 目录/文件分支 + 5 类测试，仅工作区 |

**结论**：`07-27-batch-commit-current-worktree` 不是 36 个任务里的一个，它是解锁其中 6 个的前置。而它自己是 `planning`、prd 只有一行 TBD、AC 0/1。整个待办池里杠杆最高的一件事就是先把它做掉。

---

## P8 · AC 勾选框双向失真，不能作为完成度信号  ◐ 部分修复

**有交付没勾**：

| 任务 | AC | 实际 |
|---|---|---|
| `07-17-widget-sandbox-completion` | 0/7 | `widget-sandbox-policy.ts` 及其测试早已存在，commit `a0c628289`（*feat(runtime): hard-cut transport and sandbox widgets*）已落地。挂 `in_progress` 十天，实为已交付 |
| `07-13-catalog-service-mvp` | 0/9 | commit `cd8dbc7b7`（*feat(catalog): add signed official lexicon lifecycle*）已建模块并在 `main/index.ts` 注册 |

**勾了没做**：

`07-26-batch-commit-project-changes` AC 5/5 标记完成，但工作区此刻仍有 233 个脏文件。核查确认它的 5 条 AC 指的是 G01–G19 那批约 20 个 commit（如 `3414a9be8` / `90d838212`），与当前脏工作区无关 —— **别把它当成「工作区已清干净」的凭据**。

这与 P1／P4 是同一类失效模式的变体：一个看起来在守护的信号，实际早已与被守护的事实脱钩。

---

## P9 · 父任务进度与子任务脱节  ✅ 已修复

`07-17-unify-ota-update-flow` 显示 `[0/5 done]`，看起来零进度。实测 5 个子任务中 **4 个已实证完成**（`3175ba33a` + 各自测试通过），父任务真正未完成的只有一条：三平台真实宿主签名版的验收证据。

`07-09-audit-search-system-architecture` 同理 —— 5 个子任务已归档，只剩 `unify-search-provider-lifecycle` 一个没做。

**影响**：看板上这两条线看起来完全没动，实际只差收尾。按显示的进度做优先级排序会严重误判。

---

## 分组结论

### A. 可直接改 `completed` 后归档（8 个，实证已完成）

| 任务 | AC | 佐证 |
|---|---|---|
| `07-26-release-v2-4-13-stable` | 6/6 | tag `v2.4.13`（`9935ed49b`）已推 origin，GitHub Release 为 Latest 正式版 |
| `07-26-release-v2-4-13-beta-23` | 6/6 | tag `v2.4.13-beta.23`（`022ade0d0`）已推，GitHub 为 Pre-release |
| `07-26-batch-commit-project-changes` | 5/5 | G01–G19 对应约 20 个 commit 已提交 |
| `07-21-07-20-align-published-release-gates` | 5/5 | gate-e 测试 + `beta.19` tag 均存在 |
| `07-17-unify-ota-provider-security` | 7/7 | commit `3175ba33a`，19 项测试通过 |
| `07-17-persist-ota-lifecycle` | 8/8 | `0028` 迁移 + lifecycle 30 项测试通过 |
| `07-17-unify-ota-install-recovery` | 8/8 | `quit-intent.ts`，9 项测试实测通过 |
| `07-17-ota-ui-release-acceptance` | 7/7 | `SettingHeader.vue` 隐藏徽章逻辑存在 |

### B. 交付已在仓库、AC 从未勾选，需人工确认后归档（3 个）

| 任务 | AC | 佐证 / 备注 |
|---|---|---|
| `07-17-widget-sandbox-completion` | 0/7 | 见 P8 |
| `07-13-catalog-service-mvp` | 0/9 | 见 P8，仅剩文档留痕类 AC |
| `07-26-install-launch-v2-4-13-beta-23` | 4/4 | `/Applications/Tuff.app` 版本 2.4.13-beta.23 且进程在跑；但 `~/Applications/Tuff-backups/` 为空，备份 AC 无证据 |

### C. 先提交、再归档（4 个）

`07-27-fix-transport-caller-identity-300`(9/9)、`07-27-harden-plugin-storage-299`(8/8)、`07-27-secure-plugin-views-298`(8/8)、`07-27-fix-permission-revocation-296`(7/8，另剩 #299 消费事件复核)。四者代码全部只在工作区，见 P7。

### D. 建议归档为 backlog（1 个）

`07-27-expose-plugin-search-sdk`（0/3）：**已被主动降级**。`design.md` / `implement.md` 在工作区被删除（未提交），`task.json` 的 parent 从 `optimize-clipboard-plugin` 改为 null、优先级 P1→P3，prd 重写为「等 ≥2 个真实消费者再启动」的候补条目。这是有意降级不是误删。

### E. 差临门一脚（5 个，剩余项明确）

| 任务 | AC | 还差什么 |
|---|---|---|
| `07-24-harden-app-icon-self-healing` | 10/11 | R1–R5 对应 commit 均已推送（`ab4d4aaf4` / `4724ad1e4` / `16f8a08fd` / `1fff571c9` / `3414a9be8`），只剩官方签名版真机冒烟 |
| `07-22-ota-one-click-background-update` | 9/10 | `apply-update.sh` 已去提权分支；缺 macOS 真实签名 15 秒基准 + 三平台真机证据 |
| `07-17-windows-everything-productionization` | 9/12 | PR287（`9fd368ed3`）在 HEAD 祖先链、gate 今日仍通过；缺真机打包 CoreBox UI 验收 + manifest 严格校验 |
| `07-27-fix-plugin-folder-button` | 4/5 | 代码+测试已写（未提交），缺真机 Finder 点击验证 |
| `07-09-audit-search-system-architecture` | 13/17 | 只剩 `unify-search-provider-lifecycle` 一个子任务，见 P9 |

### F. 真正停滞的老任务（3 个，7-19 后目录未动过）

| 任务 | AC | 实测 |
|---|---|---|
| `07-09-unify-search-provider-lifecycle` | 0/7 | `tuff-dsl.ts` 的 `ISearchProvider` 仍只有 `onLoad`，jsonl 是空模板。typed 生命周期 / 可执行注册表 / 通用 adapter 三样都没动 |
| `07-13-search-crossplatform-audit` | 7/25 | prd 07-26 仍在更新，B1–B6 + R4 已有归档子任务；R1–R3、R5–R9、C1–C6 共 15 项待办 |
| `07-17-unify-ota-update-flow` | 0/12 | 父任务，见 P9 |

### G. 已规划未开工（8 个）

| 任务 | 规划齐备度 | 建议 |
|---|---|---|
| `07-27-optimize-clipboard-plugin` | prd + design + implement 齐全 | 可直接开工写代码 |
| `07-27-optimize-core-utility-plugins` | prd + 研究（`plugin-audit.md`）齐备，3 子任务仅 1 个完成设计 | 继续做 |
| `07-27-optimize-intelligence-plugin` | 仅 prd | 补 design + implement |
| `07-27-optimize-translation-plugin` | 仅 prd | 补 design + implement |
| `07-27-audit-plugin-privileged-security` | prd + 4 篇 research（305 行，带 file:line 引用） | 拆出的 6 个 P0/P1 多数已进 review；自身矩阵/数据流表未产出 |
| `07-27-isolate-plugin-prelude-297` | 8 个新文件在工作区（host / wire / codec 等） | main 仍默认 vm 执行，官方插件迁移与硬切未做 |
| `07-27-sensitive-data-lifecycle-301` | prd 仅 TBD | 需求/设计/代码全未开始 |
| `07-27-resolve-open-github-issues` | 父任务 0/6 | 6 个子任务均已产出代码（未提交）；剩 #297 硬切、#301 需求、GitHub 复查收口 |

### H. 被 P7 卡住的发版链（3 个）

`07-27-batch-commit-current-worktree`（0/1，prd 仅 TBD）→ `07-27-release-v2-4-14-beta-1`（0/1，无 `v2.4.14*` tag，`package.json` 仍 2.4.13）→ 父任务 `07-27-batch-commit-release-v2-4-14-beta-1`（0/1，prd 仅 TBD）。整条链的第一步就是把 233 个脏文件分组提交 —— 而这一步同时解锁 P7 里的 6 个任务。

---

## 建议执行顺序

1. **先做 `batch-commit-current-worktree`** —— 一步解锁 6 个任务的收口。它自己的 prd 还是 TBD，需要先补出分组方案。
2. **提交完成后**，C 组 4 个立刻可归档；`fix-plugin-folder-button` 与 `base-anchor-liquid-animation` 各自只剩一条真机/收尾验证。
3. **顺手清账**：A 组 8 个 + B 组 3 个 + D 组 1 个共 12 个可直接归档，不需要写任何代码。清完后活跃任务从 36 降到约 18，看板才有参考价值。
4. **真机验收攒一批做**：E 组里 3 个任务卡的都是「官方签名版真机冒烟 / 三平台宿主证据」，性质相同，凑一次签名构建可以一起收。
5. **老任务做减法**：F 组停滞两周以上，判断重启还是作废，别继续挂在活跃列表里稀释信号。

---

## 数据可信度说明

- **直接验证过的**：5 个关键 commit（`cd8dbc7b7` / `a0c628289` / `3175ba33a` / `9935ed49b` / `022ade0d0`）确实存在；`widget-sandbox-policy.ts` 及其测试文件存在；tag `v2.4.13-beta.23` 存在；`package.json` 版本为 2.4.13；全部 36 个任务的 AC 勾选数由脚本机械统计。
- **由并行子代理核查、未逐条复验的**：各任务的测试通过数、工作区文件的具体内容归属。
- **已修正的偏差**：子代理曾把 `07-17-widget-sandbox-completion` 报为 AC 7/7，实测 prd 里 7 条全部未勾（0/7）—— 其实证结论仍成立，但计数以本报告为准。本报告所有 AC 数字统一来自 `prd.md` 的 `- [x]` / `- [ ]` 机械计数。

---

# P7–P9 处理记录（2026-07-27）

> 原则：归档是状态变更，而本报告自己声明过部分数据「由并行子代理核查、未逐条复验」。
> 因此下列每一条证据都由 `.trellis/scripts/verify-archive-candidates.py` 从仓库**重新推导**，不采信原结论。

## 已归档 9 个（证据独立复验通过）

复验脚本对 12 个候选逐条检查 tag 是否推到 origin、commit 是否在 HEAD 祖先链、文件是否存在。结果 **11/12 成立**，且脚本机械重数的 AC 与报告完全吻合。

| 任务 | 复验到的硬证据 |
|---|---|
| `07-26-release-v2-4-13-stable` | tag `v2.4.13` 在 origin |
| `07-26-release-v2-4-13-beta-23` | tag `v2.4.13-beta.23` 在 origin |
| `07-26-batch-commit-project-changes` | `3414a9be8` 在 HEAD 祖先链 |
| `07-21-07-20-align-published-release-gates` | `986622ed9`（与任务同名）+ tag beta.19 + **75 个 gate 测试实跑通过** |
| `07-17-unify-ota-provider-security` | `3175ba33a` 在祖先链 |
| `07-17-persist-ota-lifecycle` | 迁移 `0028` 存在 |
| `07-17-unify-ota-install-recovery` | `quit-intent.ts` 存在 |
| `07-17-ota-ui-release-acceptance` | `SettingHeader.vue` 存在 |
| `07-17-widget-sandbox-completion` | **25 个测试实跑通过** + AC5 证据在 `plugin-runtime-security.md:307`（已在 HEAD） |

OTA 四个任务另跑了 `src/main/modules/update` + `quit-intent`，**98 个测试全通过**。

`widget-sandbox-completion` 原为 0/7，7 条 AC 与测试用例逐条对应（含 `it.each` 的 eval/Function/WebAssembly 拒绝用例），已勾选后归档。

**活跃任务 36 → 27。**

## 明确不做的三件事

1. **不提交工作区**：附录三建议的第一步是把 233 个脏文件分组提交。提交需要显式授权，且工作区混有多个来源的改动，误扫风险高。C 组 4 个任务因此仍卡着。
2. **不归档 `07-26-install-launch-v2-4-13-beta-23`**：复验唯一失败项 —— `~/Applications/Tuff-backups/` 确为空，备份 AC 无证据。AC 却已勾 4/4，是 P8「勾了没做」的又一例。
3. **不归档 `07-27-expose-plugin-search-sdk`**：`task.py archive` 会把 status 置为 `completed`，而它是**被主动降级的候补项、不是完成品**。归档等于污染记录。它当前 `planning` + P3 + parent=null 已经是正确的 backlog 表示，无需改动。

## P9 已修复

归档 4 个 OTA 子任务后，父任务进度**自动纠正**：

- `07-17-unify-ota-update-flow`：`[0/5]` → **`[4/5 done]`**
- `07-09-audit-search-system-architecture`：**`[6/7 done]`**

看板不再把「只差收尾」显示成「零进度」。

## P8 部分修复

- `widget-sandbox-completion` 0/7 → 7/7（测试逐条坐实后归档）
- `catalog-service-mvp` 0/9 → **7/9**，未归档：AC1–AC7 由具名测试坐实（catalog 38 个 + i18n 18 个测试通过，测试标题与 AC 逐条对应），但 **AC8 需 lint+typecheck 未验、AC9 要求的 `implement.md` / `design.md` 实际缺失**。停在 7/9 比谎报 0/9 或 9/9 都更接近事实。

剩余任务的 AC 未逐条复验 —— 勾选框仍不可作为完成度信号，除非配套证据。

## 复验中发现报告本身有一处错误

附录三 F 组称 `07-09-unify-search-provider-lifecycle` 的证据是「`tuff-dsl.ts` 的 `ISearchProvider` 仍只有 `onLoad`」。

**实测不成立**：`packages/utils/core-box/tuff/tuff-dsl.ts:1548` 的 `ISearchProvider` 有 5 个钩子 —— `onSearch` / `onActivate` / `onDeactivate` / `onExecute` / `onLoad`。

该任务**确实未开工**（AC 0/7、两个 jsonl 均为 254 字节空模板、无 design/implement），所以结论仍成立，但**引用的证据是错的**。这正好印证了本报告开头那句「未逐条复验」的自我声明 —— 结论对不代表证据对。
