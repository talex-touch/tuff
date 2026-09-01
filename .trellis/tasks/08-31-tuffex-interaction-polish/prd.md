# tuffex 交互细节三修：slider 拖杆尺寸 / 全量 cursor / tooltip 跟手

## Goal

修掉 2026-08-31 在 nexus 组件画廊里实机发现的三处交互硬伤。三处彼此独立、可分别验收，因此拆成三个子任务；本父任务只持有需求来源、任务映射和跨子任务的验收口径。

## 需求来源

用户在浏览 nexus live specimen 画廊时提出，附三张截图：

1. **Slider 拖杆**（截图：蓝色填充 + 圆角矩形折射板）——"原本那个拖杆应该是一层 mask，它会整体缩小。不要改成缩小了，用 transform 拉伸，或者直接把 transform 改掉，直接改它的大小。但这个大小要注意避免触发回流，不然回流渲染会很卡，因为这是高频操作。"
2. **按钮无 cursor**（截图：DropdownMenu 页的 `+ Add` 触发器）——"这些按钮 hover 上去咋都没加 cursor 啥的，你可以排查下。" 用户已确认范围为**全量扫一遍可交互组件**。
3. **Tooltip 滚动延迟**（截图：Tooltip 页的 `Add` 浮层）——"tooltip 提示滚动的时候有延迟，你应该加载 mounted 动画结束之后 transition 干掉。"

## 任务映射

| 子任务 | 目录 | 交付物 |
|---|---|---|
| slider 拖杆改为直接改尺寸 | `08-31-slider-surface-size` | `.tx-slider__surface` 以真实宽高表达状态，不再整体 `scale()` |
| 全量补齐可交互组件 cursor | `08-31-interactive-cursor-sweep` | 21 个待处理组件的 cursor 补齐 + 防回归守卫 |
| anchor 浮层滚动跟手 | `08-31-anchor-follow-transition` | 浮层跟随参考元素不再拖尾 |

三者无实现顺序依赖，可并行推进。

## 跨子任务约束

- **不扩大范围。** 每个子任务只修各自报告的问题；顺手发现的相邻缺陷写成代码注释 + 在收尾报告里列出，不夹带修改。
- **文档同步是硬要求。** 任何改到 `packages/tuffex/packages/components/src/` 下组件渲染结果（DOM / class / 视觉表现 / prop / 事件 / slot）的子任务，必须同步对应的 nexus 文档页；清单见 `.trellis/spec/frontend/tuffex-docs-sync.md`。仅在 props 表加一行不算文档同步。
- **两个下游都要过。** tuffex 自己的 `vue-tsc` 比 nexus 和 core-app 都宽松，改完 tuffex 源码后两个下游的 typecheck 都要跑。
- **不整文件 `--fix`。** core-app 与根 eslint 配置规则相反（尾逗号等），只判 delta。

## 验收标准

- [ ] 三个子任务各自的验收标准全部达成
- [ ] `packages/tuffex` 单测通过，且新增用例针对的是**修复后的行为**而非现状快照
- [ ] nexus typecheck 通过（先 build tuffex，dist 为空会造成约 39 条假错）
- [ ] core-app typecheck 通过
- [ ] `pnpm lint` 在改动文件上无新增告警
- [ ] 三处问题在 nexus 画廊实机复核确认修复（截图或 CDP 证据）

## Notes

- 分支：`feat/gallery-live-specimens`（父任务 base branch 已记录）。
- 本仓库有并发 agent 写文件，验证单个文件的原始版本用 `git show HEAD:path > path`，**不要** stash / checkout / restore。
