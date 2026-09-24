# Design — suite 画廊异步化与 docs 样式表实验

## 1. 问题的本质

Nuxt 为一页输出的 head 提示来自 SSR 时实际加载的模块图，而不是实际渲染的 DOM。`<ClientOnly>` 只省掉了渲染，省不掉 `import`。所以只要 specimen 的组件仍被画廊 SFC 静态 import，五个 suite 页就会为 162 个组件的 chunk 和样式付费。解法只有一个方向：让 specimen 所在模块在服务器上根本不被 import。

## 2. 结构

```
app/components/docs/
  DocsComponentsGallery.vue        # 外壳：安装条 + 网格 + SSR 占位；不再 import 任何 Tx 组件
  DocsGallerySpecimen.vue          # 其他会话新增，原样保留
  gallery/
    manifest.ts                    # 每个 suite 的格子清单：{ id, doc, label: { zh, en } }
    shared.ts                      # copy 文案表、cellLabel、docPath、INSTALL_CMD 等纯函数/常量
    suites/
      base.vue  pro.vue  ai.vue  data.vue  flow.vue   # 各 suite 的格子原样搬入，含其 script 状态
```

- 外壳组件：

```ts
const suiteLoaders = {
  base: () => import('./gallery/suites/base.vue'),
  pro: () => import('./gallery/suites/pro.vue'),
  ai: () => import('./gallery/suites/ai.vue'),
  data: () => import('./gallery/suites/data.vue'),
  flow: () => import('./gallery/suites/flow.vue'),
} as const
const SuiteBody = defineAsyncComponent(() => suiteLoaders[props.suite]())
```

  模板：`<ClientOnly><SuiteBody /><template #fallback>` 用 `manifest[suite]` 渲染与今天相同的 `section.docs-gallery__cell` 外壳（标签 + `NuxtLink` + `.docs-gallery__ph`）。服务器只执行 fallback，`defineAsyncComponent` 的 loader 不会被调用，suite chunk 与其 CSS 不进入 SSR 模块图。
- suite 模块：把今天 `v-if="props.suite === 'pro'"` 分支内的整块模板与它依赖的 script 状态、import 一并搬入 `suites/pro.vue`；格内继续用 `DocsGallerySpecimen`（重播）。静态 specifier 保证 Vite 为每个 suite 产出独立 chunk。
- 客户端时序：hydration → `ClientOnly` 切到 `SuiteBody` → 拉一个 suite chunk（含该 suite 的组件依赖）与其 CSS → 格子逐个出现。首屏与 LCP 不再等待这些资源。

## 3. 备选与取舍

- 每格一个异步组件（162 个 chunk）：颗粒更细，但绝大多数格子 < 4 KB 会被 `experimentalMinChunkSize` 折回，收益不稳定，先不做；若某 suite chunk 实测 > 300 KB gzip，再对该 suite 做按格 IntersectionObserver 懒挂载（第二阶段）。
- `LazyDocsComponentsGallery` / 把整个画廊改成客户端组件：SSR 仍会解析并渲染，模块图不变，无效。
- tuffex 全量 `components.css`：610 KB，比按需更重，否决。
- `features.inlineStyles`：已验证会双份，否决（见 spec）。

## 4. docs 页样式表实验（R4）

- 变量一：`experimentalMinChunkSize` 4096 → 16384 → 24576，各跑一次 build，记录 `checkHtmlInitialAssetBudgets` 各家族的 css/js 计数与 gzip 体积，以及 button 页 / landing 的 head 计数。
- 变量二：`vite.build.rollupOptions.output.manualChunks` 把 docs 页必带的原语（button、icon、card、tooltip、popover、tag、base-anchor、glass-surface、checkbox）并入一个 `tuffex-core` chunk → 对应 CSS 合成一份。风险是 landing 若不用其中某个组件会多下载；用 landing 家族预算作否决线。
- 保留规则：docs 家族 css/js 计数下降且 public/landing 家族不高于基线；否则只留记录。

## 5. 契约与门禁

- `docs-page-performance.test.ts` 若钉住画廊源字符串，需同步；新增一个测试断言 `DocsComponentsGallery.vue` 不含 `@talex-touch/tuffex/` 与 `#components` 的静态 import，且 `suiteLoaders` 五键齐全。
- `check:demo-registry`（`build/check-demo-registry-orphans.mjs`）对搬迁后的 demo 引用保持通过。
- `check-worker-bundle.mjs`：`checkHtmlInitialAssetBudgets` 的 docs 家族数字预期下降；不新增 findings。
- MDC 解析不变：外壳组件名与文件名不动，短代码无需改。

## 6. 兼容、回滚

- 无数据、无 API 变化；纯前端模块划分。回滚 = 撤销拆分提交。
- 与画廊整改任务的关系：本任务在其后进行，搬运时保留它们的改动；`DocsGallerySpecimen.vue` 不动。
