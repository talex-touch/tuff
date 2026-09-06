# Design — 模型菜单渠道分层

Task: `.trellis/tasks/09-06-home-model-menu-channels`

## 1. 一个维度，两处消费

渠道（`ModelChoice.source`）和 provider 不是两套东西：**筛选条的 tab 身份、列表的分组键，是同一个函数
的输出**。分两处各写一遍必然漂移（tab 显示 `codex` 而分组头写 `Pi (local CLI)` 之类）。

```ts
/** 一个 tab / 一个分组的身份。有渠道按渠道，无渠道退回 provider。 */
type ModelBucketKey = string // `${providerId}\u0000${source ?? ''}`

interface ModelBucket {
  key: ModelBucketKey
  providerId: string
  /** null = 该 provider 的模型 id 没有 `/` 前缀，桶就是 provider 本身 */
  source: string | null
  label: string        // source ?? providerName
  /** null = 认不出的自命名渠道，改画 `initial` */
  icon: ITuffIcon | null   // source ? modelSourceIconFor(source) : providerIconFor(providerType)
  initial: string          // icon 为 null 时画的首字母
}
```

`bucketOf(choice)` 是唯一的真值来源，`providerFilters`（改名 `bucketFilters`）与分组渲染都读它。

分隔符用 `\u0000` 而不是 `/` 或 `:`：provider id 和 source 都可能含它们，`a/b` + `c` 与 `a` + `b/c`
必须是两个桶。

## 2. 渠道图标：正则表，不是查找表

本机真实渠道是 `anthropic / DeepSeekOfficial / touchapi / mesh / codex / kimi / cpa / router`。
`DeepSeekOfficial` 说明**渠道名是用户起的**，精确查表会漏；`model-family-icons.ts` 已经为同一类问题
选了「按顺序试正则」，新表照抄那套形态（冻结、无 `g`/`y` 标志、导出 class 列表）。

新模块 `apps/core-app/src/renderer/src/modules/intelligence/model-source-icons.ts`：

```ts
export const MODEL_SOURCES: readonly ModelSource[] = Object.freeze([
  { id: 'openai',     test: /openai|codex/,        icon: 'i-simple-icons-openai' },
  { id: 'anthropic',  test: /anthropic|claude/,    icon: 'i-simple-icons-anthropic' },
  { id: 'deepseek',   test: /deepseek/,            icon: 'i-simple-icons-deepseek' },
  { id: 'kimi',       test: /kimi|moonshot/,       icon: 'i-simple-icons-kimi' },
  { id: 'ollama',     test: /ollama/,              icon: 'i-simple-icons-ollama' },
  { id: 'openrouter', test: /openrouter/,          icon: 'i-simple-icons-openrouter' },
  { id: 'gemini',     test: /gemini|googleai/,     icon: 'i-simple-icons-googlegemini' },
  { id: 'qwen',       test: /qwen|dashscope/,      icon: 'i-simple-icons-qwen' },
  { id: 'mistral',    test: /mistral/,             icon: 'i-simple-icons-mistralai' },
  { id: 'huggingface',test: /huggingface/,         icon: 'i-simple-icons-huggingface' },
  { id: 'github',     test: /githubcopilot|copilot/, icon: 'i-simple-icons-githubcopilot' },
])

/** 认不出就不画图标 —— 由调用方画首字母。 */
export function modelSourceIconFor(source: string): ITuffIcon | null
export function modelSourceInitialFor(source: string): string
```

决定与理由：

- **`codex` 归到 OpenAI**：`@iconify-json/simple-icons@1.2.90` 里没有 `codex`（已实测），
  而 codex 就是 OpenAI 的 CLI。
- **模式必须能被包含匹配**，所以 `/deepseek/` 而不是 `/^deepseek$/`——`DeepSeekOfficial` 要命中。
- **不得写 `/router/`**：会把用户的 `router` 端点错标成 OpenRouter。只写 `/openrouter/`，
  它不匹配 `router`（子串方向相反）。同理不写 `/api/`、`/mesh/`、`/ai/` 这类过宽的模式。
- **兜底不是图标，是首字母徽标**（`touchapi` → `T`、`mesh` → `M`、`cpa` → `C`、`router` → `R`）。
  本机四个自命名端点若共用一个通用图标就成了四个一模一样的 tab；首字母让它们互相可辨，
  也不会假装认识某个牌子。取 `Array.from(source)[0]` 而非 `source[0]`：非 ASCII 渠道名
  （用户可以起中文名）不能被 UTF-16 代理对切坏。大写用 `toLocaleUpperCase()`。
- 匹配前 `source.toLowerCase()`；表本身全小写。

`MODEL_SOURCE_ICON_CLASSES`（表里的全部 class）接进 `uno.config.ts` 的 `safelist`，模块绝对
路径进 `configDeps`——两处都改，漏一处就是空盒子。导入用相对路径（`../conversation/model-display`
的先例）：uno.config.ts 由 jiti 加载，不认 `~/` 别名。首字母兜底不产生 class，不需要 safelist。

## 3. hover：必须往 tuffex 加一个 token（关键发现）

单纯把行换成 `TxCardItem` **修不好暗色下的 hover**。实测它的 hover 是：

```scss
.tx-card-item--clickable:hover {
  border-color: color-mix(in srgb, var(--tx-border-color-light) 70%, transparent);
  background:   color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 18%, transparent);
}
```

暗色下 `--tx-bg-color-overlay: #1d1e1f`（`variables.scss:376`，作用域 `[data-theme='dark'], .dark`），
18% 的深色叠在同样深色的面板上 ≈ 看不见——和现在手搓的 `--shell-surface` 是同一个病。

所以 `TxCardItem` 增加两个 token，**默认值与今天完全一致**（对现有 8 个使用方零影响）：

```scss
.tx-card-item--clickable:hover {
  background: var(--tx-card-item-hover-bg, color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 18%, transparent));
}
.tx-card-item--active {
  background: var(--tx-card-item-active-bg, color-mix(in srgb, var(--tx-color-primary, #409eff) 8%, transparent));
}
```

菜单侧把它们指到 shell 语义色：hover → `--shell-surface-2`，active → `--shell-primary-soft`。
面板 teleport 到 body 拿不到 `.HomePage` 的 `--tx-*` 桥接，但 `--shell-*` 定义在 `:root` / `.dark`
（`shell-tokens.scss`），teleport 后仍然继承得到——这正是现在的行能用 `--shell-surface` 的原因。

暗色对比：面板底 `#1c1c1e` vs `--shell-surface-2: #2c2c2e`，亮色 `#f7f7f8` vs `#efeff1`。

## 4. 行的结构改写

```
<TxCardItem role="menuitemradio" :aria-checked :clickable :active @click>
  <template #avatar>  <TxIcon :icon="rowIcon(choice)" :size="15" />
  <template #title>   displayName
  <template #subtitle>modelSubtitle(providerName, source)
  <template #right>   <TxKbd v-if=…>  +  星标按钮（@click.stop）
```

要守住的语义（现有 27 条用例覆盖的）：

- `role="menuitemradio"` + `aria-checked` 走 attrs 落到 `TxCardItem` 的单根 div —— primitive 的
  `getEnabledItems()` 用 `[role="menuitemradio"]` 且要求 `closest('[role="menu"]') === panelRef`；
  新增的分组 `role="group"` 不是 `menu`，`closest` 会越过它，方向键遍历不受影响（已核对选择器）。
- **星标从「行的兄弟」变成「行内 right 插槽」**：`TxCardItem` 根是 `div` 不是 `button`，控件嵌套合法
  （这也是它 `onActivateKey` 显式忽略 right 插槽冒泡的原因）。但 click 会冒泡到行的 `@click`，
  星标必须 `@click.stop`，否则点星变成选模型。
- 尺寸靠 token 压：`--tx-card-item-padding / -radius / -gap / -avatar-size`，照 `TxDropdownItem` 的写法。

## 5. 分组渲染与快捷键

`visibleChoices`（扁平、已排序）保持为顺序真值，分组是它的视图：

```ts
const visibleGroups = computed(() => {
  // 按 bucketOf 分组，保留 visibleChoices 的首次出现顺序；
  // startIndex = 该组第一行在 visibleChoices 中的下标
})
const showGroupHeaders = computed(() => visibleGroups.value.length > 1)
```

- 快捷键序号 = `group.startIndex + i`，天然跨组连续，分组头不占号（它不是行）。
- 单组时不渲染组头（PRD 3）。搜索态同样按此规则——搜索跨全部来源，通常就是多组。
- 组头 `aria-hidden="true"`，外层 `role="group" :aria-label="group.label"`：组名由 group 的 label 播报，
  组头本身不可聚焦、不进 Tab 序。
- 组头带渠道图标（认不出则首字母）+ label，与 tab 同一套解析，两处指同一个东西。

## 6. 筛选条

顺序：星标 → 渠道 tab（按 `visibleChoices` 里首次出现的顺序）→ 无渠道的 provider tab。
桶即 tab，`activeFilter` 从 `{kind:'provider', providerId}` 改为 `{kind:'bucket', key: ModelBucketKey}`
（星标那支不变）。

高度：保留 `flex-wrap: wrap`，加 `max-height: 64px`（两行）+ `overflow-y: auto`。
本机 8 渠道 + 星标在 300px 宽面板上正好一行（30px 槽 + 2px gap ≈ 9 个/行），两行的上限给到 18 个 tab，
够用且不会把列表挤没。

## 7. 不做

- 不动 `useModelOptions` / `ModelChoice` / pi 目录读取：`source` 已经在数据里。
- 不做渠道的显示名美化（`DeepSeekOfficial` 就照原样显示）：那是 pi 配置里用户自己起的名字，
  改写它会让用户对不上自己的配置。
- 不给 `TxCardItem` 加 `selected` 语义或 ARIA：`aria-checked` 由调用方给。

## 8. 风险

| 风险 | 处置 |
|---|---|
| 新图标类漏进 safelist → 空盒子 | class 列表从表派生（不手抄），并加断言测试；`configDeps` 同步 |
| 正则过宽把自命名端点错标品牌 | 表里禁止宽模式，`router`/`mesh`/`cpa`/`touchapi` 作为回归用例钉住首字母兜底 |
| 星标点击冒泡成选中 | `@click.stop` + 保留既有「星标不选中不关闭」用例 |
| `TxCardItem` 加 token 影响其它 8 个使用方 | 默认值与现值逐字符相同，只是包一层 `var()` |
| 组头进入方向键遍历 | 组头非 `menuitem*` 角色；`getEnabledItems` 选择器已核对 |
