# CoreBox 场景适配矩阵(2026-08-06 初稿)

场景维度的适配总览,与父任务 `research/reco-signals-audit.md`(信号维度)互为补充视图:
信号是供给侧(采集了什么),场景是需求侧(用户此刻想干什么)。同一框架、同一套三原则
(隐私分层 / 可解释 / 可评估),不另起炉灶。

状态标注:✅ 已生效 · 🔗 已有任务覆盖(标任务)· 🧩 缺口(见场景卡)· ❓ 低置信观察项

## 业界 prior art(梳理时的参照系)

| 产品 | 做法 | 对本项目的启示 |
|---|---|---|
| Windows 11 开始菜单 | "Recently added" 独立分区置顶,时间窗后自动退出 | 新装 app 用**硬性可见位** + 时间窗退场,不靠打分博弈 |
| iOS Siri Suggestions | 刚安装 app 立即进建议格;产生真实使用后让位给习惯模型 | **novelty → frecency 交接**:新鲜度是探索通道,拿到使用信号即交棒 |
| Pixel Launcher 建议行 | 时间 / 耳机接入 / 新装 app 等信号融合出一行建议 | 多信号进同一个「建议位」,而非各自开区 |
| Raycast | frecency + favorites 硬置顶 + alias 学习;根搜索有 Suggestions 区 | 与现状同构(frecency/pinned/query_completions 均已有),差异在 novelty |
| Alfred | 查询前缀 → 选中项学习 | 已有等价物 `query_completions` |
| uTools | 剪贴板内容自动匹配功能 | 已有等价物(剪贴板路由 + contextMatch) |
| 推荐系统通说 | item cold-start:新 item 无历史,纯 frecency 永远埋没它;需 novelty boost + 快衰减 + 负反馈快速退场 | S1 整类的理论依据;曝光未点击要加速衰减(S6.2) |

关键洞察:**frecency 与 novelty 互补**。现有排序的主导信号(频率/最近使用/前缀学习)全部
依赖历史,新 item 天然为零分 → 新装 app、新启用插件永远输给老习惯。需要一条「探索通道」,
且在获得真实使用后把 item 交还给 frecency 正常通道。

## 场景总表

### S1 · Item 生命周期(novelty,frecency 盲区 —— 本次新暴露的整类缺口)

| # | 场景 | 意图假设 | 状态 |
|---|---|---|---|
| S1.1 | 刚安装的 app → 打开启动器即置顶推荐 | 装完就想开,置信度高(Windows/iOS/Pixel 皆有) | 🧩 **top gap** |
| S1.2 | 刚更新的 app → 轻微加权 | 想看新版本,置信度低 | ❓ 观察项,暂不做 |
| S1.3 | 卸载 app → 推荐/统计立即消失 | 负向数据卫生;残留推荐是硬伤 | 🧩 |
| S1.4 | 新启用的插件 feature → 首曝光机会 | novelty 探索,给新能力被发现的机会 | 🧩 |
| S1.5 | 冷启动(零使用历史) | 现有实现退化:ctime 首扫同批 + 执行一次即永久失效 + `cold-start` 无 badge/类型 | 🧩 修复 |

### S2 · 系统事件

| # | 场景 | 状态 |
|---|---|---|
| S2.1 | 耳机/音频路由接入 → 媒体/会议类 | 🔗 reco-system-state-signals |
| S2.2 | 外接显示器/dock → 工作台模式(IDE/设计) | 🔗 同上 |
| S2.3 | 唤醒/长空闲返回 → 晨间例行 vs 深夜模式 | 🔗 同上 |
| S2.4 | 外置卷/U 盘挂载 → 文件入口 + 该卷最近文件 | 🔗 同上 |
| S2.5 | 充电状态转移沿(刚插电+外显=坐下办公) | 🔗 同上 |
| S2.6 | 网络离线 → 降权在线工具;低电量;DND(macOS) | ✅ |
| S2.7 | 输入法切换 → 中文内容应用微调 | 🔗 R4 候选,未排期 |
| S2.8 | 麦克风/摄像头占用 → 会议中动作 | 🔗 R4 候选,未排期 |

### S3 · 内容上下文

| # | 场景 | 状态 |
|---|---|---|
| S3.1 | 剪贴板类型/URL → 匹配候选与重排;非文本输入路由到声明支持的 feature | ✅ |
| S3.2 | 选区感知(与剪贴板同档) | ✅(R2 已接) |
| S3.3 | 刚下载完成 / 新截图 → 打开/移动/标注 | 🔗 reco-file-activity-signals |
| S3.4 | 剪贴板模式(连续同类复制)→ 批量/历史工具 | 🔗 R4 候选 |
| S3.5 | 活跃项目目录 → 对应 IDE/终端 | 🔗 reco-file-activity-signals |

### S4 · 应用共现

| # | 场景 | 状态 |
|---|---|---|
| S4.1 | 前台 app 静态规则(去重自身、IDE→终端、浏览器→开发) | ✅(快照修复后) |
| S4.2 | prev_app 共现学习(schema 已预留,未写入) | 🔗 reco-behavior-learning |
| S4.3 | 会话节奏(同类连续查询 → 类目临时提权) | 🔗 R4 候选 |

### S5 · 时间与习惯

| # | 场景 | 状态 |
|---|---|---|
| S5.1 | 时段/星期/24h 分布 affinity | ✅(R2 已接 hourDistribution) |
| S5.2 | 节假日/调休修正 isWorkingHours | 🔗 R4 候选 |
| S5.3 | 日历会议临近 → 会前推入会链接、会后推纪要 | 🔗 reco-calendar-signal |
| S5.4 | 时区切换(旅行)→ travel token | ✅(R2 已接) |

### S6 · 反馈闭环

| # | 场景 | 状态 |
|---|---|---|
| S6.1 | 取消惩罚(cancelCount 负权) | ✅ |
| S6.2 | 曝光未点击 → 加速衰减(反哺排序) | 🧩(曝光计数已落库,但只做评估不反哺) |
| S6.3 | 手动「不再推荐」/ 降权 | 🧩 |
| S6.4 | 结构性:有查询排序(`tuff-sorter`)不消费任何 ContextSignal,上述场景全部只影响零查询 | 🧩 需先出设计,不盲目接 |

## 缺口场景卡(🧩 全量)

### S1.1 新安装 app 置顶推荐 —— 首发

1. **触发**:app watcher 实时索引事件(`handleIndexedSourceWatchEvent`,装后 1.5-2.5s 可搜)。全本地,零新增权限。低成本。
2. **意图假设**:装完 → 打开启动器 → 就是想开它。置信度高(三家 prior art)。
3. **注入路径**:A(`getCandidates` 新增「近 N 天新装」维度,与 frequent/recent/time-based/trending 并列 —— 绕开冷启动只在零历史触发的死角)+ B(稳定层加 install-recency 项,复用 `resolveInstallTime`)。不走 E 硬分区(避免与 pinned 语义打架),靠权重进 top 3。
4. **强度与衰减**:48h 内强 boost(目标:进 top 3),7 天线性淡出;**一旦产生首次执行即交棒 frecency**(novelty 项立即清零,该 item 已有真实信号)。多样性过滤(同类 ≤40%)需给新装项豁免或提高上限,否则同批装多个会互相挤掉。
5. **可解释**:badge「新安装」(如 `i-ri-sparkling-line`),reason「刚安装的应用」。
6. **评估**:`recommendation_exposure_daily` 按 source 切片,单独看 newly-installed 的 hit-rate@3;若显著低于均值则降 boost 或缩窗。
7. **现状与依赖**:基建约八成现成 —— watcher 链路 ✅、`ctime` 入库且 upsert 冲突时不覆盖 ✅、`resolveInstallTime` 现成 ✅。缺:① 真实安装时间(扫描器补 `birthtime`,并区分「首扫入库」vs「watcher 新发现」,否则首扫同批全被当成新装);② watcher → `invalidateCache()`(否则新装要等缓存过期);③ 类型与 badge:`ScoredItem['source']` 缺 `'cold-start' | 'newly-installed'`(与 `tuff-dsl.ts` 的 `TuffMeta.recommendation.source` 不一致),`item-rebuilder` 的 badge/reason map 无对应键。

### S1.3 卸载即时清理

1. **触发**:watcher unlink 事件(链路已有)。
2. **意图**:负向 —— 卸载了还推荐是硬伤,且残留统计污染 frecency。
3. **注入路径**:数据层,不是打分:候选生成前过滤已失效 item + 推荐缓存失效;`item_usage_stats` 等历史行标记失效(保留数据以备重装,不物理删除)。
4. **衰减**:即时,无衰减语义。
5. **可解释**:无(消失本身即结果)。
6. **评估**:回归测试断言卸载后不再出现在推荐/搜索。
7. **依赖**:与 S1.1 同一条 watcher 事件流,适合同一任务落地。

### S1.4 新启用插件 feature 首曝光

1. **触发**:插件启用/注册 feature 事件(PluginManager 已有生命周期)。
2. **意图**:novelty 探索 —— 给新能力被发现的机会;置信度中(不如新装 app 强)。
3. **注入路径**:A 并入 S1.1 的「新鲜度」候选维度(同一通道,不同 item 来源)。
4. **衰减**:比 S1.1 弱(不进 top 3,只保证进前 10),同样首次使用即交棒。
5. **可解释**:badge「新功能」。
6. **评估**:同 S1.1 切片。
7. **依赖**:S1.1 的通道建成后增量接入;可作同任务的第二阶段或独立小任务。

### S1.5 冷启动修复

1. **现状缺陷**:`getColdStartRecommendations` 按 ctime 倒序,但首扫时全部 ctime 同批 → 近似随机;`source: 'cold-start'` 不在 `ScoredItem` 类型联合里;badge/reason map 无键,UI 落通用「推荐」。
2. **修法**:S1.1 落地后冷启动直接复用同一份「新鲜度优先」逻辑(数据修正后 ctime/birthtime 可信),并补类型与 badge。属 S1.1 任务的收尾项,不单独立任务。

### S6.2 曝光未点击 → 加速衰减

1. **触发**:已有 `recommendation_exposure_daily`(impressions@k / clicks@k)。
2. **意图**:推了没点 = 弱负反馈;推荐系统通行做法。
3. **注入路径**:B 稳定层,frecency 公式加曝光惩罚项(类比现有 cancelCount 负权)。
4. **衰减**:惩罚随时间衰减,避免永久压死。
5. **可解释**:无需 badge(表现为「不再刷屏」)。
6. **评估**:整体 hit-rate@k 应上升;需防自证循环(压掉的 item 没有曝光就永远翻不了身 → 保留小概率探索)。
7. **依赖**:审查文档 R4「行为模式」已列此条;建议与 S6.3 打包成负反馈任务,排 S1 之后(P2)。

### S6.3 手动「不再推荐」

1. **触发**:结果项右键/快捷操作(UI 交互,新增)。
2. **意图**:显式负反馈,置信度最高的信号。
3. **注入路径**:数据层黑名单(推荐侧过滤,不影响主动搜索命中)+ 设置页可管理。
4. **可解释**:操作即解释;设置页列表可撤销。
5. **评估**:功能性验收为主。
6. **依赖**:与 S6.2 同任务;pinned(正向硬置顶)的镜像,存储可参照 `pinned_items` 表。

### S6.4 有查询排序的上下文缺失(结构性)

`tuff-sorter` 只吃 item 自身属性(匹配度/频率/最近使用),不读 ContextSignal —— 所有场景适配
只影响零查询。是否要把上下文引入有查询排序,涉及「用户明确输入时是否应该尊重字面意图」的
产品判断 + 性能预算(sorter 在热路径),**先出 design 再决定**,不在本轮任何任务里顺手做。

## 优先级与任务提案

排序依据:意图置信度 × 触发频率 × 基建就绪度 ÷ 隐私成本。

| 提案 | 覆盖 | 优先级 | 一句话验收 |
|---|---|---|---|
| **08-06-reco-item-freshness**(已建,2026-08-06) | S1.1 + S1.3 + S1.5(+S1.4 可选二期) | P1,建议紧随 wire-existing-signals | 装一个新 app,≤10s 内打开 CoreBox 见其带「新安装」badge 进 top 3;首次执行后 novelty 退场;卸载后即时消失;exposure 有独立切片 |
| **08-06-reco-negative-feedback**(已建,2026-08-06,未排期) | S6.2 + S6.3 | P2 | 连续曝光未点击的 item 排名下降且可翻身;右键不再推荐即时生效、设置页可撤销 |
| query-time context design(暂不立任务) | S6.4 | P3 | 仅 design 评审,通过后再立实现任务 |
| 其余 🔗 场景 | S2/S3/S4/S5 | — | 已由既有 reco-* 任务与 R4 候选清单覆盖,本 playbook 不重复立项 |
