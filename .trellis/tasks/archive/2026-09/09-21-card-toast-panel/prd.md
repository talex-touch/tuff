# 卡片交互动效升级与 TxToastPanel

父任务：`.trellis/tasks/09-21-bui-parity-and-interaction/`

## 背景

老板 2026-09-21 第一条需求（附 X @shlok776 `status/2101375771277504674` 截图）：「根据这个优化一下我们的交互动效 卡片的 新增ToastPanel」。

参考图是一张产品落地页的 feature 卡片：一个 macOS 窗口样式的列表卡片，**下方用虚线牵引连着一条刚到达的条目**，条目卡片底下还露出一层薄边暗示后面排着更多。

## 交付：TxToastPanel

### 它不是 Toast

`TxToastHost` 是**全局通知栈**——`toastStore` 驱动、浮在视口角落、自己排队自己消失、与页面内容没有位置关系。

`TxToastPanel` 相反：**锚在某样东西下面**、完全受控，而那条虚线牵引就是全部差别——它说的是「这条是从**那里**来的」，不是「有条通知」。两者共存不冲突，因此新建目录而非扩展 toast。

### 设计决策

- **隐藏态不卸载。** `open: false` 时组件留在 DOM，只是 opacity 归零并回到位移起点。用 `v-if` 会切断离场过渡（面板瞬间消失而非退回），且牵引线的盒子塌掉会让每次条目变化都把布局往上拽一跳。
- **入场用 `--tx-ease-spring` 回弹。** 新条目是「送到眼前」的东西，冲过终点再落回比匀速滑入更像「刚到」。减弱动效下位移整个去掉、只留淡入——淡入是「内容变了」的最低限度信号，全砍掉回来的眼睛看不出发生过什么。
- **堆叠上限钉死 2。** 按默认错位量，第三片露出的边不到一个像素，只会搅浑阴影却要多一个节点和一层阴影。夹取在组件内做，不信任调用方。
- **位置归宿主。** 组件只画牵引线方向，不定位自己——只有宿主知道它挂在什么下面。
- **它自己播报**（`role="status"` + `aria-live="polite"`），因为面板在无用户动作时出现；宿主已在别处播报时用 `live="off"` 关掉，一次到达配两个 live region 比没有更糟。

### 注册链条

`components.ts`、`base` barrel（与 `toast` 同桶）、README 中英（Feedback 12 → 13，计数 155 → 156）、demo、`demo-registry.ts`、中英文档页、`DocsSidebar.vue`、`recategorize-component-docs.py`。

## 验收结果

| 项 | 结果 |
|---|---|
| `toast-panel.test.ts` | 13 passed |
| tuffex 全量 | 240 文件 / 2532 测试 passed |
| `vue-tsc` | exit 0 |
| eslint（tuffex / nexus 各自配置） | 双 0 |
| `audit:readme` | 156 modules 双语一致 |
| `check:mdc-fences` / `check:doc-parity` / `check:demo-registry` / `recategorize` | 全过 |
| 浏览器实测 | 列表卡片 → 虚线牵引 → 浮出条目 → 底部堆叠薄边，与参考图结构一致 |

## 过程中被守卫抓到的疏漏

首版两层阴影都是 `0 Npx`（正下方），被 `src/__tests__/shadow-light-source.test.ts` 判失败——库里所有阴影必须共用同一个左上光源，x 偏移约取 y 的一半。改成 `3px 6px 16px` / `4px 8px 24px` 后通过，demo 里那层也一并对齐。

> 这条规范来自 `5a3a38d3a change(tuffex): put every shadow back under the same light`，新写组件时容易漏，但有 CI 守卫兜底。

## 未完成

老板原话里的「优化一下我们的交互动效 **卡片的**」——ToastPanel 本身的浮出动效已按此实现（回弹入场）。若指的是 `TxCard` 组件自身的 hover / press 动效，尚未动，需要老板确认指向。
