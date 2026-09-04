# Design — status-badge 暗色 token 与图标家族

## 为什么修 token 而不是修配方

三条路：

1. 只改 status-badge 的配方（例如描边降到 20%、填充换成向页面色混合）——能救这一个组件，但 `TxBadge` / `TxTag` / `TxAlert` 明确写着"same recipe as TxStatusBadge"，改完家族里出现两种暗色表现，且 Badge / Tag 在暗色下同样浑浊，问题只是没被截到。
2. 在 status-badge 里加 `.dark` 覆盖——本质同 1，还多一层选择器。
3. 在 `.dark` 定义这三枚 token——一处改，30 个消费者同时受益；代价是要逐个看。

用户选了 3。高对比暗色主题早就这么做了（`tx-high-contrast-dark` 定义了浅调三色），普通暗色只是漏了。

## 选值

约束来自两类消费者：

- **作为墨水**（文字 / 图标 / 描边 / 低透明填充）：越亮越好，要 ≥ 7 : 1。
- **作为实心底 + 白墨水**（`TxToolConfirmation .is-dangerous`，可能还有 button 的 filled 语义变体）：越亮越差，白字对比度不能低于现值 2.9 : 1。

两头一夹，答案是"比现值亮一档、但不到粉彩"，Tailwind 400 系正好落在这里：

| token | 现值 | 新值 | 文字 : `#141414` | 白墨水 : 新值 |
|---|---|---|---|---|
| success | `#67c23a` | `#4ade80` | 10.6 : 1 | 1.9 : 1（现值 2.2） |
| warning | `#e6a23c` | `#fbbf24` | 11.0 : 1 | 1.7 : 1（现值 2.1） |
| danger | `#f56c6c` | `#f87171` | 6.7 : 1 | 2.77 : 1（现值 2.90） |

**红色的可行窗口为空**（09-02 实算，也是 danger 只按 AA 验收的原因）：AAA 7 : 1 墨水在 `#141414` 上要求相对亮度 ≥ 0.349，白墨水压在实心底上要保住 2.90 则要求 ≤ 0.312。`#f87171` 亮度 0.330，落在两者之间：墨水 6.66 : 1（AA 过、AAA 差一点），白墨水 2.77。我最初在表里写的「持平 2.9」是没算白墨水就写下的，错。

success / warning 的白墨水对比度略降——但白字压在绿 / 黄实心底上本来就不及格（现值 2.2 / 2.1），实现时 grep 有没有组件真这么用（`background: var(--tx-color-success|warning)` + 白字）；有则那个组件本来就该改成深墨水，记录不修。danger 持平。

danger 的 12% 填充 `#2f1f1f` 与现值几乎一样，这是红色在近黑上的物理限制；`#fb7185`（rose-400）偏粉一点、填充 `#301f22`，实机对比后二选一，design 表里记最终值。

**不做的**：不改 `:root` 亮色值；不改高对比两套；不动 `--tx-color-primary`（暗色 `#409eff` 是另一个已知问题，`variables.scss` 第 320 行有注释，不在范围）。

## 派生变量

`.dark` 块内：

- `--tx-color-*-rgb`（第 359–362 行）：手写三元组，必须与新 hex 同步，否则 `rgb(var(--tx-color-success-rgb) / .2)` 类用法会用旧色。单测锁定。
- `--tx-color-success/warning-light-*`：`color-mix(... white)` 派生，自动跟随。
- `--tx-color-danger-light-5/7/9`：硬编码 `#a43c3c / #7f2d2d / #4e1f1f`，从旧 danger 往黑混出来的。先 `rg "danger-light-" packages/tuffex/packages/components/src`；有消费者就按新 danger 重推（50% / 30% / 12% 向黑混），没有就留注释。
- `--tx-color-warning-dark-2`：派生，自动跟随。

## 组件层

```scss
.tx-status-badge {
  border-radius: 999px;      // 8px → 胶囊，与 TxBadge 一致
  font-weight: 500;          // 600 → 与 TxBadge 一致；600 是它读成按钮的一半原因
  &__icon { font-size: 1em; }  // 14px → 随文字；nexus ×1.2 后 14.4px
  &--md { padding: 3px 10px; }
  &--sm { padding: 2px 8px; }
}
```

图标映射：

| tone | 现 | 新 |
|---|---|---|
| success | `i-carbon-checkmark-filled` | `i-carbon-checkmark-outline` |
| warning | `i-carbon-warning` | 不变 |
| danger | `i-carbon-close-outline` | 不变 |
| info | `i-carbon-information` | 不变 |
| muted | `i-carbon-minimize` | `i-carbon-circle-dash` |

五个都是"圆 + 符号"的描线图，线宽一致，视觉分量一致。选描线而不是全实心：实心五个盘在 12px 文字旁太重，且实心版 warning（`warning-filled`）是三角不是圆，家族又散了。

`color` / `background` / `border` 三行不动（家族配方）。

## 爆炸半径签收清单

`rg -l "tx-color-(success|warning|danger)" packages/tuffex/packages/components/src` 的 30 个目录，按画廊格子逐个截暗色图：

ai-elements · alert · attachment-tray · badge · button · chain-of-thought · chat · context-indicator · context-menu · dropdown-menu · empty-state · flat-input · form · icon · input · message-actions · progress-bar · select · stat-card · status-badge · steps · stream-markdown · tab-bar · tag · textarea · timeline · toast · tool-call-card · tool-confirmation · version-capsule

每个记"更好 / 持平 / 更差 + 一句话"。画廊里没有格子的（chat 系列）去各自文档页看 demo。

## 回滚形状

`variables.scss` `.dark` 块 + `TxStatusBadge.vue` 两处；无 API 变化。回滚 = 还原两个文件与文档。
