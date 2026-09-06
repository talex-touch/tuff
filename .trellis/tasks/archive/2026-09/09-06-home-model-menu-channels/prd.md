# 模型菜单渠道分层：混排 tabs、分组头与行的 item 机制统一

Parent: `.trellis/tasks/09-06-model-menu-redesign`
前置：`09-06-home-model-menu-v2`（模型选择器 v2：筛选条、搜索、收藏、快捷键已落地）。

## Goal

Home 模型选择器把「渠道」（pi 模型 id 的 `source` 前缀）提升为一等维度：顶部筛选条能按渠道筛，
渠道带品牌图标；列表在分组头下按渠道归类；行的 hover / 选中态改由 tuffex 既有的 item 机制承担，
不再手搓。

## 需求来源

用户在真机使用 v2 菜单后逐条提出（2026-09-06，截图批注）：

1. 「item hover 背景不明显 我记得有一套item的机制啊」
2. 「最顶部tabs没有用比如codex 的icon ollama的icon」
3. 「列表还是简单分个类吧 比如打开的pi 有不同的渠道 就是 codex - xxx - xxx / cpa - xxx」

澄清后确认的三项决定：

- tabs 采用**混排**：有渠道的 provider 展开成多个渠道 tab，没有渠道的 provider 保留 provider tab；
  **且列表内仍保留分组头**。
- 行**换成 `TxCardItem`**（tuffex 的 item 机制），不是只调配色。
- 走 Trellis 子任务，先规划。

## Background

### 现状（实测 / 读码）

- 行是手搓的 `.HomeModelMenu-Item` 按钮，hover 用 `background: var(--shell-surface)`；暗色下
  `--shell-surface: #1c1c1e`（`shell-tokens.scss:135`）与面板底色几乎同色 → hover 不可见。
  tuffex 的 `TxCardItem` 才是这套 item 机制：`.tx-card-item--clickable:hover` 用
  `color-mix(in srgb, var(--tx-bg-color-overlay) 18%, transparent)`，选中态 primary 8%，
  另有 disabled / danger；`TxDropdownItem` 就是它的薄封装。
- 筛选条一个 provider 一个按钮，图标走 `providerIconFor(choice.providerType)`；
  provider 类型只有 `openai / anthropic / deepseek / siliconflow / local / custom` 六种
  （`provider-icons.ts`），pi 是 `local` → `i-carbon-bare-metal-server`，所以多个本地 CLI provider
  的 tab 长得完全一样。
- 渠道数据**已经有了**：`ModelChoice.source` 是 pi id 的 `/` 前缀（`model-display.ts:splitModelId`，
  `codex/gpt-6-astra` → `codex`），副标题 `modelSubtitle` 已在用它。列表本身没有任何分组。

### 本机真实渠道（读 `~/.pi/agent/models.json` 的 `providers` 键，未读取任何凭据字段）

`anthropic`、`DeepSeekOfficial`、`touchapi`、`mesh`、`codex`、`kimi`、`cpa`、`router` —— 共 8 个。

**关键结论：渠道名大半是用户自命名的端点，不是品牌。** 图标表只能覆盖认得出的那部分，其余必须有兜底，
否则会把 `mesh` / `router` / `cpa` 画成随便一个牌子。

### 图标可用性（对 `@iconify-json/simple-icons@1.2.90` 实际验证）

- 有：`ollama`、`openai`、`anthropic`、`claude`、`deepseek`、`kimi`、`googlegemini`、`openrouter`、
  `mistralai`、`qwen`、`meta`、`perplexity`、`huggingface`、`github`、`githubcopilot`
- 没有：`codex`、`xai`、`moonshot`、`zhipu`、`groq`、`together`，以及全部自命名渠道

所以 `codex` 必须别名到 `i-simple-icons-openai`；`kimi` 有自己的图标。

### 硬性约束：UnoCSS safelist

UnoCSS 只扫模板，不扫 `.ts`。新图标表必须导出 class 列表并接进 `uno.config.ts` 的 `safelist`，
同时把模块绝对路径加进 `configDeps`——否则图标渲染成空盒子（Pi 那个 tab 就这么消失过，
`provider-icons.ts` 与 `model-family-icons.ts` 的注释都记了这件事）。

## Requirements

1. **渠道图标表**：新增按渠道名解析图标的表，形态对齐 `model-family-icons.ts`（冻结表、导出
   `*_ICON_CLASSES`、相对导入以便 uno.config.ts 的 jiti 能求值）。大小写不敏感；`codex` 别名到
   OpenAI；**认不出的渠道不画图标，画渠道名首字母徽标**（`touchapi` → `T`、`mesh` → `M`），
   四个自命名端点因此互相可辨，且不得错配品牌。
2. **混排筛选条**：顺序为 星标 → 各渠道 tab → 无渠道的 provider tab。
   - 有渠道的 provider：为它出现过的每个渠道各出一个 tab，不再出该 provider 自己的 tab。
   - 无渠道的 provider：保留原来的 provider tab 与 provider 图标。
   - 一个渠道只属于一个 provider（tab 身份是 `providerId + source`），不同 provider 的同名渠道不合并。
3. **列表分组头**：当前筛选下若可见项跨越多个渠道，按渠道加分组头；单渠道时不加（一个组头等于噪音）。
   搜索态跨全部来源，仍按渠道分组。分组头不可聚焦、不参与方向键遍历。
4. **行换 `TxCardItem`**：hover / 选中态由它承担；星标与快捷键徽标进 `right` 插槽。
   现有语义必须保住：`role="menuitemradio"` + `aria-checked`、星标既不选中也不关闭菜单、
   方向键只走 radio 行。
5. **快捷键**：⌘1–9 仍按**可见顺序**（跨分组连续编号），分组头不占号。
6. **i18n**：新增文案两套语言齐全（`zh-CN` / `en-US`），键名沿用 `home.model*` 前缀。

## Constraints

- 不改数据层：`useModelOptions` / `ModelChoice` / pi 目录读取一律不动，`source` 已够用。
- 不读、不打印任何凭据字段（`models.json` 含明文 apiKey；本任务只用 `source` 字符串）。
- 筛选条是 `flex-wrap: wrap`：8 渠道 + N provider 会把条子撑高。本任务需给出高度上限的处理，
  不能让筛选条把列表挤没。
- `TxCardItem` 的 hover 用 `--tx-bg-color-overlay`；面板 teleport 到 body，拿不到 `.HomePage` 的
  `--tx-*` 桥接（`HomePage.vue:1392-1407`），必须验证暗色下 hover 真的可见，而不是又一次同色。

## Acceptance Criteria

- [ ] 暗色与亮色下，行 hover 与选中态都肉眼可辨；行的结构由 `TxCardItem` 承担
- [ ] 筛选条：`codex` 显示 OpenAI 图标，`ollama` 显示 Ollama 图标，`kimi` 显示 Kimi 图标；
      `mesh` / `router` / `cpa` / `touchapi` 各显示自己名字的首字母（`M` / `R` / `C` / `T`），
      彼此可辨且不错配品牌
- [ ] 新图标类全部进 `uno.config.ts` safelist，且模块路径进 `configDeps`；真机上无空盒子
- [ ] 列表在多渠道时出现分组头（`codex` / `cpa` …），单渠道时无组头
- [ ] ⌘1–9 仍选中「可见顺序」的第 1–9 行，分组头不占号，跨组连续
- [ ] 键盘：Tab 到筛选条/搜索，方向键只在 radio 行间走，分组头不获得焦点
- [ ] `HomeModelMenu.test.ts` 覆盖：混排 tab 组成、渠道图标解析（含别名与兜底）、分组头出现/不出现的
      两个条件、快捷键跨组连续；既有 27 条用例中受影响的（如「keeps the provider icon on the filter
      strip」）随语义更新而不是删除
- [ ] `npm run typecheck:web`、core-app 内 eslint、相关 vitest 全绿
