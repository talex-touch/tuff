# CoreBox 搜索体验与索引新鲜度修复（父任务）

## Goal

把 2026-09-21 真机审计（隔离 profile + CDP 驱动真实 CoreBox）确认的问题按严重度依次修掉：先修让功能失效的两个 bug，再修最影响手感的窗口抽动，最后做应用新鲜度与搜索热路径的加固。每个子任务独立可验证，父任务只负责需求来源、子任务映射与最终集成复核。

## Source findings

| # | 现象 | 根因定位 | 子任务 |
|---|---|---|---|
| 1 | 手动「重建文件索引」永久挂起；之后所有 file-provider watch 事件被 `eligibility` 跳过，直到重启 | `withPausedAdmission` 持锁期间 `clearScanProgress` 经同一 writer 的 `withAdmission` 等自己 | `09-21-file-index-rebuild-deadlock` |
| 2 | 活了 5–17 分钟的 CoreBox 页面对新装/删除应用、新建文件不再自动刷新，新页面正常 | stream client 首条 port 消息后 `portActive` 永久 true，主进程 port 记录丢失后走 channel 回退被丢弃 | `09-21-index-commit-stream-liveness` |
| 3 | 每次停顿输入窗口先缩到 242px 再涨回 600px；开启交错动画时后排行钉住 4s 才归位 | `macos-spotlight-provider` 标 fast 层但每次 ~900ms；`useResize` 无滞回；`getStaggerDelay` 线性累加无上限 | `09-21-spotlight-deferred-height-hysteresis` |
| 4 | 应用新鲜度：大应用拖入可能永不入索引；解析中的第二个事件被丢；mdls 轮询直接删行；补全开关无效 | `_waitForItemStable` 比较目录 st_size；`not-app` 终态无重试；`processingPaths` 早退；mdls 不走宽限账本；`scanIndexedSource` 不查 `startupBackfillEnabled` | `09-21-app-freshness-hardening` |
| 5 | 搜索热路径卫生：首批合并后缺 abort 复查；session snapshot/complete 不看 aborted；deferred 延时不响应取消；fast 并发 6 < 7 个 provider；每批 full 富化；app reconcile 每次误报 67 个 changed | 见子任务 PRD | `09-21-search-hotpath-hygiene` |

## Constraints

- 不 commit / push；每个子任务完成后由老板决定提交方式。
- 子任务顺序即优先级：1 → 2 → 3 → 4 → 5；后一个不依赖前一个的代码，但真机验证复用同一套 CDP 工具（`/tmp/tuff-search-verify`）。
- 改动限定在定位到的根因；旁路问题记录到对应子任务的 Notes，不扩大范围。
- 工作树里已有未提交改动（read-worker 重建、stats 缓存、voice 设置页等）来自其他会话，不得触碰。

## Cross-child acceptance criteria

- [x] 五个子任务各自的验收全部通过并归档。
- [x] 真机集成复核（2026-09-21，隔离实例 stack8）：手动重建 `success:true` 且 reset 门归零 → 新建文件 4s 内入索引并可搜 → 装探针应用后打开中的列表自动刷新（主进程自动搜索 +2，顶部出现该应用）→ 卸载后自动刷新（+1，应用消失）→ `ghostty→gho` 窗口高度最小值 554 无回弹。
- [x] `search-engine` + `addon/apps` 1100/1100、transport 79/79、renderer resize/stagger 通过；`typecheck:node` 通过；`vue-tsc` 仅剩其他会话未提交文件的一处告警。

## Notes（本轮未做，留待立项）

- 主进程丢弃 `index-committed` MessagePort 记录的具体触发点未钉死（渲染端已能容忍）。
- 审计里的 `watchState` 硬编码、诊断页读错库、系统目录未 watch、Linux 扩展名过滤、`resetIndexedSourceLocalState` 虚报清空。
- 索引瘦身（icon 去重、content 双份、n-gram 行）与 embeddings 恒空（B1）。
- 动效令牌统一（CoreBox 未接 tuffex 令牌；TxStagger / TxGroupBlock 缺 reduced-motion）。
