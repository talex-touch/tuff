# Implement — Home 模型切换弹窗 v2

Parent: `.trellis/tasks/09-06-model-menu-redesign`
前置：`09-06-tuffex-anchor-max-height` 已合入（否则 AC8 无法验收）。

## Step 0 — 前置核查

- [ ] `python3 ./.trellis/scripts/task.py current` 指向本任务。
- [ ] `git log --oneline -3 -- packages/tuffex/packages/components/src/base-anchor` 能看到 max-height 修复。
- [ ] `git status --short` 记录其他会话在途文件（`HomePage.vue`、lang JSON 若已脏，按 multi-session guide 只暂存自己的行）。

## Step 1 — 数据层：默认值 + 纯函数

- [ ] `packages/utils/common/storage/entity/app-settings.ts`：新增顶层 `conversation` 区块（design §3）。
- [ ] `modules/conversation/model-display.ts`：`splitModelId / modelDisplayName / modelSubtitle / matchesModelQuery / sameModelRef`。
- [ ] `model-display.test.ts`：pi 前缀、无前缀、含 `:` 的 id、大小写不敏感搜索、providerName / source 命中。

验证：`pnpm -C apps/core-app exec vitest run src/renderer/src/modules/conversation/model-display.test.ts`

**Gate 1**：纯函数落地，AC3 的显示规则有测试。

## Step 2 — provider 图标共享模块

- [ ] `modules/intelligence/provider-icons.ts`：`providerIconFor(type)`，未知 type 回落 `custom` 图标。
- [ ] `IntelligenceProviderHeader.vue:59` 与 `IntelligenceItem.vue:122` 改为引用；行为不变。
- [ ] `provider-icons.test.ts`：六种 type 精确断言 + 未知 type 回落。

验证：`pnpm -C apps/core-app exec vitest run src/renderer/src/modules/intelligence/provider-icons.test.ts src/renderer/src/components/intelligence`

**Gate 2**：仓库只剩一份 provider 图标映射（`rg 'i-simple-icons-openai' apps/core-app/src/renderer` 只命中新模块）。

## Step 3 — composables

- [ ] `useModelOptions.ts`：`choices` 增补 `providerType / source / displayName`；`select()` 写
      `appSetting.conversation.model`；`resolvedChoice / routing / ensureLoaded()` 按 design §3.1。
      删除模块级 `selection` ref；保留 `isSelected`。
- [ ] `useModelFavorites.ts`：`favorites / isFavorite / toggle`，去重。
- [ ] 测试（mock `@talex-touch/utils/renderer` 的 `useIntelligenceSdk`，mock `~/modules/storage/app-storage`
      的 `appSetting` / `appSettingStore`，参考 `IntelligenceApiConfig.test.ts:15-27` 的 mock 形态）：
      - 持久化值能解析 → routing / pill 取它；解析不到 → Auto 且持久化值不变；未加载 → Auto。
      - `ensureLoaded` 等 hydration；重复调用只加载一次。
      - favorites toggle 去重、跨实例共享。
- [ ] `HomePage.vue`：`onMounted` 调 `ensureLoaded()`；routing getter 改读 `routing`。

验证：`pnpm -C apps/core-app exec vitest run src/renderer/src/modules/conversation`

**Gate 3**：AC5 / AC6 的状态规则有测试；HomePage 仍能发送（现有 `useHomeConversation.test.ts` 绿）。
回滚点：Step 1-3 可整体 revert，视图未动。

## Step 4 — TuffEx：TxDropdownMenu 最小改动

- [ ] `types.ts` + `TxDropdownMenu.vue`：`initialFocus` prop；`handleKeydown` 对可编辑目标放行 Home / End。
- [ ] `dropdown-menu.test.ts`：`initialFocus="none"` 不抢焦点；input 内 Home / End 不被 preventDefault，
      ArrowDown 仍进列表。
- [ ] 文档 zh / en（`apps/nexus/content/docs/dev/components/dropdown-menu.{zh,en}.mdc`）：props 表在
      `closeOnSelect` 后插入；交互契约 253-254 行改写；review notes 覆盖行。跑 blast-radius 三条命令
      （tuffex-docs-sync.md）确认包装组件文档无需改。
- [ ] `pnpm -C packages/tuffex build`（core-app 通过 dist 消费；见 memory：dist 与 src 分离）。

验证：`pnpm -C packages/tuffex exec vitest run packages/components/src/dropdown-menu`；
`pnpm -C apps/nexus run check:doc-parity`（若脚本存在）。

**Gate 4**：默认行为不变（现有 dropdown 测试全绿），docs 同步完成。

## Step 5 — 视图：HomeModelMenu 重写 + pill

- [ ] i18n 新键（en-US / zh-CN 同步，插在 `home.modelEmpty` 之后）：
      `modelSearch`、`modelFavorites`、`modelFavoritesEmpty`、`modelNoResults`、`modelFavorite`、
      `modelUnfavorite`、`modelProviders`。
- [ ] `HomeModelMenu.vue` 按 design §4 重写：tab 条、搜索、Auto 行、行（图标 / 名称 / 副标题 / TxKbd / 星标）、
      快捷键、空态、打开时聚焦搜索框、`min-height`。样式只用 `--shell-*` token。
- [ ] `HomePage.vue` / `HomeTopBar.vue`：pill 显示名 + 图标（`modelIcon` prop）。
- [ ] `HomeModelMenu.test.ts`（mock vue-i18n、sdk、app-storage；TxDropdownMenu 可用真实组件或 stub 出 panel）：
      tab 过滤、★ 过滤、搜索忽略 tab、⌘1 / Ctrl+1 选中并关闭、星标切换、三种空态、Auto 行常在。

验证：`pnpm -C apps/core-app exec vitest run src/renderer/src/views/base/home src/renderer/src/modules/conversation`；
`pnpm -C apps/core-app run typecheck:web`

**Gate 5**：AC1-AC7、AC9 的自动化部分全绿。

## Step 6 — 真机验收（pnpm core:dev）

- [ ] composer 与 top bar 两个入口各截图一张：tab 条 / 搜索 / 行副标题 / 徽标可见。
- [ ] 列表滚到底：面板不盖 pill、不超视口（AC8）。
- [ ] ⌘1 选中；星标；重启后收藏与选择保留（AC4 / AC5）。
- [ ] 把 `config/app-setting.json` 的 `conversation.model` 改成不存在的 id 再启动（AC6）。
- [ ] 证据写入 `evidence/`（截图 + 步骤）。

## Step 7 — 收尾

- [ ] `pnpm lint:changed`（勿从根目录直接对 core-app 跑 eslint）；`git diff --check`。
- [ ] 按 multi-session guide 检查每个待提交文件的 hunk 归属；lang JSON 只暂存自己的行。
- [ ] 更新 spec（若 TxDropdownMenu 契约变化写进 `anchor-overlay-chain.md` 或 component-guidelines 的相应段）。

## 风险文件

- `HomePage.vue`（2000+ 行，其他会话高频编辑）：只改 §5 三处，提交前 `git diff` 核对 hunk。
- `en-US.json` / `zh-CN.json`：行追加型共享文件，按 guide 用 `update-index --cacheinfo` 方式暂存。
- `app-settings.ts`（entity）：主进程也读它；只新增顶层键，不动既有键。
