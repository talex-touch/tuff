# CoreBox 交互与动效打磨

## Goal

把 CoreBox 的"搜索中"状态、键盘选择和结果列表动效一起打磨到位：搜索中用高级的整条 bar 光效，键盘上下选择不再乱跳，不同类型 item 的加载 / 出现过渡顺滑一致。其中光效沉淀为 tuffex 的通用组件。

## Source requirements（老板原话，2026-09-25）

1. 「这个正在搜索改成整个bar 背景的那种脉冲 从左往右的渐变 高级一点 加上beam morph啥的」（附 CoreBox 截图，红框标出右侧「正在搜索…」）
2. 「https://x.com/soulegit/status/2102733297977614562 可以参考这种效果 融入我们的tuffex组件库」
3. 同事 @程耀宇（Crosery）反馈：「我输入了对应文件扩展名，下键 / 默认调到最后的一个文件 / 跳」
4. 「你顺便分析下corebox交互 和 列表动画 不同item 加载过渡动画 都优化下」
5. 「这个怪怪的 老是刷新」（附截图：CoreBox 查询 `wx`，结果全是 `apps/core-app/out/renderer/assets/` 构建产物；日志里 file-provider `FILE_INDEX_WORKER_BATCH_FAILED:26/30`、`IndexingDiagnostics.source` 阻塞 293–340ms）（2026-09-26）
6. 「脉冲动画再优化下 只要高度变高 不局限于corebox 要立即收起 不然观感很差」（2026-09-26）
7. ⌘K 操作面板截图标注：「1. meta 没有居中 2. 背景的那个模糊也有问题 3. meta这个展示形式也需要重构」（2026-09-26）

## Task map

| 子任务 | 交付 | 依赖 |
| --- | --- | --- |
| `09-25-tuffex-prism-glow` | tuffex `TxPrismGlow` 组件，包括注册链、文档、demo、单测 | — |
| `09-25-corebox-search-pulse-beam` | CoreBox 搜索中状态接入 `TxPrismGlow`（门控已完成） | 需要 prism-glow 的组件源码 |
| `09-25-corebox-keyboard-jump` | 修复"输入扩展名后按下键跳到最后一个文件" | —（调研中） |
| `09-26-corebox-refresh-churn` | 查清并修复 CoreBox 对同一查询反复刷新（索引提交风暴 / worker 批次失败重试） | —（调研中）；渲染层的删插抖动由 list-motion 方案 B 处理 |
| `09-26-corebox-meta-overlay` | ⌘K 操作面板（meta overlay）：修正居中、背景模糊，重构展示形式 | —（调研中） |
| `09-25-corebox-list-motion` | CoreBox 交互 / 列表 / item 加载过渡的分析与优化 | —（调研中）。与 keyboard-jump 可能改到同一批文件（`useKeyboard.ts`、`CoreBox.vue`、`BoxGrid.vue`），实施时串行 |

## Cross-child acceptance

- [ ] 在 dev 环境的真实 CoreBox 里走一遍：输入扩展名搜索，走完"搜索中光效 → 结果出现 → 下键逐项移动 → 预览面板打开"整条链路。
  - 各阶段衔接不闪、不跳，光效和结果动效不互相打架；
  - 光效在结果出现后按门控规则淡出。
- [ ] 所有改动过的文件都通过各自子任务的门禁，`git diff --check` 干净。
- [ ] 共享工作树的提交纪律：只暂存本任务树的行，不带走其他会话的改动。

## Out of Scope

- DivisionBox、OmniPanel、插件 UI 视图等 CoreBox 之外的界面。
- 搜索排序 / 召回逻辑本身（除非 keyboard-jump 的根因就在这里）。

## 归档说明（2026-09-26）

7 个子任务全部完成并检查通过，已提交到本地 master。截至归档时，本地比远端多 38 个提交，尚未推送：

| 子任务 | 结果 |
| --- | --- |
| `09-25-tuffex-prism-glow` | tuffex 新组件 TxPrismGlow（含文档），增高时立即收起 |
| `09-25-corebox-search-pulse-beam` | CoreBox 接入光效，只在还没有结果时亮，常驻播报区 |
| `09-25-corebox-keyboard-jump` | 按 ↓ 跳到最后一个文件的问题已修 |
| `09-25-corebox-list-motion` | 阶段 1–3 完成；阶段 4 与帧率测量由老板决定暂不做 |
| `09-26-corebox-refresh-churn` | 刷新风暴治理；M3 / M4 同时在 PR #1965 和本地提交 `b3edffef1` 中 |
| `09-26-corebox-meta-overlay` | ⌘K 面板重做及 5 项后续 |
| `09-26-corebox-default-shortcut` | 默认 ⌥Space，永远不兜底 |

新增 spec：
- `main-process/index-commit-refresh-contracts.md`
- `main-process/corebox-meta-overlay-contracts.md`
- `main-process/global-shortcut-contracts.md`
- `frontend/corebox-results-contracts.md`
- `tuffex-design-rules.md` 的两条 Motion 规则

待真机验证的事项，记在各子任务的「归档说明」里。
