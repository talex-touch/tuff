# BUI 对齐与交互体验升级

## 背景

2026-09-21 老板一次性给出六条参考，指向同一件事：**tuffex 从 Beautiful UI 迁过来的那一族组件，现在展示出来「问题很严重」**，同时要按几个外部设计参考升级交互语言。

这是父任务，只负责需求汇总、子任务映射和跨子任务验收。实现落在各子任务。

## 需求来源（原始证据）

| # | 来源 | 老板原话 | 落点 |
|---|---|---|---|
| R1 | X @shlok776 `status/2101375771277504674`（截图） | 「根据这个优化一下我们的交互动效 卡片的 新增ToastPanel」 | C2 |
| R2 | X @AdityaSur11 `status/2101695377267384457`（原图已存 `/tmp/tuff-ref/aditya-0.png`） | 「重新设计我们的 Status 相关的」 | C3 |
| R3 | https://www.beautifului.dev/ | 「确保这个库相关的都完整迁移到我们的库里」「包括样式啥的 你可以自己对比一下 看看每一个有无问题 现在展示出来的问题很严重」 | C1 |
| R4 | 同上（站内 Web Audio 实现） | 「还有这个里面的点击音效 输入框音效啥的」 | C4 |
| R5 | BUI `#insight-cards` 截图 | 「这个丢 data」 | C1 |
| R6 | BUI `#flowchart` | 「尤其是 flowchart 可以单开一个 ai data 后面的 flow」 | C5 |
| R7 | BUI `#selection-actions` 截图 | 「这个 q 弹的动效 当然背景要用 surface」 | C1 |
| R8 | BUI `#agent-screen` 截图 | （仅截图，纳入对齐清单） | C1 |

## 子任务映射

| 子任务 | 交付物 | 独立验收面 |
|---|---|---|
| **C1 bui-parity-audit** | BUI 21 个 section 逐个与 tuffex 实现做样式/行为对齐，修复差异 | 每个组件在 nexus 文档页与 beautifului.dev 并排截图比对通过 |
| **C2 card-toast-panel** | 新增 `TxToastPanel`；卡片交互动效按 R1 升级 | 组件可独立渲染 + 文档页 + 动效在真实浏览器可见 |
| **C3 status-mono-redesign** | `TxStatusBadge` 默认视觉改 mono 标签风格 | 所有调用点（core-app / nexus）视觉回归通过 |
| **C4 tuff-sound-system** | Web Audio 合成音效系统（点击音、输入音） | 真实浏览器听到；可全局开关；尊重 reduced-motion / 静音偏好 |
| **C5 flowchart-flow-suite** | `TxFlowchart` 组件 + nexus 新增 `flow` 文档套件（排在 ai、data 之后） | flow 套件在文档站可见并可导航；flowchart 页有 demo |

## 已确认的决策

- **任务结构**：父任务 + 独立子任务（老板 2026-09-21 选定）。
- **C3 范围**：改 `TxStatusBadge` **默认视觉**，不是新增 variant。这是破坏性视觉变更，接受 core-app / nexus 全量跟着变（老板 2026-09-21 选定）。
- **C5 套件位**：`flow` 是第六个文档套件，位置在 `ai`、`data` 之后。

## 跨子任务验收标准

1. BUI 21 个 section 在我们库里**都有对应实现**，缺失的补齐，不能只对上名字。
2. 每个对应实现与 beautifului.dev 的**视觉与交互差异被逐项记录并判定**（修复 / 有意偏离 + 理由），不允许「看起来差不多」结论。
3. 不引入新的 lint / typecheck / 测试回归；tuffex 与 nexus 各自的门禁按其**自身**配置跑（见 `[[coreapp-lint-config-vs-root]]` 同类陷阱）。
4. 所有视觉结论必须来自**真实浏览器截图**，不接受读代码推断。

## 非目标

- 不重构 BUI 之外的 tuffex 组件。
- 不改 core-app 的业务逻辑，只承接 C3 带来的视觉变更。
- 不做 beautifului.dev 的像素级复刻——对齐的是设计意图与交互质量，颜色/字体走我们自己的 token 层。

## 待老板确认（不阻塞 C1 起步）

- C4 音效默认开还是默认关。
- C2 的「卡片」具体指 `TxCard` 本身，还是 nexus 落地页的 feature 卡片。
