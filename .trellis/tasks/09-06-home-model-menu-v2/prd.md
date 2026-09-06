# Home 模型切换弹窗 v2：provider 分栏、搜索、收藏、快捷键

Parent: `.trellis/tasks/09-06-model-menu-redesign`
前置：`09-06-tuffex-anchor-max-height` 先合入。新面板的高度与定位依赖 `maxHeight` 真正生效，
否则重做后的面板同样会盖住 composer。

## Goal

把 `views/base/home/HomeModelMenu.vue` 从「Auto + 按 provider 分组的平铺列表」重做为参考图的选择器：
provider 分栏过滤、搜索、星标收藏、⌘数字快捷选择；行内展示模型显示名与 provider / source 副标题；
收藏与当前选择跨重启保存。

## Background（仓库已确认事实）

- 入口：`HomeModelMenu.vue` 是 TxDropdownMenu 的包装（`min-width 240 / max-height 320 / panel pure`），
  被 `HomePage.vue:1254`（composer，`top-end`）与 `HomeTopBar.vue:42`（`bottom-start`）复用；
  同一时刻只能开一个（模块级 `closeActiveModelMenu`）。
- 数据：`modules/conversation/useModelOptions.ts` → `sdk.getProviderModelOptions({ capabilityId: 'text.chat' })`，
  返回 `IntelligenceProviderModelOption`（`packages/utils/transport/sdk/domains/intelligence.ts:209`）：
  `providerId / providerName / providerType / models: string[] / defaultModel / capabilities / available`。
  现 hook 只读 4 个字段；`providerType` 未用。选择状态是模块级、会话级，不持久化。
- pi provider：`intelligence-config.ts:77` 名为 `Pi (local CLI)`；模型 id 形如 `codex/gpt-6-astra`、
  `DeepSeekOfficial/deepseek-v4…`（`pi-model-catalog.ts:123` 拼 `${providerName}/${id}`），`/` 前是 pi 侧 source。
  本地模型（type `local`）形如 `qwen2.5:3b`（含 `:`，所以持久化键不能用 `providerId:model` 字符串拼接）。
- provider 图标：`components/intelligence/layout/IntelligenceProviderHeader.vue:59` 的
  `providerIconMap: Record<IntelligenceProviderType, ITuffIcon>`；`IntelligenceItem.vue:122` 还有一份 class 字符串版。
  两份都是组件私有，需上提为共享模块后复用（code-reuse guide）。
- 持久化：renderer 通过 `~/modules/storage/app-storage` 的 `appSetting`（= `appSettingsData`）读写
  `AppSetting`，autoSave；hydration 是顶层浅合并（`Object.assign`，`base-storage.ts:838`），
  新增顶层区块对老配置自动取默认值。`main.ts:227` 启动时等待 hydration（软超时）。
- i18n：`modules/lang/{en-US,zh-CN}.json` 已有 `home.model / modelAuto / modelLoading / modelEmpty /
  modelName("Tuff Auto") / effortHigh`。
- TuffEx 可用原语：`TxDropdownMenu`（锚定 / 外点 / Esc / ↑↓ / Home / End）、`TxSearchInput`、`TxKbd`、`TxIcon`、`TxTooltip`。
  没有现成 model picker（tuffex / intelligence-uikit 均无）；TxCommandPalette 是全屏 dialog，不适用。
  `TxDropdownMenu` 打开时无条件聚焦首个菜单项，且对面板内任何目标（含 input）劫持 `Home / End`
  （`TxDropdownMenu.vue:70-105`）。
- renderer 内没有 ⌘数字 的既有模式；没有测试覆盖 HomeModelMenu / useModelOptions。

## Decisions（已与用户确认）

- D1 收藏与当前选择都持久化到 `AppSetting` 新区块 `conversation`。
- D2 留在 CoreApp 作为组合层，不新增 TuffEx 组件；TuffEx 只改必要的原语行为并同步文档。
- D3 tab 按 provider 分（Local / Pi / OpenAI…），pi 的 source 进入行副标题，不拆 tab。

## Requirements

- R1 tab 条：「★ 收藏」+ 每个可用 provider 一个（provider 图标 + tooltip 显示 providerName）。
  常显，即使只有一个 provider。默认激活 tab：当前选择所属 provider → 否则有收藏取 ★ → 否则第一个 provider。
- R2 搜索：大小写不敏感，匹配模型 id、显示名、providerName、source；有搜索词时跨所有 provider 搜索，忽略 tab。
- R3 行：provider 图标 + 显示名（pi 模型去掉 `source/` 前缀）+ 副标题「providerName · source」（无 source 时只有
  providerName）；选中行以背景高亮 + `aria-checked`；行尾星标按钮切换收藏（`aria-pressed`）。
- R4 快捷键：面板打开时 ⌘1…⌘9（Windows / Linux 为 Ctrl）选中当前可见列表的前 9 行；这 9 行行尾显示 TxKbd 徽标。
- R5 Auto（Tuff 自动路由）保持为置顶行，不受 tab / 搜索过滤影响，无快捷键。
- R6 pill（composer 与 top bar）：显示名 + provider 图标；Auto 时保持现有 `home.modelName` 文案与外观。
- R7 持久化：`AppSetting.conversation = { model: { providerId, model } | null, favoriteModels: { providerId, model }[] }`。
  重启后恢复；持久化值只在 options 加载完成且能解析到现有选项时才参与路由与 pill 展示，解析不到时展示 Auto、
  路由走 Auto，但**不删除**持久化值（provider 暂不可用时保留用户选择）。
- R8 键盘：tab 条与搜索框在 Tab 序内；↑↓ / Home / End / Enter / Esc 沿用 TxDropdownMenu；打开时焦点落在搜索框。
  搜索框内 Home / End 移动光标，不跳菜单项（需 TuffEx 原语修正）。
- R9 加载 / 空态：沿用 `modelLoading / modelEmpty`；新增收藏为空、搜索无结果两种空态；面板设最小高度，加载前后不跳动。
- R10 启动时（HomePage 挂载）即加载 options，保证 R7 的解析尽早完成；失败时与现状一致，静默回落 Auto。

## Acceptance Criteria

- [ ] AC1 打开面板：tab 条 + 搜索框 + Auto 行 + 当前 tab 的模型行；两个入口（composer / top bar）行为一致。
- [ ] AC2 切换 tab 只显示该 provider 的模型；★ tab 只显示收藏；输入搜索词后跨 provider 过滤且忽略 tab。
- [ ] AC3 pi 模型 `codex/gpt-6-astra` 显示为「gpt-6-astra」+ 副标题「Pi (local CLI) · codex」；`qwen2.5:3b` 显示原名 +「Local Model」。
- [ ] AC4 ⌘1（Ctrl+1）选中可见列表第 1 行并关闭面板；pill 立即更新；⌘键在面板关闭时无副作用。
- [ ] AC5 星标切换后 ★ tab 立即反映；重启 app 后收藏与上次选择均保留。
- [ ] AC6 把持久化的模型改成不存在的 id 再启动：pill 显示 Auto，发送走 Auto，配置文件里的值不被清除。
- [ ] AC7 键盘：Tab 可到达 tab 条 / 搜索框 / 星标；搜索框内 Home / End 移动光标；↓ 从搜索框进入列表；Esc 关闭并回焦 pill。
- [ ] AC8 面板任何滚动位置不与 pill 重叠、不超出视口（依赖前置子任务）。
- [ ] AC9 测试：`model-display` 纯函数、`useModelFavorites`、`useModelOptions`（持久化 / 解析规则）、
      `HomeModelMenu`（过滤 / 快捷键 / 空态）、TxDropdownMenu（`initialFocus` / 可编辑目标 Home / End）全绿；
      `pnpm -C apps/core-app run typecheck:web`、`git diff --check` 通过。
- [ ] AC10 TuffEx 改动的 Nexus 文档（dropdown-menu zh / en）同步：props 表 + 交互契约 + review notes 覆盖行。

## Out of scope

- effort（推理强度）选择；provider 配置；CoreBox 内的模型选择（见父任务）。
- 收藏在设置页的管理入口：收藏只在本弹窗内增删。
- 虚拟列表：模型数量在百级以内，不做。
