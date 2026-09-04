# status-badge 暗色 token — 爆炸半径签收表（2026-09-02）

依据：`before/dark` 与 `after/dark` 各 32 张画廊格子截图（同一脚本 `shoot.mjs`，同视口，同滚动位置）逐像素比对（阈值：任一通道差 > 24 记为变化像素），加上两份 `_metrics.json` 里的计算样式。签收由父任务集成阶段完成（实现 agent 在写表前空闲）。

最终 token（`.dark`）：success `#4ade80`、warning `#fbbf24`、danger `#f87171`；`-rgb` 三元组同步；`--tx-color-danger-light-5/7/9` 按新旧 danger 的通道比例重锚为 `#a63f3f / #812f2f / #4f2020`。

| # | 目录 | 画廊格子 | 变化像素 | 判定 | 说明 |
|---|---|---|---|---|---|
| 1 | status-badge | StatusBadge | 2.33% | **更好** | 三枚同为描线圆家族、胶囊、图标随文字；填充色相清晰，描边不再是深色硬边。文字对比 8.2→10.6 / 8.4→11.0 / 6.4→6.7 |
| 2 | alert | Alert | 0.89% | **更好** | success / error 两块的填充与描边随 token 提亮，标题与正文墨水更清楚 |
| 3 | tag | Tag | 0.27% | **更好** | 稳定版 / 测试版两枚的墨水与描边提亮，与 Badge 同族 |
| 4 | badge | Badge | 0.03% | 持平 | 只有 error 数字徽标的墨水从 `#f56c6c` 到 `#f87171`，肉眼几乎无差 |
| 5 | steps | Steps | 0.36% | 持平（注） | completed 图标实心底 `#67c23a`→`#4ade80`，白色对勾对比 2.24→1.74；改前已不及格（AA 4.5），实心语义底配白墨水本就不是受支持的配对，记为既有缺陷 |
| 6 | tab-bar | TabBar | 0.00% | 持平（注） | 计数徽标实心底 `#f56c6c`→`#f87171`，白字对比 2.90→2.77，像素级无可见差；同上，既有缺陷 |
| 7 | tool-confirmation | ToolConfirmation | 0.00% | 持平（注） | `.is-dangerous` Allow 按钮实心 danger 底配白字 2.90→2.77，两者都低于 AA；正确修法是深色墨水，另开任务 |
| 8 | stat-card | StatCard | 0.17% | **更好** | 趋势文字 `+16.7%` 绿色更亮 |
| 9 | progress-bar | ProgressBar | 0.59% | 混杂 | 同时被 progress-bar 重设计改动，最终签收见父任务集成截图 |
| 10 | select | Select | 3.06% | 持平（混杂） | 差异来自 Select 下拉的开合 / 焦点态在两次截图间不同，非 token（该格子不渲染语义色文字） |
| 11 | dropdown-menu | DropdownMenu-open | 0.34% | 持平 | 打开态里的 danger 菜单项墨水提亮，像素差在阈值边缘 |
| 12 | dropdown-menu | DropdownMenu | 0.00% | 持平 | 关闭态无语义色 |
| 13 | typing-indicator | TypingIndicator | 0.18% | 持平 | 动画帧位差，不读语义 token |
| 14 | button | Button | 0.04% | 持平 | 画廊只展示 primary / 默认按钮，无语义变体 |
| 15 | icon | Icon | 0.03% | 持平 | 抗锯齿噪声 |
| 16 | chain-of-thought | ChainOfThought | 0.02% | 持平 | 状态点极小 |
| 17 | tool-call-card | ToolCallCard | 0.01% | 持平 | 状态点极小 |
| 18 | ai-elements | AiElements | 0.00% | 持平 | 格子内无语义色 |
| 19 | attachment-tray | AttachmentTray | 0.00% | 持平 | 无语义色 |
| 20 | chat | Chat | 0.00% | 持平 | 无语义色 |
| 21 | context-indicator | ContextIndicator | 0.00% | 持平 | 无语义色 |
| 22 | context-menu | ContextMenu | 0.00% | 持平 | 关闭态 |
| 23 | empty-state | ErrorState | 0.00% | 持平 | 无语义色 |
| 24 | flat-input | FlatInput | 0.00% | 持平 | 无 error 态展示 |
| 25 | form | Form | 0.00% | 持平 | 无 error 态展示 |
| 26 | input | Input | 0.00% | 持平 | 无 error 态展示 |
| 27 | message-actions | MessageActions | 0.00% | 持平 | 无语义色 |
| 28 | stream-markdown | StreamMarkdown | 0.00% | 持平 | 无语义色 |
| 29 | textarea | Textarea | 0.00% | 持平 | 无 error 态展示 |
| 30 | timeline | Timeline | 0.00% | 持平 | 画廊只有 default / active 点 |
| 31 | toast | Toast | 0.00% | 持平 | 画廊只有触发按钮，toast 本体未弹出 |
| 32 | version-capsule | VersionCapsule | 0.00% | 持平 | 画廊为 beta（primary），无 success 通道 |

未被画廊覆盖但在读取清单里的目录：`chat` 系列子组件（message-actions 等已含）、`empty-state` 的 error 变体、`form` / `input` / `textarea` 的 error 态。这些只在各自文档页的 demo 里出现，token 提亮对它们的效果与 Alert 同向（墨水与描边变亮），未逐页截图。

**结论**：更好 4（StatusBadge / Alert / Tag / StatCard），持平 25，混杂 2（ProgressBar / Select），更差 0。三处「持平（注）」是实心语义底配白墨水的既有缺陷，token 变亮让它们略降（2.24→1.74 / 2.90→2.77 / 2.90→2.77），都在 AA 线以下且改前也在线下；修法是那三处换深色墨水，已记入父任务相邻缺陷清单。

亮色主题：`after/light` 与 `before/light` 的 StatusBadge / Badge / Tag / Alert / Steps / TabBar / Timeline / ToolConfirmation / Button 格子 token 值不变（`:root` 未动），差异仅来自组件层（胶囊 / 字重 / 图标），无回归。

下游抽查（`after/downstream/`）：`/store`、`/dashboard/devices`、`/dashboard/storage` 视口截图与 status-badge 文档页均正常渲染，status badge 为胶囊。

> 2026-09-02 curation: only the cells that changed or carry a note above keep their before/after PNGs (StatusBadge, Alert, Tag, StatCard, Steps, TabBar, ToolConfirmation, ProgressBar, Select, Badge) plus the dark `_viewport` positive control and the downstream captures; the 22 "持平" cells and the `preview-a/b` token renders were dropped from the repo copy. `shoot.mjs` (with `CELLS=`) regenerates any of them against :3200; `_metrics.json` keeps every computed style.
