# TxTransfer 面板内部滚动与双侧搜索

## Goal

让 CoreApp 智能设置里两个模型穿梭弹窗（「模型优先级」「管理模型」）的长列表在面板内部滚动、两侧都能搜索，并把这套行为收敛到 TuffEx `TxTransfer` 原语上，而不是在 CoreApp 各写一份。

## Background

- 「模型优先级」弹窗由 `apps/core-app/src/renderer/src/components/intelligence/capabilities/CapabilityModelTransfer.vue` 自己实现穿梭框：没有搜索框，面板没有高度上限。
- 「管理模型」弹窗用的是 `TxTransfer`（`apps/core-app/src/renderer/src/components/intelligence/config/IntelligenceModelConfig.vue:447`），已有 `filterable`，但 `.tx-transfer__panel` 只有 `min-height: 240px`、没有任何上限。
- 两处的根因相同：面板高度由内容决定，249 个模型把面板撑到几千像素，滚动因此发生在 FlipDialog 外层而不是列表内部；弹窗头部、搜索框、中间的移动按钮都会被滚出视野。

## Requirements

### R1 TxTransfer 支持列表内部滚动（根因修复）

- 列表区域有高度上限，超出后在 `.tx-transfer__list` 内部滚动，面板整体高度不再随条目数增长。
- 上限可由调用方配置，且有默认值，保证未配置的调用方也不会被撑破。
- 面板头部、筛选框、中间移动按钮在列表滚动时保持可见。

### R2 两侧搜索

- 「模型优先级」弹窗左右两个面板都显示搜索框（复用 `filterable`），占位文案本地化。
- 搜索只影响当前面板的可见条目，不改变 `modelValue`。

### R3 优先级排序不能丢

- 「模型优先级」的语义是排序：已绑定面板必须保留序号显示与上移/下移操作。
- 该能力作为 `TxTransfer` 的 `orderable` 选项提供，排序结果通过 `update:modelValue` / `change` 抛出。

### R4 两个弹窗行为一致

- 两个弹窗都使用 `TxTransfer`，具备相同的滚动、搜索、空态与无障碍表现。
- `CapabilityModelTransfer` 保留现有对外 props / emits（`modelValue`、`availableModels`、`scopeKey`、`disabled`），两个调用方与既有测试桩不受影响。
- 自定义模型输入（「模型优先级」）与新增模型输入（「管理模型」）都放在穿梭框下方，两个弹窗版式一致。

### R5 无障碍与本地化

- 纯图标按钮（移动、上移、下移）必须有显式 aria-label，且中英文都本地化。
- 左右面板可以配置不同的空态文案（可选模型为空 vs 已绑定为空的提示语不同）。

### R6 文档与测试同步

- `TxTransfer` 的 `.zh.mdc` 与 `.en.mdc` 在同一提交内更新：props 表、Slots 说明、审阅说明，并补一个可运行 demo。
- `packages/tuffex/packages/components/src/transfer/__tests__/transfer.test.ts` 覆盖新增行为。

## 追加需求（2026-09-08 现场反馈）

### R7 全选

- 每个面板头部提供全选框，作用范围是**当前可见（筛选后）且未禁用**的行。
- 部分选中报 `aria-checked="mixed"`；再次点击清空。

### R8 中间移动按钮要"看得见"

- 现场反馈「不明显」：纯图标 ghost 按钮夹在两个描边面板之间会被读成装饰，按了像没反应。
- 按钮自带边框/底色，有勾选时变主色并显示待移动数量。
- 同时提供双击整行直接移动的第二条路径（回补旧实现的 dblclick）。

### R9 「管理模型」底部一行重做

- 原状：裸 `<input>` + 两个被 CSS 强制刷成主色的按钮，三者平级、层级不清。
- 改为 `TxInput` + 主色「添加模型」（与输入框绑定）+ 分隔线 + 中性「获取模型」。
- 该弹窗的空态文案本地化（此前显示英文默认值 `No data`）。

## 现场核查记录：「点了没用」

用户报告勾选后点 `>` 无反应。核查结论：**写入是成功的**——`~/Library/Application Support/@talex-touch/core-app/tuff-dev/modules/config/aisdk-config`
在 08:26:53 已写入 `capabilities['audio.asr'].providers[0].models = ["qwen-audio-3.0-asr-flash"]`。
组件链有四个测试证明 `勾选 → > → update:modelValue → updateModels` 正确（含父组件重传新数组标识的场景）。
未复现的部分是弹窗右侧没有把新值读回来渲染，即 `props.bindings` → `focusedBinding` → `modelValue` 这条读回路径，
属于能力页/存储层，不在本任务改动范围内；R8 的双击与显眼按钮降低了这条路径的误判概率，但不构成修复。

## Constraints

- 不新增 CoreApp 私有穿梭框实现；新原语行为落在 TuffEx（`.trellis/spec/frontend/index.md` 硬规则）。
- 现有 `TxTransfer` 调用方（nexus demo、文档 gallery、权限编排 demo）必须保持可用，不得因默认值变化而破版。
- i18n 的 zh-CN / en-US 必须成对新增，通过 `translation-coverage` 校验。

## Accepted trade-offs

- 已绑定面板的**每行删除按钮**（当前 `CapabilityModelTransfer` 的垃圾桶图标）在改用 `TxTransfer` 后不再保留，移除路径统一为「勾选 → ←」。这是为了不把一次性业务按钮塞进通用原语；若后续确认高频，再以 `removable` 形式补进 TxTransfer。
- 已绑定面板的双击移动（dblclick）同样不迁移，统一为勾选 + 按钮。

## Acceptance Criteria

- [ ] 249 个模型时，「模型优先级」弹窗高度不超过 FlipDialog 上限，滚动条出现在左右面板列表内部；弹窗标题与移动按钮始终可见。
- [ ] 「管理模型」弹窗同上，左右面板都能看到，不再出现单侧空白/被撑出视口的版式。
- [ ] 「模型优先级」左右面板均有搜索框，输入后仅过滤当前面板；清空后恢复完整列表。
- [ ] 已绑定面板显示 1..n 序号，上移/下移可改变顺序并保存；首项禁用上移、末项禁用下移。
- [ ] 自定义模型 ID 添加后进入已绑定列表，并出现在可用池中（切换渠道后由 `scopeKey` 重置）。
- [ ] `canEditModels` 为 false 时整个穿梭框不可交互。
- [ ] `pnpm vitest run` 覆盖 transfer 的新增用例全部通过；CoreApp `npm run typecheck` 通过。
- [ ] `transfer.zh.mdc` / `transfer.en.mdc` 与源码一致，新增 demo 在 demo-registry 中注册且非孤儿。
