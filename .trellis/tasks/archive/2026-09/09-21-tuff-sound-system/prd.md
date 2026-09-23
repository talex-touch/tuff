# Web Audio 交互音效系统

父任务：`.trellis/tasks/09-21-bui-parity-and-interaction/`

## 背景

老板 2026-09-21：「还有这个里面的点击音效 输入框音效啥的」，指 beautifului.dev 站内的交互音。

## 上游调研结论：只借形态，不搬引擎

逆向 `675-a1987701fc5ebd5a.js` 拿到的是一套**通用 Web Audio 合成引擎**：振荡器 / 噪声 / wavetable / sample 四类音源，ADSR 包络，外加 13 种效果器（reverb、convolver、delay、distortion、chorus、flanger、phaser、tremolo、vibrato、bitcrusher、compressor、eq、pan）和 `layers + effects` 的 patch 结构。

**具体的音效预设参数不在这个 chunk 里**——它们由站点页面代码在运行时构造，散在压缩过的 React chunk 中，两轮正则提取都是 0 命中。

因此**不搬引擎**：
1. 老板要的是「点击音、输入框音」，不是 13 种效果器。搬一套通用合成库进组件库是范围失控。
2. UI 音效的参数应当服务我们自己的交互语言，照抄别人的数值没有意义。

只借它的**形态**（合成而非采样、layers 结构、ADSR），参数自己设计。

## 交付：`packages/tuffex/packages/utils/sound.ts`

形态刻意对齐同层的 `vibrate.ts`（预设表 + 主函数 + 快捷对象），两者是同一层的两条反馈通道。

### 设计决策

- **默认关闭。** 一个 import 进来就出声的库，宿主得专门去关；主动开启是一行，被意外吵到之后再关是一张 issue。
- **音频图懒建。** 浏览器把非用户手势内创建的 `AudioContext` 挂在 `suspended`，一个永不播放的页面若也建一个就是纯泄漏。测试断言「关闭时连 context 都不创建」。
- **合成而非采样。** 零打包体积、任何采样率不糊、不会 404。
- **七个预设，不多。** 会发出七种声音的界面就是噪音。
- **两套时长预算。** 即时反馈（click/key/toggle）≤ 80ms 必须跟手；状态提示（其余）≤ 250ms 够一个两音音型。首版把两类一刀切在 180ms，被自己的预设证伪后改成按用途分档——原规则过度简化，不是放宽。
- **包络不从 0 起。** `exponentialRampToValueAtTime` 从 0 是 no-op，会留下一个阶跃，而增益曲线上的阶跃本身就是一声咔哒——盖在本该是提示音的声音上。
- **节点回收。** 每个声音结束时断开自己的包络节点，否则连打会在主增益上挂几百个死节点。
- **永不抛。** 关闭 / 不支持 / 还没有用户手势时静默返回 `false`。反馈通道绝不该成为交互失败的原因。

## 验收结果

| 项 | 结果 |
|---|---|
| `sound.test.ts` | 23 passed（自建可观察的 Web Audio mock，断言调度而非听感） |
| tuffex 全量 | 241 文件 / 2555 测试 passed |
| `vue-tsc` | exit 0 |
| eslint | exit 0 |
| 四个 nexus 门禁 | 全过（178 components） |
| **离线渲染实测** | 见下 |

### 离线渲染实测（真实 PCM，逐样本测量）

把 `window.AudioContext` 换成 `OfflineAudioContext` 让**真实调度路径**渲染出音频，再逐样本统计：

| 预设 | 峰值 | 可听时长 | 削波 |
|---|---|---|---|
| click | 0.1029 | 40.4ms | 否 |
| key | 0.0564 | 27.4ms | 否 |
| toggle | 0.0893 | 64.7ms | 否 |
| success | 0.0897 | 187.6ms | 否 |
| error | 0.0996 | 215.7ms | 否 |
| open | 0.0779 | 91.3ms | 否 |
| close | 0.0774 | 91.3ms | 否 |

三条设计意图被数据坐实：`key` 峰值确实最低（每字符触发，不能变打字机）；`open`/`close` 峰值与时长完全镜像（方向承载语义，音量不承载）；全部不削波。

> 验证用的临时页面与静态服务器已清理，`dist/index.html` 已删除。

## 文档

`apps/nexus/content/docs/dev/components/sound.{zh,en}.mdc`，category `Foundations`，接入 `DocsSidebar.vue` 两处 Foundations 列表与 `recategorize-component-docs.py`。表格里写的是**实测值**而非标称值。

## 未做（有意）

- 效果器链（reverb / delay / chorus 等 13 种）：UI 反馈音用不上，搬进来是范围失控。
- 组件层自动接线：没有让 `TxButton` 等自动发声。音效何时响是产品决策，不是组件默认行为；宿主在自己的事件处理里调 `sound.click()` 即可。
