# Item freshness recommendations

## Goal

落地场景矩阵 S1 组(Item 生命周期):刚安装的 app 在零查询推荐里获得置顶级曝光并可解释;产生真实使用后把排序交还 frecency;卸载后即时从推荐消失;顺带修复冷启动的退化实现。来源:`08-06-reco-scenario-playbook/research/scenario-matrix.md` 场景卡 S1.1 / S1.3 / S1.5。

## Requirements

### R1 新安装 app 置顶推荐(S1.1)
- 安装一个新 app 后,打开 CoreBox(空查询)应看到它进入推荐前 3,带「新安装」badge 与 reason。
- 新鲜度判定必须防两类误报:app 自更新(bundle 重建导致文件创建时间刷新)不算新安装;Touch 首次全量扫描把老 app 入库不算新安装。
- 强推窗口 48h,7 天内线性淡出,7 天后完全退场。
- 一旦该 item 产生首次执行(executeCount > 0),novelty 加成立即归零,排序交还 frecency 正常通道。
- 推荐缓存必须在新 app 入索后失效,否则「装完 ≤10s 可见」不成立(索引本身 1.5-2.5s 已达标)。

### R2 卸载即时清理(S1.3)
- 卸载 app 后,推荐列表不得再出现该 app(含缓存命中路径)。
- 使用历史统计行保留(重装恢复 frecency),但不得把已卸载 app 带回推荐。

### R3 冷启动修复(S1.5)
- 冷启动排序改用真实安装时间(不再依赖首扫同批、近似随机的入库时刻)。
- `cold-start` 成为一等 source:类型联合、badge、reason 补齐(现状:类型缺失、UI 落通用「推荐」)。

### R4 可解释与可评估(对齐三原则)
- 「新安装」badge 文案与 reason 进 `meta.recommendation`。
- 曝光-点击按 newly-installed 切片计数(沿用本地 `recommendation_exposure_daily`,仅计数、不存 item id)。

## Acceptance Criteria

- [ ] 模拟新装 app(watcher 路径):空查询推荐中该 app 进前 3,badge「新安装」;单测覆盖新鲜度判定(自更新排除 / 首扫老 app 排除 / 新装命中 / Linux 无 birthtime 回退)
- [ ] 首次执行后 novelty 加成为 0(单测),item 不因失去加成而从候选池硬消失(仍可经 frequent/recent 维度进入)
- [ ] app 索引 add/delete 提交后推荐缓存(内存 + DB 两层)失效(单测/集成测)
- [ ] 卸载后 recommend() 输出不含该 app,即使其 usage 统计行仍存在(单测)
- [ ] 冷启动按安装时间排序生效,`cold-start`/`newly-installed` 进入 `ScoredItem['source']` 联合与 badge/reason map,与 `tuff-dsl` 的 `TuffMeta.recommendation.source` 口径一致
- [ ] 曝光表出现 `:newly-installed` 切片行,仅计数
- [ ] `apps/core-app` `npm run typecheck` 通过;touched 测试套件全绿;不引入 DB schema 迁移(安装时间走 `file_extensions` KV)

## Non-goals

- 不做 S1.2(刚更新 app 加权)与 S1.4(新插件 feature 首曝光)——后者待本通道验证后二期接入
- 不改有查询排序(`tuff-sorter`),本任务只影响零查询推荐
- 不清除已卸载 app 的历史统计行
