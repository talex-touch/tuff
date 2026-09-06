# Implement — 模型菜单渠道分层

Task: `.trellis/tasks/09-06-home-model-menu-channels`
顺序有依赖：1 → 2 → 3 → 4 → 5，每步跑完自己的验证再进下一步。

## 1. 渠道图标表 + safelist

- [x] 新建 `apps/core-app/src/renderer/src/modules/intelligence/model-source-icons.ts`
      （表、`sourceIconFor()` 认不出返回 `null`、`sourceInitialFor()`、`MODEL_SOURCE_ICON_CLASSES`），
      形态照 `model-family-icons.ts`：`Object.freeze`、正则无 `g`/`y`、相对导入
- [x] `uno.config.ts`：`configDeps` 加模块绝对路径，`safelist` 展开 `MODEL_SOURCE_ICON_CLASSES`
- [x] 新建 `model-source-icons.test.ts`：`codex → openai`、`DeepSeekOfficial → deepseek`、
      `kimi/moonshot`、`ollama`、大小写不敏感；**`router` / `mesh` / `cpa` / `touchapi` → `null`
      且首字母为 `R` / `M` / `C` / `T`**（不是 openrouter）；非 ASCII 渠道名首字母不被代理对切坏；
      `MODEL_SOURCE_ICON_CLASSES` 与表一致

验证：`cd apps/core-app && npx vitest run src/renderer/src/modules/intelligence/model-source-icons.test.ts`

**评审点**：表里每条模式都要能说出「它不会误伤哪个自命名端点」。

## 2. TxCardItem 的 hover / active token

- [x] `packages/tuffex/.../card-item/src/TxCardItem.vue`：`--tx-card-item-hover-bg`、
      `--tx-card-item-active-bg` 包住现有值，默认值逐字符不变
- [x] `card-item/__tests__` 加一条源码级断言（仓库既有先例：`collapse.test.ts`），
      钉住「默认值仍是原公式」，防止以后有人把 fallback 改掉

验证：`cd packages/tuffex && npx vitest run packages/components/src/card-item packages/components/src/dropdown-menu packages/components/src/select packages/components/src/cascader packages/components/src/tree-select packages/components/src/search-select packages/components/src/context-menu packages/components/src/agents`
（8 个使用方全过一遍）

## 3. 桶模型（tabs + 分组共用）

- [x] `HomeModelMenu.vue`：`bucketOf(choice)` / `ModelBucket`；`providerFilters` → `bucketFilters`
- [x] `activeFilter` 改为 `{ kind:'bucket', key }`；`defaultFilter()` 跟着改（钉住的模型 → 它所在的桶）
- [x] `visibleChoices` 的过滤条件从「同 providerId」改为「同 bucket key」
- [x] 筛选条渲染桶图标：有渠道 `sourceIconFor(source)`，无渠道 `providerIconFor(providerType)`
- [x] 筛选条 `max-height: 64px` + `overflow-y: auto`

验证：`cd apps/core-app && npx vitest run src/renderer/src/views/base/home/HomeModelMenu.test.ts`
（既有 27 条里受影响的按新语义**更新**，不删）

## 4. 分组渲染

- [x] `visibleGroups`（含 `startIndex`）+ `showGroupHeaders`（`length > 1`）
- [x] 模板改为两层 `v-for`；组头 `aria-hidden`，外层 `role="group" :aria-label`
- [x] 快捷键序号改 `group.startIndex + i`
- [x] i18n：组头相关文案 `zh-CN` / `en-US` 同步（若最终不需要新文案则显式记录「无新键」）

验证：同上，并新增用例——多渠道出组头 / 单渠道不出组头 / ⌘1–9 跨组连续 / 组头不进方向键遍历

## 5. 行换 TxCardItem

- [x] 行改 `TxCardItem`（`role` / `aria-checked` / `clickable` / `active`），
      avatar=图标、title=displayName、subtitle=副标题、right=快捷键+星标
- [x] 星标 `@click.stop`
- [x] 菜单侧写 `--tx-card-item-hover-bg: var(--shell-surface-2)`、
      `--tx-card-item-active-bg: var(--shell-primary-soft)` 及尺寸 token
- [x] 删掉被顶替的 `.HomeModelMenu-Item` / `-Row` 手搓样式（不要留死 CSS）

验证：同上全量 + `npm run typecheck:web`

## 6. Nexus 文档（规划时漏了，`trellis-before-dev` 拉规约时发现）

前端硬规则：`packages/tuffex/packages/components/src/` 下的改动必须同 commit 带上 Nexus 文档，
组件自己的 `.zh.mdc` **和** `.en.mdc`，外加每个 wrapper 的页面。本任务有两处落在这条规则下：

- [x] `card-item.{zh,en}.mdc`：新增 `--tx-card-item-hover-bg` / `--tx-card-item-active-bg` 的
      CSS 变量说明与「默认值不变、暗色面板要覆写」的最佳实践；zh/en 章节数与顺序保持一致
- [x] `base-anchor.{zh,en}.mdc`：滚动容器从 `.tx-base-anchor__card` 移到卡片 body 的交互契约，
      并在审阅说明里记下被否掉的做法（卡片自身滚动会把绝对定位的 surface 滚走）
- [x] wrapper 页面核查（结果）：`tx-card-item--clickable` / `tx-base-anchor__card` 在
      `dev/components/` 下只出现在这两个组件自己的页面里；下游面板文档只声称「面板超过 maxHeight 后
      滚动」（dropdown-menu、popover）或自带列表滚动容器（select、tree-select、search-select），
      没有一处指明**哪个元素**滚动或 hover 底色怎么算 —— 默认值未变，无需改动。

验证：`cd apps/nexus && node build/check-doc-translation-parity.mjs && node build/check-mdc-fences.mjs`

## 收尾验证（全部跑完）

```bash
cd apps/core-app && npm run typecheck:web
cd apps/core-app && npx vitest run src/renderer/src/views/base/home src/renderer/src/modules/intelligence
cd packages/tuffex && npx vitest run packages/components/src/card-item
cd apps/core-app && npx eslint src/renderer/src/views/base/home/HomeModelMenu.vue src/renderer/src/modules/intelligence/model-source-icons.ts uno.config.ts
```

真机验收（dev 已在跑，renderer 走 HMR，主进程不需要重启）：

- [ ] 暗色 + 亮色各看一次 hover / 选中
- [ ] 筛选条图标：codex=OpenAI、kimi=Kimi、mesh/router/cpa/touchapi=首字母 M/R/C/T，**没有空盒子**
- [ ] 多渠道有组头、单渠道无组头；⌘1–9 跨组连续

## 回滚点

- 第 2 步（tuffex token）与第 1 步（新模块 + safelist）互不依赖，可单独 revert
- 第 5 步若 `TxCardItem` 在菜单里出现语义问题，可只回滚行结构，保留 1–4 的渠道分层

## 提交前

- 工作区是多会话共用的：只 `git add` 本任务自己的文件，提交后 `git grep MUTATION HEAD` 自查
- eslint 必须在 `apps/core-app` / `packages/tuffex` 包内跑，不要从仓库根跑
