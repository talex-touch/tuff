# CoreBox 自动推荐信号体系评估（2026-08-06 只读审查）

Source: reco-audit agent, same session as the search audit. 结论供批次 R 任务规划；
行号为审查时工作树状态，使用前先核对。

**核心结论**：时间/时区/上下文/前台 app 的采集基础设施基本已存在，缺的是「采集了没接进
评分」或「接了被 bug 打断」；需要从零新建的只有地理位置。两个 P0：M17 排序丢失仍在；
时段信号因 sourceId 口径断链结构性失效（零候选，非权重问题）。

## 信号现状（采集入口 ContextProvider.getCurrentContext, context-provider.ts:54；
设置开关 app-settings.ts:315-324）

| 信号 | 采集 | 评分参与 & 权重 | 生效? |
|---|---|---|---|
| 时间 TimePattern | context-provider.ts:73-90 | 候选维度3 getTimeBasedTopItems + timeRelevance×1e5 (engine:1418) + 语义 token | **前两者死**(P0-2)，token 生效 |
| 剪贴板(type/hash/contentType/meta) | :98-187 | contextMatch×1e6 (70~100分, engine:1748-1838) + 打开URL候选 95×1e5 + token | 生效（唯一强信号） |
| 前台应用 | :239-260 (activeAppService) | matchForegroundApp×1e6：自身−50 / IDE→终端+60 / 浏览器→开发+50 | **采样时机错，近乎失效**(P1-4) |
| 网络 | :372-407 | 离线时浏览器/下载 −25 | 生效 |
| 电源 | :409-435 | 低电: 图像/IDE−16, 编辑器/终端+8 | 生效 |
| 勿扰(仅 macOS) | :437-457 | IDE/终端+12, 娱乐社交−20 | 仅 macOS |
| 蓝牙 | :459-461 | — | **死信号**（硬编码 false，开关是摆设） |
| 时区+locationBucket | :358-363 | 只进缓存键 + 布尔 token | **不参与评分**；locationBucket 实际= hash(时区)（networkIdHash 哈希的是接口名 en0，恒定） |
| frecency | engine:2073-2088 | (exec+0.3search−0.5cancel)×exp(−0.1天)×1e4 | 生效 |
| 最近使用 | engine:2093-2102 | 100×exp(−0.1小时)×1e3 | 生效 |
| 语义 profile | semantic-profile.ts (64维hash向量) | ×6e5 / ×3.5e5 / ×−5e5 | 生效 |
| AI embedding/rerank | engine:1479-1636 | ×4e5 / ×3e5 | 默认关 |

候选池 6 维度（engine:930-1038）：高频30/最近20/**时段20(零产出)**/趋势15/插件(空)/剪贴板URL。

## 质量问题

P0-1 / P0-2 / P1-3 / P1-4 — FIXED 2026-08-05（08-05-reco-ranking-stats-fix）：
rebuildItems 按输入(评分)序返回并写 scoring.final；combineRecommendedWithPinned 在
截断前按 final 排序；recordExecute 改写 usage_logs.source = source.id，历史行由
门控幂等迁移 usage-source-identity-migration 重键（trend/time-stats 碰撞按和合并）；
CoreBox show() 抢焦点前记前台 app 快照（TTL 15s），ContextProvider 优先用快照并把
「前台=Touch 自己」当作无信号。以下描述保留为修复前的机理记录。

- **P0-1 排序丢失（M17 仍在）** item-rebuilder.ts:73-91：scoreAndRank 的降序被按
  source 分组重建打乱（跨组 [app,file,plugin-feature,clipboard]、组内=DB返回序）；
  mergeAndEnrichItems(:507) 只写 meta.recommendation.score 不重排；
  combineRecommendedWithPinned (engine:838) 在乱序上 slice → 有 pinned 时**最高分被丢**；
  渲染端 applyRecommendationResult (useSearch:901) 不经 rankRenderedItems；推荐项从不写
  scoring.final（渲染端兜底排序看到全 0）。
- **P0-2 时段信号 sourceId 口径断链**：recordExecute 写日志用 source.type
  ('application', search-usage-service.ts:150)、写统计用 source.id ('app-provider',
  :158)；TimeStatsAggregator 把 type 当 sourceId 写 item_time_stats
  (time-stats-aggregator.ts:32/50/95)；getTimeBasedTopItems 拿 type 键查 id 键统计
  (engine:1095-1122) 永不命中 → 维度3 恒空 + timeRelevance 永不触发。全线不等：
  app-provider/application、clipboard-history/history、plugin-features/plugin。
  测试盲区：engine 测试 mock 掉 rebuildItems 且未 mock getAllItemTimeStats。
- **P1-3 usage_trend_daily 双键污染**：backfill 用 type 键 (engine:421/442)、实时用
  id 键 → type 行被 :1304 丢弃；id 行历史被劈开 → avgWeekly 低估、growthRate 虚高。
- **P1-4 前台 app 采样时机**：CoreBox 先抢焦点 (window.ts:396-441) 再采样
  (context-provider:241) → 拿到的是 Touch 自己；全仓无「打开前快照」；最近先例
  clipboard.ts:719-750 的 activeAppCache。
- **P1-5 缓存键高基数**：前台/剪贴板/网络/电量全进 key (context-provider:471-503)，
  后台 15min 预热的 key 与用户按快捷键时必不同 → 双层缓存 miss，可见路径全量重算。
- P2-6 冷启动空白（无候选→fallback 也空→返回空数组，engine:635-676/892-925）。
- P2-7 时段统计 24h 全表重算写绝对值（隐私清理旧日志→历史分布永久丢失；内存无上界）。
- P2-8 getTimeBasedTopItems 全表扫+逐行 JSON.parse×3（被 P0-2 掩盖）。
- P2-9 macOS bundleId 白名单硬编码 (engine:1914-2068)，且 itemId 可能是 path 形态
  (item-rebuilder:122) → 判定落空；无 Win/Linux 表。
- P2-10 getUsageStatsBatch 交叉积取数（结果正确，过度取数）。
- P3-11 死代码：upsertItemTimeStats；蓝牙采集。

## 五类目标信号差距

| 信号 | 已有 | 需建 | 成本/隐私 |
|---|---|---|---|
| 时间 | 几乎完备；**hourDistribution[24] 已入库但从未被读** (aggregator:60/72 vs recommendation-utils:58-73) | 修 P0-2；提频；hourDistribution 进评分 | S/低 |
| 时区 | 已采集；getHours 本就随系统时区 | 仅「时区切换=旅行」检测需新增 | S/低 |
| 位置 | **无**（tuff-native 无定位；权限注册表 27 id 无 location） | 真定位: 原生绑定+权限+表 (L/高)；折中: SSID/网关 MAC 地点桶 (M/中) | 见左 |
| 上下文 | 剪贴板已接入；selection-capture.ts 存在**未接入** | 放宽 5s 窗口；接选区 | S~M/中 |
| 前台 app | active-app.ts 全平台采集+缓存+权限退避；usage_logs.context schema 注释已预留 prev_app 格式 (schema.ts:209) 但 recordExecute 只写 {scoring} | ①打开前快照（挂 show() 前）②prev_app 写入+共现表 | 快照 S；共现 M/中 |

## 分层路线（批次 R 提案）

- R1（修 bug，最大收益）：P0-1 rebuild 后按 score 重排 + 写 scoring.final（接上 A1 渲染端
  排序）+ pinned 截断在排序后；P0-2 sourceId 口径统一（sourceIdMap 现成映射，
  item-rebuilder:93-102）+ 历史行迁移（顺带解 P1-3）；P1-4 打开前快照。
- R2（接已有未用信号）：hourDistribution 进评分；缓存键降基数（基础排序缓存+易变上下文
  轻量 re-rank）；冷启动兜底；聚合 24h→增量；接 selection-capture；时区切换检测。
- R3（新信号）：prev_app 共现学习；SSID 地点桶；真地理位置（默认关，最后做）。
- 清理：蓝牙删或实现；upsertItemTimeStats 删；bundleId 判定兼容 path 形态+跨平台表。

## R4 扩展信号候选（2026-08-06 最佳实践扩展，未排期；参考 Siri Suggestions /
Raycast / Windows Start 的做法）

日历与日程（新信号里价值最高）：
- 日历事件临近：会前 N 分钟推「加入会议」（解析事件内 Zoom/Meet/腾讯会议链接），会后推
  纪要工具。EventKit + 日历权限（权限注册表挂新 id）。M/中。
- 节假日与调休日历：workday/weekend/holiday 修正 isWorkingHours（中国调休需内置数据）。S/低。

系统状态（无权限、廉价、可先做）：
- 音频路由：耳机/AirPods 接入 → 音乐/播客/会议应用（替代死掉的蓝牙信号，更通用）。S/低。
- 外接显示器/dock：接外显=工作台模式（IDE/设计加权），拔掉=移动模式。S/低。
- 唤醒/开机/长空闲返回：morning routine vs 深夜模式。S/低。
- 充电状态转移事件（刚插电+外显=坐下办公；电量已采，缺转移沿）。S/低。
- 外置卷挂载：U 盘插入 → 文件管理/备份 + 该卷最近文件。S/低。
- 输入法切换：当前中文 IME → 中文内容应用微调。S/低。
- 麦克风/摄像头占用：开会中 → 勿扰动作/录屏工具。M/中（API 边界）。

文件与内容活动（「接着做」场景，文件索引 watcher 已有事件流可复用）：
- 最近下载/新截图：Downloads 新文件→打开/移动/分享；Desktop 截图→标注。S~M/低。
- 活跃项目目录（mtime 聚类）→ 对应 IDE/终端。M/低。
- 剪贴板模式检测：连续同类复制 → 批量工具/剪贴板历史置顶。S/低。

行为模式（学习型）：
- 窗口标题细化（schema 已预留 prev_app+window_title）：标题需 hash/白名单化。M/高隐私。
- 推荐曝光-点击率：展示未点击的衰减（cancelCount 骨架已有，补曝光记录）。M/低。
- 会话节奏：同类连续查询 → 会话内类目权重临时提升。S/低。

三原则（任何新信号的前置）：①隐私分层——全本地、内容只存 hash/类别、位置与窗口标题默认
关 + 权限注册表新 id；②可解释——meta.recommendation 带「因为…」；③可评估——先埋
推荐命中率@k（曝光 vs 点击）指标再调权，否则新信号无法验证收益。
