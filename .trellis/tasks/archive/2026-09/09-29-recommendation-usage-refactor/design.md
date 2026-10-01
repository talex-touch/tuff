# 推荐使用重构设计

## 已批准的产品选择

2026-09-29 用户回复“做吧”，按已推荐的严格常用方案实施。近 30 天 5 次、3 个本地自然日；时间偏好 10 次、3 天；行为分 0～100、时间最多 20 分、插件自报最多 5 分；宫格最多 6 项且不补满。

## 数据流与边界

用户触发 → provider 明确报告主要动作已接受 → 统一身份与动作事件 → 单写者事务保存日志及统计 → 失效读缓存和推荐代际 → 通知可见行更新次数 → 下次打开重新计算推荐。

- provider 执行成功与是否激活分开表达；失败、取消、次要动作不计主要使用。每次主动动作生成独立 eventId，重复通知沿用同一 eventId。
- 统计身份复用来源注册表 canonicalize，重建条目使用 `_originalSourceId` / `_originalItemId`，不得用临时展示 ID 派生另一份事实。
- 有效执行不再等待十分钟队列。日志、累计次数、summary 和日级趋势在一个交互事务提交；事件去重有数据库约束。统计错误只影响统计状态，不使已成功完成的操作失败。
- SearchUsageService.recordExecute 保留现有入口，RecordExecuteOptions 增加 eventId；动作层必须传入 eventId。服务接纳执行时立即使统计读缓存和推荐代际失效；提交完成再次通知。公开回读方法与推荐、应用详情读取相同实际数据库。
- DbUtils 提供批量 getUsageBehaviorBatch(keys, now?)。每行含 sourceId、itemId、近 30/7 天次数、activeDays30、按发生日衰减的执行分、近 30 天小时/星期/时段分布；只能由可靠执行日期构成。历史累计不清零，未知日期不推算。不得每次打开扫描整个历史数据库。
- 使用事件或可靠日志的发生时间决定本地日与衰减。新动作只加自己的贡献，不使旧事件返老还童。公开时间权重 API 和宿主一起修正，明确模型版本，不保留另一套旧评分。
- 推荐引擎消费同一批行为样本，单独判定常用资格，不以召回来源代替资格。行为自动分有上限；上下文只在建议区竞争；非冷启动未使用探索最多一个。置顶占展示预算但不受行为门槛限制，文件始终在列表。
- 可见曝光由渲染器在实际可见且宿主窗口显示时上报，同一显示会话去重；移除主进程发布结果即视为曝光的路径。次数通知只更新行元数据，不改变顺序、焦点、预览与快捷键。
- 缓存失效保留同步读屏障和 generation。失效前计算不能发布旧快照；执行后的首次推荐等待已接纳统计写入，不以旧数据库填热缓存。

## 文件所有权与协作接口

- UsageStorage：SearchUsageService、usage queue/cache、db/utils/schema/migrations、database aux DDL、行为读 API及保留边界。提供 eventId 去重和提交结果、统计更新订阅；不改 search-core、推荐引擎或 renderer。
- ExecuteActions：search-core、app recorder、各 provider、plugin adapters、clipboard/action入口、DSL 执行结果类型。统一成功计数及动作 eventId，接入 UsageStorage 的通知并同步失效推荐；不改统计存储、推荐目录或 renderer。
- RecommendationRules：recommendation 目录、usage-utils、公共 recommendation-weights 与全部评分调用者。读取 getUsageBehaviorBatch、常用准入与分区、探索预算、证据、SDK 语义。需要跨所有权改动时通知集成 owner。
- 集成 owner：transport 事件契约、renderer 真曝光与次数订阅、最终接口整合、真实 Electron 验证、规范更新。
- Tester：测试文件及回归覆盖；实现 owner 不自行写测试。旧行为/措辞断言失效时删除或换成真实新边界，不重新固定偶然实现。

现有其他会话修改：preload/index.ts、renderer/platform、utils/env、utils/renderer/hooks/initialize 及其测试、frontend/type-safety.md，不覆盖、不还原。所有子任务实施过程中不运行 build/lint/tests/formatters，由集成 owner 最后统一执行。

## 数据与兼容性

若新增执行去重列或表，同时更新主库 migrations、schema 和 aux 初始化 DDL，复用既有 retention/export 删除入口。已有来源迁移维持幂等，置顶和累计不重建。所有宿主/SDK 调用者一次切换，版本说明记录评分语义改变；不发布、不提交、不 push。

## 验证面

定向现有回归和有价值的边界测试；真实 libSQL 事务、重复 eventId、失败回滚、重开读取、来源别名与迁移重复应用；隔离 Electron 真实 DOM、CoreBox 搜索/推荐/执行、两项常用不补满、零使用固定、次数即时回读、热缓存重新打开和焦点顺序。数据与大产物只放 /tmp，不修改生产 profile。
