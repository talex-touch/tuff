# 消息朗读（ttsSpeak 接操作栏）

父任务：`.trellis/tasks/08-05-ai-toolchain-suite`。轻量任务，PRD-only。主会话自做（HomePage.vue 由主会话独占以避免与并行代理相撞）。

## Goal

已完成的 assistant 消息可一键朗读——复用主进程既有 `intelligenceApiEvents.ttsSpeak`（返回可播放 data URL），pilot ChatItem 里被注释的 🔊 兑现。

## Requirements

- TxMessageActions 增 `speakable` 能力位：speak 按钮三态（idle/loading/speaking），speaking 时再点=停止
- HomePage：assistant 完成消息接入；同一时刻至多一条在播（播新停旧）；组件卸载/切会话停播
- TTS 不可用（无 provider/失败）→ toast 提示，不出裸错
- i18n：朗读/停止/失败文案 zh+en（精准插键）

## Acceptance Criteria

- [x] 组件测试：三态切换、emit 契约、appear 不回归（message-actions 6 测试绿）
- [ ] 真机：点 🔊 出声、再点停、连点两条只响后者（待用户重启后验证——代码侧 token 竞态防护已单测无法覆盖真声音）
- [x] lint/typecheck/tuffex 全量绿
