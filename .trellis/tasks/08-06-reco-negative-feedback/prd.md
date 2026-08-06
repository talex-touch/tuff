# Recommendation negative feedback

> P2,未排期。来源:`08-06-reco-scenario-playbook/research/scenario-matrix.md` 场景卡 S6.2 / S6.3。
> 依赖:`08-06-reco-item-freshness` 落地的曝光 tag 切片通道可复用为通用曝光归因。

## Goal

补齐推荐的负反馈闭环:反复曝光却不被点击的 item 加速衰减(弱负反馈),用户可显式「不再推荐」(强负反馈),让推荐列表能自我纠错而不是靠正向信号单边堆积。

## Requirements

### R1 曝光未点击 → 加速衰减(S6.2)
- 基于 `recommendation_exposure_daily` 计数,在稳定层给「高曝光零点击」item 加惩罚项(类比现有 cancelCount 负权)。
- 惩罚随时间衰减,且保留小概率探索窗口,防自证循环(被压掉的 item 失去曝光就永远翻不了身)。

### R2 手动「不再推荐」(S6.3)
- 结果项快捷操作(右键/快捷键)加入推荐黑名单;仅影响零查询推荐,不影响主动搜索命中。
- 设置页可查看、可撤销;存储参照 `pinned_items` 表形态(其镜像)。

## Acceptance Criteria

- [ ] 连续 N 日曝光@k 且零点击的 item 排名显著下降,且在惩罚衰减后可翻身(单测覆盖曲线与探索窗口)
- [ ] 「不再推荐」即时生效(含缓存失效),搜索命中不受影响,设置页可撤销
- [ ] 整体 hit-rate@k 不劣化(以曝光表为准观察)

## Notes

- 规划时补 design.md(惩罚公式、黑名单存储、设置页 IA)后再 start;本 PRD 仅锁定范围。
