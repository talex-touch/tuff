# 语音润色的长度门槛：调研与决策

调研日期 2026-09-10。问题：**自动润色是否应该只在长对话场景开启，以及多长才值得润色。**

## 0. 结论

| 输入长度（units = 汉字数 + 英文词数） | 决策 | 理由 |
|---|---|---|
| < 12 | **不调用任何 Provider**，原文直接交付 | 实测 7 字/11 字两次会话净收益为 0（一次删成 3 字，一次完全没变），却各花 667/834 ms |
| 12 – 59 | 只允许 `natural`（去口头词、修自纠正、标点） | 这一段是真实收益区；结构化重排在两句话里开始编造讲话者没有的结构 |
| ≥ 60 | 使用用户选择强度（`natural`/`structured`/`deep`） | 只有到长句/多句，分组与重排才付得起代价 |
| ≳ 300 | 需要分段（本次未实现） | 8s 预算下超长单次会静默回退原文（现有行为） |

用户的假设**方向正确但要修正**：不是"长对话才开润色"，而是市场统一形态 =
**轻量格式化永远开 + 重型重写按显式请求/场景开**；长对话只是重型重写的主要适用场景，不是开关条件。

## 1. 市场对标（全部为一手来源实测抓取）

| 产品 | 轻量层（默认开） | 重型 AI 重写（如何触发） | 硬性长度门槛 |
|---|---|---|---|
| **Wispr Flow** | Smart Formatting 全平台默认开，Android 无开关 | Transforms：**选中文本 + Opt+1**，需先跑通 demo 才能开启；"Auto Cleanup (Beta)" 文章已下架 | **iOS Polish 要求 10 words** |
| **superwhisper** | 按 App/URL 自动切模式；含 **Voice-to-Text 模式完全不做 AI 处理** | 跟随模式 | 无；文档警告极短录音易出幻想标点 |
| **VoiceInk**（6.4k★，源码） | 每模式 always-on 清理，强保真提示词 | 跟随模式 | 无；段落单元 ≤3 句 / 约 40 words |
| **Handy**（MIT） | 原文一个快捷键 | 清理是**另一个快捷键** | 无 |
| **FluidVoice** | 清理默认开 | 同左 | **<1 秒录音直接丢弃**（issue #276） |
| **豆包输入法** | 语音识别（方言/中英混输） | **「智能文字整理」是独立功能**："口语随便说，智能理成文…梳理内容重点" | 未公开数值 |
| **OpenTypeless** | — | 结构化规则：**≥2 个事项**才整理成编号大纲 | 按事项数 |

### 可引用的原文

- Wispr Flow, *How to use Transforms (Beta)*，`https://docs.wisprflow.ai/articles/8068950331`：
  > "Available on: Mac and Windows (rolling out gradually). **Polish is also available on iOS with a
  > 10-word minimum.**"
- Wispr Flow, *How do I use Smart Formatting and Backtrack*，`https://docs.wisprflow.ai/articles/5373093536`：
  > "**Smart Formatting is on by default on every platform, and always on with no toggle on
  > Android.** Changes apply from your next dictation; no restart is needed."
- Wispr Flow, *How to use Auto Cleanup (Beta)*，`https://docs.wisprflow.ai/articles/4136931124`：
  > "Note: This article is not currently available. Contact support if you need help with Auto
  > Cleanup."
- superwhisper 官方文档 `https://superwhisper.com/docs/llms-full.txt`：模式为场景/App 绑定，
  且极短音频是识别模型本身的问题：
  > "…they do tend to struggle with punctuation and have minor hallucination issues with single
  > word recordings"
- 豆包输入法官网 `https://shurufa.doubao.com/`：语音识别与"智能文字整理"是两个功能。

**读法**：唯一敢写死长度的是 Wispr Flow 的重写路径，值是 10 words；同时他们把"全自动重型清理"
撤回成了不可用状态。轻量层永远开、重型层显式触发——这是被市场验证过的边界。

## 2. 自家实测

### 2.1 生产链路逐字延迟

来源：`~/Library/Application Support/@talex-touch/core-app/tuff-dev/logs/D.2026-09-10.log`，
grep 模式 `Polish pass (starting|applied|hit its deadline)`。Provider `siliconflow-default`，
模型 `Qwen/Qwen3-VL-32B-Instruct`（**视觉语言模型，用于纯文本改写**），强度 `structured`。

| 输入 | 耗时 | 输出 | 净效果 |
|---|---|---|---|
| 7 字 | 667 ms | 3 字 | −57%，明显过度删改 |
| 11 字 | 834 ms | 11 字 | **完全没变，纯浪费** |
| 24 字 | 878 ms | 22 字 | 微小改动 |
| 64 字 | 1601 ms | 67 字 | 正常 |
| 95 字 | 6157 ms | 70 字 | 非线性劣化（−26%） |

已核对：`Polish pass elapsedMs` 与 `[Intelligence] text.chat success … latency=` 逐毫秒一致，
所以 6157 ms 是 Provider 侧真实耗时，不是 Tuff 封装开销。

### 2.2 真实会话分布

`voice_insights_state`（dev profile）：`26 sessions · 518 characters · 217050 ms · polished 17/26`
→ **平均 19.9 字/次，平均 8.35 s/次**。也就是说绝大多数会话落在"润色不划算"的区间。

### 2.3 等 prompt 长度扫描（代理实验，非生产路由）

用生产 `structured` system prompt（2646 字符）在同一台机器上跑 15/35/70/140/280 字：

| 输入 | 耗时 | 输出 |
|---|---|---|
| 15 | 674 ms | 9 |
| 35 | 676 ms | 28 |
| 70 | 1049 ms | 60 |
| 140 | 918 ms | 140 |
| 280 | 918 ms | 196 |

结论：**短输入并不因为输入短而便宜**——固定 prompt 成本主导；且长输入出现内容丢失
（35 字样本里"三楼那个大间"被截成"三楼那个"）。该实验用的是本地快模型，只作为**规模形状**参考，
不能当作生产数字。

## 3. 阈值推导

- **下限 12 units**：贴近市场唯一硬数字（Flow 10 words）；高于实测"无收益点"（11 字）；
  对中文 12 字、英文 12 词都成立，一套阈值跨语言。
- **上限 60 units**：一段口述停止是"一句话"的位置；也是 `deep`/`structured` 开始付得起代价的位置
  （实测 64 字 → 1.6 s，仍在预算内）。
- 中间的 `light` 段**强制降级到 `natural`**：静默的强度选择在这里会做用户没要的重排，
  而 20 字上下的口述（本机均值）正是最容易被"整理"坏的地方。

## 4. 已实施的策略

- `voice-service.ts`：新增 `countPolishUnits()` / `resolvePolishTier()`（12 / 60 两个常量），
  在 `polish()` 内部做门禁，覆盖 streaming final、one-shot、retry 三条路径。
- 跳过时记录 `Polish pass skipped: transcript below the length gate`（`reason: 'too-short'`），
  并按 `skipped-short` 记一条遥测；不再有任何 Provider 调用。
- `light` 段请求 `natural` prompt，日志同时输出 `strength`(实际) 与 `requestedStrength`(请求)，
  便于统计降级比例。
- 匿名遥测：`voice_polish_telemetry` 表（每决策一行，仅尺寸/档位/结果/延迟/强度），
  `VoiceInsightsStore.recordPolishPass()` 写入，`summarizePolishTelemetry()` 输出可上报聚合，
  `clearInsights()` 一并清除。

## 5. 待验证 / 下一步（按价值排序）

1. **换模型比调门槛更赚**：当前给纯文本改写配了 32B 视觉模型。需要一次同 prompt 的
   `text.chat` 模型对比（小尺寸 instruct vs 当前），用真实语音样本测延迟与保真。
2. **95 字 6.2 s 是排队还是模型**：需要同路由受控探测或 Provider 侧分段计时。
3. **分段上限**：≥300 字单次必超预算并静默回退，需要按句/段切分或提高预算（需真实样本验证）。
4. **场景维度**：对齐 superwhisper/VoiceInk 的模式思路，按目标 App（聊天 vs 编辑器）调档，
   而不是只按长度。
5. **价值信号**：口头词密度、自纠正标记、枚举项数（OpenTypeless 用 ≥2 项）比纯长度更准，
   但要在门槛稳定后再加第二个权威。
6. 每会话长度直方图：`voice_recognition_records` 为空，目前只有日聚合；遥测表落地后可直接出分布。
7. 竞品提示词的逐字台账与可采纳项见 `competitor-bench.md`。
