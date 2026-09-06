# Implement — 筛选条改用 TxFilterChips

Task: `.trellis/tasks/09-06-model-menu-filter-chips`
顺序有依赖：1 → 2 → 3，每步跑完自己的验证再进下一步。

## 1. TxFilterChips 的滑动指示器（tuffex）

- [x] `TxFilterChips.vue`：新增 `indicator?: boolean`（默认 `true`）到 `types.ts`，
      模板加 `tx-bui-filter-chips__indicator`（`aria-hidden`），容器 `position: relative`
- [x] 位置计算：读活动 chip 的 `offsetLeft` / `offsetWidth` 写 CSS 变量；触发点为
      `modelValue` 变化、`items` 变化、`ResizeObserver`；无活动项时 `opacity: 0` 且不位移
- [x] 首帧不滑：`--placing` 类先关 transition，`requestAnimationFrame` 后移除
- [x] 活动态底色/阴影从 `.is-active` 搬到指示器，`.is-active` 只留 `color`（静止观感不变）
- [x] BUI 规则：class 前缀 `tx-bui-filter-chips__*`、非 scoped scss、每个 `var()` 带内联兜底、
      保留 MIT 头；reduced-motion 下 `transition: none`
- [x] 测试：单元（切换后指示器变量跟着活动 chip 走 / `indicator: false` 时不渲染 /
      无活动项时不位移）+ **编译 SCSS 契约测试**（照 `context-cards-motion.test.ts`：
      断言 reduce 块里 `transition: none`，并反向断言默认块里确实有 transition）

验证：`cd packages/tuffex && npx vitest run packages/components/src/filter-chips`

**评审点**：静止态截图应与改前逐像素一致；变的只能是两态之间。

## 2. 筛选条换成 TxFilterChips（core-app）

- [x] `ModelFilter` 回到 `{ kind:'favorites' } | { kind:'provider'; providerId }`；
      `visibleChoices` 按 `providerId` 过滤；`defaultFilter()` 用钉住模型的 provider
- [x] `bucketFilters` → `providerFilters`（去重 provider、保留顺序）；
      `bucketOf` / `visibleGroups` / `showGroupHeaders` **不动**，继续喂组头
- [x] chip items computed：`[收藏, ...providers]`，`label` 取 `providerName`，
      `value` 用 `'\u0000favorites'` 之类不可能与 providerId 相撞的哨兵（或保持 union 映射）
- [x] 模板换成 `<TxFilterChips role="toolbar" :aria-label :items v-model>`；
      删除 `.HomeModelMenu-Filter` / `-Filters` / `-FilterInitial` 全部样式与手搓循环
- [x] i18n：`home.modelSources` 措辞回到「按提供方筛选」/「Filter by provider」（键名保持，
      避免又一次改键；两套语言同步）

验证：`cd apps/core-app && npx vitest run src/renderer/src/views/base/home/HomeModelMenu.test.ts`
（strip 相关用例按新语义**更新**：chip 数从 5 回到 3、label 从渠道名回到 provider 名、
「认不出的渠道画首字母」那条移到组头去断言）

## 3. Nexus 文档（tuffex 硬规则，同 commit）

- [x] `filter-chips.{zh,en}.mdc`：`indicator` 进 Props 表（按 `defineProps` 顺序放位置，不要追加到表尾）、
      交互契约补「活动底色是一个平移的滑块 / 它随 chip 横向滚动 / reduced-motion 直接落位 /
      首帧不滑」、最佳实践补「关掉 indicator 的场景」、审阅说明补覆盖行
- [x] 两个 demo（`FilterChipsFilterChipsDemo` / `FilterChipsFilterTableDemo`）核查结果：
      两者都不传 `indicator`，因此取默认（开）；静止观感不变，只有切换瞬间多了位移，
      demo 的说明文字没有一句在讲活动态怎么画，无需改动
- [x] wrapper 核查结果：`TxFilterChips` 在 tuffex 内部没有任何封装者（`rg` 只命中它自己的目录、
      `components.ts` / `base/index.ts` 的导出，以及 nexus 的两个 demo 与画廊），无 wrapper 文档需要跟改

验证：`cd apps/nexus && node build/check-doc-translation-parity.mjs && node build/check-mdc-fences.mjs`

## 收尾验证

```bash
cd apps/core-app && npm run typecheck:web
cd apps/core-app && npx vitest run src/renderer/src/views/base/home
cd packages/tuffex && npx vitest run packages/components/src/filter-chips
cd apps/core-app && npx eslint src/renderer/src/views/base/home/HomeModelMenu.vue
cd packages/tuffex && npx eslint packages/components/src/filter-chips
```

真机验收（dev 已在跑，renderer 走 HMR）：

- [ ] 筛选条只有 收藏 / Local Model / Pi，**单行**，高度恒定
- [ ] 切换时底色平移可见；打开面板的第一帧不滑
- [ ] 进 Pi 后列表出 `codex` / `cpa` / `touchapi` 组头，⌘1–9 跨组连续
- [ ] 系统开「减弱动态效果」后切换直接落位

## 回滚点

- 第 1 步（tuffex 指示器）与第 2 步（core-app 换组件）互不依赖：指示器出问题可只 revert 第 1 步，
  筛选条仍是 TxFilterChips，只是没有位移动效

## 提交前

- 工作区多会话共用：只 `git add` 本任务文件，提交后 `git grep MUTATION HEAD` 自查
- eslint 在包内跑，不要从仓库根跑
- **`apps/core-app/src/main/core/touch-app.ts` 里还留着上一轮的 `[WindowDiag]` 临时诊断
  （拖动隐藏问题未结），不要连它一起提交**
