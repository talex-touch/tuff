# 洞察页共享组件迁移 — 截图比对证据（AC-E3）

## 结论

语音页切到 `components/settings/insights/` 五个共享组件后，**所有迁移区域逐像素无差异**：

| 状态 | 视口（CSS px，2x） | 标题行 | 提示条 ×3 | 主指标 | 辅助指标卡 ×3 | ⋯ 菜单面板 | 几何 |
|---|---|---|---|---|---|---|---|
| 空态 `empty` | 1100×820 | 0 | — | — | — | — | 一致 |
| 有数据 `data` | 1100×1302（整页） | 0 | — | 0 | 0 | — | 一致 |
| 菜单展开 `menu` | 1100×820 | 0 | — | 0 | 0 | 0 | 一致 |
| 三个提示条 `notices` | 1100×1540（整页） | 0 | 0 | 0 | 0 | — | 一致 |
| 窄屏 `notices-640` | 640 宽（命中 `max-width: 680px`） | 0 | 0 | 0 | 0 | — | 一致 |
| 窄屏 `notices-460` | 460 宽（命中 `max-width: 480px`） | 0 | 0 | 0 | 0 | — | 一致 |

表中数字为该区域内差异像素数。区域框取自两阶段各自的几何导出（`geometry/*.json`），两阶段的框逐值相同。完整输出见 `region-report.txt`。

整帧看，只有 `data` 与 `menu` 两张在**年度热力图卡片内部**出现亮度差恰为 1/255 的像素（270 / 491 个，位于格子圆角的抗锯齿处）。它们不在任何迁移区域内，且任一通道差值都不超过 1。作为对照，HEAD 代码连拍两次（`before` 对 `before2`）也有 7 个同类像素。`diff-data.png`、`diff-menu.png` 是这些像素的掩码（白点即差异），其余四张整帧 0 差异。

## 文件

- `before-*.png`：迁移前，`VoiceInsights.vue` 与 HEAD 一致（05:10 拍摄）。
- `after-*.png`：迁移后的最终代码（05:42 拍摄）。
- `diff-data.png`、`diff-menu.png`：整帧差异掩码。
- `region-report.txt`：整帧与逐区域的比对数字，以及 HEAD 连拍的噪声底。
- `geometry/`：每个状态的盒模型与关键计算样式导出，包括标题行、提示条、主指标、指标卡和菜单项。两阶段逐值相同。
- `harness/`：可一条命令重建的脚本，说明见下。

## 方法

- **隔离实例**：独立 profile（`/tmp/tuff-shellkit/userdata`），vite `:5197`，CDP `:9437`，关闭全局快捷键和原生音频，没有碰老板或其他会话的实例。
- **固定渲染条件**：
  - 新手引导闸：`beginner.init = true`；
  - 语言：`zh-CN`，不跟随系统；
  - 主题：暗色，`auto: false`，`window: pure`，不受系统外观和每日壁纸影响。
- **数据**：在隔离 profile 里写入确定性的语音洞察聚合，日期全部为绝对值：2026-07-05 起，90 天内 70 个有记录的日子。两阶段在同一天拍摄。
  - 本 profile 的 aux 库未就绪，`resolveCurrentAuxDb()` 回落到主库。已实测：清 aux 行页面仍有数据，清主库行页面变空。所以种子同时写 `database.db` 和 `database-aux.db`。
- **空态波形**：用页面自己的 `stopWave / resizeWave / drawWave(canvas, 0)` 停在 t=0 那一帧（即减少动效时显示的帧），避免动画时间差污染比对。
- **提示条**：通过页面组件自身的 `setupState` 同时打开 `loadFailed / copyFailed / postClearRefreshFailed`。只改渲染态，不向主进程发任何请求。
- **菜单**：对触发按钮发 `click`，等 900 ms 让入场动画结束后再截图。

## 复现

```bash
H=.trellis/tasks/10-03-insights-shell-kit/evidence/harness
SHELLKIT_WRAPPER_FROM_HEAD=1 bash $H/launch.sh   # 约 40 s 后窗口就绪
bash $H/capture.sh prepare                       # 新 profile 只需一次
bash $H/capture.sh before   # 或 after；输出到 /tmp/tuff-shellkit/shots
bash $H/launch.sh stop
```

`SHELLKIT_WRAPPER_FROM_HEAD=1` 的原因：05:06 有并行会话在工作区改了 `scripts/dev-electron-wrapper.mjs`（未提交，新增 macOS `translation` 原生模块构建）。而 `@talex-touch/tuff-native` 还没有导出 `./translation`，工作区版本 wrapper 启动即抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`。

- 开关打开时，脚本取 HEAD 版 wrapper 放到 `/tmp/tuff-shellkit/`，只改两行路径，让它从 `apps/core-app` 解析依赖。
- 这正是 before 阶段（05:00 启动）实际跑的那份代码，所以两阶段的启动方式一致。

## 过程记录

1. **第一轮 after 在 640 宽出现差异，已修正。**
   - 现象：状态胶囊与「记录」按钮宽度从 102/100 变成 124/80。
   - 原因：我误以为 Vue scoped 会把作用域属性加在末尾的 `*` 上，于是把原规则 `> *` 改写成了 `> :slotted(*)`，并给状态插槽套了 `display: contents` 包装。
   - 实测：HEAD 的编译结果是 `.VoiceInsights-HeroActions[data-v-…] > *`，属性加在父级上，三个子元素（状态、记录、菜单触发器）都会拿到 `flex: 1 1 0`。
   - 处理：改回原样 `> *`，去掉包装。新增 `InsightsHeader.style.test.ts` 锁定编译产物，并做了负控：换成 `:slotted(*)` 时测试变红。修正后 640 宽差异为 0。
2. **迁移不修正的旧问题**：辅助指标卡的 `> p` 规则（14px、次要色、上边距 8px）从来没生效过，因为 TxCard 把插槽包在 `.tx-card__body` 里。实测 before 中标签为 16px、主色、上边距 0。这条规则按原样迁入 `InsightsMetricCard`，并加注释说明。要让它生效会改变语音页外观，留给负责卡片外观的任务去决定。
3. **截图时出现的其他元素**：「权限体检」toast 和标题行的「语音输入不可用」胶囊（由 `TUFF_DISABLE_NATIVE_AUDIO` 触发）两阶段都在，区域内 0 差异。
