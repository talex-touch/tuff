# Recommendation scenario playbook

## 背景

- 诉求源头:「刚安装一个 app,打开 CoreBox 大概率就是想打开它,应该提前推荐」。2026-08-06 调查确认该场景未覆盖:唯一消费安装时间的 `getColdStartRecommendations` 仅在使用历史完全为空时触发,执行过任意 item 后永久失效;`files.ctime` 是首次入库时刻(首扫同批几乎相同,扫描器未取 birthtime);app watcher 发现新应用后不触发推荐缓存失效。
- 父任务 `08-05-search-audit-remediation` 的 `research/reco-signals-audit.md` 已建立**信号维度**的体系(信号现状表、R1-R4 分层、三原则),7 个 `reco-*` 子任务在执行。缺一份**场景维度**的总览:以「用户此刻打开启动器想干什么」为单位,把信号组合成可命名、可解释、可评估的场景,并暴露信号视角看不见的整类缺口(item 新鲜度、负反馈闭环)。

## 目标

以场景为单位梳理 CoreBox 推荐/搜索的适配面,产出场景矩阵(playbook),对齐现有 reco 体系,把缺口转化为可执行的新任务提案。**本任务只做梳理与规划,不做实现**;实现归按提案新建的子任务。

## 交付物

1. `research/scenario-matrix.md` — 场景矩阵:六大类场景,每场景一行总表;缺口场景另有完整场景卡。
2. 缺口 → 任务映射:每个场景标注 ✅已生效 / 🔗已有任务覆盖(标任务名)/ 🧩缺口(附新任务提案)/ ❓低置信观察项;不允许出现未映射场景。
3. 新任务提案(含验收标准草案),至少包含 item 新鲜度场景包(新安装置顶 / 卸载即时清理 / 冷启动修复)。

## 场景卡统一字段(梳理框架)

1. **触发信号** — 来源、采集点、成本/隐私层级(对齐三原则①)
2. **意图假设与置信度** — 用户此刻大概率想做什么,依据(prior art / 数据)
3. **注入路径** — A 零查询候选维度(`getCandidates`)/ B 稳定层评分(可缓存,`calculateRecommendationScore`)/ C 易变层重排(`applyVolatileContextRerank`)/ D 有查询排序(`tuff-sorter`)/ E 硬分区(pinned 式)
4. **强度与衰减** — boost 量级、半衰期、退场条件、与 frecency 的交接方式
5. **可解释** — badge/reason 文案(对齐三原则②)
6. **评估** — 曝光-点击 hit-rate@k 按场景 source 切片(对齐三原则③)
7. **现状与依赖** — 已有基建、关联任务、缺口

## 验收标准

- [ ] `research/scenario-matrix.md` 完成:总表覆盖六大类全部场景,状态标注齐全,无未映射场景
- [ ] 每个 🧩 缺口场景有完整 7 字段场景卡,或明确「不做」及理由
- [ ] item 新鲜度任务提案包含:安装时间数据修正(birthtime / 发现来源区分)、候选维度接入(绕开冷启动死角)、衰减与 frecency 交接、badge 与类型补齐(`ScoredItem['source']` 与 `tuff-dsl` 的不一致一并修)、watcher → 缓存失效、评估切片
- [ ] 与 `reco-signals-audit.md` 的 R1-R4 分层和三原则无冲突(场景视角是补充视图,不另起框架;新信号仍归 R3/R4 路线)
- [ ] 评审通过后,按提案在 `08-05-search-audit-remediation` 下创建子任务并回填映射表

## 非目标

- 不改任何生产代码(实现归子任务)
- 不新增信号采集(新信号排期仍走审查文档的 R3/R4)
- 不做联网/A-B 评估(沿用本地曝光计数 `recommendation_exposure_daily`)
