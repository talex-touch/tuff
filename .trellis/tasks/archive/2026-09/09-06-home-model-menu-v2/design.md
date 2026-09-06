# Design — Home 模型切换弹窗 v2

Parent: `.trellis/tasks/09-06-model-menu-redesign`

## 1. 问题与基本事实

问题一句话：用户要在十几个模型里快速、可记忆地选一个，而当前菜单只是一列平铺的 id。

基本事实：
- 数据源只有一个：`getProviderModelOptions`，每个 provider 一组 `models: string[]`，无图标、无显示名、无收藏。
- 两个入口共用一份选择状态（模块级），必须继续共用。
- 持久化只能走 `AppSetting`（renderer `appSetting` 代理，autoSave，顶层浅合并）。
- 面板锚定、外点关闭、Esc、↑↓ 由 `TxDropdownMenu` 提供；它假设面板内容全是菜单项。

## 2. 边界与文件归属

| 层 | 文件 | 职责 |
|---|---|---|
| 纯函数 | `modules/conversation/model-display.ts`（新） | `splitModelId`、`modelDisplayName`、`modelSubtitle`、`matchesModelQuery`、`sameModelRef` |
| 纯函数 | `modules/intelligence/provider-icons.ts`（新） | `providerIconFor(type: string): ITuffIcon`，从 `IntelligenceProviderHeader.vue:59` 上提；`IntelligenceItem.vue:122` 的 class 版改为引用 |
| composable | `modules/conversation/useModelOptions.ts`（改） | options 加载、`choices` 增补 `providerType / source / displayName`、持久化选择、解析规则、`ensureLoaded()` |
| composable | `modules/conversation/useModelFavorites.ts`（新） | 读写 `appSetting.conversation.favoriteModels`，`isFavorite / toggle / favorites` |
| 默认值 | `packages/utils/common/storage/entity/app-settings.ts`（改） | 新增顶层 `conversation` 区块 |
| 视图 | `views/base/home/HomeModelMenu.vue`（重写） | 面板布局、tab / 搜索 / 快捷键 / 空态 |
| 视图 | `HomePage.vue` / `HomeTopBar.vue`（小改） | pill 显示名 + 图标；挂载时 `ensureLoaded()` |
| 原语 | `packages/tuffex/.../dropdown-menu/src/TxDropdownMenu.vue`（小改） | `initialFocus` prop；可编辑目标内不劫持 Home / End |
| 文档 | `apps/nexus/content/docs/dev/components/dropdown-menu.{zh,en}.mdc` | props 表、交互契约、review notes |
| i18n | `modules/lang/{en-US,zh-CN}.json` | 新增 `home.model*` 键 |

不新增 TuffEx 组件（决策 D2）。

## 3. 数据契约

```ts
// AppSetting（appSettingOriginData 新增顶层区块；老配置浅合并后自动取此默认）
conversation: {
  model: null as null | { providerId: string; model: string },
  favoriteModels: [] as Array<{ providerId: string; model: string }>,
}

// useModelOptions
interface ModelChoice {
  providerId: string
  providerName: string
  providerType: string      // 供 providerIconFor
  model: string             // 原始 id，路由用
  source: string | null     // pi: `/` 前缀；其他 null
  displayName: string       // pi: `/` 后；其他 = model
}
```

- 收藏与选择都用对象 `{ providerId, model }`，不用 `providerId:model` 拼接：`qwen2.5:3b` 这类 id 含 `:`。
- 比较用 `sameModelRef(a, b)`（providerId 与 model 全等）。

### 3.1 选择的解析规则（R7）

```
persisted = appSetting.conversation.model
resolved  = loaded && persisted && choices.find(c => sameModelRef(c, persisted))   // ModelChoice | undefined
routing   = resolved ? { providerId, model } : {}     // HomePage 的 routing getter 读这个
pillLabel = resolved ? resolved.displayName : t('home.modelName')
```

- `select(choice | null)` 直接写 `appSetting.conversation.model`；不再维护独立的 `selection` ref。
- options 未加载完成、或持久化值解析不到 → 展示与路由都按 Auto，但不改写持久化值。
  这样 pi CLI 暂时不在时用户的选择不会丢；一旦 provider 回来，下次加载即恢复。
- `ensureLoaded()`：`await appSettingStore.whenHydrated()` 后再 `load()`；HomePage `onMounted` 调用一次；
  菜单打开时仍调用（幂等）。

### 3.2 收藏

- `favoriteModels` 去重（`sameModelRef`）；toggle 直接改数组（autoSave 落盘）。
- 收藏项不随 provider 消失而删除；★ tab 只显示当前 `choices` 里能解析到的收藏。

## 4. 面板结构与交互契约

```
.HomeModelMenu                         @keydown（⌘/Ctrl + 1-9）
├─ .HomeModelMenu-Filters  role="group" aria-label=t('home.modelProviders')
│   ├─ button.is-active aria-pressed  ★（t('home.modelFavorites')）
│   └─ button aria-pressed ×N        provider 图标，title/tooltip = providerName
├─ TxSearchInput  v-model=query  placeholder=t('home.modelSearch')
├─ button role="menuitemradio"       Auto（置顶，aria-checked = !resolved）
├─ .HomeModelMenu-Divider
└─ .HomeModelMenu-List  role="group"
    └─ .HomeModelMenu-Row ×N
        ├─ button role="menuitemradio" aria-checked
        │    ├─ TxIcon(providerIconFor)  ├─ 名称 + 副标题  └─ TxKbd（前 9 行：⌘1…⌘9 / Ctrl+1…）
        └─ button.HomeModelMenu-Star aria-pressed aria-label=t('home.modelFavorite'|'modelUnfavorite')
```

- **不用 `role="tablist"`**：面板根是 TxDropdownMenu 的 `role="menu"`，tablist 嵌在 menu 里语义冲突。
  tab 条按「过滤开关」建模：`button[aria-pressed]`，一次只有一个为 true。
- 行内星标不能嵌在选择按钮里（button 内不允许交互元素），所以一行是两个并列 button；
  TxDropdownMenu 的 ↑↓ 只在 `menuitemradio` 间移动，星标靠 Tab 到达。
- 可见列表（`visibleChoices`）：
  `query` 非空 → `choices.filter(matchesModelQuery)`；
  否则 `activeTab === 'favorites'` → 收藏中能解析到的；否则 → 该 provider 的 choices。
- 快捷键在 `.HomeModelMenu` 的 `keydown` 处理：`(metaKey || ctrlKey) && /^[1-9]$/.test(key)` →
  `preventDefault`，`choose(visibleChoices[n-1])`。焦点在面板内时事件才到达，所以面板关闭时天然无副作用。
  修饰键按平台：`navigator.platform` 含 `Mac` 用 ⌘，否则 Ctrl；徽标文案同源。
- 打开：`initial-focus="none"`，HomeModelMenu 在 `open` 变 true 后 `nextTick` 聚焦搜索框；
  `activeTab` 每次打开重算（§R1 规则），`query` 清空。
- 关闭回焦 pill 的逻辑（`restoreFocusOnClose`）沿用现有实现。
- 尺寸：`min-width 300`、`max-height 380`，面板内 `.HomeModelMenu-List` 由 TxBaseAnchor 的 card 滚动；
  `.HomeModelMenu` 设 `min-height`（≈ 4 行）避免 loading → loaded 跳动。
- 空态：loading → `modelLoading`；无 provider → `modelEmpty`（现有）；★ 为空 → `modelFavoritesEmpty`；
  搜索无结果 → `modelNoResults`。不做 skeleton：行数由数据决定，属于 component-guidelines「layout depends on
  the data」的例外，用固定 min-height + 文案。

## 5. pill

- HomePage：`modelLabel` 拆为 `modelPill = computed(() => ({ label, icon }))`；composer pill 与 `HomeTopBar`
  的 `modelName` prop 同源，新增 `modelIcon?: ITuffIcon` prop。Auto 时 `icon` 为 undefined，外观不变。
- pill 文案：`resolved.displayName`（不是原始 id）。

## 6. TuffEx 原语改动（最小）

- `TxDropdownMenu` 新 prop `initialFocus?: 'first-item' | 'none'`（默认 `'first-item'`，行为不变）。
- `handleKeydown`：目标是 `input / textarea / [contenteditable]` 时不拦截 `Home / End`（光标移动）；
  `ArrowUp / ArrowDown` 仍接管（从搜索框进入列表）。
- 测试：`dropdown-menu.test.ts` 增 2 条；文档 zh / en：props 表（放在 `closeOnSelect` 之后）、
  交互契约第 253-254 行改写、review notes 覆盖行。包装组件检查：
  `rg -l "\.\./\.\./dropdown-menu'" packages/tuffex/packages/components/src --glob '*.vue'`，命中者的文档若描述了
  「打开即聚焦首项」需同步。

## 7. 取舍与否决

| 方案 | 结论 |
|---|---|
| 沉淀为 TuffEx 通用面板 | 否决（D2）：文档 / demo 负担翻倍，API 一发布即承诺 |
| pi 按 source 拆 tab | 否决（D3）：无 source 图标资源，tab 数不可控 |
| `role="tablist"` | 否决：与 `role="menu"` 冲突，改 `aria-pressed` 过滤按钮 |
| 持久化键 `providerId:model` 字符串 | 否决：model id 含 `:`（`qwen2.5:3b`） |
| 解析不到就清空持久化值 | 否决：provider 暂不可用会误删用户选择；改为读取时解析 |
| skeleton 加载态 | 否决：行数未知，按 spec 例外用固定 min-height + 文案 |
| 全局 keydown 监听 ⌘数字 | 否决：面板内 keydown 已足够，且天然只在打开时生效 |

## 8. 兼容与回滚

- `AppSetting.conversation` 为新增顶层区块：老配置浅合并后取默认；老版本代码读到多余键无影响。无迁移。
- TxDropdownMenu 默认行为不变；`initialFocus` 默认 `'first-item'`。
- 回滚粒度：按 implement.md 的 Step 切；Step 1-3（数据层）与 Step 5（视图）可独立回退，
  持久化键留存无害。
