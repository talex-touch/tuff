# 推荐信号工程总map（批次 R 全量排期，2026-08-06 用户批准「都做，本地数据处理」）

需求源：reco-signals-audit.md（现状+差距+R4 候选）。原则：全部本地计算；每信号独立
设置开关；窗口标题 hash 化且默认关；真地理位置**长期停放**（唯一越出「本地数据处理」
理由的信号）；先有指标再调权（R2/R9 的 hit-rate@k 是所有后续信号验收的标尺）。

## 分层与依赖

```
R1 reco-ranking-stats-fix      修排序丢失/口径断链/前台快照     [in flight]
 └─ R2 reco-wire-existing-signals  接现成信号 + hit-rate@k 指标基座 [R1 后]
     └─ R3a reco-signal-substrate   采集基座:collector registry     [R2 后]
         ├─ R3b reco-system-state-signals  外显/dock·唤醒·充电沿·卷挂载·IME (·麦克风摄像头 stretch)
         ├─ R3c reco-file-activity-signals 下载/截图·活跃项目·剪贴板模式   [与 R3b 可并行]
         ├─ R3d reco-calendar-signal       EventKit+权限+入会链接+调休日历
         └─ R3e reco-behavior-learning     prev_app 共现·曝光CTR·会话节奏·窗口标题(hash,默认关)·Wi-Fi 地点桶
```

## 信号→任务映射（R4 候选全部入册）

| 信号 | 任务 | 备注 |
|---|---|---|
| hourDistribution/缓存降基数/冷启动/增量聚合/选区/时区切换 | R2 | audit 既有未用 |
| 曝光-点击 hit-rate@k 指标 | R2 (R9) | 后续一切信号的验收标尺 |
| 音频路由(耳机→音乐/会议) | R3a | 顺带删蓝牙死信号+开关 |
| 外接显示器/dock、唤醒/开机/长空闲、充电转移沿、外置卷挂载、输入法切换 | R3b | Electron powerMonitor/screen 为主 |
| 麦克风/摄像头占用 | R3b (stretch) | API 边界先探 |
| 最近下载/新截图、活跃项目目录、剪贴板模式 | R3c | 复用文件 watcher 事件流 |
| 日历临近事件+入会链接、节假日/调休 | R3d | tuff-native EventKit + 权限注册表新 id |
| prev_app 共现、曝光CTR衰减、会话节奏、窗口标题(hash)、Wi-Fi 地点桶 | R3e | 依赖 R1 口径 + R2 指标 |
| 真地理位置 | — 停放 | 需要时再立项，默认关 |

## 验收基线

每个 R3x 任务落地时必须：①新信号有设置开关并进 unavailableSignals 体系；②有单测
（信号可用/不可用/开关关闭三态）；③hit-rate@k 无显著回归（R2 指标）；④digest/研究
文档同步更新。
