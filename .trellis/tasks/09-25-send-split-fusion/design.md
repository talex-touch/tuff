# 设计：发送分裂动画

## 1. 总谱（第一次发送与停靠后发送共用，时间可调，全部集中在一个 score 常量表里）

```
t=0        按下发送
           ├─ 草稿幽灵：输入框里原位的文字向上 10px、模糊到 6px、淡出（WAAPI，160ms，合成层）
           ├─ 输入框加 .is-splitting：描边与聚焦光环在 120ms 内退回常态色（接缝要与凸起描边一致）
           └─ 输入框高度先锁住（内联 height），分裂期间上沿不动
t≈16–33ms  布局稳定（nextTick + 2 帧，虚拟列表测完新行高度）后测量：
           输入框可见矩形（含 FLIP 变换）、首行文字位置、真实气泡最终矩形、滚动目标 → 预测落点
t0+0       长出：凸起在文字横向位置从输入框上沿长出（外凸 0 → 紧凑高度），凹角融合；
           凸起里的气泡文字从 6px 模糊变清晰
t0+150     拉开：detach 0 → breakAt，颈部先拉长再收腰
t0+≈290    断开（驱动器判定）：
           ├─ 输入框回弹（沿用现有 recoil，composite: add）
           ├─ 两端小尖回缩（snappy 弹簧，≈100ms），接缝补丁随小尖一起撤掉
           └─ 输入框解锁高度，多行草稿在 180ms 内收成一行
断开之后   飞行：水滴用弹簧飞向落点（位置 x / y、尺寸 w / h、圆角各自一根弹簧，保留速度），
           材质从「输入框填充 + 描边」过渡到「气泡填充、无描边」，长消息随水滴长大逐行露出
落地       到达落点（位置、尺寸误差 ≤ 0.5px）那一帧：揭开真实消息行、撤掉覆盖层；
           撞击上方消息（沿用 knockRows，提前量沿用 KNOCK_LEAD_MS 的思路按剩余距离估算）
```

第一次发送额外规则：输入框的 FLIP 下沉（`playComposerFlip`）延迟到断开 + 小尖回缩之后才开始（`delay` 期间 `fill: backwards` 保持在原位），于是水滴向上、输入框向下，两者反向分开；问候语 / 快捷胶囊的离场不变。

所有时长只是初值，按 CDP 录帧结果调。

## 2. 层与元素

覆盖层在 `HomePage.vue` 模板里声明（要拿到作用域样式的 `data-v-*`；运行时 `createElement` 的节点拿不到），常驻但默认隐藏：

```
.HomePage-Split (position: fixed; inset: 0; pointer-events: none; aria-hidden)
  svg.HomePage-SplitSurface  → 一条 path：凸起 / 颈部 / 水滴（fusionSurfacePath, includeBody: false）
  div.HomePage-SplitSeam     → 接缝补丁：盖住输入框上沿描边在颈底那一段（宽度 = spans[0]）
  div.HomePage-SplitDrop     → 水滴内容：.HomePage-UserBubble 同款排版的文字，transform + clip-path 每帧写
.HomePage-Composer
  div.HomePage-DraftGhost    → 草稿幽灵（输入框内一层 overflow: hidden 的容器，跟输入框圆角一致）
```

层级刻度（`.HomePage` 上的 `--home-z-*`）：

| 层 | 值 | 说明 |
| --- | --- | --- |
| `--home-z-leaving` | 0 | 不变 |
| `--home-z-flight` | 1 | 分裂层（surface + drop），仍在输入框之下 |
| `--home-z-composer` | 2 | 不变 |
| `--home-z-seam` | 3 | 新增：只有接缝补丁在输入框之上，且只盖住描边那 2–4px，不遮任何内容 |

材质：起始填充取输入框在发送那一刻的计算背景（空态不透明 `--shell-bg`；会话态玻璃取 `--shell-bg` 近似，差异只存在于几百毫秒的颈部），描边取 `--shell-border`（`.is-splitting` 保证此时输入框也是这个颜色）；目标材质 `--shell-surface-2`、无描边，用一个每帧写入的 `--split-mix` 做 `color-mix()` 过渡。

## 3. 模块划分

```
apps/core-app/src/renderer/src/composables/
  useSendChoreography.ts        # 总谱编排：保留 knock / entrance / composer FLIP（加 delay）/ recoil；
                                # playSend 换成 playSplit，对外句柄仍是 { impact }
  send-split/score.ts           # 时间与参数常量、纯函数（阶段判定、材质插值、紧凑尺寸计算）
  send-split/split-driver.ts    # rAF 驱动：springSteps 推进 → fusionSurfacePath → 写覆盖层 DOM
  send-split/*.test.ts
```

- 几何与弹簧来自 `@talex-touch/tuffex/fusion-surface`（`fusionSurfacePath`）与 `spring.ts` 的 `springSteps`（`09-25-tuffex-fusion-surface` 交付）。
- 驱动器每帧只做：推进弹簧 → 拼 path 字符串（相同就跳过）→ 写 3–4 个 style；**不读布局**。落点只在「启动时」「断开时」「飞行 70% 时」各读一次真实行的矩形，差值交给位置弹簧改目标，速度连续，不瞬移。
- 序列号沿用现有 `sendSeq` / `invalidate()` / `cancel()`：新的一次发送或卸载让旧动画立刻落位，`ENTRANCE_WATCHDOG_MS` 兜底不变。

## 4. 主线程减负（先量后改）

1. **基线**：改动前 CDP 录制（`Tracing` 的 `devtools.timeline` + `disabled-by-default-devtools.timeline.frame`），记录两条路径（空态第一次发送、停靠后发送）的长任务、丢帧、各阶段耗时占比。
2. **已知热点**：`TxConversationStream` 的 `range` 每次滚动都返回新对象 → `windowItems` 重算 → 可见行插槽每帧重渲染。修法：`range` 用带旧值的 `computed((old) => …)`，起止下标不变就返回旧对象（Vue 3.4+ 语义，改动在 tuffex `conversation-stream`，附单测与文档 `## 技术实现` 一行）。
3. **其余热点**按基线轨迹逐个处理，写进 `research/perf-baseline.md`；如果修完仍有无法避免的长任务落在飞行窗口里，再把「断开后的飞行」改成合成线程上的 WAAPI（位置用预测落点 + 末段加性修正），这是预留的决策点，不预先做。

## 5. 与既有契约的关系

- `08-09-send-flight-layering`：飞行中的消息永远在输入框之下——保持；新增的 `--home-z-seam` 只画描边补丁，写进同一张刻度表的注释。
- `useHomeConversation`：不改。`choreographedSend` 的「认领这一批追加」机制不变。
- 减少动态效果：`prefersReducedMotion()` 为真时 `playSplit` 直接返回 `null`，与现有 `playSend` 的降级路径相同。
- 表单提交等程序化追加的用户消息：仍走 `playEntrance`，不分裂（它们没有从输入框里出来）。

## 6. 取舍记录

- **为什么不直接把输入框做成 `TxFusionSurface`**：输入框外面包着 `TxBorderBeam`，自己还有流式发光的伪元素和毛玻璃，这些都依赖它是一个普通圆角盒子；把背景换成 SVG 路径会把它们全部打断。所以输入框保持原样，只在分裂的几百毫秒里叠一层覆盖层。
- **为什么接缝要单独补丁**：覆盖层在输入框之下（层级约定），输入框自己的上沿描边会横穿颈底；只把那一小段描边盖住，是不破坏层级约定下唯一能做到「无缝」的办法。
- **为什么落点只读三次**：旧实现每帧 `getBoundingClientRect()`，每一帧都可能强制同步布局；三次读取 + 弹簧改目标，既能精确落地，又把布局读取从每帧降到常数次。
